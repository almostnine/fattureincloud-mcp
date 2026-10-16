import { readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, resolve, sep } from 'node:path';
import { z } from 'zod';
import { OPERATIONS, SPEC_VERSION } from '../api/catalog.generated.js';
import type { CatalogOperation, Effect } from '../api/catalog-types.js';
import { refused } from '../api/errors.js';
import { callOp } from '../api/ops.js';
import { MAX_PER_PAGE } from '../api/paginate.js';
import type { Mode } from '../config.js';
import type { AppContext } from '../context.js';
import { cleanOutgoingText, untrusted } from '../safety/untrusted.js';
import { defineTool } from './define.js';
import { toolRegistry } from './registry.js';

const API_REFERENCE = 'https://developers.fattureincloud.it/api-reference/';
const MAX_OUTPUT_CHARS = 120_000;

/** Campi di testo libero che possono contenere istruzioni scritte da terzi. */
const FREE_TEXT_KEYS = new Set([
  'notes',
  'description',
  'subject',
  'visible_subject',
  'body',
  'message',
  'reason',
  'name',
  'entity_name',
  'contact_person',
  'address_street',
  'address_extra',
  'shipping_address',
  'dn_ai_notes',
  'dn_ai_destination',
  'causal',
  'details',
  'title',
]);

const MODE_FOR: Record<Effect, Mode> = {
  read: 'readonly',
  write: 'write',
  delete: 'write',
  delete_permanent: 'write',
  send: 'full',
  external: 'full',
};

const TOOL_FOR_EFFECT: Partial<Record<Effect, string>> = {
  read: 'fic_api_read',
  write: 'fic_api_write',
  delete: 'fic_delete',
  delete_permanent: 'fic_delete',
  external: 'fic_api_write (modalità full, con conferma)',
};

const SEND_TOOL: Record<string, string> = {
  sendEInvoice: 'fic_send_einvoice',
  scheduleEmail: 'fic_send_email',
};

/** Delimita i testi liberi in una risposta generica, ricorsivamente. */
export function wrapFreeText(value: unknown, depth = 0): unknown {
  if (depth > 12) return value;
  if (Array.isArray(value)) return value.map((v) => wrapFreeText(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = typeof v === 'string' && FREE_TEXT_KEYS.has(k) ? untrusted(v) : wrapFreeText(v, depth + 1);
    }
    return out;
  }
  return value;
}

/** Tiene la risposta entro la dimensione gestibile da Claude Desktop tagliando gli elenchi. */
function fitSize(value: Record<string, unknown>): Record<string, unknown> {
  let text = JSON.stringify(value);
  if (text.length <= MAX_OUTPUT_CHARS || !Array.isArray(value.data)) return value;
  const data = [...(value.data as unknown[])];
  while (data.length > 1 && text.length > MAX_OUTPUT_CHARS) {
    data.splice(Math.ceil(data.length / 2));
    text = JSON.stringify({ ...value, data });
  }
  return {
    ...value,
    data,
    truncated: `Risposta troppo grande: mostrati ${data.length} elementi su ${(value.data as unknown[]).length}. Usa per_page più piccolo o filtri.`,
  };
}

function coveringTools(id: string, tools: Array<{ name: string; operations: string[] }>): string[] {
  return tools.filter((t) => t.operations.includes(id) && !t.name.startsWith('fic_api_')).map((t) => t.name);
}

function opSummary(op: CatalogOperation, tools: Array<{ name: string; operations: string[] }>) {
  return {
    id: op.id,
    method: op.method,
    path: op.path.replace('/c/{company_id}', ''),
    summary: op.summary,
    effect: op.effect,
    mode: MODE_FOR[op.effect],
    tools: [...coveringTools(op.id, tools), SEND_TOOL[op.id] ?? TOOL_FOR_EFFECT[op.effect]].filter(Boolean),
  };
}

function findOp(id: string): CatalogOperation {
  const op =
    OPERATIONS.find((o) => o.id === id) ?? OPERATIONS.find((o) => o.id.toLowerCase() === id.toLowerCase());
  if (!op) throw refused(`Operazione "${id}" inesistente. Cerca l’ID con fic_api_catalog.`);
  return op;
}

type Params = Record<string, string | number | boolean>;

function checkParams(op: CatalogOperation, pathParams: Params, query: Params): void {
  for (const p of op.pathParams) {
    if (pathParams[p] === undefined || pathParams[p] === '')
      throw refused(`Manca il parametro di percorso ${p} per ${op.id}.`);
  }
  for (const k of Object.keys(pathParams)) {
    if (!op.pathParams.includes(k))
      throw refused(
        `${op.id} non ha il parametro di percorso ${k}. Ammessi: ${op.pathParams.join(', ') || 'nessuno'}.`,
      );
  }
  for (const q of op.query) {
    const v = query[q.name];
    if (q.required && (v === undefined || v === ''))
      throw refused(
        `Manca il parametro ${q.name} per ${op.id}${q.enum ? ` (valori: ${q.enum.join(', ')})` : ''}.`,
      );
    if (v !== undefined && q.enum && !q.enum.map(String).includes(String(v))) {
      throw refused(`Valore non ammesso per ${q.name}: ${v}. Ammessi: ${q.enum.join(', ')}.`);
    }
  }
  for (const k of Object.keys(query)) {
    if (!op.query.some((q) => q.name === k))
      throw refused(
        `${op.id} non accetta il parametro ${k}. Ammessi: ${op.query.map((q) => q.name).join(', ') || 'nessuno'}.`,
      );
  }
}

const paramsSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]));
const pathParamsSchema = z.record(z.string(), z.union([z.string(), z.number()]));

function allTools() {
  return toolRegistry.tools;
}

export const apiCatalog = defineTool({
  name: 'fic_api_catalog',
  title: 'Catalogo delle operazioni API',
  description: `Cerca tra tutte le ${OPERATIONS.length} operazioni dell'API v2 di Fatture in Cloud (OpenAPI ${SPEC_VERSION}, ${API_REFERENCE}) per parola chiave, gruppo o effetto. Con operation_id restituisce il dettaglio: parametri, campi del corpo, scope, modalità richiesta e tool da usare.
Usalo per tutto ciò che i tool dedicati non coprono: prodotti e magazzino, corrispettivi, F24, archivio, impostazioni, cestino, listini, email inviate, webhook. Poi esegui con fic_api_read o fic_api_write.
Searches the full Fatture in Cloud API catalog; then run operations with fic_api_read or fic_api_write.`,
  minMode: 'readonly',
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  input: z.object({
    query: z
      .string()
      .max(60)
      .optional()
      .describe('Parola chiave (per esempio "product", "receipt", "f24", "archive").'),
    tag: z
      .string()
      .max(40)
      .optional()
      .describe('Gruppo: Products, Receipts, Taxes, Archive, Cashbook, Settings, Webhooks, Info...'),
    effect: z.enum(['read', 'write', 'delete', 'delete_permanent', 'send', 'external']).optional(),
    operation_id: z.string().max(60).optional().describe('Dettaglio di una singola operazione.'),
  }),
  operations: [],
  handler: async (args, app) => {
    const tools = allTools();
    if (args.operation_id) {
      const op = findOp(args.operation_id);
      return {
        ...opSummary(op, tools),
        available_in_current_mode: modeRank(app.config.mode) >= modeRank(MODE_FOR[op.effect]),
        scopes: op.scopes,
        scopes_declared_in_spec: op.scopesDeclared,
        path_params: op.pathParams,
        query: op.query,
        paginated: op.paginated,
        body: op.body
          ? {
              content_type: op.body.contentType,
              data_fields: op.body.fields?.data,
              options: op.body.fields?.options?.length ? op.body.fields.options : undefined,
            }
          : undefined,
        reference: API_REFERENCE,
      };
    }
    const q = args.query?.toLowerCase();
    const list = OPERATIONS.filter(
      (o) =>
        (!args.tag || o.tag.toLowerCase().includes(args.tag.toLowerCase())) &&
        (!args.effect || o.effect === args.effect) &&
        (!q || `${o.id} ${o.path} ${o.summary} ${o.tag}`.toLowerCase().includes(q)),
    );
    return { count: list.length, operations: list.map((o) => opSummary(o, tools)), reference: API_REFERENCE };
  },
});

function modeRank(m: Mode): number {
  return { readonly: 0, write: 1, full: 2 }[m];
}

export const apiRead = defineTool({
  name: 'fic_api_read',
  title: 'Esegui un’operazione di lettura API',
  description: `Esegue qualsiasi operazione di sola lettura dell'API di Fatture in Cloud (${API_REFERENCE}) per operationId, con parametri di percorso e di query (anche q, sort, fields, fieldset, page, per_page). Comprende i calcoli di totali, che sono POST senza effetti.
Trova l'operazione e i parametri con fic_api_catalog. Per fatture, rate, clienti e situazione preferisci i tool dedicati.
Runs any read-only Fatture in Cloud API operation by operationId.`,
  minMode: 'readonly',
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  input: z.object({
    operation_id: z.string().max(60),
    path_params: pathParamsSchema
      .default({})
      .describe('Per esempio {"product_id": 12}. company_id è automatico.'),
    query: paramsSchema.default({}).describe('Per esempio {"q": "name contains \'vite\'", "per_page": 50}.'),
    body: z
      .record(z.string(), z.unknown())
      .optional()
      .describe('Solo per le operazioni di calcolo (totali): {"data": {...}}.'),
  }),
  operations: OPERATIONS.filter((o) => o.effect === 'read').map((o) => o.id),
  handler: async (args, app) => {
    const op = findOp(args.operation_id);
    if (op.effect !== 'read') {
      throw refused(
        `${op.id} non è un’operazione di lettura (effetto: ${op.effect}). ${SEND_TOOL[op.id] ? `Usa ${SEND_TOOL[op.id]}.` : `Usa ${TOOL_FOR_EFFECT[op.effect]}.`}`,
      );
    }
    const query = { ...args.query };
    if (op.paginated && query.per_page === undefined) query.per_page = 50;
    if (op.paginated && Number(query.per_page) > MAX_PER_PAGE) query.per_page = MAX_PER_PAGE;
    checkParams(op, args.path_params, query);
    if (args.body && op.method !== 'POST') throw refused(`${op.id} non accetta un corpo.`);
    const client = op.companyScoped ? await app.api() : app.rawClient();
    const text = op.responseType && !op.responseType.includes('json');
    const res = await callOp<unknown>(client, op.id, {
      pathParams: args.path_params,
      query,
      body: args.body,
      responseType: text ? 'text' : 'json',
    });
    if (typeof res === 'string')
      return {
        operation_id: op.id,
        content_type: op.responseType,
        text: res.length > MAX_OUTPUT_CHARS ? `${res.slice(0, MAX_OUTPUT_CHARS)}… [troncato]` : res,
      };
    return fitSize({ operation_id: op.id, ...(wrapFreeText(res) as Record<string, unknown>) });
  },
});

/** I file da caricare devono stare nella cartella di scambio: mai altrove sul disco. */
function readUploadFile(app: AppContext, filePath: string): { name: string; bytes: Buffer } {
  const root = resolve(app.config.downloadDir);
  let real: string;
  let realRoot: string;
  try {
    real = realpathSync(resolve(root, filePath));
    realRoot = realpathSync(root);
  } catch {
    throw refused(`File non trovato: ${filePath}. I file da caricare vanno messi in ${root}.`);
  }
  if (!real.startsWith(realRoot + sep)) throw refused(`Per sicurezza si caricano solo file dentro ${root}.`);
  const st = statSync(real);
  if (!st.isFile() || st.size > 20 * 1024 * 1024) throw refused('Il file non esiste o supera 20 MB.');
  if (!/\.(png|jpe?g|gif|pdf|zip|xlsx?|docx?)$/i.test(real))
    throw refused('Formati ammessi: png, jpg, gif, pdf, zip, xls, xlsx, doc, docx.');
  return { name: basename(real), bytes: readFileSync(real) };
}

function cleanBody(value: unknown, depth = 0): unknown {
  if (depth > 12) return value;
  if (typeof value === 'string') return cleanOutgoingText(value);
  if (Array.isArray(value)) return value.map((v) => cleanBody(v, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, cleanBody(v, depth + 1)]));
  }
  return value;
}

export const apiWrite = defineTool({
  name: 'fic_api_write',
  title: 'Esegui un’operazione di scrittura API',
  description: `Esegue un'operazione di creazione o modifica dell'API di Fatture in Cloud (${API_REFERENCE}) per operationId: prodotti, corrispettivi, F24, archivio, prima nota, impostazioni (conti, metodi di pagamento, aliquote), recupero dal cestino, caricamento di allegati. Per i caricamenti passa file_path: il file deve stare nella cartella di scambio FIC_DOWNLOAD_DIR.
Non esegue invii (fic_send_einvoice, fic_send_email) né cancellazioni (fic_delete). Le operazioni sui webhook, che inviano dati a un URL esterno, richiedono la modalità full e una conferma con anteprima.
Trova operazione e campi con fic_api_catalog. Per documenti, rate e anagrafiche preferisci i tool dedicati.
Runs a create or update Fatture in Cloud API operation by operationId.`,
  minMode: 'write',
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  input: z.object({
    operation_id: z.string().max(60),
    path_params: pathParamsSchema.default({}),
    query: paramsSchema.default({}),
    body: z.record(z.string(), z.unknown()).optional().describe('Corpo JSON, di solito {"data": {...}}.'),
    file_path: z
      .string()
      .max(300)
      .optional()
      .describe('Solo per i caricamenti di allegati: file dentro FIC_DOWNLOAD_DIR.'),
    confirm: z
      .string()
      .max(80)
      .optional()
      .describe('Solo per i webhook: token dell’anteprima, dopo il sì esplicito dell’utente.'),
  }),
  operations: OPERATIONS.filter((o) => o.effect === 'write' || o.effect === 'external').map((o) => o.id),
  handler: async (args, app) => {
    const op = findOp(args.operation_id);
    if (op.effect === 'read') throw refused(`${op.id} è una lettura: usa fic_api_read.`);
    if (op.effect === 'send')
      throw refused(`Gli invii passano solo da ${SEND_TOOL[op.id]}, con anteprima e conferma.`);
    if (op.effect === 'delete' || op.effect === 'delete_permanent')
      throw refused('Le cancellazioni passano solo da fic_delete, con anteprima e conferma.');
    if (op.effect === 'external' && app.config.mode !== 'full') {
      throw refused(
        `${op.id} fa arrivare dati dell’azienda a un URL esterno: è ammessa solo in modalità full.`,
      );
    }
    checkParams(op, args.path_params, args.query);
    const client = await app.api();
    const body = args.body ? cleanBody(args.body) : undefined;

    if (op.body?.contentType.startsWith('multipart/')) {
      if (!args.file_path)
        throw refused(
          `${op.id} carica un file: indica file_path (dentro ${resolve(app.config.downloadDir)}).`,
        );
      const file = readUploadFile(app, args.file_path);
      const form = new FormData();
      form.set('filename', file.name);
      form.set('attachment', new Blob([new Uint8Array(file.bytes)]), file.name);
      const res = await callOp<Record<string, unknown>>(client, op.id, {
        pathParams: args.path_params,
        query: args.query,
        form,
      });
      app.log.audit('allegato caricato', { op: op.id, file: file.name });
      return {
        operation_id: op.id,
        uploaded: file.name,
        ...(res ?? {}),
        next_step: 'Usa attachment_token nel campo omonimo del documento da creare o modificare.',
      };
    }

    if (op.effect === 'external') {
      const id = String(args.path_params.subscription_id ?? 'new');
      const params = { op: op.id, path: args.path_params, query: args.query, body: body ?? null };
      if (!args.confirm) {
        const data = (body as { data?: { sink?: string; types?: unknown } } | undefined)?.data;
        return {
          preview: true,
          executed: false,
          operation_id: op.id,
          destination_url: data?.sink,
          event_types: data?.types,
          warning: 'Fatture in Cloud invierà notifiche sugli eventi dell’azienda a questo URL esterno.',
          confirm_token: app.confirm.issue('HOOK', id, '', params),
          instructions:
            'Mostra l’anteprima all’utente; solo dopo il suo sì esplicito richiama con gli stessi parametri e confirm.',
        };
      }
      app.confirm.verify(args.confirm, 'HOOK', id, '', params);
    }

    const res = await callOp<unknown>(client, op.id, {
      pathParams: args.path_params,
      query: args.query,
      body,
    });
    app.cache.invalidate('issued:', 'entity:', 'ref:');
    app.log.audit('scrittura generica', { op: op.id, path: args.path_params });
    return fitSize({
      operation_id: op.id,
      executed: true,
      ...((wrapFreeText(res) as Record<string, unknown>) ?? {}),
    });
  },
});
