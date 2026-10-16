import { createHash } from 'node:crypto';
import {
  chmodSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { CacheMode } from '../config.js';
import type { Logger } from '../log.js';

/**
 * Cache.
 * - In memoria per la durata del processo (default).
 * - Su disco solo se l'utente lo sceglie (FIC_CACHE=disk) e solo per le voci marcate `persist`,
 *   cioè dati di riferimento senza dati personali. La policy d'uso di FIC vieta di mettere in cache
 *   dati utente senza consenso: documenti, anagrafiche e conti di saldo non vanno mai su disco.
 */

interface Entry {
  expires: number;
  value: unknown;
}

export interface CacheOptions {
  mode: CacheMode;
  /** Impronta di azienda e token: cambiare token non mostra dati dell'altro. */
  namespace: string;
  dir?: string;
  logger: Logger;
  now?: () => number;
}

export function defaultCacheDir(): string {
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Caches', 'fattureincloud-mcp');
  const xdg = process.env.XDG_CACHE_HOME;
  return join(xdg?.startsWith('/') ? xdg : join(homedir(), '.cache'), 'fattureincloud-mcp');
}

export function cacheNamespace(token: string | undefined, companyId: number | string | undefined): string {
  return createHash('sha256')
    .update(`${token ?? ''}|${companyId ?? ''}`)
    .digest('hex')
    .slice(0, 16);
}

function safeKey(key: string): string {
  return createHash('sha256').update(key).digest('hex').slice(0, 32);
}

export class Cache {
  private readonly memory = new Map<string, Entry>();
  private readonly mode: CacheMode;
  private readonly dir: string;
  private readonly log: Logger;
  private readonly now: () => number;
  private namespace: string;

  constructor(opts: CacheOptions) {
    this.mode = opts.mode;
    this.namespace = opts.namespace;
    this.dir = opts.dir ?? defaultCacheDir();
    this.log = opts.logger;
    this.now = opts.now ?? Date.now;
    if (this.mode === 'disk') this.prepareDir();
  }

  setNamespace(namespace: string): void {
    this.namespace = namespace;
  }

  get enabled(): boolean {
    return this.mode !== 'off';
  }

  get diskEnabled(): boolean {
    return this.mode === 'disk';
  }

  get(key: string): unknown {
    if (this.mode === 'off') return undefined;
    const k = `${this.namespace}:${key}`;
    const hit = this.memory.get(k);
    if (hit) {
      if (hit.expires > this.now()) return hit.value;
      this.memory.delete(k);
    }
    if (this.mode === 'disk') return this.readDisk(k);
    return undefined;
  }

  /** `persist` vale solo con FIC_CACHE=disk e va usato esclusivamente per dati di riferimento non personali. */
  set(key: string, value: unknown, ttlSeconds: number, persist = false): void {
    if (this.mode === 'off' || value === undefined) return;
    const k = `${this.namespace}:${key}`;
    const entry: Entry = { expires: this.now() + ttlSeconds * 1000, value };
    this.memory.set(k, entry);
    if (persist && this.mode === 'disk') this.writeDisk(k, entry);
  }

  /** Invalida tutte le voci la cui chiave inizia con uno dei prefissi (dopo una scrittura). */
  invalidate(...prefixes: string[]): void {
    for (const k of [...this.memory.keys()]) {
      const bare = k.slice(this.namespace.length + 1);
      if (prefixes.some((p) => bare.startsWith(p))) this.memory.delete(k);
    }
  }

  /** Svuota memoria e disco. Restituisce il numero di file cancellati. */
  clear(): number {
    this.memory.clear();
    return clearDiskCache(this.dir, this.log);
  }

  private prepareDir(): void {
    try {
      mkdirSync(this.dir, { recursive: true, mode: 0o700 });
      chmodSync(this.dir, 0o700);
      this.purgeExpired();
    } catch (err) {
      this.log.warn('cache su disco non disponibile, uso solo la memoria', { error: (err as Error).message });
    }
  }

  private file(k: string): string {
    return join(this.dir, `${safeKey(k)}.json`);
  }

  private readDisk(k: string): unknown {
    try {
      const entry = JSON.parse(readFileSync(this.file(k), 'utf8')) as Entry;
      if (entry.expires > this.now()) {
        this.memory.set(k, entry);
        return entry.value;
      }
      rmSync(this.file(k), { force: true });
    } catch {
      // assente o illeggibile: è un miss
    }
    return undefined;
  }

  private writeDisk(k: string, entry: Entry): void {
    try {
      const target = this.file(k);
      const tmp = `${target}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify(entry), { mode: 0o600 });
      chmodSync(tmp, 0o600);
      renameSync(tmp, target);
    } catch (err) {
      this.log.warn('scrittura cache su disco fallita', { error: (err as Error).message });
    }
  }

  private purgeExpired(): void {
    for (const name of readdirSync(this.dir)) {
      const p = join(this.dir, name);
      try {
        if (!name.endsWith('.json')) {
          rmSync(p, { force: true });
          continue;
        }
        chmodSync(p, 0o600);
        const entry = JSON.parse(readFileSync(p, 'utf8')) as Entry;
        if (!(entry.expires > this.now())) rmSync(p, { force: true });
      } catch {
        rmSync(p, { force: true });
      }
    }
  }
}

export function clearDiskCache(dir: string, log?: Logger): number {
  let removed = 0;
  try {
    if (!statSync(dir).isDirectory()) return 0;
    for (const name of readdirSync(dir)) {
      rmSync(join(dir, name), { force: true, recursive: true });
      removed++;
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT')
      log?.warn('pulizia cache fallita', { error: (err as Error).message });
  }
  return removed;
}
