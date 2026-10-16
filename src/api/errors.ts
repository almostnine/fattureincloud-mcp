/**
 * Errori dell'API di Fatture in Cloud e traduzione in messaggi per il modello.
 * Formati documentati: https://developers.fattureincloud.it/docs/basics/errors/
 */

export type FicErrorKind =
  | 'config' // configurazione locale mancante o errata
  | 'auth' // 401: token non valido o revocato, company_id errato, utente fuori whitelist
  | 'permission' // 403: scope mancante o sub-utente senza permessi
  | 'license' // 403 LICENSE_EXPIRED
  | 'quota' // 403 con Retry-After: quota oraria o mensile esaurita
  | 'rate_limit' // 429: 300 richieste ogni 5 minuti
  | 'not_found' // 404
  | 'conflict' // 409
  | 'validation' // 422
  | 'bad_request' // 400, 405
  | 'server' // 5xx
  | 'network' // errore di rete
  | 'timeout'
  | 'refused'; // rifiuto deciso dal server MCP (modalità, conferma, regole di sicurezza)

export interface FicErrorDetails {
  status?: number;
  code?: string;
  /** Messaggio dell'API, già sanificato. */
  apiMessage?: string;
  validation?: string[];
  retryAfterSeconds?: number;
  operationId?: string;
  scopes?: string[];
  /** Totali restituiti da FIC con l'errore 422 sul totale dei pagamenti. */
  totals?: unknown;
}

export class FicError extends Error {
  readonly kind: FicErrorKind;
  readonly details: FicErrorDetails;

  constructor(kind: FicErrorKind, message: string, details: FicErrorDetails = {}) {
    super(message);
    this.name = 'FicError';
    this.kind = kind;
    this.details = details;
  }
}

export function refused(message: string): FicError {
  return new FicError('refused', message);
}

const CONTROL_AND_INVISIBLE = /[\u0000-\u0008\u000B-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g;

/** Toglie caratteri di controllo e tronca: i messaggi d'errore dell'API tornano al modello. */
function tidy(s: unknown, max = 500): string | undefined {
  if (typeof s !== 'string') return undefined;
  const out = s.replace(CONTROL_AND_INVISIBLE, '').trim();
  return out.length > max ? `${out.slice(0, max)}…` : out;
}

function flattenValidation(v: unknown): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map((x) => tidy(String(x), 300)).filter((x): x is string => Boolean(x));
  if (typeof v === 'object') {
    const out: string[] = [];
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      const msgs = Array.isArray(val) ? val : [val];
      for (const m of msgs) {
        const t = tidy(typeof m === 'string' ? m : JSON.stringify(m), 300);
        if (t) out.push(k === 'xml_errors' ? t : `${k}: ${t}`);
      }
    }
    return out.slice(0, 30);
  }
  return [];
}

/** Interpreta il corpo d'errore nei due formati documentati (OAuth e `error.{message,code,validation_result}`). */
export function parseErrorBody(
  body: unknown,
): Pick<FicErrorDetails, 'code' | 'apiMessage' | 'validation' | 'totals'> {
  if (!body || typeof body !== 'object') return {};
  const b = body as Record<string, unknown>;
  if (typeof b.error === 'string') {
    return { code: tidy(b.error, 80), apiMessage: tidy(b.error_description) ?? tidy(b.error) };
  }
  if (b.error && typeof b.error === 'object') {
    const e = b.error as Record<string, unknown>;
    const extra = b.extra as Record<string, unknown> | undefined;
    return {
      code: tidy(e.code, 80),
      apiMessage: tidy(e.message),
      validation: flattenValidation(e.validation_result),
      totals: extra?.totals,
    };
  }
  if (typeof b.message === 'string') return { apiMessage: tidy(b.message) };
  return {};
}

const QUOTA_HINT = /quota|limit|limite|too many|troppe/i;

export function classifyHttpError(
  status: number,
  body: unknown,
  retryAfter: number | undefined,
  operationId?: string,
  scopes?: string[],
): FicError {
  const parsed = parseErrorBody(body);
  const details: FicErrorDetails = { status, ...parsed, operationId, scopes };
  if (retryAfter !== undefined) details.retryAfterSeconds = retryAfter;
  const msg = parsed.apiMessage ?? `HTTP ${status}`;

  if (status === 401) return new FicError('auth', msg, details);
  if (status === 403) {
    if (parsed.code === 'LICENSE_EXPIRED') return new FicError('license', msg, details);
    // La quota esaurita è un 403 con Retry-After (https://developers.fattureincloud.it/docs/basics/limits-and-quotas/).
    if (parsed.code !== 'NO_PERMISSION' && (retryAfter !== undefined || QUOTA_HINT.test(msg))) {
      return new FicError('quota', msg, details);
    }
    return new FicError('permission', msg, details);
  }
  if (status === 404) return new FicError('not_found', msg, details);
  if (status === 409) return new FicError('conflict', msg, details);
  if (status === 422) return new FicError('validation', msg, details);
  if (status === 429) return new FicError('rate_limit', msg, details);
  if (status >= 500) return new FicError('server', msg, details);
  return new FicError('bad_request', msg, details);
}

const DOC_TYPE_SCOPE: Record<string, string> = {
  invoice: 'invoices',
  credit_note: 'credit_notes',
  quote: 'quotes',
  proforma: 'proformas',
  receipt: 'receipts',
  delivery_note: 'delivery_notes',
  order: 'orders',
  work_report: 'work_reports',
  supplier_order: 'supplier_orders',
  self_own_invoice: 'self_invoices',
  self_supplier_invoice: 'self_invoices',
};

/** Sostituisce `{tipo}` negli scope dei documenti emessi con il tipo concreto, se noto. */
export function concreteScopes(scopes: string[] | undefined, docType?: string): string[] {
  if (!scopes) return [];
  const t = docType ? DOC_TYPE_SCOPE[docType] : undefined;
  return scopes.map((s) => (t ? s.replace('{tipo}', t) : s));
}

/** Testo per il modello: cosa è successo e cosa fare. Mai traceback, mai dati sensibili. */
export function errorToText(err: unknown, docType?: string): string {
  if (!(err instanceof FicError)) {
    return 'Errore interno del server MCP. Dettagli nei log del server. Cosa fare: riprova; se si ripete, segnala il problema.';
  }
  const d = err.details;
  const api = d.apiMessage ? ` Messaggio di Fatture in Cloud: "${d.apiMessage}".` : '';
  const scopes = concreteScopes(d.scopes, docType);
  const scopeText = scopes.length ? scopes.map((s) => `\`${s}\``).join(' oppure ') : undefined;

  switch (err.kind) {
    case 'config':
    case 'refused':
      return err.message;
    case 'auth':
      return `Autenticazione rifiutata da Fatture in Cloud (401).${api} Cause possibili: token revocato o non valido, ID azienda errato, utente non autorizzato all'app privata. Cosa fare: verifica il token e FIC_COMPANY_ID (fic_account_info elenca le aziende accessibili).`;
    case 'permission':
      return `Permesso negato (403${d.code ? ` ${d.code}` : ''}).${api} ${
        scopeText
          ? `Questa operazione richiede lo scope ${scopeText}.`
          : 'Al token manca uno scope necessario per questa operazione.'
      } Cosa fare: in Fatture in Cloud, Impostazioni > Applicazioni collegate > Gestisci > Modifica scope, aggiungi il permesso; se sei un sub-utente, chiedi all'amministratore il permesso sulla sezione. In alternativa resta in sola lettura.`;
    case 'license':
      return `La licenza di Fatture in Cloud è scaduta (LICENSE_EXPIRED).${api} Cosa fare: rinnova la licenza; fino ad allora l'API non risponde.`;
    case 'quota':
      return `Quota di richieste API esaurita (403).${api}${
        d.retryAfterSeconds !== undefined ? ` Si potrà riprovare tra ${d.retryAfterSeconds} secondi.` : ''
      } Limiti: 1.000 richieste all'ora e 40.000 al mese. Cosa fare: aspetta e riprova, oppure riduci le letture complete.`;
    case 'rate_limit':
      return `Troppe richieste in poco tempo (429): il limite è 300 richieste ogni 5 minuti per azienda, condiviso con le altre app collegate.${
        d.retryAfterSeconds !== undefined
          ? ` Riprova tra ${d.retryAfterSeconds} secondi.`
          : ' Riprova tra qualche minuto.'
      }`;
    case 'not_found':
      return `Risorsa non trovata (404).${api} Cosa fare: controlla l'ID; potrebbe essere stata cancellata o appartenere a un'altra azienda.`;
    case 'conflict':
      return `Operazione rifiutata per conflitto (409).${api} Cause tipiche: documento bloccato perché già inviato allo SDI, numero già usato, numerazione non cronologica, cliente duplicato, limiti del piano, servizio e-fattura non attivo. Cosa fare: leggi il messaggio, correggi i dati e riprova.`;
    case 'validation': {
      const v = d.validation?.length ? ` Campi da correggere: ${d.validation.join('; ')}.` : '';
      const t = d.totals ? ` Totali calcolati da FIC: ${JSON.stringify(d.totals)}.` : '';
      return `Dati non validi (422).${api}${v}${t} Cosa fare: correggi i campi indicati; se il problema è il totale dei pagamenti, lascia calcolare le rate a Fatture in Cloud.`;
    }
    case 'bad_request':
      return `Richiesta non valida (${d.status ?? 400}).${api} Cosa fare: controlla i parametri passati al tool.`;
    case 'server':
      return `Fatture in Cloud ha risposto con un errore interno (${d.status ?? 500}).${api} Può dipendere da caratteri non supportati (per esempio emoji) in un campo di testo. Cosa fare: riprova più tardi o semplifica i testi.`;
    case 'network':
      return 'Fatture in Cloud non è raggiungibile (errore di rete). Cosa fare: controlla la connessione e riprova.';
    case 'timeout':
      return 'Fatture in Cloud non ha risposto entro 30 secondi. Cosa fare: riprova; per elenchi molto grandi restringi il periodo.';
  }
}
