/**
 * Genera dal file OpenAPI ufficiale di Fatture in Cloud:
 *  - src/api/catalog.generated.ts: tutte le operazioni con parametri, corpo, scope e classe di effetto;
 *  - tests/contract/schemas.generated.json: schemi delle risposte 200, per validare le fixture.
 *
 * Uso: npm run gen [-- percorso/openapi-enriched.yaml]
 * Default: reference/openapi-fattureincloud/openapi-enriched.yaml (clone del repo ufficiale, escluso da git).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parse } from 'yaml';

type Json = Record<string, unknown>;

const specPath = resolve(process.argv[2] ?? 'reference/openapi-fattureincloud/openapi-enriched.yaml');
const spec = parse(readFileSync(specPath, 'utf8')) as Json;
const components = spec.components as Json;

let specCommit = 'sconosciuto';
try {
  specCommit = execFileSync('git', ['-C', dirname(specPath), 'rev-parse', '--short', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
} catch {
  // la spec può arrivare anche da un file isolato
}

// Operazioni POST che calcolano soltanto, senza modificare nulla.
const READ_POST = new Set([
  'getNewIssuedDocumentTotals',
  'getExistingIssuedDocumentTotals',
  'getNewReceivedDocumentTotals',
  'getExistingReceivedDocumentTotals',
]);
const SEND = new Set(['sendEInvoice', 'scheduleEmail']);
const EXTERNAL = new Set([
  'CreateWebhooksSubscription',
  'modifyWebhooksSubscription',
  'verifyWebhooksSubscription',
]);
const PERMANENT = new Set(['DeleteBinIssuedDocument', 'DeleteBinReceivedDocument']);

// Scope che la spec non dichiara: dedotti dalla risorsa (vedi docs/ANALISI.md, sezione 2.2).
const ISSUED_R = 'issued_documents.{tipo}:r';
const ISSUED_A = 'issued_documents.{tipo}:a';
const INFERRED: Record<string, string[]> = {
  ListBinIssuedDocuments: [ISSUED_R],
  GetBinIssuedDocument: [ISSUED_R],
  DeleteBinIssuedDocument: [ISSUED_A],
  RecoverBinIssuedDocument: [ISSUED_A],
  uploadIssuedDocumentAttachment: [ISSUED_A],
  deleteIssuedDocumentAttachment: [ISSUED_A],
  getIssuedDocumentPreCreateInfo: [ISSUED_A],
  getNewIssuedDocumentTotals: [ISSUED_A],
  getExistingIssuedDocumentTotals: [ISSUED_A],
  joinIssuedDocuments: [ISSUED_A],
  transformIssuedDocument: [ISSUED_A],
  getEInvoiceXml: [ISSUED_R],
  getEInvoiceRejectionReason: [ISSUED_R],
  verifyEInvoiceXml: [ISSUED_R],
  sendEInvoice: [ISSUED_A],
  ListBinReceivedDocuments: ['received_documents:r'],
  GetBinReceivedDocument: ['received_documents:r'],
  DeleteBinReceivedDocument: ['received_documents:a'],
  RecoverBinReceivedDocument: ['received_documents:a'],
  listEmails: ['emails:r'],
  getPaymentAccount: ['settings:r'],
  getPaymentMethod: ['settings:r'],
  getVatType: ['settings:r'],
  listTemplates: ['settings:r'],
  getTemplate: ['settings:r'],
  getPriceLists: ['products:r'],
  getPriceListItems: ['products:r'],
};

function deref(obj: Json, kind: string): Json {
  const ref = obj.$ref as string | undefined;
  if (!ref) return obj;
  const name = ref.split('/').pop()!;
  return (components[kind] as Json)[name] as Json;
}

function typeOf(s: Json | undefined): string {
  if (!s) return 'any';
  if (Array.isArray(s.enum))
    return (s.enum as unknown[])
      .filter((v) => v !== null)
      .map((v) => JSON.stringify(v))
      .join('|');
  if (s.type === 'array') return `${typeOf(s.items as Json)}[]`;
  if (s.allOf) return 'object';
  return String(s.type ?? 'object');
}

function bodyFields(
  schema: Json | undefined,
): { data: Record<string, string>; options: string[] } | undefined {
  if (!schema) return undefined;
  const props = (schema.properties ?? {}) as Json;
  const data = props.data as Json | undefined;
  const out: Record<string, string> = {};
  if (data) {
    const dp = (data.properties ?? {}) as Record<string, Json>;
    for (const [k, v] of Object.entries(dp)) {
      if (v.readOnly) continue;
      out[k] = typeOf(v);
    }
  }
  const options = props.options ? Object.keys(((props.options as Json).properties ?? {}) as Json) : [];
  return { data: out, options };
}

type Effect = 'read' | 'write' | 'delete' | 'delete_permanent' | 'send' | 'external';

const ops: Json[] = [];
const responseSchemas: Record<string, unknown> = {};

for (const [path, item] of Object.entries(spec.paths as Record<string, Json>)) {
  for (const method of ['get', 'post', 'put', 'delete'] as const) {
    const op = item[method] as Json | undefined;
    if (!op) continue;
    const id = op.operationId as string;
    const params = [...((item.parameters as Json[]) ?? []), ...((op.parameters as Json[]) ?? [])].map((p) =>
      deref(p, 'parameters'),
    );
    const pathParams = params.filter((p) => p.in === 'path').map((p) => p.name as string);
    const query = params
      .filter((p) => p.in === 'query')
      .map((p) => {
        const schema = (p.schema ?? {}) as Json;
        const q: Json = { name: p.name, type: typeOf(schema), required: Boolean(p.required) };
        if (Array.isArray(schema.enum)) q.enum = (schema.enum as unknown[]).filter((v) => v !== null);
        if (schema.maximum !== undefined) q.max = schema.maximum;
        if (p.description) q.description = String(p.description).split('\n')[0]!.slice(0, 160);
        return q;
      });

    let body: Json | undefined;
    if (op.requestBody) {
      const rb = deref(op.requestBody as Json, 'requestBodies');
      const content = (rb.content ?? {}) as Record<string, Json>;
      const contentType = Object.keys(content)[0] ?? 'application/json';
      const schema = content[contentType]?.schema as Json | undefined;
      body = { contentType, required: Boolean(rb.required), fields: bodyFields(schema) };
    }

    const declared: string[] = [];
    for (const sec of (op.security as Json[]) ?? []) {
      for (const v of Object.values(sec)) declared.push(...(v as string[]));
    }
    const scopesDeclared = declared.length > 0;
    let scopes = scopesDeclared ? declared : (INFERRED[id] ?? []);
    if (scopes.length > 1 && scopes.every((s) => s.startsWith('issued_documents.'))) {
      scopes = [scopes[0]!.endsWith(':r') ? ISSUED_R : ISSUED_A];
    }

    let effect: Effect;
    if (SEND.has(id)) effect = 'send';
    else if (EXTERNAL.has(id)) effect = 'external';
    else if (PERMANENT.has(id)) effect = 'delete_permanent';
    else if (method === 'get' || READ_POST.has(id)) effect = 'read';
    else if (method === 'delete') effect = 'delete';
    else effect = 'write';

    const responses = (op.responses ?? {}) as Record<string, Json>;
    const ok = responses['200'] ? deref(responses['200'], 'responses') : undefined;
    const okContent = (ok?.content ?? {}) as Record<string, Json>;
    const okType = Object.keys(okContent)[0];
    if (okType === 'application/json' && okContent[okType]?.schema) {
      responseSchemas[id] = okContent[okType]!.schema;
    }

    ops.push({
      id,
      method: method.toUpperCase(),
      path,
      tag: ((op.tags as string[]) ?? ['Other'])[0],
      summary: String(op.summary ?? ''),
      effect,
      scopes,
      scopesDeclared,
      companyScoped: path.startsWith('/c/{company_id}'),
      pathParams: pathParams.filter((p) => p !== 'company_id'),
      query,
      ...(body ? { body } : {}),
      paginated: query.some((q) => q.name === 'page'),
      responseType: okType ?? null,
    });
  }
}

ops.sort((a, b) => String(a.id).localeCompare(String(b.id)));

const info = spec.info as Json;
const header = `// File generato da scripts/gen-catalog.ts: non modificare a mano.
// OpenAPI Fatture in Cloud ${info.version} (commit ${specCommit}), ${ops.length} operazioni.
`;
const ts = `${header}
import type { CatalogOperation } from './catalog-types.js';

export const SPEC_VERSION = ${JSON.stringify(info.version)};

export const OPERATIONS: readonly CatalogOperation[] = ${JSON.stringify(ops, null, 2)};
`;
writeFileSync('src/api/catalog.generated.ts', ts);
writeFileSync('tests/contract/schemas.generated.json', `${JSON.stringify(responseSchemas)}\n`);
console.error(
  `Catalogo: ${ops.length} operazioni, ${Object.keys(responseSchemas).length} schemi di risposta.`,
);
