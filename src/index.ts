import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { runCli } from './cli.js';
import { loadConfig } from './config.js';
import { AppContext } from './context.js';
import { createLogger } from './log.js';
import { createServer, invalidExtraTools, toolsForMode } from './server.js';
import { VERSION } from './version.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length > 0) {
    process.exitCode = await runCli(args);
    return;
  }
  const config = loadConfig();
  const log = createLogger(config.logLevel, [config.token]);
  for (const w of config.warnings) log.warn(w);
  for (const n of invalidExtraTools(config)) {
    log.warn(`FIC_EXTRA_TOOLS: "${n}" non è un tool di scrittura abilitabile singolarmente, ignorato.`);
  }
  const app = new AppContext({ config, log });
  log.info('avvio', {
    version: VERSION,
    mode: config.mode,
    tools: toolsForMode(app).length,
    cache: config.cache,
    token: Boolean(config.token),
  });
  serveStdio(() => createServer(app), {
    onerror: (err) => log.error('errore di trasporto', { error: err.message }),
  });
}

main().catch((err: unknown) => {
  process.stderr.write(
    `[fattureincloud-mcp] avvio fallito: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exitCode = 1;
});
