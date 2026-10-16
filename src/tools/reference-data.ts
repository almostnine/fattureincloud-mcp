import { z } from 'zod';
import { refused } from '../api/errors.js';
import type { AppContext } from '../context.js';
import type { ListResponse, PaymentAccount } from '../domain/types.js';
import { wrapFreeText } from '../safety/wrap.js';
import { defineTool } from './define.js';

interface RefList {
  operationId: string;
  path: string;
  query?: Record<string, string>;
  /** Su disco solo con FIC_CACHE=disk e solo per elenchi senza dati dell'azienda o personali. */
  persist: boolean;
  description: string;
}

const LISTS = {
  payment_accounts: {
    operationId: 'listPaymentAccounts',
    path: '/c/{company_id}/info/payment_accounts',
    query: { fieldset: 'detailed' },
    persist: false,
    description: 'conti di saldo (banca, cassa...) su cui registrare gli incassi',
  },
  payment_methods: {
    operationId: 'listPaymentMethods',
    path: '/c/{company_id}/info/payment_methods',
    query: { fieldset: 'detailed' },
    persist: false,
    description: 'metodi di pagamento (bonifico, contanti...)',
  },
  vat_types: {
    operationId: 'listVatTypes',
    path: '/c/{company_id}/info/vat_types',
    query: { fieldset: 'detailed' },
    persist: true,
    description:
      'aliquote IVA e nature (N2.2 forfettario, esenzioni...): le righe dei documenti vanno indicate per id',
  },
  cost_centers: {
    operationId: 'listCostCenters',
    path: '/c/{company_id}/info/cost_centers',
    persist: false,
    description: 'centri di costo',
  },
  revenue_centers: {
    operationId: 'listRevenueCenters',
    path: '/c/{company_id}/info/revenue_centers',
    persist: false,
    description: 'centri di ricavo',
  },
  received_document_categories: {
    operationId: 'listReceivedDocumentCategories',
    path: '/c/{company_id}/info/received_document_categories',
    persist: false,
    description: 'categorie delle spese',
  },
  product_categories: {
    operationId: 'listProductCategories',
    path: '/c/{company_id}/info/product_categories',
    query: { context: 'products' },
    persist: false,
    description: 'categorie dei prodotti',
  },
  archive_categories: {
    operationId: 'listArchiveCategories',
    path: '/c/{company_id}/info/archive_categories',
    persist: false,
    description: 'categorie dell’archivio',
  },
  templates: {
    operationId: 'listTemplates',
    path: '/c/{company_id}/settings/templates',
    persist: false,
    description: 'modelli grafici dell’azienda',
  },
  default_templates: {
    operationId: 'listDefaultTemplates',
    path: '/info/templates',
    query: { type: 'all' },
    persist: true,
    description: 'modelli grafici predefiniti',
  },
  price_lists: {
    operationId: 'getPriceLists',
    path: '/c/{company_id}/price_lists',
    persist: false,
    description: 'listini prezzi',
  },
  currencies: {
    operationId: 'listCurrencies',
    path: '/info/currencies',
    persist: true,
    description: 'valute',
  },
  countries: { operationId: 'listCountries', path: '/info/countries', persist: true, description: 'paesi' },
  detailed_countries: {
    operationId: 'listDetailedCountries',
    path: '/info/detailed_countries',
    persist: true,
    description: 'paesi con codici ISO',
  },
  languages: {
    operationId: 'listLanguages',
    path: '/info/languages',
    persist: true,
    description: 'lingue dei documenti',
  },
  units_of_measure: {
    operationId: 'listUnitsOfMeasure',
    path: '/info/measures',
    persist: true,
    description: 'unità di misura',
  },
  delivery_note_causals: {
    operationId: 'listDeliveryNotesDefaultCausals',
    path: '/info/dn_causals',
    persist: true,
    description: 'causali di trasporto dei DDT',
  },
  cities: {
    operationId: 'listCities',
    path: '/info/cities',
    persist: true,
    description: 'comuni italiani (serve postal_code o city)',
  },
} satisfies Record<string, RefList>;

export type RefListName = keyof typeof LISTS;
const NAMES = Object.keys(LISTS) as [RefListName, ...RefListName[]];

export async function loadList<T = Record<string, unknown>>(
  app: AppContext,
  name: RefListName,
  extra: Record<string, string> = {},
): Promise<T[]> {
  const def: RefList = LISTS[name];
  const key = `ref:${name}:${JSON.stringify(extra)}`;
  const cached = app.cache.get(key);
  if (cached) return cached as T[];
  const client = def.path.includes('{company_id}') ? await app.api() : app.rawClient();
  const res = await client.request<ListResponse<T>>({
    operationId: def.operationId,
    method: 'GET',
    path: def.path,
    query: { ...def.query, ...extra },
  });
  const data = res?.data ?? [];
  // Un elenco vuoto può essere un effetto di permessi o configurazione: non lo si conserva.
  if (data.length) app.cache.set(key, data, app.config.cacheTtlSeconds, def.persist);
  return data;
}

export async function listPaymentAccounts(app: AppContext): Promise<PaymentAccount[]> {
  return loadList<PaymentAccount>(app, 'payment_accounts');
}

/** I nomi scelti dagli utenti restano dati: i campi testuali liberi vengono delimitati. */
function present(name: RefListName, rows: Array<Record<string, unknown>>) {
  if (
    name === 'cities' ||
    name === 'countries' ||
    name === 'currencies' ||
    name === 'languages' ||
    name === 'units_of_measure'
  )
    return rows;
  return rows.map((r) => {
    const out = wrapFreeText(r) as Record<string, unknown>;
    return out;
  });
}

export const referenceData = defineTool({
  name: 'fic_reference_data',
  title: 'Elenchi di supporto',
  description: `Elenchi di riferimento dell'azienda e generali: ${NAMES.map((n) => `${n} (${LISTS[n].description})`).join('; ')}.
Usalo per trovare gli ID da passare agli altri tool: conto di saldo per segnare una rata pagata, aliquota IVA per le righe di un documento, metodo di pagamento, centro di ricavo.
Reference lists: payment accounts, payment methods, VAT types, cost and revenue centers, categories, currencies, countries, languages, units, templates, cities, price lists.`,
  minMode: 'readonly',
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  input: z.object({
    list: z.enum(NAMES).describe('Elenco da leggere.'),
    postal_code: z
      .string()
      .regex(/^\d{5}$/)
      .optional()
      .describe('Solo per cities: CAP.'),
    city: z.string().min(2).max(60).optional().describe('Solo per cities: nome del comune.'),
    context: z
      .enum(['products', 'issued_documents', 'received_documents'])
      .optional()
      .describe('Solo per product_categories.'),
    price_list_id: z
      .string()
      .max(40)
      .optional()
      .describe('Solo per price_lists: restituisce le voci di quel listino.'),
  }),
  operations: [...Object.values(LISTS).map((l) => l.operationId), 'getPriceListItems'],
  handler: async (args, app) => {
    if (args.list === 'cities' && !args.postal_code && !args.city)
      throw refused('Per cities indica postal_code o city.');
    if (args.list === 'price_lists' && args.price_list_id) {
      const client = await app.api();
      const res = await client.request<ListResponse<Record<string, unknown>>>({
        operationId: 'getPriceListItems',
        method: 'GET',
        path: '/c/{company_id}/price_lists/{price_list_id}/items',
        pathParams: { price_list_id: args.price_list_id },
      });
      return {
        list: 'price_list_items',
        price_list_id: args.price_list_id,
        items: wrapFreeText(res?.data ?? []),
      };
    }
    const extra: Record<string, string> = {};
    if (args.postal_code) extra.postal_code = args.postal_code;
    if (args.city) extra.city = args.city;
    if (args.list === 'product_categories' && args.context) extra.context = args.context;
    const rows = await loadList(app, args.list, extra);
    return { list: args.list, count: rows.length, items: present(args.list, rows) };
  },
});
