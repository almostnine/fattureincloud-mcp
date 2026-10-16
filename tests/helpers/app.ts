import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { type Config, loadConfig, type Mode } from '../../src/config.js';
import { AppContext } from '../../src/context.js';
import { silentLogger } from '../../src/log.js';
import { ConfirmService } from '../../src/safety/confirm.js';
import { createServer } from '../../src/server.js';
import { FakeFic, noSleep } from './fake-fetch.js';

/** Data fissa dei test: 16 ottobre 2026, mezzogiorno a Roma. */
export const NOW = new Date('2026-10-16T10:00:00Z');

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    ...loadConfig({ FIC_ACCESS_TOKEN: 'a/token-di-prova-0123456789', FIC_COMPANY_ID: '1001' }),
    ...overrides,
  };
}

export function testApp(opts: { mode?: Mode; fic?: FakeFic; config?: Partial<Config>; now?: Date } = {}) {
  const fic = opts.fic ?? new FakeFic().withCompany();
  const config = testConfig({ mode: opts.mode ?? 'readonly', ...opts.config });
  const app = new AppContext({
    config,
    log: silentLogger,
    fetch: fic.fetch,
    sleep: noSleep,
    now: () => opts.now ?? NOW,
    cacheDir: mkdtempSync(join(tmpdir(), 'fic-test-cache-')),
    confirm: new ConfirmService({ secret: Buffer.alloc(32, 7), now: () => (opts.now ?? NOW).getTime() }),
  });
  return { app, fic };
}

/** Client MCP collegato in memoria al server: prova i tool esattamente come li vede Claude. */
export async function connect(app: AppContext): Promise<Client> {
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const server = createServer(app);
  await server.connect(serverT);
  const client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(clientT);
  return client;
}

export interface ToolCall {
  isError: boolean;
  text: string;
  data: Record<string, unknown>;
}

export async function call(
  client: Client,
  name: string,
  args: Record<string, unknown> = {},
): Promise<ToolCall> {
  const res = (await client.callTool({ name, arguments: args })) as {
    isError?: boolean;
    content?: Array<{ type: string; text?: string }>;
    structuredContent?: Record<string, unknown>;
  };
  const text = res.content?.find((c) => c.type === 'text')?.text ?? '';
  return { isError: Boolean(res.isError), text, data: res.structuredContent ?? {} };
}
