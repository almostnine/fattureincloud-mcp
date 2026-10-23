import { z } from 'zod';
import { refused } from '../api/errors.js';
import { fetchAll } from '../api/paginate.js';
import { isoDate, todayRome } from '../domain/dates.js';
import { displayNumber, entityName, paymentSummary } from '../domain/documents.js';
import { groupByClient, installmentRows } from '../domain/installments.js';
import { fromCents, toCents } from '../domain/money.js';
import { Q } from '../domain/query.js';
import type { DataResponse, IssuedDocument, PaymentAccount, PaymentItem } from '../domain/types.js';
import { stripBankKeys } from '../safety/bank.js';
import { docTypeSchema, periodShape, resolvePeriod } from './common.js';
import {
  authorize,
  confirmSchema,
  dryRunSchema,
  humanPrompt,
  type Pending,
  previewFields,
} from './confirm-flow.js';
import { defineTool } from './define.js';
import { getIssued } from './issued-documents.js';
import { listPaymentAccounts } from './reference-data.js';

const FIELDS = 'id,type,number,numeration,date,entity,amount_gross,next_due_date,payments_list,ei_status';

export const listInstallments = defineTool({
  name: 'fic_list_installments',
  title: 'Rate e scadenze',
  description: `Elenca le singole rate (scadenze di pagamento) di tutti i documenti, una riga per rata, con stato, giorni di ritardo, conto e data di pagamento. Filtri per stato, scadenza, data di pagamento, cliente. Con group_by_client restituisce anche il riepilogo per cliente (importo, rate, ritardo massimo, email): è la base per i solleciti.
Esempi: "quali rate sono scadute e non pagate" -> {status:"overdue"}; "rate in scadenza a novembre" -> {status:"not_paid", due_from:"2026-11-01", due_to:"2026-11-30"}; "incassi di settembre" -> {status:"paid", paid_from:"2026-09-01", paid_to:"2026-09-30"}.
Lists installments across all documents: overdue, unpaid or paid, optionally grouped by client for payment reminders.`,
  minMode: 'readonly',
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  input: z.object({
    status: z
      .enum(['overdue', 'not_paid', 'paid', 'all'])
      .default('overdue')
      .describe(
        'overdue: scadute e non pagate (default); not_paid: tutte le non pagate; paid: pagate; all: tutte.',
      ),
    due_from: isoDate.optional().describe('Scadenza della rata da (inclusa).'),
    due_to: isoDate.optional().describe('Scadenza della rata fino a (inclusa).'),
    paid_from: isoDate.optional().describe('Data di pagamento da (solo rate pagate).'),
    paid_to: isoDate.optional().describe('Data di pagamento fino a (solo rate pagate).'),
    year: periodShape.year.describe('Anno della DATA DEL DOCUMENTO (non della scadenza né del pagamento).'),
    month: periodShape.month.describe('Mese 1-12 della data del documento.'),
    date_from: periodShape.date_from.describe(
      'Data del documento da (inclusa). Per le scadenze usa due_from.',
    ),
    date_to: periodShape.date_to.describe('Data del documento fino a (inclusa). Per le scadenze usa due_to.'),
    client_id: z.number().int().positive().optional(),
    client_name: z.string().min(2).max(100).optional(),
    type: docTypeSchema.default('invoice'),
    group_by_client: z.boolean().default(false).describe('Aggiunge il riepilogo per cliente.'),
    limit: z.number().int().min(1).max(1000).default(200).describe('Numero massimo di righe restituite.'),
  }),
  operations: ['listIssuedDocuments'],
  docTypeOf: (a) => a.type,
  handler: async (args, app) => {
    const client = await app.api();
    const today = todayRome(app.now());
    const q = new Q();
    if (args.client_id) q.eq('entity.id', args.client_id);
    q.textContains('entity.name', args.client_name);
    let defaultPeriodNote: string | undefined;
    let period = resolvePeriod(args, app.now());
    // Documenti con almeno una rata aperta; le scadute si individuano in locale, rata per rata.
    if (args.status === 'overdue' || args.status === 'not_paid') q.raw('next_due_date is not null');
    else if (!period.from && !period.to) {
      // Le rate pagate non sono filtrabili lato server: si limita il periodo dei documenti.
      const fromPaid = args.paid_from ? `${Number(args.paid_from.slice(0, 4)) - 1}-01-01` : undefined;
      period = fromPaid ? { from: fromPaid, to: args.paid_to } : resolvePeriod({}, app.now(), true);
      defaultPeriodNote = `Le rate pagate si cercano solo tra i documenti emessi dal ${period.from}${
        period.to ? ` al ${period.to}` : ''
      }: per documenti più vecchi indica year o date_from.`;
    }
    q.dateGte('date', period.from).dateLte('date', period.to);

    const all = await fetchAll<IssuedDocument>(
      client,
      {
        operationId: 'listIssuedDocuments',
        path: '/c/{company_id}/issued_documents',
        query: { type: args.type, q: q.build(), fields: FIELDS, sort: 'next_due_date' },
      },
      app.config.maxPages,
    );
    const rows = installmentRows(all.items, {
      status: args.status,
      today,
      dueFrom: args.due_from,
      dueTo: args.due_to,
      paidFrom: args.paid_from,
      paidTo: args.paid_to,
    });
    const shown = rows.slice(0, args.limit);
    return {
      today,
      filter: {
        status: args.status,
        document_type: args.type,
        document_period: period.from || period.to ? period : undefined,
      },
      count: rows.length,
      amount_total: fromCents(rows.reduce((a, r) => a + toCents(r.amount), 0)),
      items: shown,
      rows_truncated:
        rows.length > shown.length
          ? `Mostrate ${shown.length} righe su ${rows.length}: aumenta limit o restringi i filtri.`
          : undefined,
      by_client: args.group_by_client ? groupByClient(rows) : undefined,
      documents_read: all.items.length,
      notes: [
        ...(defaultPeriodNote ? [defaultPeriodNote] : []),
        'Le note di credito non vengono abbinate alle rate: una fattura stornata in parte resta da incassare per intero. Controlla le note di credito del cliente prima di un sollecito.',
      ],
      truncated: all.truncated
        ? `Letti solo ${all.items.length} documenti su ${all.total}: restringi il periodo o aumenta FIC_MAX_PAGES.`
        : undefined,
    };
  },
});

/** Trova la rata indicata per indice (1-based), ID o scadenza. */
function pickInstallment(
  list: PaymentItem[],
  sel: { installment?: number; installment_id?: number; due_date?: string },
): number {
  if (sel.installment_id) {
    const i = list.findIndex((p) => p.id === sel.installment_id);
    if (i < 0) throw refused(`Nessuna rata con ID ${sel.installment_id} in questo documento.`);
    return i;
  }
  if (sel.installment) {
    if (sel.installment > list.length)
      throw refused(`Il documento ha ${list.length} rate: la rata ${sel.installment} non esiste.`);
    return sel.installment - 1;
  }
  if (sel.due_date) {
    const matches = list.map((p, i) => ({ p, i })).filter(({ p }) => p.due_date === sel.due_date);
    if (matches.length === 1) return matches[0]!.i;
    throw refused(
      matches.length
        ? 'Più rate con questa scadenza: indica installment.'
        : `Nessuna rata con scadenza ${sel.due_date}.`,
    );
  }
  if (list.length === 1) return 0;
  throw refused(
    `Il documento ha ${list.length} rate: indica quale con installment (da 1 a ${list.length}), installment_id o due_date.`,
  );
}

export const setInstallmentStatus = defineTool({
  name: 'fic_set_installment_status',
  title: 'Segna rata pagata o non pagata',
  description: `Segna una rata di un documento emesso come pagata (con conto di saldo e data di pagamento) oppure come non pagata. Tocca solo quella rata: importi, scadenze e altre rate restano invariati.
Il conto di saldo è obbligatorio per "pagata": indicalo con payment_account_id (elenco con fic_reference_data, list "payment_accounts") oppure configura FIC_DEFAULT_PAYMENT_ACCOUNT_ID. Il server non sceglie mai un conto da solo.
Esempio: "segna pagata la seconda rata della fattura 33/2026, bonifico del 10 ottobre su Banca" -> recupera l'ID con fic_get_issued_document, poi {document_id, installment:2, status:"paid", paid_date:"2026-10-10", payment_account_id}.
Prima chiamata (dry_run default true): anteprima prima/dopo e token. Per registrare: stessi parametri con dry_run: false e confirm; il server chiede allora la conferma direttamente all'utente.
Marks one installment as paid (with payment account and date) or unpaid, after preview and human confirmation.`,
  minMode: 'write',
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  input: z.object({
    document_id: z.number().int().positive(),
    installment: z.number().int().min(1).optional().describe('Numero della rata, da 1.'),
    installment_id: z.number().int().positive().optional().describe('ID della rata (in alternativa).'),
    due_date: isoDate.optional().describe('Scadenza della rata (in alternativa).'),
    status: z.enum(['paid', 'not_paid']),
    paid_date: isoDate.optional().describe('Data di pagamento; default oggi. Solo con status paid.'),
    payment_account_id: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Conto di saldo; default FIC_DEFAULT_PAYMENT_ACCOUNT_ID.'),
    dry_run: dryRunSchema,
    confirm: confirmSchema,
  }),
  operations: ['getIssuedDocument', 'modifyIssuedDocument', 'listPaymentAccounts'],
  handler: async (args, app, call) => {
    const doc = await getIssued(app, args.document_id);
    if (doc.locked) {
      throw refused(
        'Il documento è bloccato in Fatture in Cloud (di solito perché già inviato allo SDI): lo stato delle rate va cambiato dall’app web.',
      );
    }
    const list = [...(doc.payments_list ?? [])];
    if (!list.length) throw refused('Il documento non ha rate da aggiornare.');
    const idx = pickInstallment(list, args);
    const before = list[idx]!;
    let account: PaymentAccount | undefined;
    if (args.status === 'paid') {
      const accountId = args.payment_account_id ?? app.config.defaultPaymentAccountId;
      if (!accountId) {
        const accounts = await listPaymentAccounts(app);
        throw refused(
          `Per segnare la rata pagata serve il conto di saldo (payment_account_id). Conti disponibili: ${
            accounts.map((a) => `${a.id} (${a.name})`).join(', ') || 'nessuno'
          }. Chiedi all’utente quale usare.`,
        );
      }
      const accounts = await listPaymentAccounts(app);
      account = accounts.find((a) => a.id === accountId);
      if (!account)
        throw refused(
          `Il conto di saldo ${accountId} non esiste. Conti disponibili: ${accounts.map((a) => `${a.id} (${a.name})`).join(', ')}.`,
        );
    }
    const updated: PaymentItem = {
      ...before,
      status: args.status,
      paid_date: args.status === 'paid' ? (args.paid_date ?? todayRome(app.now())) : null,
      payment_account: args.status === 'paid' ? { id: account!.id } : null,
    };
    list[idx] = updated;
    // Si rimanda la payments_list completa, con gli ID delle rate invariati: gli importi non cambiano,
    // quindi la somma resta uguale al totale da pagare.
    const payments_list = list.map((p) => ({
      ...(p.id ? { id: p.id } : {}),
      amount: p.amount,
      due_date: p.due_date,
      status: p.status ?? 'not_paid',
      paid_date: p.status === 'paid' ? p.paid_date : null,
      payment_account: p.status === 'paid' && p.payment_account?.id ? { id: p.payment_account.id } : null,
      ...(p.payment_terms?.days !== null && p.payment_terms?.days !== undefined
        ? { payment_terms: { days: p.payment_terms.days, type: p.payment_terms.type ?? 'standard' } }
        : {}),
      // Dati FatturaPA del pagamento: si conservano, ma mai le coordinate bancarie (IBAN, ABI, CAB...).
      ...(p.ei_raw ? { ei_raw: stripBankKeys(p.ei_raw) } : {}),
    }));
    const pending: Pending = {
      action: 'INST',
      id: args.document_id,
      state: String(doc.updated_at ?? ''),
      params: { payments_list },
      prompt: humanPrompt(args.status === 'paid' ? 'Rata pagata' : 'Rata non pagata', {
        documento: `${doc.type ?? 'documento'} n. ${displayNumber(doc) ?? '?'} del ${doc.date ?? '?'}`,
        cliente: entityName(doc.entity),
        rata: `${idx + 1} di ${list.length}, scadenza ${before.due_date ?? '?'}, importo ${before.amount ?? '?'}`,
        prima: before.status === 'paid' ? `pagata il ${before.paid_date ?? '?'}` : 'non pagata',
        dopo:
          args.status === 'paid'
            ? `pagata il ${updated.paid_date} sul conto ${account!.name ?? ''} (ID ${account!.id})`
            : 'non pagata (conto e data di pagamento tolti)',
      }),
    };
    const beforeView = {
      status: before.status ?? 'not_paid',
      paid_date: before.paid_date ?? undefined,
      payment_account_id: before.payment_account?.id ?? undefined,
    };
    if (args.dry_run || !args.confirm) {
      return {
        dry_run: true,
        updated: false,
        document_id: args.document_id,
        installment: idx + 1,
        before: beforeView,
        after: {
          status: updated.status,
          paid_date: updated.paid_date ?? undefined,
          payment_account: account ? { id: account.id, name: account.name } : undefined,
        },
        ...previewFields(app, call, pending, 'dry_run: false e confirm uguale a confirm_token'),
      };
    }
    await authorize(app, call, args.confirm, pending);
    const client = await app.api();
    const res = await client.request<DataResponse<IssuedDocument>>({
      operationId: 'modifyIssuedDocument',
      method: 'PUT',
      path: '/c/{company_id}/issued_documents/{document_id}',
      pathParams: { document_id: args.document_id },
      body: { data: { type: doc.type, payments_list } },
    });
    app.cache.invalidate('issued:');
    app.log.audit('rata aggiornata', {
      document_id: args.document_id,
      installment: idx + 1,
      status: args.status,
    });
    const after = res?.data?.payments_list?.[idx];
    return {
      updated: true,
      document_id: args.document_id,
      installment: idx + 1,
      before: beforeView,
      after: {
        status: after?.status ?? updated.status,
        paid_date: after?.paid_date ?? updated.paid_date ?? undefined,
        payment_account: account ? { id: account.id, name: account.name } : undefined,
      },
      document_payment_status: res?.data?.payments_list
        ? paymentSummary(res.data.payments_list, todayRome(app.now())).payment_status
        : undefined,
    };
  },
});
