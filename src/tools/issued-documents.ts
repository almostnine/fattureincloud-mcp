import { z } from 'zod';
import { refused } from '../api/errors.js';
import { fetchAll, fetchPage } from '../api/paginate.js';
import type { AppContext } from '../context.js';
import { todayRome } from '../domain/dates.js';
import {
  ISSUED_LIST_FIELDS,
  issuedDetail,
  issuedSummary,
  paymentSummary,
  sumField,
} from '../domain/documents.js';
import { Q } from '../domain/query.js';
import type { DataResponse, IssuedDocument, IssuedType } from '../domain/types.js';
import { docTypeSchema, pagingShape, periodShape, resolvePeriod } from './common.js';
import { defineTool } from './define.js';

const LIST_PATH = '/c/{company_id}/issued_documents';

export async function getIssued(app: AppContext, id: number): Promise<IssuedDocument> {
  const client = await app.api();
  const res = await client.request<DataResponse<IssuedDocument>>({
    operationId: 'getIssuedDocument',
    method: 'GET',
    path: '/c/{company_id}/issued_documents/{document_id}',
    pathParams: { document_id: id },
    query: { fieldset: 'detailed' },
  });
  if (!res?.data) throw refused(`Documento ${id} non trovato.`);
  return res.data;
}

/** Cerca un documento per numero, anno e (facoltativo) sezionale. */
export async function findByNumber(
  app: AppContext,
  type: IssuedType,
  number: number,
  year: number,
  numeration?: string,
) {
  const client = await app.api();
  const q = new Q().eq('number', number).dateGte('date', `${year}-01-01`).dateLte('date', `${year}-12-31`);
  if (numeration) q.strEq('numeration', numeration);
  const page = await fetchPage<IssuedDocument>(
    client,
    {
      operationId: 'listIssuedDocuments',
      path: LIST_PATH,
      query: { type, q: q.build(), fields: 'id,number,numeration,date,entity' },
    },
    1,
    20,
  );
  return page.items;
}

const listInput = z.object({
  type: docTypeSchema.default('invoice'),
  ...periodShape,
  client_id: z.number().int().positive().optional().describe('ID del cliente in Fatture in Cloud.'),
  client_name: z.string().min(2).max(100).optional().describe('Parte del nome del cliente.'),
  number: z.number().int().positive().optional().describe('Numero del documento.'),
  numeration: z.string().max(20).optional().describe('Sezionale, per esempio "/A".'),
  payment_status: z
    .enum(['paid', 'not_paid', 'partially_paid', 'overdue'])
    .optional()
    .describe(
      'Filtra per stato di pagamento; overdue = almeno una rata scaduta e non pagata. Attiva la lettura di tutte le pagine.',
    ),
  ei_status: z
    .string()
    .max(30)
    .optional()
    .describe(
      'Filtra per stato SDI (not_sent, sent, accepted, rejected, discarded, error...). Attiva la lettura di tutte le pagine.',
    ),
  sort: z
    .enum([
      'date',
      '-date',
      'number',
      '-number',
      'amount_gross',
      '-amount_gross',
      'next_due_date',
      '-next_due_date',
    ])
    .default('-date')
    .describe('Ordinamento; il segno meno indica decrescente.'),
  ...pagingShape,
});

export const listIssuedDocuments = defineTool({
  name: 'fic_list_issued_documents',
  title: 'Elenco documenti emessi',
  description: `Elenca fatture, note di credito, proforma, preventivi, ordini, DDT e gli altri documenti emessi, con filtri per periodo, cliente, numero, stato di pagamento e stato SDI. Per ogni documento: numero, data, cliente, importi, stato di pagamento, importo da incassare e scaduto, stato della fattura elettronica.
Esempi: "fatture di ottobre 2026" -> {type:"invoice", year:2026, month:10}; "note di credito del 2026" -> {type:"credit_note", year:2026}; "fatture non pagate di Rossi" -> {client_name:"Rossi", payment_status:"not_paid"}.
Per le singole rate usa fic_list_installments; per il dettaglio di un documento fic_get_issued_document.
Lists issued documents (invoices, credit notes, quotes...) with filters, pagination and payment status.`,
  minMode: 'readonly',
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  input: listInput,
  operations: ['listIssuedDocuments'],
  docTypeOf: (a) => a.type,
  handler: async (args, app) => {
    const client = await app.api();
    const today = todayRome(app.now());
    const period = resolvePeriod(args, app.now());
    const q = new Q().dateGte('date', period.from).dateLte('date', period.to);
    if (args.client_id) q.eq('entity.id', args.client_id);
    q.textContains('entity.name', args.client_name);
    if (args.number) q.eq('number', args.number);
    if (args.numeration) q.strEq('numeration', args.numeration);
    // Restringe lato server quando possibile: next_due_date è la scadenza della prossima rata non pagata.
    if (args.payment_status === 'overdue') q.dateLt('next_due_date', today);
    if (args.payment_status === 'not_paid' || args.payment_status === 'partially_paid')
      q.raw('next_due_date is not null');
    const spec = {
      operationId: 'listIssuedDocuments',
      path: LIST_PATH,
      query: { type: args.type, q: q.build(), sort: args.sort, fields: ISSUED_LIST_FIELDS },
    };

    const postFilter = Boolean(args.payment_status || args.ei_status);
    const keep = (d: IssuedDocument) => {
      if (args.ei_status && d.ei_status !== args.ei_status) return false;
      if (!args.payment_status) return true;
      const s = paymentSummary(d.payments_list, today);
      if (args.payment_status === 'overdue') return s.amount_overdue > 0;
      return s.payment_status === args.payment_status;
    };

    if (args.all_pages || postFilter) {
      const all = await fetchAll<IssuedDocument>(client, spec, app.config.maxPages);
      const docs = all.items.filter(keep);
      return {
        items: docs.map((d) => issuedSummary(d, today)),
        count: docs.length,
        total_before_local_filters: postFilter ? all.total : undefined,
        pages_read: all.pagesRead,
        truncated: all.truncated || undefined,
        truncated_note: all.truncated
          ? `Letti solo i primi ${all.pagesRead * 100} documenti su ${all.total}: restringi il periodo.`
          : undefined,
        sums: sums(docs, today),
        period,
      };
    }

    const page = await fetchPage<IssuedDocument>(client, spec, args.page, args.per_page);
    return {
      items: page.items.map((d) => issuedSummary(d, today)),
      page: page.page,
      per_page: page.perPage,
      total: page.total,
      has_more: page.hasMore,
      next_page: page.hasMore ? page.page + 1 : undefined,
      sums_this_page: sums(page.items, today),
      period,
    };
  },
});

function sums(docs: IssuedDocument[], today: string) {
  return {
    amount_net: sumField(docs, (d) => d.amount_net),
    amount_vat: sumField(docs, (d) => d.amount_vat),
    amount_gross: sumField(docs, (d) => d.amount_gross),
    amount_outstanding: sumField(docs, (d) => paymentSummary(d.payments_list, today).amount_outstanding),
    amount_overdue: sumField(docs, (d) => paymentSummary(d.payments_list, today).amount_overdue),
  };
}

const getInput = z.object({
  document_id: z.number().int().positive().optional().describe('ID del documento in Fatture in Cloud.'),
  number: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Numero del documento (in alternativa all’ID), per esempio 33 per "33/2026".'),
  year: z
    .number()
    .int()
    .min(2000)
    .max(2100)
    .optional()
    .describe('Anno del documento, obbligatorio con number.'),
  numeration: z.string().max(20).optional().describe('Sezionale, se il numero è ambiguo.'),
  type: docTypeSchema.default('invoice'),
});

export const getIssuedDocument = defineTool({
  name: 'fic_get_issued_document',
  title: 'Dettaglio documento emesso',
  description: `Dettaglio di un documento emesso, per ID oppure per numero e anno ("dettaglio della fattura 33/2026" -> {number:33, year:2026}). Restituisce cliente, righe con aliquote, totali, metodo di pagamento, rate con stato (pagata, non pagata, scaduta, conto di saldo, data di pagamento), stato della fattura elettronica, se è bloccato e il link temporaneo al PDF.
Shows one issued document by ID or by number and year, with items, totals, installments and e-invoice status.`,
  minMode: 'readonly',
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  input: getInput,
  operations: ['getIssuedDocument', 'listIssuedDocuments'],
  docTypeOf: (a) => a.type,
  handler: async (args, app) => {
    const today = todayRome(app.now());
    let id = args.document_id;
    if (!id) {
      if (!args.number || !args.year)
        throw refused('Indica document_id oppure number e year (per esempio number 33, year 2026).');
      const found = await findByNumber(app, args.type, args.number, args.year, args.numeration);
      if (found.length === 0) {
        throw refused(
          `Nessun documento di tipo ${args.type} con numero ${args.number} nel ${args.year}. Controlla tipo, numero e anno.`,
        );
      }
      if (found.length > 1) {
        return {
          ambiguous: true,
          message:
            'Più documenti con questo numero (sezionali diversi): ripeti indicando document_id o numeration.',
          candidates: found.map((d) => issuedSummary(d, today)),
        };
      }
      id = found[0]!.id!;
    }
    return issuedDetail(await getIssued(app, id), today);
  },
});
