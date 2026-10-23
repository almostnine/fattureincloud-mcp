import { resolve } from 'node:path';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { runCli } from './cli.js';
import { loadConfig } from './config.js';
import { AppContext } from './context.js';
import { createLogger } from './log.js';
import { createServer, extraToolsWarnings, toolsForMode } from './server.js';
import { cleanupDownloads } from './tools/einvoice.js';
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
  for (const w of extraToolsWarnings(config)) log.warn(w);
  if (config.downloadRetentionDays) {
    const removed = cleanupDownloads(resolve(config.downloadDir), config.downloadRetentionDays);
    if (removed) log.info('file scaricati rimossi', { removed, days: config.downloadRetentionDays });
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
