/**
 * Genera manifest.json (MCPB, manifest 0.3) e server.json (registro MCP) da package.json e dall'elenco dei tool.
 * Uso: npm run manifest
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { ALL_TOOLS } from '../src/tools/index.js';

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
  version: string;
  description: string;
  name: string;
};
const repo = 'https://github.com/almostnine/fattureincloud-mcp';

const firstLine = (s: string) => s.split('\n')[0]!.split('. ')[0]!.replace(/\.$/, '');

const manifest = {
  $schema:
    'https://raw.githubusercontent.com/modelcontextprotocol/mcpb/main/dist/mcpb-manifest-v0.3.schema.json',
  manifest_version: '0.3',
  name: pkg.name,
  display_name: 'Fatture in Cloud MCP (non ufficiale)',
  version: pkg.version,
  description:
    'Fatture, rate, incassi, clienti e situazione di Fatture in Cloud dentro Claude. Sola lettura di default.',
  long_description: `Server MCP non ufficiale per l'API v2 di Fatture in Cloud: copre tutte le 123 operazioni dell'API.

- **Sola lettura di default**: in modalità \`readonly\` i tool di scrittura e di invio non esistono proprio.
- **Modalità \`write\`**: creazione e modifica di documenti e anagrafiche, rate pagate o non pagate, cancellazioni con anteprima e conferma.
- **Modalità \`full\`**: anche invio allo SDI ed email, sempre con anteprima e token di conferma.
- Testi provenienti da Fatture in Cloud delimitati come dati, nessuna cache su disco di dati personali, nessuna telemetria: il server parla solo con api-v2.fattureincloud.it.

Non affiliato a TeamSystem né a Fatture in Cloud. Codice e documentazione: ${repo}`,
  author: { name: 'Marco Di Santo', url: 'https://github.com/almostnine' },
  repository: { type: 'git', url: `${repo}.git` },
  homepage: repo,
  documentation: `${repo}#readme`,
  support: `${repo}/issues`,
  icon: 'icon.png',
  server: {
    type: 'node',
    entry_point: 'dist/index.js',
    mcp_config: {
      command: 'node',
      args: ['${__dirname}/dist/index.js'],
      env: {
        FIC_ACCESS_TOKEN: '${user_config.fic_access_token}',
        FIC_COMPANY_ID: '${user_config.fic_company_id}',
        FIC_MODE: '${user_config.fic_mode}',
        FIC_DEFAULT_PAYMENT_ACCOUNT_ID: '${user_config.fic_default_payment_account_id}',
        FIC_EMAIL_ALLOWED_RECIPIENTS: '${user_config.fic_email_allowed_recipients}',
      },
    },
  },
  tools: ALL_TOOLS.map((t) => ({
    name: t.name,
    description: `${firstLine(t.description)} (modalità ${t.minMode}).`,
  })),
  tools_generated: false,
  keywords: [
    'fatture in cloud',
    'fatturazione elettronica',
    'fatture',
    'sdi',
    'contabilità',
    'italia',
    'invoices',
  ],
  license: 'MIT',
  privacy_policies: [`${repo}/blob/main/PRIVACY.md`, 'https://www.fattureincloud.it/privacy/'],
  compatibility: { platforms: ['darwin', 'win32', 'linux'] },
  user_config: {
    fic_access_token: {
      type: 'string',
      title: 'Token di accesso Fatture in Cloud',
      description:
        'Token personale: Fatture in Cloud > Impostazioni > Applicazioni collegate. Per la sola lettura bastano gli scope ":r". Viene salvato nel portachiavi del sistema.',
      sensitive: true,
      required: true,
    },
    fic_company_id: {
      type: 'number',
      title: 'ID azienda (facoltativo)',
      description: 'Necessario solo se il token vede più aziende. Lo trovi con il tool fic_account_info.',
      required: false,
      min: 1,
    },
    fic_mode: {
      type: 'string',
      title: 'Modalità',
      description:
        'readonly (default, solo lettura), write (crea e modifica, cancella con conferma), full (anche invio SDI ed email, con conferma). Qualsiasi altro valore vale readonly.',
      default: 'readonly',
      required: false,
    },
    fic_default_payment_account_id: {
      type: 'number',
      title: 'Conto di saldo predefinito (facoltativo)',
      description:
        'ID del conto usato quando segni una rata pagata senza indicarlo. Elenco con fic_reference_data.',
      required: false,
      min: 1,
    },
    fic_email_allowed_recipients: {
      type: 'string',
      title: 'Destinatari email aggiuntivi (facoltativo)',
      description:
        'Indirizzi, separati da virgola, a cui si può inviare oltre a quelli dei clienti in anagrafica (per esempio il commercialista).',
      required: false,
    },
  },
};

writeFileSync('manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);

let sha = '';
try {
  sha = readFileSync(`dist/${pkg.name}-${pkg.version}.mcpb.sha256`, 'utf8').trim().split(/\s+/)[0] ?? '';
} catch {
  // il file .mcpb non è ancora stato costruito
}

const server = {
  $schema: 'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json',
  name: 'io.github.almostnine/fattureincloud-mcp',
  title: 'Fatture in Cloud MCP (non ufficiale)',
  description:
    'Fatture in Cloud API v2: fatture, rate, incassi, clienti, situazione. Sola lettura di default.',
  version: pkg.version,
  repository: { url: repo, source: 'github' },
  websiteUrl: repo,
  packages: [
    {
      registryType: 'npm',
      identifier: pkg.name,
      version: pkg.version,
      transport: { type: 'stdio' },
      environmentVariables: [
        {
          name: 'FIC_ACCESS_TOKEN',
          description: 'Token personale di Fatture in Cloud',
          isRequired: true,
          isSecret: true,
          format: 'string',
        },
        {
          name: 'FIC_COMPANY_ID',
          description: 'ID azienda, se il token ne vede più di una',
          isRequired: false,
          format: 'number',
        },
        {
          name: 'FIC_MODE',
          description: 'readonly (default), write o full',
          isRequired: false,
          format: 'string',
          default: 'readonly',
        },
      ],
    },
    {
      registryType: 'mcpb',
      identifier: `${repo}/releases/download/v${pkg.version}/${pkg.name}-${pkg.version}.mcpb`,
      version: pkg.version,
      fileSha256: sha || 'DA_COMPILARE_DOPO_LA_BUILD',
      transport: { type: 'stdio' },
    },
  ],
};
writeFileSync('server.json', `${JSON.stringify(server, null, 2)}\n`);
console.error(
  `manifest.json e server.json generati (versione ${pkg.version}, ${ALL_TOOLS.length} tool${sha ? ', sha256 del .mcpb incluso' : ''}).`,
);
