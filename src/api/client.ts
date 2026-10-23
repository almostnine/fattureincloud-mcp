import type { Logger } from '../log.js';
import { assertNoBankData } from '../safety/bank.js';
import { OPERATIONS } from './catalog.generated.js';
import type { CatalogOperation } from './catalog-types.js';
import { classifyHttpError, FicError } from './errors.js';

/** Unico host dell'API. Fisso nel codice: un URL configurabile sarebbe un modo per far uscire il token. */
export const API_BASE = 'https://api-v2.fattureincloud.it';

const TIMEOUT_MS = 30_000;
const MAX_WAIT_SECONDS = 60;
const MAX_QUOTA_RETRIES = 2;
const MAX_CONFLICT_RETRIES = 2;
const MAX_TRANSIENT_RETRIES = 3;
/** Limite per azienda: 300 richieste ogni 5 minuti (https://developers.fattureincloud.it/docs/basics/limits-and-quotas/). */
const BUCKET_CAPACITY = 300;
const BUCKET_WINDOW_MS = 5 * 60 * 1000;
/** Sotto questa soglia di richieste rimaste (ora o mese) il server si ferma, per non esaurire la quota dell'azienda. */
export const QUOTA_FLOOR = 20;

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';
export type QueryValue = string | number | boolean | undefined | null;

export interface RequestSpec {
  /** operationId del catalogo: serve per gli scope nei messaggi d'errore e per i log. */
  operationId: string;
  method: HttpMethod;
  /** Percorso con segnaposto, per esempio `/c/{company_id}/issued_documents/{document_id}`. */
  path: string;
  pathParams?: Record<string, string | number>;
  query?: Record<string, QueryValue>;
  body?: unknown;
  /** Corpo multipart (caricamento allegati): alternativo a `body`. */
  form?: FormData;
  /** Se la richiesta si può ripetere su 5xx, 409 di concorrenza ed errori di rete. Default: vero per GET, PUT e DELETE. */
  retrySafe?: boolean;
  /** `text` per le risposte non JSON (per esempio l'XML della fattura elettronica). */
  responseType?: 'json' | 'text';
}

export interface Quota {
  hourlyRemaining?: number;
  hourlyLimit?: number;
  monthlyRemaining?: number;
  monthlyLimit?: number;
  updatedAt?: string;
  /** Istante dell'ultimo aggiornamento, in millisecondi. */
  updatedAtMs?: number;
}

export interface FicClientOptions {
  token: string;
  logger: Logger;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
}

/**
 * Secchiello di gettoni lato client: al massimo 300 richieste ogni 5 minuti per azienda, ricaricato in modo
 * continuo. Il limite di Fatture in Cloud è condiviso con le altre app collegate: questo conta solo le nostre.
 */
export class TokenBucket {
  private tokens: number;
  private last: number;
  private readonly perMs: number;

  constructor(
    private readonly capacity: number,
    windowMs: number,
    now: number,
  ) {
    this.tokens = capacity;
    this.last = now;
    this.perMs = capacity / windowMs;
  }

  /** Prenota un gettone e restituisce quanti millisecondi aspettare prima di usarlo (0 se subito). */
  reserve(now: number): number {
    this.tokens = Math.min(this.capacity, this.tokens + Math.max(0, now - this.last) * this.perMs);
    this.last = now;
    this.tokens -= 1;
    return this.tokens >= 0 ? 0 : Math.ceil(-this.tokens / this.perMs);
  }

  /** Restituisce il gettone prenotato (richiesta non partita). */
  release(): void {
    this.tokens = Math.min(this.capacity, this.tokens + 1);
  }
}

const OPS_BY_ID = new Map<string, CatalogOperation>(OPERATIONS.map((o) => [o.id, o]));

export function catalogOperation(id: string): CatalogOperation | undefined {
  return OPS_BY_ID.get(id);
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  if (/^\d+$/.test(value.trim())) return Number(value.trim());
  const date = Date.parse(value);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, Math.ceil((date - Date.now()) / 1000));
}

function headerInt(h: Headers, name: string): number | undefined {
  const v = h.get(name);
  return v && /^\d+$/.test(v) ? Number(v) : undefined;
}

export function buildUrl(
  path: string,
  pathParams: Record<string, string | number>,
  query?: Record<string, QueryValue>,
): string {
  const filled = path.replace(/\{([a-z_]+)\}/g, (_m, name: string) => {
    const v = pathParams[name];
    if (v === undefined || v === '')
      throw new FicError('refused', `Parametro di percorso mancante: ${name}.`);
    // "." e ".." cambierebbero l'endpoint chiamato.
    if (/^\.{1,2}$/.test(String(v))) throw new FicError('refused', `Valore non valido per ${name}.`);
    return encodeURIComponent(String(v));
  });
  const url = new URL(API_BASE + filled);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v === undefined || v === null || v === '') continue;
    url.searchParams.set(k, typeof v === 'boolean' ? (v ? '1' : '0') : String(v));
  }
  return url.toString();
}

/**
 * Client HTTP per l'API v2 di Fatture in Cloud.
 * Richieste in serie e limitate lato client (300 ogni 5 minuti per azienda), stop quando la quota oraria o
 * mensile sta per finire, retry solo per le richieste ripetibili, errori tipizzati. Nessun corpo con
 * coordinate bancarie esce dal server.
 */
export class FicClient {
  readonly quota: Quota = {};
  private readonly token: string;
  private readonly log: Logger;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;
  private readonly now: () => number;
  private readonly buckets = new Map<string, TokenBucket>();
  private queue: Promise<unknown> = Promise.resolve();
  private companyIdValue: number | undefined;
  requestCount = 0;

  constructor(opts: FicClientOptions) {
    this.token = opts.token;
    this.log = opts.logger;
    this.fetchImpl = opts.fetch ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.random = opts.random ?? Math.random;
    this.now = opts.now ?? Date.now;
  }

  setCompanyId(id: number): void {
    this.companyIdValue = id;
  }

  get companyId(): number | undefined {
    return this.companyIdValue;
  }

  /** Esegue una richiesta e restituisce il corpo già decodificato. */
  request<T = unknown>(spec: RequestSpec): Promise<T> {
    const run = () => this.execute<T>(spec);
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => undefined);
    return p;
  }

  private async execute<T>(spec: RequestSpec): Promise<T> {
    const op = OPS_BY_ID.get(spec.operationId);
    const params: Record<string, string | number> = { ...(spec.pathParams ?? {}) };
    if (spec.path.includes('{company_id}')) {
      if (this.companyIdValue === undefined) {
        throw new FicError(
          'config',
          'Azienda non ancora determinata: impossibile chiamare un metodo legato all’azienda.',
        );
      }
      params.company_id = this.companyIdValue;
    }
    const url = buildUrl(spec.path, params, spec.query);
    const retrySafe = spec.retrySafe ?? spec.method !== 'POST';
    // Difesa in profondità: nessun corpo con IBAN o altre coordinate bancarie arriva a Fatture in Cloud.
    if (spec.body !== undefined) assertNoBankData(spec.body, spec.operationId);

    let quotaRetries = 0;
    let conflictRetries = 0;
    let transientRetries = 0;

    for (;;) {
      this.checkQuota();
      await this.throttle();
      const started = Date.now();
      let res: Response;
      try {
        this.requestCount++;
        res = await this.fetchImpl(url, {
          method: spec.method,
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: spec.responseType === 'text' ? '*/*' : 'application/json',
            ...(spec.body !== undefined && !spec.form ? { 'Content-Type': 'application/json' } : {}),
            'User-Agent': 'fattureincloud-mcp-server',
          },
          body: spec.form ?? (spec.body !== undefined ? JSON.stringify(spec.body) : undefined),
          signal: AbortSignal.timeout(TIMEOUT_MS),
          redirect: 'error',
        });
      } catch (err) {
        const isTimeout = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
        if (retrySafe && transientRetries < MAX_TRANSIENT_RETRIES) {
          transientRetries++;
          await this.backoff(transientRetries);
          continue;
        }
        this.log.warn('richiesta fallita', {
          op: spec.operationId,
          error: err instanceof Error ? err.message : String(err),
        });
        throw new FicError(isTimeout ? 'timeout' : 'network', 'Errore di rete', {
          operationId: spec.operationId,
        });
      }

      this.trackQuota(res.headers);
      this.log.debug('richiesta', {
        op: spec.operationId,
        method: spec.method,
        status: res.status,
        ms: Date.now() - started,
      });

      if (res.ok) {
        if (res.status === 204) return undefined as T;
        const text = await res.text();
        if (spec.responseType === 'text') return text as T;
        if (!text) return undefined as T;
        try {
          return JSON.parse(text) as T;
        } catch {
          throw new FicError('server', 'Risposta non JSON da Fatture in Cloud', {
            status: res.status,
            operationId: spec.operationId,
          });
        }
      }

      const retryAfter = parseRetryAfter(res.headers.get('retry-after'));
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        body = undefined;
      }
      const error = classifyHttpError(res.status, body, retryAfter, spec.operationId, op?.scopes);

      if ((error.kind === 'rate_limit' || error.kind === 'quota') && quotaRetries < MAX_QUOTA_RETRIES) {
        const wait = retryAfter ?? (error.kind === 'rate_limit' ? 10 : undefined);
        if (wait !== undefined && wait <= MAX_WAIT_SECONDS) {
          quotaRetries++;
          this.log.warn('limite di richieste: attendo', { op: spec.operationId, seconds: wait });
          await this.sleep(wait * 1000);
          continue;
        }
      }
      // "Già in esecuzione": si ripete solo una richiesta ripetibile, mai una creazione (potrebbe duplicarla).
      if (
        error.kind === 'conflict' &&
        retrySafe &&
        /already being executed|in esecuzione/i.test(error.message) &&
        conflictRetries < MAX_CONFLICT_RETRIES
      ) {
        conflictRetries++;
        await this.sleep(2000 * conflictRetries);
        continue;
      }
      if (error.kind === 'server' && retrySafe && transientRetries < MAX_TRANSIENT_RETRIES) {
        transientRetries++;
        await this.backoff(transientRetries);
        continue;
      }
      this.log.info('errore API', {
        op: spec.operationId,
        status: res.status,
        kind: error.kind,
        code: error.details.code,
      });
      throw error;
    }
  }

  /** Attende il turno nel secchiello dell'azienda; oltre 60 secondi rinuncia con un errore chiaro. */
  private async throttle(): Promise<void> {
    const key = String(this.companyIdValue ?? 'utente');
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = new TokenBucket(BUCKET_CAPACITY, BUCKET_WINDOW_MS, this.now());
      this.buckets.set(key, bucket);
    }
    const wait = bucket.reserve(this.now());
    if (wait === 0) return;
    if (wait > MAX_WAIT_SECONDS * 1000) {
      bucket.release();
      throw new FicError(
        'rate_limit',
        'Limite di 300 richieste ogni 5 minuti raggiunto da questo server: richiesta non inviata.',
        { retryAfterSeconds: Math.ceil(wait / 1000) },
      );
    }
    this.log.info('limite di 300 richieste ogni 5 minuti: attendo', { ms: wait });
    await this.sleep(wait);
  }

  /** Si ferma prima di esaurire la quota oraria o mensile dell'azienda, condivisa con le altre app. */
  private checkQuota(): void {
    const q = this.quota;
    if (q.updatedAtMs === undefined) return;
    const now = this.now();
    if (
      now - q.updatedAtMs < 60 * 60 * 1000 &&
      q.hourlyRemaining !== undefined &&
      q.hourlyRemaining < QUOTA_FLOOR
    ) {
      throw new FicError(
        'refused',
        `Quota oraria dell’API quasi esaurita: restano ${q.hourlyRemaining} richieste su ${q.hourlyLimit ?? 1000}. Il server si ferma sotto ${QUOTA_FLOOR} per non bloccare le altre app collegate all’azienda. Cosa fare: riprova tra un’ora.`,
      );
    }
    const sameMonth =
      new Date(q.updatedAtMs).toISOString().slice(0, 7) === new Date(now).toISOString().slice(0, 7);
    if (sameMonth && q.monthlyRemaining !== undefined && q.monthlyRemaining < QUOTA_FLOOR) {
      throw new FicError(
        'refused',
        `Quota mensile dell’API quasi esaurita: restano ${q.monthlyRemaining} richieste su ${q.monthlyLimit ?? 40000}. Il server si ferma sotto ${QUOTA_FLOOR} per non bloccare l’azienda fino al mese prossimo.`,
      );
    }
  }

  private backoff(attempt: number): Promise<void> {
    const base = 500 * 2 ** (attempt - 1);
    return this.sleep(base + Math.floor(this.random() * base));
  }

  private trackQuota(h: Headers): void {
    const hourlyRemaining = headerInt(h, 'ratelimit-hourlyremaining');
    const monthlyRemaining = headerInt(h, 'ratelimit-monthlyremaining');
    if (hourlyRemaining === undefined && monthlyRemaining === undefined) return;
    this.quota.hourlyRemaining = hourlyRemaining;
    this.quota.hourlyLimit = headerInt(h, 'ratelimit-hourlylimit');
    this.quota.monthlyRemaining = monthlyRemaining;
    this.quota.monthlyLimit = headerInt(h, 'ratelimit-monthlylimit');
    this.quota.updatedAtMs = this.now();
    this.quota.updatedAt = new Date(this.quota.updatedAtMs).toISOString();
  }
}
