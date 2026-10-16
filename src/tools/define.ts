import type { CallToolResult } from '@modelcontextprotocol/server';
import type { z } from 'zod';
import { errorToText, FicError } from '../api/errors.js';
import { type Mode, modeAllows } from '../config.js';
import type { AppContext } from '../context.js';
import { containsUntrusted, UNTRUSTED_NOTICE } from '../safety/untrusted.js';

/** Le quattro annotation sono obbligatorie per costruzione: un tool senza annotation non compila. */
export interface Annotations {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
}

export interface ToolDef<I extends z.ZodObject = z.ZodObject> {
  name: string;
  title: string;
  description: string;
  /** Modalità minima in cui il tool viene registrato. */
  minMode: Mode;
  annotations: Annotations;
  input: I;
  output?: z.ZodType;
  /** Operazioni del catalogo raggiungibili da questo tool (per docs/COVERAGE.md). */
  operations: string[];
  /** Tipo di documento coinvolto, per i messaggi sugli scope mancanti. */
  docTypeOf?: (args: z.infer<I>) => string | undefined;
  handler: (args: z.infer<I>, app: AppContext) => Promise<Record<string, unknown>>;
}

export function defineTool<I extends z.ZodObject>(def: ToolDef<I>): ToolDef<I> {
  return def;
}

/** Elimina null, undefined, stringhe vuote, array e oggetti vuoti: output compatti. */
export function compact<T>(value: T): T {
  if (Array.isArray(value)) return value.map(compact).filter((v) => v !== undefined) as T;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const c = compact(v);
      if (c === undefined || c === null || c === '') continue;
      // Gli elenchi vuoti restano solo dove dicono qualcosa: "nessun risultato".
      if (Array.isArray(c) && c.length === 0 && k !== 'items' && k !== 'results') continue;
      if (typeof c === 'object' && !Array.isArray(c) && Object.keys(c as object).length === 0) continue;
      out[k] = c;
    }
    return out as T;
  }
  return value;
}

export function toResult(data: Record<string, unknown>): CallToolResult {
  const body = compact(data);
  const withNotice = containsUntrusted(body) ? { ...body, avviso_testi: UNTRUSTED_NOTICE } : body;
  return {
    content: [{ type: 'text', text: JSON.stringify(withNotice) }],
    structuredContent: withNotice,
  };
}

export function errorResult(err: unknown, docType?: string): CallToolResult {
  return { content: [{ type: 'text', text: errorToText(err, docType) }], isError: true };
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** Raccoglie gli indirizzi email presenti negli argomenti dei tool di scrittura (vedi AppContext.sessionEmails). */
function rememberEmails(value: unknown, into: Set<string>, depth = 0): void {
  if (depth > 10) return;
  if (typeof value === 'string') {
    for (const m of value.match(EMAIL) ?? []) into.add(m.toLowerCase());
  } else if (Array.isArray(value)) {
    for (const v of value) rememberEmails(v, into, depth + 1);
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) rememberEmails(v, into, depth + 1);
  }
}

/** Esegue l'handler con il doppio controllo di modalità e la traduzione degli errori. */
export async function runTool<I extends z.ZodObject>(
  def: ToolDef<I>,
  args: z.infer<I>,
  app: AppContext,
): Promise<CallToolResult> {
  let docType: string | undefined;
  try {
    docType = def.docTypeOf?.(args);
    if (!modeAllows(app.config.mode, def.minMode)) {
      throw new FicError(
        'refused',
        `Il tool ${def.name} richiede la modalità ${def.minMode}; il server è in modalità ${app.config.mode}.`,
      );
    }
    if (def.minMode === 'write') rememberEmails(args, app.sessionEmails);
    const data = await def.handler(args, app);
    return toResult(data);
  } catch (err) {
    if (err instanceof FicError) {
      app.log.info('tool in errore', { tool: def.name, kind: err.kind, status: err.details.status });
    } else {
      app.log.error('errore inatteso nel tool', { tool: def.name, error: err });
    }
    return errorResult(err, docType);
  }
}
