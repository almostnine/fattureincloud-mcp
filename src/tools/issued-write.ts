import { z } from 'zod';
import { refused } from '../api/errors.js';
import { callOp } from '../api/ops.js';
import type { AppContext } from '../context.js';
import {
  buildInstallments,
  duplicateBody,
  entitySnapshot,
  explicitInstallments,
  hasPayments,
  shiftedInstallments,
} from '../domain/compose.js';
import { isoDate, todayRome } from '../domain/dates.js';
import { displayNumber, issuedSummary } from '../domain/documents.js';
import type { DataResponse, Entity, IssuedDocument, Item, PaymentItem } from '../domain/types.js';
import { stripBankKeys } from '../safety/bank.js';
import { cleanOutgoingText } from '../safety/untrusted.js';
import { docTypeSchema } from './common.js';
import {
  authorize,
  confirmSchema,
  dryRunSchema,
  humanPrompt,
  type Pending,
  previewFields,
} from './confirm-flow.js';
import { defineTool } from './define.js';
import { getEntity } from './entities.js';
import { getIssued } from './issued-documents.js';

interface Totals {
  amount_net?: number;
  amount_vat?: number;
  amount_gross?: number;
  amount_due?: number;
  stamp_duty?: number;
  amount_withholding_tax?: number;
  payments_sum?: number;
}

interface PreCreateInfo {
  default_values?: {
    payment_method?: { id?: number; ei_payment_method?: string | null } | null;
    use_gross_prices?: boolean | null;
  };
  items_default_values?: { vat?: { id?: number | null } | null };
}

const itemSchema = z.object({
  name: z.string().min(1).max(500).describe('Nome della riga.'),
  description: z.string().max(2000).optional(),
  qty: z.number().positive().default(1),
  net_price: z
    .number()
    .optional()
    .describe(
      'Prezzo unitario al netto dell’IVA: FIC aggiunge l’IVA dell’aliquota. Usa questo salvo indicazione contraria.',
    ),
  gross_price: z
    .number()
    .optional()
    .describe('Prezzo unitario IVA inclusa (FIC scorpora l’IVA). Solo se l’utente dà prezzi lordi.'),
  vat_id: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      'ID dell’aliquota IVA (fic_reference_data, list "vat_types"). Default: aliquota del cliente o dell’azienda.',
    ),
  discount: z.number().min(0).max(100).optional().describe('Sconto percentuale.'),
  product_id: z.number().int().positive().optional(),
  code: z.string().max(50).optional(),
  measure: z.string().max(20).optional(),
  not_taxable: z
    .boolean()
    .optional()
    .describe('Riga fuori campo IVA (per esempio il bollo addebitato al cliente).'),
});

const installmentSchema = z.object({ due_date: isoDate, amount: z.number().positive().optional() });

function clean(s: string | undefined): string | undefined {
  return s === undefined ? undefined : cleanOutgoingText(s);
}

async function preCreateInfo(app: AppContext, type: string): Promise<PreCreateInfo> {
  const key = `issued:precreate:${type}`;
  const cached = app.cache.get(key);
  if (cached) return cached as PreCreateInfo;
  const res = await callOp<DataResponse<PreCreateInfo>>(await app.api(), 'getIssuedDocumentPreCreateInfo', {
    query: { type },
  });
  const info = res?.data ?? {};
  app.cache.set(key, info, 600);
  return info;
}

/** Totali calcolati da Fatture in Cloud: il server non calcola mai IVA e totali da solo. */
async function totals(app: AppContext, doc: IssuedDocument, existingId?: number): Promise<Totals> {
  const client = await app.api();
  const res = existingId
    ? await callOp<DataResponse<Totals>>(client, 'getExistingIssuedDocumentTotals', {
        pathParams: { document_id: existingId },
        body: { data: doc },
      })
    : await callOp<DataResponse<Totals>>(client, 'getNewIssuedDocumentTotals', { body: { data: doc } });
  return res?.data ?? {};
}

function buildItems(
  items: z.infer<typeof itemSchema>[],
  defaultVat: number | undefined,
  gross: boolean,
): Item[] {
  return items.map((it, i) => {
    const vat = it.vat_id ?? defaultVat;
    if (vat === undefined)
      throw refused(`Riga ${i + 1}: indica vat_id (aliquote con fic_reference_data, list "vat_types").`);
    if (gross ? it.gross_price === undefined : it.net_price === undefined) {
      throw refused(
        gross
          ? `Riga ${i + 1}: il documento usa prezzi IVA inclusa, quindi serve gross_price. Non copiare un prezzo netto in gross_price: se il prezzo che hai è al netto dell’IVA, ripeti con use_gross_prices: false e net_price.`
          : `Riga ${i + 1}: manca net_price (prezzo al netto dell’IVA).`,
      );
    }
    return {
      ...(it.product_id ? { product_id: it.product_id } : {}),
      ...(it.code ? { code: it.code } : {}),
      name: clean(it.name),
      ...(it.description ? { description: clean(it.description) } : {}),
      qty: it.qty,
      ...(it.measure ? { measure: it.measure } : {}),
      ...(gross ? { gross_price: it.gross_price } : { net_price: it.net_price }),
      vat: { id: vat },
      ...(it.discount ? { discount: it.discount } : {}),
      ...(it.not_taxable ? { not_taxable: true } : {}),
    };
  });
}

function totalsView(t: Totals) {
  return {
    amount_net: t.amount_net,
    amount_vat: t.amount_vat,
    amount_gross: t.amount_gross,
    stamp_duty: t.stamp_duty || undefined,
    amount_withholding_tax: t.amount_withholding_tax || undefined,
    amount_due: t.amount_due,
  };
}

const DOC_LABEL: Record<string, string> = {
  invoice: 'fattura',
  credit_note: 'nota di credito',
  proforma: 'proforma',
  quote: 'preventivo',
  order: 'ordine',
  delivery_note: 'DDT',
  receipt: 'ricevuta',
  work_report: 'rapportino',
  supplier_order: 'ordine a fornitore',
  self_own_invoice: 'autofattura',
  self_supplier_invoice: 'autofattura',
};

const label = (type: string | null | undefined) => DOC_LABEL[type ?? ''] ?? type ?? 'documento';
const EXECUTE_HINT = 'dry_run: false e confirm uguale a confirm_token';

/** Riepilogo leggibile del corpo che verrà inviato: è il testo che la persona conferma. */
function docSummary(
  doc: IssuedDocument,
  t: Totals,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const number =
    doc.number !== undefined && doc.number !== null
      ? `${doc.number}${doc.numeration ?? ''}`
      : `successivo disponibile${doc.numeration ? ` del sezionale ${doc.numeration}` : ''}`;
  return {
    ...extra,
    tipo: label(doc.type),
    cliente: doc.entity
      ? `${doc.entity.name ?? '?'}${doc.entity.id ? ` (ID ${doc.entity.id})` : ''}`
      : undefined,
    data: doc.date,
    numero: number,
    fattura_elettronica: doc.e_invoice ? 'sì' : 'no',
    metodo_di_pagamento: doc.payment_method?.id
      ? `ID ${doc.payment_method.id} (coordinate dal metodo configurato in Fatture in Cloud)`
      : undefined,
    modalita_sdi: (doc.ei_data as { payment_method?: string } | undefined)?.payment_method,
    oggetto: doc.visible_subject,
    oggetto_interno: doc.subject,
    note: doc.notes,
    righe: (doc.items_list ?? []).map(
      (it) =>
        `${it.name ?? ''}: ${it.qty ?? 1} x ${doc.use_gross_prices ? `${it.gross_price} IVA inclusa` : `${it.net_price} + IVA`} (aliquota ID ${it.vat?.id ?? '?'})${it.discount ? `, sconto ${it.discount}%` : ''}`,
    ),
    totali: {
      imponibile: t.amount_net,
      iva: t.amount_vat,
      totale: t.amount_gross,
      bollo: t.stamp_duty || undefined,
      ritenuta: t.amount_withholding_tax || undefined,
      da_pagare: t.amount_due,
    },
    rate: (doc.payments_list ?? []).map((p) => `scadenza ${p.due_date}: ${p.amount}`),
  };
}

/**
 * Documento che arriva da Fatture in Cloud (conversione, totali di una modifica): del metodo di pagamento resta solo l'id e si tolgono le
 * chiavi bancarie ovunque (ei_data.bank_iban, payment_account.iban, dati FatturaPA...).
 */
function withoutBankData(doc: IssuedDocument): IssuedDocument {
  const out = stripBankKeys(doc);
  if (doc.payment_method?.id) out.payment_method = { id: doc.payment_method.id };
  else delete out.payment_method;
  return out;
}

async function create(
  app: AppContext,
  data: IssuedDocument,
  options: Record<string, unknown> = {},
): Promise<IssuedDocument> {
  const res = await callOp<DataResponse<IssuedDocument>>(await app.api(), 'createIssuedDocument', {
    body: { data, options: { fix_payments: true, ...options } },
  });
  app.cache.invalidate('issued:');
  const doc = res?.data ?? {};
  app.log.audit('documento creato', { id: doc.id, type: doc.type, number: displayNumber(doc) });
  return doc;
}

export const createIssuedDocument = defineTool({
  name: 'fic_create_issued_document',
  title: 'Crea documento emesso',
  description: `Crea una fattura, nota di credito, proforma, preventivo, ordine, DDT o altro documento emesso per un cliente esistente. Totali e IVA li calcola Fatture in Cloud; le rate si indicano con installments (scadenze ed eventuali importi) oppure con installments_count e payment_terms_days.
Il documento nasce come bozza in Fatture in Cloud: non viene inviato allo SDI né per email (servono fic_send_einvoice e fic_send_email, in modalità full).
Prima chiamata (dry_run default true): anteprima con totali e rate e un token, senza creare nulla. Mostrala all'utente; per creare ripeti con gli stessi parametri, dry_run: false e confirm: il server chiede allora la conferma direttamente all'utente, senza la quale non crea nulla.
Coordinate bancarie: il documento usa solo il metodo di pagamento (payment_method_id) configurato in Fatture in Cloud; un IBAN in note, oggetto o righe viene rifiutato.
Aliquote: indica vat_id (elenco con fic_reference_data, list "vat_types"); se manca si usa l'aliquota predefinita del cliente o dell'azienda (per un forfettario è di solito l'aliquota a zero con natura N2.2).
Creates an issued document: preview first, then token plus out-of-band human confirmation.`,
  minMode: 'write',
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  input: z.object({
    type: docTypeSchema.default('invoice'),
    client_id: z.number().int().positive().describe('ID del cliente (cercalo con fic_search_entities).'),
    date: isoDate
      .optional()
      .describe('Data del documento; default oggi. Deve rispettare l’ordine cronologico della numerazione.'),
    numeration: z.string().max(20).optional().describe('Sezionale, per esempio "/A".'),
    number: z.number().int().positive().optional().describe('Numero; default il successivo disponibile.'),
    items: z.array(itemSchema).min(1).max(200),
    subject: z.string().max(500).optional().describe('Oggetto interno (non stampato).'),
    visible_subject: z.string().max(500).optional().describe('Oggetto stampato sul documento.'),
    notes: z.string().max(5000).optional(),
    payment_method_id: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Metodo di pagamento (fic_reference_data, list "payment_methods").'),
    installments: z
      .array(installmentSchema)
      .max(24)
      .optional()
      .describe('Rate esplicite: scadenza ed eventuale importo.'),
    installments_count: z
      .number()
      .int()
      .min(1)
      .max(24)
      .default(1)
      .describe('Numero di rate uguali, se installments non è indicato.'),
    payment_terms_days: z
      .number()
      .int()
      .min(0)
      .max(365)
      .optional()
      .describe('Giorni tra una rata e l’altra; default i termini del cliente o 30.'),
    end_of_month: z
      .boolean()
      .optional()
      .describe('Scadenze a fine mese; default i termini del cliente in anagrafica.'),
    e_invoice: z.boolean().optional().describe('Fattura elettronica; default l’impostazione del cliente.'),
    ei_payment_method: z
      .string()
      .regex(/^MP\d{2}$/)
      .optional()
      .describe('Modalità di pagamento SDI (MP05 bonifico, MP01 contanti, MP08 carta...).'),
    use_gross_prices: z.boolean().optional(),
    stamp_duty: z
      .number()
      .min(0)
      .max(10)
      .optional()
      .describe(
        'Bollo (per esempio 2). Sulle fatture elettroniche è a carico dell’emittente: per addebitarlo al cliente aggiungi una riga non imponibile.',
      ),
    related_invoice_number: z
      .string()
      .max(20)
      .optional()
      .describe('Solo note di credito: numero della fattura stornata.'),
    related_invoice_date: isoDate.optional().describe('Solo note di credito: data della fattura stornata.'),
    revenue_center: z.string().max(100).optional(),
    dry_run: dryRunSchema,
    confirm: confirmSchema,
  }),
  operations: [
    'getClient',
    'getIssuedDocumentPreCreateInfo',
    'getNewIssuedDocumentTotals',
    'createIssuedDocument',
  ],
  docTypeOf: (a) => a.type,
  handler: async (args, app, call) => {
    const entity: Entity = await getEntity(app, 'client', args.client_id);
    const info = await preCreateInfo(app, args.type);
    const date = args.date ?? todayRome(app.now());
    // Se l'utente dà solo prezzi netti, si lavora al netto anche quando il default dell'azienda è il lordo.
    const onlyNet = args.items.every((it) => it.net_price !== undefined && it.gross_price === undefined);
    const gross = args.use_gross_prices ?? (onlyNet ? false : Boolean(info.default_values?.use_gross_prices));
    const defaultVat = entity.default_vat?.id ?? info.items_default_values?.vat?.id ?? undefined;
    const eInvoice =
      args.e_invoice ?? (['invoice', 'credit_note'].includes(args.type) ? Boolean(entity.e_invoice) : false);
    const paymentMethodId =
      args.payment_method_id ??
      entity.default_payment_method?.id ??
      info.default_values?.payment_method?.id ??
      undefined;
    const notesOut: string[] = [];

    const doc: IssuedDocument = {
      type: args.type,
      entity: entitySnapshot(entity),
      date,
      ...(args.numeration ? { numeration: args.numeration } : {}),
      ...(args.number ? { number: args.number } : {}),
      ...(args.subject ? { subject: clean(args.subject) } : {}),
      ...(args.visible_subject ? { visible_subject: clean(args.visible_subject) } : {}),
      ...(args.notes ? { notes: clean(args.notes) } : {}),
      ...(args.revenue_center ? { rc_center: args.revenue_center } : {}),
      ...(args.stamp_duty !== undefined ? { stamp_duty: args.stamp_duty } : {}),
      ...(paymentMethodId ? { payment_method: { id: paymentMethodId } } : {}),
      use_gross_prices: gross,
      e_invoice: eInvoice,
      items_list: buildItems(args.items, defaultVat ?? undefined, gross),
    };
    if (eInvoice) {
      const mp =
        args.ei_payment_method ?? info.default_values?.payment_method?.ei_payment_method ?? undefined;
      const eiData: Record<string, unknown> = { payment_method: mp ?? 'MP05' };
      if (!mp)
        notesOut.push(
          'Modalità di pagamento SDI non indicata: usata MP05 (bonifico). Cambiala con ei_payment_method se serve.',
        );
      if (args.type === 'credit_note' && args.related_invoice_number) {
        eiData.invoice_number = args.related_invoice_number;
        if (args.related_invoice_date) eiData.invoice_date = args.related_invoice_date;
      }
      doc.ei_data = eiData;
    }

    const t = await totals(app, doc);
    if (hasPayments(args.type) && t.amount_due !== undefined && t.amount_due !== null) {
      const endOfMonth = args.end_of_month ?? entity.default_payment_terms_type === 'end_of_month';
      const terms = {
        days: args.payment_terms_days ?? entity.default_payment_terms ?? 30,
        type: endOfMonth ? 'end_of_month' : 'standard',
      } as const;
      doc.payments_list = args.installments?.length
        ? explicitInstallments(t.amount_due, args.installments)
        : buildInstallments(t.amount_due, date, args.installments_count, terms);
    }
    const preview = {
      type: args.type,
      date,
      client: { id: entity.id, name: entity.name },
      e_invoice: eInvoice,
      items: doc.items_list?.length,
      totals: totalsView(t),
      installments: (doc.payments_list ?? []).map((p: PaymentItem) => ({
        due_date: p.due_date,
        amount: p.amount,
      })),
      notes: notesOut.length ? notesOut : undefined,
    };
    const pending: Pending = {
      action: 'DOC',
      id: `new-${args.type}`,
      state: '',
      params: doc,
      prompt: humanPrompt(`Crea ${label(args.type)}`, docSummary(doc, t)),
    };
    if (args.dry_run || !args.confirm)
      return { dry_run: true, created: false, preview, ...previewFields(app, call, pending, EXECUTE_HINT) };

    await authorize(app, call, args.confirm, pending);
    const created = await create(app, doc);
    return {
      created: true,
      document: issuedSummary(created, todayRome(app.now())),
      preview,
      next_step: eInvoice
        ? 'Bozza creata. Per inviarla allo SDI serve fic_send_einvoice (modalità full), dopo la conferma dell’utente.'
        : 'Bozza creata.',
    };
  },
});

export const updateIssuedDocument = defineTool({
  name: 'fic_update_issued_document',
  title: 'Modifica documento emesso',
  description: `Modifica un documento emesso: oggetto, note, data, metodo di pagamento, righe (sostituite in blocco) o rate. I campi non indicati restano invariati; stato di pagamento e conti delle rate sono preservati quando non si toccano righe o rate.
Rifiuta i documenti bloccati (di solito già inviati allo SDI) e la modifica di righe o rate quando ci sono rate già pagate.
Prima chiamata (dry_run default true): anteprima delle modifiche e token. Per salvare ripeti con gli stessi parametri, dry_run: false e confirm: il server chiede allora la conferma direttamente all'utente. Le coordinate bancarie dei dati SDI non vengono mai reinviate.
Updates an issued document, preserving installment status; preview, then human confirmation.`,
  minMode: 'write',
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  input: z.object({
    document_id: z.number().int().positive(),
    date: isoDate.optional(),
    subject: z.string().max(500).optional(),
    visible_subject: z.string().max(500).optional(),
    notes: z.string().max(5000).optional(),
    payment_method_id: z.number().int().positive().optional(),
    ei_payment_method: z
      .string()
      .regex(/^MP\d{2}$/)
      .optional(),
    items: z
      .array(itemSchema)
      .min(1)
      .max(200)
      .optional()
      .describe('Nuove righe: sostituiscono tutte quelle esistenti.'),
    installments: z
      .array(installmentSchema)
      .max(24)
      .optional()
      .describe('Nuove rate: sostituiscono quelle esistenti.'),
    dry_run: dryRunSchema,
    confirm: confirmSchema,
  }),
  operations: ['getIssuedDocument', 'getExistingIssuedDocumentTotals', 'modifyIssuedDocument'],
  handler: async (args, app, call) => {
    const doc = await getIssued(app, args.document_id);
    if (doc.locked)
      throw refused(
        'Il documento è bloccato (di solito perché già inviato allo SDI): non si può modificare via API.',
      );
    const anyPaid = (doc.payments_list ?? []).some((p) => p.status === 'paid');
    if ((args.items || args.installments) && anyPaid) {
      throw refused(
        'Il documento ha rate già pagate: per cambiare righe o rate riportale prima a non pagate con fic_set_installment_status.',
      );
    }
    const data: IssuedDocument = { type: doc.type };
    const changed: string[] = [];
    if (args.date) {
      data.date = args.date;
      changed.push('date');
    }
    if (args.subject !== undefined) {
      data.subject = clean(args.subject);
      changed.push('subject');
    }
    if (args.visible_subject !== undefined) {
      data.visible_subject = clean(args.visible_subject);
      changed.push('visible_subject');
    }
    if (args.notes !== undefined) {
      data.notes = clean(args.notes);
      changed.push('notes');
    }
    if (args.payment_method_id) {
      data.payment_method = { id: args.payment_method_id };
      changed.push('payment_method');
    }
    if (args.ei_payment_method) {
      // Si reinviano i dati SDI esistenti (l'oggetto viene sostituito per intero), ma senza coordinate bancarie.
      data.ei_data = { ...stripBankKeys(doc.ei_data ?? {}), payment_method: args.ei_payment_method };
      changed.push('ei_payment_method');
    }
    let t: Totals | undefined;
    if (args.items) {
      const firstVat =
        doc.items_list?.find((i) => i.vat?.id !== undefined && i.vat?.id !== null)?.vat?.id ?? undefined;
      data.items_list = buildItems(args.items, firstVat ?? undefined, Boolean(doc.use_gross_prices));
      changed.push('items');
    }
    if (args.items || args.installments) {
      // Per il calcolo dei totali basta il documento senza coordinate bancarie e senza i testi non modificati.
      const base = withoutBankData({ ...doc, ...data, payments_list: undefined } as IssuedDocument);
      for (const k of ['notes', 'subject', 'visible_subject'] as const)
        if (data[k] === undefined) delete base[k];
      t = await totals(app, base, args.document_id);
      if (t.amount_due !== undefined && t.amount_due !== null && hasPayments(doc.type ?? 'invoice')) {
        data.payments_list = args.installments?.length
          ? explicitInstallments(t.amount_due, args.installments)
          : shiftedInstallments(doc, args.date ?? doc.date ?? todayRome(app.now()), t.amount_due);
        changed.push('installments');
      }
    }
    if (changed.length === 0) throw refused('Nessuna modifica indicata.');
    const pending: Pending = {
      action: 'DOC',
      id: args.document_id,
      state: String(doc.updated_at ?? ''),
      params: data,
      prompt: humanPrompt(`Modifica ${label(doc.type)} n. ${displayNumber(doc) ?? '?'}`, {
        documento: `${label(doc.type)} n. ${displayNumber(doc) ?? '?'} del ${doc.date ?? '?'} (ID ${args.document_id})`,
        cliente: doc.entity?.name ?? undefined,
        campi_modificati: changed.join(', '),
        nuovi_valori: {
          data: data.date,
          oggetto: data.visible_subject,
          oggetto_interno: data.subject,
          note: data.notes,
          metodo_di_pagamento: data.payment_method?.id ? `ID ${data.payment_method.id}` : undefined,
          modalita_sdi: args.ei_payment_method,
          righe: data.items_list?.map(
            (it) =>
              `${it.name ?? ''}: ${it.qty ?? 1} x ${it.net_price ?? it.gross_price} (aliquota ID ${it.vat?.id ?? '?'})`,
          ),
          rate: data.payments_list?.map((p) => `scadenza ${p.due_date}: ${p.amount}`),
        },
        totali: t ? totalsView(t) : undefined,
      }),
    };
    if (args.dry_run || !args.confirm) {
      return {
        dry_run: true,
        updated: false,
        changed,
        totals: t ? totalsView(t) : undefined,
        ...previewFields(app, call, pending, EXECUTE_HINT),
      };
    }
    await authorize(app, call, args.confirm, pending);
    const res = await callOp<DataResponse<IssuedDocument>>(await app.api(), 'modifyIssuedDocument', {
      pathParams: { document_id: args.document_id },
      body: { data, options: { fix_payments: true } },
    });
    app.cache.invalidate('issued:');
    app.log.audit('documento modificato', { id: args.document_id, fields: changed });
    return {
      updated: true,
      changed,
      totals: t ? totalsView(t) : undefined,
      document: res?.data ? issuedSummary(res.data, todayRome(app.now())) : undefined,
    };
  },
});

const TRANSFORMS: Record<string, string[]> = {
  quote: ['order', 'proforma', 'receipt', 'invoice'],
  work_report: ['order', 'proforma', 'receipt', 'invoice'],
  order: ['proforma', 'receipt', 'invoice'],
  proforma: ['receipt', 'invoice'],
};

export const convertIssuedDocument = defineTool({
  name: 'fic_convert_issued_document',
  title: 'Converti documento (es. proforma in fattura)',
  description: `Converte un documento in un altro tipo con la funzione ufficiale di Fatture in Cloud, che mantiene il collegamento tra i due: proforma in fattura o ricevuta; preventivo o rapportino in ordine, proforma, ricevuta o fattura; ordine in proforma, ricevuta o fattura.
Default: l'originale resta. Con keep_copy: false Fatture in Cloud elimina l'originale.
Prima chiamata (dry_run default true): anteprima del nuovo documento e token, senza creare nulla. Per convertire ripeti con gli stessi parametri, dry_run: false e confirm: il server chiede allora la conferma direttamente all'utente.
Converts a document (e.g. proforma to invoice) keeping the link between documents; preview, then human confirmation.`,
  minMode: 'write',
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  input: z.object({
    document_id: z.number().int().positive(),
    new_type: z.enum(['invoice', 'receipt', 'order', 'proforma']).default('invoice'),
    keep_copy: z.boolean().default(true).describe('Mantiene il documento originale.'),
    e_invoice: z
      .boolean()
      .optional()
      .describe('Il nuovo documento è una fattura elettronica; default l’impostazione del cliente.'),
    date: isoDate
      .optional()
      .describe('Data del nuovo documento; default quella proposta da Fatture in Cloud.'),
    dry_run: dryRunSchema,
    confirm: confirmSchema,
  }),
  operations: ['getIssuedDocument', 'transformIssuedDocument', 'createIssuedDocument'],
  docTypeOf: (a) => a.new_type,
  handler: async (args, app, call) => {
    const src = await getIssued(app, args.document_id);
    const allowed = TRANSFORMS[src.type ?? ''] ?? [];
    if (!allowed.includes(args.new_type)) {
      throw refused(
        `Un documento di tipo ${src.type} non si può convertire in ${args.new_type}. Conversioni ammesse: ${allowed.join(', ') || 'nessuna'}.`,
      );
    }
    const eInvoice =
      args.e_invoice ??
      (args.new_type === 'invoice' ? Boolean(src.e_invoice || src.entity?.e_invoice) : false);
    // transform è una lettura: prepara il nuovo documento senza crearlo.
    const res = await callOp<{ data?: IssuedDocument; options?: Record<string, unknown> }>(
      await app.api(),
      'transformIssuedDocument',
      {
        query: {
          original_document_id: args.document_id,
          new_type: args.new_type,
          type: src.type,
          e_invoice: eInvoice ? 1 : 0,
          transform_keep_copy: args.keep_copy ? 1 : 0,
        },
      },
    );
    if (!res?.data) throw refused('Fatture in Cloud non ha restituito il documento convertito.');
    const data = withoutBankData({ ...res.data, ...(args.date ? { date: args.date } : {}) });
    const from = { id: src.id, type: src.type, number: displayNumber(src), date: src.date };
    const pending: Pending = {
      action: 'DOC',
      id: `convert-${args.document_id}`,
      state: String(src.updated_at ?? ''),
      params: {
        new_type: args.new_type,
        keep_copy: args.keep_copy,
        e_invoice: eInvoice,
        date: args.date ?? null,
      },
      prompt: humanPrompt(
        `Converti ${label(src.type)} n. ${displayNumber(src) ?? '?'} in ${label(args.new_type)}`,
        docSummary(data, data as Totals, {
          origine: `${label(src.type)} n. ${displayNumber(src) ?? '?'} del ${src.date ?? '?'} (ID ${args.document_id})`,
          documento_originale: args.keep_copy ? 'resta' : 'VIENE ELIMINATO da Fatture in Cloud',
        }),
      ),
    };
    if (args.dry_run || !args.confirm) {
      return {
        dry_run: true,
        converted: false,
        from,
        new_type: args.new_type,
        warning: args.keep_copy
          ? undefined
          : 'Il documento originale verrà eliminato da Fatture in Cloud dopo la conversione.',
        ...previewFields(app, call, pending, EXECUTE_HINT),
      };
    }
    await authorize(app, call, args.confirm, pending);
    // La sezione options va reinviata intatta (https://developers.fattureincloud.it/docs/guides/invoice-join-transform/).
    const created = await create(app, data, res.options ?? {});
    return {
      converted: true,
      from: { ...from, kept: args.keep_copy },
      document: issuedSummary(created, todayRome(app.now())),
    };
  },
});

export const duplicateIssuedDocument = defineTool({
  name: 'fic_duplicate_issued_document',
  title: 'Duplica documento',
  description: `Duplica un documento emesso con una nuova data: copia cliente (dati aggiornati dall'anagrafica), righe con le stesse aliquote, sconti, ritenute, cassa, bollo, metodo di pagamento e sezionale; rigenera numero, rate (stesse distanze e proporzioni) e campi SDI. Totali calcolati da Fatture in Cloud.
replace_text sostituisce testi in oggetto, note e righe (per esempio "settembre" -> "ottobre"). Non copia mai coordinate bancarie: del metodo di pagamento copia solo l'id.
Prima chiamata (dry_run default true): anteprima e token, senza creare nulla. Per creare la copia ripeti con gli stessi parametri, dry_run: false e confirm: il server chiede allora la conferma direttamente all'utente.
Duplicates an issued document with a new date, optional text replacements and recalculated installments; preview, then human confirmation.`,
  minMode: 'write',
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  input: z.object({
    document_id: z.number().int().positive(),
    date: isoDate.optional().describe('Data del nuovo documento; default oggi.'),
    replace_text: z
      .array(z.object({ from: z.string().min(1).max(200), to: z.string().max(200) }))
      .max(10)
      .default([]),
    keep_numeration: z.boolean().default(true).describe('Usa lo stesso sezionale dell’originale.'),
    dry_run: dryRunSchema,
    confirm: confirmSchema,
  }),
  operations: ['getIssuedDocument', 'getClient', 'getNewIssuedDocumentTotals', 'createIssuedDocument'],
  handler: async (args, app, call) => {
    const src = await getIssued(app, args.document_id);
    const date = args.date ?? todayRome(app.now());
    if (!src.entity) throw refused('Il documento originale non ha un cliente: non si può duplicare.');
    let entity: Entity = src.entity;
    let entityNote: string | undefined;
    if (src.entity?.id) {
      try {
        entity = await getEntity(app, 'client', src.entity.id);
      } catch {
        entityNote = 'Cliente non più in anagrafica: usati i dati presenti nel documento originale.';
      }
    }
    const body = duplicateBody(src, {
      date,
      entity,
      replacements: args.replace_text.map((r) => ({ from: r.from, to: cleanOutgoingText(r.to) })),
      keepNumeration: args.keep_numeration,
    });
    const t = await totals(app, body);
    if (hasPayments(src.type ?? 'invoice') && t.amount_due !== undefined && t.amount_due !== null)
      body.payments_list = shiftedInstallments(src, date, t.amount_due);
    const preview = {
      source: { id: src.id, number: displayNumber(src), date: src.date },
      type: body.type,
      date,
      client: { id: entity.id ?? undefined, name: entity.name ?? undefined },
      totals: totalsView(t),
      installments: (body.payments_list ?? []).map((p) => ({ due_date: p.due_date, amount: p.amount })),
      note: entityNote,
    };
    const pending: Pending = {
      action: 'DOC',
      id: `dup-${args.document_id}`,
      state: String(src.updated_at ?? ''),
      params: body,
      prompt: humanPrompt(
        `Duplica ${label(src.type)} n. ${displayNumber(src) ?? '?'}`,
        docSummary(body, t, {
          origine: `${label(src.type)} n. ${displayNumber(src) ?? '?'} del ${src.date ?? '?'} (ID ${args.document_id})`,
        }),
      ),
    };
    if (args.dry_run || !args.confirm)
      return { dry_run: true, created: false, preview, ...previewFields(app, call, pending, EXECUTE_HINT) };
    await authorize(app, call, args.confirm, pending);
    const created = await create(app, body);
    return { created: true, document: issuedSummary(created, todayRome(app.now())), preview };
  },
});
