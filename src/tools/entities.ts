import { z } from 'zod';
import { refused } from '../api/errors.js';
import { fetchAll, fetchPage } from '../api/paginate.js';
import type { AppContext } from '../context.js';
import { todayRome } from '../domain/dates.js';
import { entityName } from '../domain/documents.js';
import { installmentRows } from '../domain/installments.js';
import { fromCents, toCents } from '../domain/money.js';
import { Q } from '../domain/query.js';
import type { DataResponse, Entity, IssuedDocument } from '../domain/types.js';
import { cleanOutgoingText, untrusted } from '../safety/untrusted.js';
import { pagingShape } from './common.js';
import { defineTool } from './define.js';

const kindSchema = z
  .enum(['client', 'supplier'])
  .default('client')
  .describe('client (cliente) o supplier (fornitore).');

const PATHS = {
  client: {
    list: '/c/{company_id}/entities/clients',
    one: '/c/{company_id}/entities/clients/{id}',
    listOp: 'listClients',
    getOp: 'getClient',
    createOp: 'createClient',
    modifyOp: 'modifyClient',
    param: 'client_id',
  },
  supplier: {
    list: '/c/{company_id}/entities/suppliers',
    one: '/c/{company_id}/entities/suppliers/{id}',
    listOp: 'listSuppliers',
    getOp: 'getSupplier',
    createOp: 'createSupplier',
    modifyOp: 'modifySupplier',
    param: 'supplier_id',
  },
} as const;

function entityPath(kind: 'client' | 'supplier'): string {
  return PATHS[kind].one.replace('{id}', `{${PATHS[kind].param}}`);
}

export function entitySummary(e: Entity) {
  return {
    id: e.id,
    name: untrusted(entityName(e), 200),
    code: e.code || undefined,
    type: e.type || undefined,
    vat_number: e.vat_number || undefined,
    tax_code: e.tax_code || undefined,
    city: untrusted(e.address_city, 100),
    email: e.email || undefined,
    certified_email: e.certified_email || undefined,
  };
}

export function entityDetail(e: Entity) {
  return {
    ...entitySummary(e),
    first_name: untrusted(e.first_name, 100),
    last_name: untrusted(e.last_name, 100),
    contact_person: untrusted(e.contact_person, 200),
    address: {
      street: untrusted(e.address_street, 200),
      postal_code: e.address_postal_code,
      city: untrusted(e.address_city, 100),
      province: untrusted(e.address_province, 10),
      extra: untrusted(e.address_extra, 200),
      country: e.country,
      country_iso: e.country_iso,
    },
    phone: e.phone,
    ei_code: e.ei_code,
    e_invoice: e.e_invoice ?? undefined,
    default_payment_terms: e.default_payment_terms ?? undefined,
    default_payment_terms_type: e.default_payment_terms_type ?? undefined,
    default_vat:
      e.default_vat?.id !== undefined && e.default_vat?.id !== null
        ? { id: e.default_vat.id, rate: e.default_vat.value }
        : undefined,
    default_payment_method: e.default_payment_method?.id
      ? { id: e.default_payment_method.id, name: e.default_payment_method.name ?? undefined }
      : undefined,
    bank_iban: e.bank_iban,
    notes: untrusted(e.notes),
    updated_at: e.updated_at,
  };
}

/** Riconosce P.IVA, codice fiscale ed email nella ricerca libera. */
function searchQuery(text: string): Q {
  const t = text.trim();
  const q = new Q();
  const vat = t.replace(/^IT/i, '').replace(/\s/g, '');
  if (/^\d{11}$/.test(vat))
    return q.anyOf(
      new Q().strEq('vat_number', vat),
      new Q().strEq('vat_number', `IT${vat}`),
      new Q().strEq('tax_code', vat),
    );
  if (/^[A-Za-z0-9]{16}$/.test(t)) return q.strEq('tax_code', t.toUpperCase());
  if (t.includes('@') && !t.includes("'"))
    return q.anyOf(new Q().strEq('email', t), new Q().strEq('certified_email', t));
  return q.anyOf(new Q().textContains('name', t), new Q().textContains('code', t));
}

export async function getEntity(app: AppContext, kind: 'client' | 'supplier', id: number): Promise<Entity> {
  const client = await app.api();
  const p = PATHS[kind];
  const res = await client.request<DataResponse<Entity>>({
    operationId: p.getOp,
    method: 'GET',
    path: entityPath(kind),
    pathParams: { [p.param]: id },
    query: { fieldset: 'detailed' },
  });
  if (!res?.data) throw refused(`${kind === 'client' ? 'Cliente' : 'Fornitore'} ${id} non trovato.`);
  return res.data;
}

export const searchEntities = defineTool({
  name: 'fic_search_entities',
  title: 'Cerca clienti e fornitori',
  description: `Cerca clienti (default) o fornitori nell'anagrafica per nome, codice, partita IVA, codice fiscale o email; senza query li elenca tutti, a pagine.
Esempi: {query:"Rossi"}; {query:"01234567890"}; {kind:"supplier", query:"Enel"}.
Searches clients or suppliers by name, code, VAT number, tax code or email.`,
  minMode: 'readonly',
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  input: z.object({
    kind: kindSchema,
    query: z.string().min(1).max(100).optional().describe('Nome, codice, P.IVA, codice fiscale o email.'),
    sort: z.enum(['name', '-name', 'created_at', '-created_at', 'updated_at', '-updated_at']).default('name'),
    ...pagingShape,
  }),
  operations: ['listClients', 'listSuppliers'],
  handler: async (args, app) => {
    const client = await app.api();
    const p = PATHS[args.kind];
    const spec = {
      operationId: p.listOp,
      path: p.list,
      query: {
        q: args.query ? searchQuery(args.query).build() : undefined,
        sort: args.sort,
        fieldset: 'detailed',
      },
    };
    if (args.all_pages) {
      const all = await fetchAll<Entity>(client, spec, app.config.maxPages);
      return {
        kind: args.kind,
        items: all.items.map(entitySummary),
        total: all.total,
        truncated: all.truncated || undefined,
      };
    }
    const page = await fetchPage<Entity>(client, spec, args.page, args.per_page);
    return {
      kind: args.kind,
      items: page.items.map(entitySummary),
      page: page.page,
      total: page.total,
      has_more: page.hasMore,
      next_page: page.hasMore ? page.page + 1 : undefined,
    };
  },
});

export const getEntityTool = defineTool({
  name: 'fic_get_entity',
  title: 'Dettaglio cliente o fornitore',
  description: `Scheda completa di un cliente o fornitore: dati fiscali, indirizzo, contatti, codice SDI, termini e metodo di pagamento predefiniti. Per i clienti, con include_open_installments, aggiunge le rate non pagate e scadute del cliente.
Shows a client or supplier; for clients optionally adds unpaid and overdue installments.`,
  minMode: 'readonly',
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  input: z.object({
    kind: kindSchema,
    id: z.number().int().positive(),
    include_open_installments: z
      .boolean()
      .default(false)
      .describe('Solo clienti: aggiunge rate non pagate e scadute.'),
  }),
  operations: ['getClient', 'getSupplier', 'listIssuedDocuments'],
  handler: async (args, app) => {
    const e = await getEntity(app, args.kind, args.id);
    const out: Record<string, unknown> = { kind: args.kind, ...entityDetail(e) };
    if (args.kind === 'client' && args.include_open_installments) {
      const today = todayRome(app.now());
      const all = await fetchAll<IssuedDocument>(
        await app.api(),
        {
          operationId: 'listIssuedDocuments',
          path: '/c/{company_id}/issued_documents',
          query: {
            type: 'invoice',
            q: new Q().eq('entity.id', args.id).raw('next_due_date is not null').build(),
            fields: 'id,type,number,numeration,date,entity,payments_list',
          },
        },
        app.config.maxPages,
      );
      const rows = installmentRows(all.items, { status: 'not_paid', today });
      out.open_installments = {
        count: rows.length,
        amount: fromCents(rows.reduce((a, r) => a + toCents(r.amount), 0)),
        overdue_amount: fromCents(rows.filter((r) => r.overdue).reduce((a, r) => a + toCents(r.amount), 0)),
        items: rows.map(({ client_id, client_name, client_email, client_certified_email, ...r }) => r),
      };
    }
    return out;
  },
});

const entityFields = {
  name: z.string().min(1).max(250).optional().describe('Ragione sociale o nome completo.'),
  type: z
    .enum(['company', 'person', 'pa', 'condo'])
    .optional()
    .describe('company (azienda), person (privato), pa (pubblica amministrazione), condo (condominio).'),
  first_name: z.string().max(100).optional(),
  last_name: z.string().max(100).optional(),
  code: z.string().max(50).optional().describe('Codice interno.'),
  vat_number: z.string().max(30).optional().describe('Partita IVA.'),
  tax_code: z.string().max(30).optional().describe('Codice fiscale.'),
  address_street: z.string().max(200).optional(),
  address_postal_code: z.string().max(20).optional(),
  address_city: z.string().max(100).optional(),
  address_province: z.string().max(5).optional(),
  address_extra: z.string().max(200).optional(),
  country: z.string().max(60).optional().describe('Paese, per esempio "Italia".'),
  email: z.string().email().optional(),
  certified_email: z.string().email().optional().describe('PEC.'),
  phone: z.string().max(40).optional(),
  contact_person: z.string().max(100).optional(),
  ei_code: z
    .string()
    .regex(/^[A-Za-z0-9]{6,7}$/)
    .optional()
    .describe(
      'Codice destinatario SDI: 7 caratteri (6 per la PA); "0000000" se si usa la PEC o per i privati.',
    ),
  e_invoice: z.boolean().optional().describe('Il cliente riceve fatture elettroniche.'),
  default_payment_terms: z
    .number()
    .int()
    .min(0)
    .max(365)
    .optional()
    .describe('Giorni di pagamento predefiniti.'),
  notes: z.string().max(2000).optional(),
};

/** Campi che esistono solo per i clienti (schema Client dell'OpenAPI). */
const CLIENT_ONLY = ['ei_code', 'e_invoice', 'default_payment_terms'];

function cleanEntity(data: Record<string, unknown>, kind: 'client' | 'supplier'): Record<string, unknown> {
  if (kind === 'supplier') {
    const bad = CLIENT_ONLY.filter((k) => data[k] !== undefined);
    if (bad.length) throw refused(`Per i fornitori questi campi non esistono: ${bad.join(', ')}.`);
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    out[k] = typeof v === 'string' ? cleanOutgoingText(v) : v;
  }
  return out;
}

/** Cerca anagrafiche che sembrano la stessa persona o azienda: stessa P.IVA, codice fiscale, email o nome. */
async function findDuplicates(
  app: AppContext,
  kind: 'client' | 'supplier',
  data: Record<string, unknown>,
): Promise<Entity[]> {
  const alternatives: Q[] = [];
  const vat =
    typeof data.vat_number === 'string' ? data.vat_number.replace(/^IT/i, '').replace(/\s/g, '') : '';
  if (vat && !vat.includes("'"))
    alternatives.push(new Q().strEq('vat_number', vat), new Q().strEq('vat_number', `IT${vat}`));
  const cf = typeof data.tax_code === 'string' ? data.tax_code.trim().toUpperCase() : '';
  if (cf && !cf.includes("'")) alternatives.push(new Q().strEq('tax_code', cf));
  const email = typeof data.email === 'string' ? data.email.trim() : '';
  if (email && !email.includes("'")) alternatives.push(new Q().strEq('email', email));
  const name = typeof data.name === 'string' ? data.name : '';
  if (name) alternatives.push(new Q().textContains('name', name));
  if (!alternatives.length) return [];
  const p = PATHS[kind];
  const page = await fetchPage<Entity>(
    await app.api(),
    {
      operationId: p.listOp,
      path: p.list,
      query: { q: new Q().anyOf(...alternatives).build(), fieldset: 'detailed' },
    },
    1,
    20,
  );
  const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  // Il filtro per nome è "contiene": si tengono solo i nomi uguali, oltre alle corrispondenze esatte sugli altri campi.
  return page.items.filter(
    (e) =>
      (vat && (e.vat_number ?? '').replace(/^IT/i, '') === vat) ||
      (cf && (e.tax_code ?? '').toUpperCase() === cf) ||
      (email && norm(e.email) === norm(email)) ||
      (name && norm(entityName(e)) === norm(name)),
  );
}

export const createEntity = defineTool({
  name: 'fic_create_entity',
  title: 'Crea cliente o fornitore',
  description: `Crea un nuovo cliente (default) o fornitore nell'anagrafica di Fatture in Cloud. Serve almeno il nome; per fatturare a un privato servono di solito codice fiscale e indirizzo, per un'azienda partita IVA, indirizzo e codice destinatario SDI (ei_code) o PEC.
Prima di creare, il tool cerca anagrafiche con la stessa partita IVA, codice fiscale, email o nome: se ne trova, non crea nulla e le restituisce. Mostrale all'utente; se conferma che è davvero un nuovo cliente, ripeti con allow_duplicate: true.
Raccogli i dati dall'utente e riepilogali prima di creare: non inventare dati mancanti.
Creates a client or supplier, checking for likely duplicates first.`,
  minMode: 'write',
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  input: z.object({
    kind: kindSchema,
    ...entityFields,
    name: z.string().min(1).max(250).describe('Ragione sociale o nome completo.'),
    allow_duplicate: z
      .boolean()
      .default(false)
      .describe(
        'Crea anche se esistono anagrafiche simili: solo dopo che l’utente ha confermato che è un soggetto diverso.',
      ),
  }),
  operations: ['listClients', 'listSuppliers', 'createClient', 'createSupplier'],
  handler: async ({ kind, allow_duplicate, ...data }, app) => {
    const body = cleanEntity(data, kind);
    if (!allow_duplicate) {
      const dups = await findDuplicates(app, kind, body);
      if (dups.length) {
        return {
          kind,
          created: false,
          possible_duplicates: dups.map(entitySummary),
          next_step:
            'Esistono già anagrafiche con dati uguali: mostrale all’utente. Se è lo stesso soggetto usa quella esistente (eventualmente aggiornala con fic_update_entity); se è davvero nuovo, ripeti con allow_duplicate: true.',
        };
      }
    }
    const client = await app.api();
    const p = PATHS[kind];
    const res = await client.request<DataResponse<Entity>>({
      operationId: p.createOp,
      method: 'POST',
      path: p.list,
      body: { data: body },
    });
    app.cache.invalidate('entity:');
    app.log.audit('anagrafica creata', { kind, id: res?.data?.id });
    return { kind, created: true, ...entityDetail(res?.data ?? {}) };
  },
});

export const updateEntity = defineTool({
  name: 'fic_update_entity',
  title: 'Modifica cliente o fornitore',
  description: `Modifica i campi indicati di un cliente o fornitore; i campi non indicati restano invariati. Restituisce i valori prima e dopo per i campi cambiati.
Updates the given fields of a client or supplier.`,
  minMode: 'write',
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  input: z.object({ kind: kindSchema, id: z.number().int().positive(), ...entityFields }),
  operations: ['getClient', 'getSupplier', 'modifyClient', 'modifySupplier'],
  handler: async ({ kind, id, ...data }, app) => {
    const changes = cleanEntity(data, kind);
    if (Object.keys(changes).length === 0) throw refused('Nessun campo da modificare.');
    const before = await getEntity(app, kind, id);
    const client = await app.api();
    const p = PATHS[kind];
    const res = await client.request<DataResponse<Entity>>({
      operationId: p.modifyOp,
      method: 'PUT',
      path: entityPath(kind),
      pathParams: { [p.param]: id },
      body: { data: changes },
    });
    app.cache.invalidate('entity:');
    app.log.audit('anagrafica modificata', { kind, id, fields: Object.keys(changes) });
    const after = res?.data ?? {};
    const diff: Record<string, { before: unknown; after: unknown }> = {};
    for (const k of Object.keys(changes)) {
      diff[k] = {
        before: (before as Record<string, unknown>)[k] ?? null,
        after: (after as Record<string, unknown>)[k] ?? changes[k],
      };
    }
    return { kind, id, updated: true, changes: diff };
  },
});
