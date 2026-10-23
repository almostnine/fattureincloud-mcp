import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ConfirmMethod } from './safety/human.js';

export type Mode = 'readonly' | 'write' | 'full';
export type CacheMode = 'memory' | 'disk' | 'off';
export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export interface Config {
  token: string | undefined;
  companyId: number | undefined;
  mode: Mode;
  defaultPaymentAccountId: number | undefined;
  emailAllowedRecipients: string[];
  /**
   * FIC_EXTRA_TOOLS, dalla 1.2.0 senza effetto: in readonly non abilita più nessuna scrittura e nelle altre
   * modalità i tool sono già tutti attivi. Resta letto solo per avvisare nei log.
   */
  extraTools: string[];
  /** Come chiedere la conferma umana delle scritture (FIC_CONFIRM_METHOD). */
  confirmMethod: ConfirmMethod;
  /** fic_delete esiste solo con FIC_ENABLE_DELETE=true, oltre alla modalità write o full. */
  enableDelete: boolean;
  /**
   * Invii allo SDI e per email (fic_send_einvoice, fic_send_email) solo con FIC_ENABLE_SEND=true, oltre alla
   * modalità full. Senza, il client HTTP rifiuta ogni operazione di invio, qualunque tool la chieda.
   */
  enableSend: boolean;
  downloadDir: string;
  /** Giorni dopo i quali i file scaricati dal server vengono cancellati all'avvio; undefined: mai. */
  downloadRetentionDays: number | undefined;
  cache: CacheMode;
  cacheTtlSeconds: number;
  maxPages: number;
  logLevel: LogLevel;
  /** Avvisi emersi durante la lettura della configurazione, da scrivere nei log all'avvio. */
  warnings: string[];
}

const MODES: readonly Mode[] = ['readonly', 'write', 'full'];
const CACHE_MODES: readonly CacheMode[] = ['memory', 'disk', 'off'];
const LOG_LEVELS: readonly LogLevel[] = ['error', 'warn', 'info', 'debug'];
const CONFIRM_METHODS: readonly ConfirmMethod[] = ['auto', 'elicitation', 'dialog'];

function clean(value: string | undefined): string | undefined {
  const v = value?.trim();
  // Claude Desktop passa i campi facoltativi vuoti come stringa vuota o come segnaposto non sostituito.
  if (!v || /^\$\{.*\}$/.test(v)) return undefined;
  return v;
}

function positiveInt(name: string, raw: string | undefined, warnings: string[]): number | undefined {
  const v = clean(raw);
  if (v === undefined) return undefined;
  if (!/^\d+$/.test(v) || Number(v) <= 0) {
    warnings.push(`${name} non è un intero positivo: valore ignorato.`);
    return undefined;
  }
  return Number(v);
}

function oneOf<T extends string>(
  name: string,
  raw: string | undefined,
  allowed: readonly T[],
  fallback: T,
  warnings: string[],
): T {
  const v = clean(raw)?.toLowerCase();
  if (v === undefined) return fallback;
  if ((allowed as readonly string[]).includes(v)) return v as T;
  warnings.push(`${name}="${v}" non è valido (ammessi: ${allowed.join(', ')}): uso "${fallback}".`);
  return fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const warnings: string[] = [];
  // Modalità: qualsiasi valore non riconosciuto ricade su readonly, mai il contrario.
  const mode = oneOf('FIC_MODE', env.FIC_MODE, MODES, 'readonly', warnings);
  // Come per le cancellazioni: solo "true" (o "1") accende gli invii.
  const enableSend = ['true', '1'].includes(clean(env.FIC_ENABLE_SEND)?.toLowerCase() ?? '');
  if (mode === 'full' && !enableSend)
    warnings.push(
      'FIC_MODE=full senza FIC_ENABLE_SEND=true: invii allo SDI e per email spenti. Le fatture si inviano dal pannello di Fatture in Cloud.',
    );
  const recipients = (clean(env.FIC_EMAIL_ALLOWED_RECIPIENTS) ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  return {
    token: clean(env.FIC_ACCESS_TOKEN),
    companyId: positiveInt('FIC_COMPANY_ID', env.FIC_COMPANY_ID, warnings),
    mode,
    defaultPaymentAccountId: positiveInt(
      'FIC_DEFAULT_PAYMENT_ACCOUNT_ID',
      env.FIC_DEFAULT_PAYMENT_ACCOUNT_ID,
      warnings,
    ),
    emailAllowedRecipients: recipients,
    extraTools: (clean(env.FIC_EXTRA_TOOLS) ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    confirmMethod: oneOf('FIC_CONFIRM_METHOD', env.FIC_CONFIRM_METHOD, CONFIRM_METHODS, 'auto', warnings),
    // Solo "true" (o "1") abilita le cancellazioni: qualsiasi altro valore le lascia spente.
    enableDelete: ['true', '1'].includes(clean(env.FIC_ENABLE_DELETE)?.toLowerCase() ?? ''),
    enableSend,
    downloadDir: clean(env.FIC_DOWNLOAD_DIR) ?? join(homedir(), 'Downloads', 'fattureincloud-mcp'),
    downloadRetentionDays: positiveInt(
      'FIC_DOWNLOAD_RETENTION_DAYS',
      env.FIC_DOWNLOAD_RETENTION_DAYS,
      warnings,
    ),
    cache: oneOf('FIC_CACHE', env.FIC_CACHE, CACHE_MODES, 'memory', warnings),
    cacheTtlSeconds: positiveInt('FIC_CACHE_TTL_SECONDS', env.FIC_CACHE_TTL_SECONDS, warnings) ?? 86_400,
    maxPages: positiveInt('FIC_MAX_PAGES', env.FIC_MAX_PAGES, warnings) ?? 20,
    logLevel: oneOf('FIC_LOG_LEVEL', env.FIC_LOG_LEVEL, LOG_LEVELS, 'info', warnings),
    warnings,
  };
}

const RANK: Record<Mode, number> = { readonly: 0, write: 1, full: 2 };

/** Vero se la modalità attiva consente un tool che richiede almeno `required`. */
export function modeAllows(active: Mode, required: Mode): boolean {
  return RANK[active] >= RANK[required];
}
