import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  Client,
  type ElicitRequestFormParams,
  type ElicitResult,
  InMemoryTransport,
} from '@modelcontextprotocol/client';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { type Config, loadConfig, type Mode } from '../../src/config.js';
import { AppContext } from '../../src/context.js';
import { silentLogger } from '../../src/log.js';
import { ConfirmService } from '../../src/safety/confirm.js';
import type { DialogRunner } from '../../src/safety/human.js';
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

/**
 * Finestra di dialogo finta (al posto di osascript): registra i testi mostrati e risponde come la persona.
 * 'accept' = clic su "Conferma", 'decline' = "Annulla", 'timeout' = nessuna risposta.
 */
export function fakeDialog(answer: 'accept' | 'decline' | 'timeout', shown: string[]): DialogRunner {
  return async (args) => {
    shown.push(args.at(-2) ?? '');
    if (answer === 'decline') return { code: 1, stdout: '' };
    if (answer === 'timeout') return { code: 0, stdout: 'button returned:, gave up:true\n' };
    return { code: 0, stdout: 'button returned:Conferma, gave up:false\n' };
  };
}

export function testApp(
  opts: {
    mode?: Mode;
    fic?: FakeFic;
    config?: Partial<Config>;
    now?: Date;
    /** Risposta della persona alla finestra di conferma (default: conferma); 'none' = nessuna finestra. */
    human?: 'accept' | 'decline' | 'timeout' | 'none';
    platform?: NodeJS.Platform;
  } = {},
) {
  const fic = opts.fic ?? new FakeFic().withCompany();
  const config = testConfig({ mode: opts.mode ?? 'readonly', ...opts.config });
  const dialogs: string[] = [];
  const human = opts.human ?? 'accept';
  const app = new AppContext({
    config,
    log: silentLogger,
    fetch: fic.fetch,
    sleep: noSleep,
    now: () => opts.now ?? NOW,
    cacheDir: mkdtempSync(join(tmpdir(), 'fic-test-cache-')),
    confirm: new ConfirmService({ secret: Buffer.alloc(32, 7), now: () => (opts.now ?? NOW).getTime() }),
    dialog: human === 'none' ? null : fakeDialog(human, dialogs),
    platform: opts.platform ?? 'darwin',
  });
  return { app, fic, dialogs };
}

export interface ConnectOptions {
  /** Il client dichiara l'elicitation e risponde così (la persona nella finestra di Claude Desktop). */
  elicitation?: (params: ElicitRequestFormParams) => ElicitResult | Promise<ElicitResult>;
  /** Protocollo 2026-07-28 (richieste input_required) invece del 2025. */
  modern?: boolean;
}

/** Client MCP collegato in memoria al server: prova i tool esattamente come li vede Claude. */
export async function connect(app: AppContext, opts: ConnectOptions = {}): Promise<Client> {
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  if (opts.modern) {
    serveStdio(() => createServer(app), { transport: serverT });
  } else {
    await createServer(app).connect(serverT);
  }
  const client = new Client(
    { name: 'test', version: '0.0.0' },
    {
      ...(opts.elicitation ? { capabilities: { elicitation: { form: {} } } } : {}),
      ...(opts.modern ? { versionNegotiation: { mode: 'auto' as const } } : {}),
    },
  );
  if (opts.elicitation) {
    const answer = opts.elicitation;
    client.setRequestHandler('elicitation/create', async (req) =>
      answer(req.params as ElicitRequestFormParams),
    );
  }
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

/**
 * Anteprima e poi esecuzione con il token, come farebbe il modello dopo il sì dell'utente nella chat.
 * L'esecuzione passa comunque dalla conferma umana (finestra finta del test o elicitation del client).
 */
export async function previewAndRun(
  client: Client,
  name: string,
  args: Record<string, unknown> = {},
): Promise<{ preview: ToolCall; done: ToolCall }> {
  const preview = await call(client, name, args);
  if (preview.isError || typeof preview.data.confirm_token !== 'string') return { preview, done: preview };
  const done = await call(client, name, { ...args, dry_run: false, confirm: preview.data.confirm_token });
  return { preview, done };
}
