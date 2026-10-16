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
import { cleanOutgoingText } from '../safety/untrusted.js';
import { docTypeSchema } from './common.js';
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
  net_price: z.number().optional().describe('Prezzo unitario netto (default).'),
  gross_price: z.number().optional().describe('Prezzo unitario lordo, solo con use_gross_prices.'),
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
      throw refused(`Riga ${i + 1}: manca ${gross ? 'gross_price' : 'net_price'}.`);
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
Con dry_run: true restituisce l'anteprima con totali e rate senza creare nulla: usalo prima di creare e mostra l'anteprima all'utente.
Aliquote: indica vat_id (elenco con fic_reference_data, list "vat_types"); se manca si usa l'aliquota predefinita del cliente o dell'azienda (per un forfettario è di solito l'aliquota a zero con natura N2.2).
Creates an issued document; use dry_run to preview totals and installments first.`,
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
    end_of_month: z.boolean().default(false).describe('Scadenze a fine mese.'),
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
    dry_run: z.boolean().default(false).describe('Anteprima senza creare nulla.'),
  }),
  operations: [
    'getClient',
    'getIssuedDocumentPreCreateInfo',
    'getNewIssuedDocumentTotals',
    'createIssuedDocument',
  ],
  docTypeOf: (a) => a.type,
  handler: async (args, app) => {
    const entity: Entity = await getEntity(app, 'client', args.client_id);
    const info = await preCreateInfo(app, args.type);
    const date = args.date ?? todayRome(app.now());
    const gross = args.use_gross_prices ?? Boolean(info.default_values?.use_gross_prices);
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
    if (hasPayments(args.type) && t.amount_due !== undefined) {
      const terms = {
        days: args.payment_terms_days ?? entity.default_payment_terms ?? 30,
        type: args.end_of_month ? 'end_of_month' : 'standard',
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
    if (args.dry_run)
      return {
        dry_run: true,
        created: false,
        preview,
        next_step: 'Mostra l’anteprima all’utente; se conferma, ripeti con dry_run: false.',
      };

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
Updates an issued document, preserving installment status.`,
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
  }),
  operations: ['getIssuedDocument', 'getExistingIssuedDocumentTotals', 'modifyIssuedDocument'],
  handler: async (args, app) => {
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
      data.ei_data = { ...(doc.ei_data ?? {}), payment_method: args.ei_payment_method };
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
      t = await totals(
        app,
        { ...doc, ...data, payments_list: undefined } as IssuedDocument,
        args.document_id,
      );
      if (t.amount_due !== undefined && hasPayments(doc.type ?? 'invoice')) {
        data.payments_list = args.installments?.length
          ? explicitInstallments(t.amount_due, args.installments)
          : shiftedInstallments(doc, args.date ?? doc.date ?? todayRome(app.now()), t.amount_due);
        changed.push('installments');
      }
    }
    if (changed.length === 0) throw refused('Nessuna modifica indicata.');
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
Con keep_copy: false l'originale viene eliminato da Fatture in Cloud: chiedi conferma all'utente. Default: l'originale resta.
Converts a document (e.g. proforma to invoice) keeping the link between documents.`,
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
  }),
  operations: ['getIssuedDocument', 'transformIssuedDocument', 'createIssuedDocument'],
  docTypeOf: (a) => a.new_type,
  handler: async (args, app) => {
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
    const data = { ...res.data, ...(args.date ? { date: args.date } : {}) };
    // La sezione options va reinviata intatta (https://developers.fattureincloud.it/docs/guides/invoice-join-transform/).
    const created = await create(app, data, res.options ?? {});
    return {
      converted: true,
      from: { id: src.id, type: src.type, number: displayNumber(src), kept: args.keep_copy },
      document: issuedSummary(created, todayRome(app.now())),
    };
  },
});

export const duplicateIssuedDocument = defineTool({
  name: 'fic_duplicate_issued_document',
  title: 'Duplica documento',
  description: `Duplica un documento emesso con una nuova data: copia cliente (dati aggiornati dall'anagrafica), righe con le stesse aliquote, sconti, ritenute, cassa, bollo, metodo di pagamento e sezionale; rigenera numero, rate (stesse distanze e proporzioni) e campi SDI. Totali calcolati da Fatture in Cloud.
replace_text sostituisce testi in oggetto, note e righe (per esempio "settembre" -> "ottobre"). Con dry_run: true mostra l'anteprima senza creare.
Duplicates an issued document with a new date, optional text replacements and recalculated installments.`,
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
    dry_run: z.boolean().default(false),
  }),
  operations: ['getIssuedDocument', 'getClient', 'getNewIssuedDocumentTotals', 'createIssuedDocument'],
  handler: async (args, app) => {
    const src = await getIssued(app, args.document_id);
    const date = args.date ?? todayRome(app.now());
    let entity: Entity = src.entity ?? {};
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
    if (hasPayments(src.type ?? 'invoice') && t.amount_due !== undefined)
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
    if (args.dry_run) return { dry_run: true, created: false, preview };
    const created = await create(app, body);
    return { created: true, document: issuedSummary(created, todayRome(app.now())), preview };
  },
});
