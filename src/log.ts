import type { LogLevel } from './config.js';

const RANK: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 };

export interface Logger {
  error(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  debug(msg: string, fields?: Record<string, unknown>): void;
  /** Riga di audit per scritture e invii: sempre scritta, a qualunque livello. */
  audit(action: string, fields: Record<string, unknown>): void;
}

/**
 * Logger su stderr (stdout è riservato al protocollo MCP).
 * I segreti registrati con `secrets` vengono oscurati in ogni riga, insieme a qualsiasi header Bearer.
 */
export function createLogger(
  level: LogLevel,
  secrets: Array<string | undefined> = [],
  write: (line: string) => void = (line) => process.stderr.write(`${line}\n`),
): Logger {
  const known = secrets.filter((s): s is string => Boolean(s && s.length >= 6));

  const redact = (text: string): string => {
    let out = text.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [oscurato]');
    for (const s of known) out = out.split(s).join('[oscurato]');
    return out;
  };

  const emit = (lvl: string, msg: string, fields?: Record<string, unknown>) => {
    let line = `${new Date().toISOString()} [fattureincloud-mcp] ${lvl.toUpperCase()} ${msg}`;
    if (fields && Object.keys(fields).length > 0) {
      let json: string;
      try {
        json = JSON.stringify(fields, (_k, v) =>
          v instanceof Error ? { name: v.name, message: v.message, stack: v.stack } : v,
        );
      } catch {
        json = '[campi non serializzabili]';
      }
      line += ` ${json}`;
    }
    write(redact(line));
  };

  const at = (lvl: LogLevel) => (msg: string, fields?: Record<string, unknown>) => {
    if (RANK[lvl] <= RANK[level]) emit(lvl, msg, fields);
  };

  return {
    error: at('error'),
    warn: at('warn'),
    info: at('info'),
    debug: at('debug'),
    audit: (action, fields) => emit('audit', action, fields),
  };
}

export const silentLogger: Logger = {
  error() {},
  warn() {},
  info() {},
  debug() {},
  audit() {},
};
