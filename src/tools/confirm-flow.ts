import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import type { ConfirmAction } from '../safety/confirm.js';
import type { HumanPrompt } from '../safety/human.js';
import { CLOSE, OPEN } from '../safety/untrusted.js';
import type { ToolCall } from './define.js';

/**
 * Flusso comune di ogni scrittura: anteprima con token, poi esecuzione con token valido E conferma umana
 * fuori banda. Il token lega l'anteprima al corpo esatto; la conferma umana è l'autorizzazione.
 */

export const confirmSchema = z
  .string()
  .max(80)
  .optional()
  .describe(
    'Token restituito dall’anteprima. Da solo non basta: all’esecuzione il server chiede la conferma direttamente all’utente.',
  );

export const dryRunSchema = z
  .boolean()
  .default(true)
  .describe(
    'Default true: solo anteprima, non scrive nulla. Per eseguire: dry_run: false insieme a confirm (token dell’anteprima); il server chiede poi la conferma all’utente.',
  );

export interface Pending {
  action: ConfirmAction;
  id: string | number;
  /** Stato della risorsa al momento dell'anteprima (per esempio `updated_at`). */
  state: string;
  /** Corpo e parametri esatti che verranno inviati. */
  params: unknown;
  prompt: HumanPrompt;
}

/** Campi standard dell'anteprima: token, testo esatto che la persona dovrà confermare, istruzioni. */
export function previewFields(
  app: AppContext,
  call: ToolCall,
  p: Pending,
  executeHint = 'confirm uguale a confirm_token',
) {
  return {
    confirm_token: app.confirm.issue(p.action, p.id, p.state, p.params),
    confirmation_text: p.prompt.text,
    human_confirmation: app.human.describe(call.human),
    instructions: `Mostra l’anteprima all’utente. Se vuole procedere, richiama con gli stessi parametri e ${executeHint}: il server chiederà allora la conferma direttamente all’utente; senza la sua conferma non viene eseguito nulla.`,
  };
}

/**
 * Autorizza l'esecuzione: token valido per questo corpo esatto, poi conferma umana, poi consumo del token.
 * Lancia `refused` (o, sull'era 2026-07-28, `InputRequiredSignal`) se manca qualcosa.
 */
export async function authorize(app: AppContext, call: ToolCall, token: string, p: Pending): Promise<void> {
  app.confirm.verify(token, p.action, p.id, p.state, p.params);
  const digest = createHash('sha256').update(p.prompt.text).digest('hex');
  await app.human.confirm(call.human, p.prompt, `${p.action}|${p.id}|${token.trim()}|${digest}`);
  app.confirm.consume(token);
}

function plain(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s =
    typeof v === 'string'
      ? v
      : typeof v === 'number' || typeof v === 'boolean'
        ? String(v)
        : JSON.stringify(v);
  // I delimitatori dei testi non fidati servono al modello, non alla persona.
  return s.replaceAll(OPEN, '«').replaceAll(CLOSE, '»');
}

function lines(value: unknown, indent: string, out: string[]): void {
  if (Array.isArray(value)) {
    for (const v of value) {
      if (v && typeof v === 'object') {
        const sub: string[] = [];
        lines(v, `${indent}  `, sub);
        if (sub.length) out.push(`${indent}- ${sub[0]!.trimStart()}`, ...sub.slice(1));
      } else if (v !== undefined && v !== null && v !== '') out.push(`${indent}- ${plain(v)}`);
    }
    return;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined || v === null || v === '') continue;
      if (Array.isArray(v) && v.length === 0) continue;
      if (typeof v === 'object') {
        out.push(`${indent}${k}:`);
        lines(v, `${indent}  `, out);
      } else out.push(`${indent}${k}: ${plain(v)}`);
    }
  }
}

/** Testo leggibile dell'anteprima, identico a quello che la persona conferma. */
export function humanPrompt(title: string, summary: Record<string, unknown>): HumanPrompt {
  const out: string[] = [];
  lines(summary, '', out);
  return { title, text: `${title.toUpperCase()}\n\n${out.join('\n')}` };
}
