import { errorToText } from './api/errors.js';
import { clearDiskCache, defaultCacheDir } from './cache/store.js';
import { loadConfig } from './config.js';
import { AppContext } from './context.js';
import { createLogger } from './log.js';
import { VERSION } from './version.js';

const HELP = `fattureincloud-mcp-server ${VERSION}

Uso:
  fattureincloud-mcp-server            avvia il server MCP su stdio
  fattureincloud-mcp-server check      verifica token e azienda (FIC_ACCESS_TOKEN, FIC_COMPANY_ID)
  fattureincloud-mcp-server cache clear  svuota la cache su disco
  fattureincloud-mcp-server --version
  fattureincloud-mcp-server --help
`;

/** Comandi da riga di comando. Qui stdout è libero: il server MCP non è in esecuzione. */
export async function runCli(args: string[]): Promise<number> {
  const [cmd, sub] = args;
  if (cmd === '--version' || cmd === '-v') {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }
  if (cmd === 'cache' && sub === 'clear') {
    const n = clearDiskCache(defaultCacheDir());
    process.stdout.write(`Cache svuotata (${n} file rimossi da ${defaultCacheDir()}).\n`);
    return 0;
  }
  if (cmd === 'check') {
    const config = loadConfig();
    const log = createLogger('warn', [config.token]);
    for (const w of config.warnings) log.warn(w);
    const app = new AppContext({ config, log });
    try {
      const company = await app.activeCompany();
      process.stdout.write(
        `OK: azienda ${company.id} (${company.name}), piano ${company.fic_plan ?? 'n/d'}, modalità ${config.mode}.\n`,
      );
      return 0;
    } catch (err) {
      process.stdout.write(`${errorToText(err)}\n`);
      return 1;
    }
  }
  process.stdout.write(HELP);
  return cmd === '--help' || cmd === '-h' ? 0 : 2;
}
