import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { refused } from '../api/errors.js';

/**
 * Token di conferma per le azioni irreversibili (invio SDI, email, cancellazioni, webhook).
 *
 * L'anteprima restituisce un token del tipo `SDI-12345-k3x9ab-7f3a9c2e1d`: prefisso dell'azione, ID,
 * istante di emissione in base 36, HMAC. L'HMAC copre azione, ID, istante, stato del documento
 * (per esempio `updated_at`) e parametri, con un segreto casuale generato all'avvio del processo:
 * il modello non può fabbricarlo, e se documento o parametri cambiano il token non vale più.
 */

export const CONFIRM_TTL_MS = 10 * 60 * 1000;

export type ConfirmAction = 'SDI' | 'EMAIL' | 'DEL' | 'HOOK';

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
}

export class ConfirmService {
  private readonly secret: Buffer;
  private readonly now: () => number;

  constructor(opts: { secret?: Buffer; now?: () => number } = {}) {
    this.secret = opts.secret ?? randomBytes(32);
    this.now = opts.now ?? Date.now;
  }

  private mac(action: ConfirmAction, id: string, issued: string, state: string, params: unknown): string {
    return createHmac('sha256', this.secret)
      .update(`${action}|${id}|${issued}|${state}|${canonical(params)}`)
      .digest('hex')
      .slice(0, 12);
  }

  issue(action: ConfirmAction, id: string | number, state: string, params: unknown): string {
    const issued = this.now().toString(36);
    return `${action}-${id}-${issued}-${this.mac(action, String(id), issued, state, params)}`;
  }

  /** Lancia un errore `refused` con la spiegazione se il token non è valido per questa azione esatta. */
  verify(token: string, action: ConfirmAction, id: string | number, state: string, params: unknown): void {
    const parts = token.trim().split('-');
    const again =
      'Chiama di nuovo il tool senza `confirm` per ottenere una nuova anteprima e un nuovo token, mostrala all’utente e attendi il suo sì.';
    // Formato: AZIONE-ID-ISTANTE-MAC; l'ID può contenere trattini, quindi si legge da destra.
    const mac = parts.at(-1) ?? '';
    const issued = parts.at(-2) ?? '';
    const tokenId = parts.slice(1, -2).join('-');
    if (parts.length < 4 || parts[0] !== action || tokenId !== String(id)) {
      throw refused(`Token di conferma non valido per questa azione su ${id}. ${again}`);
    }
    const issuedAt = Number.parseInt(issued, 36);
    if (
      !Number.isFinite(issuedAt) ||
      this.now() - issuedAt > CONFIRM_TTL_MS ||
      issuedAt > this.now() + 1000
    ) {
      throw refused(`Token di conferma scaduto (validità 10 minuti). ${again}`);
    }
    const expected = Buffer.from(this.mac(action, String(id), issued, state, params));
    const given = Buffer.from(mac);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      throw refused(
        `Il token di conferma non corrisponde: il documento è cambiato dopo l’anteprima oppure i parametri sono diversi da quelli mostrati. ${again}`,
      );
    }
  }
}
