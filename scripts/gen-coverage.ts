/**
 * Genera docs/COVERAGE.md: per ogni operazione dell'OpenAPI, i tool che la espongono e se è esercitata dai test.
 * Uso: npm test (scrive coverage/ops/*.json) e poi npm run coverage:doc.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { OPERATIONS, SPEC_VERSION } from '../src/api/catalog.generated.js';
import { ALL_TOOLS } from '../src/tools/index.js';

const tested = new Set<string>();
if (existsSync('coverage/ops')) {
  for (const f of readdirSync('coverage/ops'))
    for (const id of JSON.parse(readFileSync(`coverage/ops/${f}`, 'utf8')) as string[]) tested.add(id);
}

const EFFECT: Record<string, string> = {
  read: 'lettura',
  write: 'scrittura',
  delete: 'cancellazione',
  delete_permanent: 'cancellazione definitiva',
  send: 'invio',
  external: 'scrittura verso terzi',
};
const MODE: Record<string, string> = {
  read: 'readonly',
  write: 'write',
  delete: 'write',
  delete_permanent: 'write',
  send: 'full',
  external: 'full',
};

const rows = [...OPERATIONS].sort(
  (a, b) => a.tag.localeCompare(b.tag) || a.path.localeCompare(b.path) || a.method.localeCompare(b.method),
);
let current = '';
const lines: string[] = [];
let curated = 0;
for (const op of rows) {
  if (op.tag !== current) {
    current = op.tag;
    lines.push(
      '',
      `### ${op.tag}`,
      '',
      '| Operazione | Metodo e percorso | Effetto | Modalità | Tool | Testata |',
      '|---|---|---|---|---|---|',
    );
  }
  const tools = ALL_TOOLS.filter((t) => t.operations.includes(op.id)).map((t) => t.name);
  const dedicated = tools.filter((t) => !t.startsWith('fic_api_'));
  if (dedicated.length) curated++;
  const list = [...dedicated, ...tools.filter((t) => t.startsWith('fic_api_'))]
    .map((t) => `\`${t}\``)
    .join(', ');
  lines.push(
    `| \`${op.id}\` | ${op.method} \`${op.path.replace('/c/{company_id}', '')}\` | ${EFFECT[op.effect]} | ${MODE[op.effect]} | ${list} | ${tested.has(op.id) ? 'sì' : 'no'} |`,
  );
}

const header = `# Copertura dell'API

File generato da \`scripts/gen-coverage.ts\`: non modificare a mano.

- Specifica: OpenAPI Fatture in Cloud ${SPEC_VERSION}, ${OPERATIONS.length} operazioni.
- Raggiungibili da almeno un tool: ${OPERATIONS.filter((o) => ALL_TOOLS.some((t) => t.operations.includes(o.id))).length} su ${OPERATIONS.length} (verificato anche da un test).
- Con un tool dedicato: ${curated}; le altre passano dai tool generici \`fic_api_read\` e \`fic_api_write\`, guidati dal catalogo. Tutte le cancellazioni passano da \`fic_delete\`.
- Esercitate dai test automatici (risposte simulate): ${tested.size} su ${OPERATIONS.length}.
- I percorsi sono relativi a \`/c/{company_id}\` salvo quelli sotto \`/user\` e \`/info\`.
`;
writeFileSync('docs/COVERAGE.md', `${header}${lines.join('\n')}\n`);
console.error(
  `COVERAGE.md: ${OPERATIONS.length} operazioni, ${tested.size} testate, ${curated} con tool dedicato.`,
);
