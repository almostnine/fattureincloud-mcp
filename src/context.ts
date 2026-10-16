import { FicClient } from './api/client.js';
import { FicError } from './api/errors.js';
import { Cache, cacheNamespace } from './cache/store.js';
import type { Config } from './config.js';
import type { Logger } from './log.js';
import { ConfirmService } from './safety/confirm.js';

export interface Company {
  id: number;
  name: string;
  type?: string;
  fic_plan?: string;
  fic_license_expire?: string;
}

interface UserCompaniesResponse {
  data?: { companies?: Company[] };
}

/** Stato condiviso da tutti i tool per la durata del processo. */
export class AppContext {
  readonly config: Config;
  readonly log: Logger;
  readonly cache: Cache;
  readonly confirm: ConfirmService;
  readonly now: () => Date;
  /** fetch per i file dei documenti (link temporanei); iniettabile nei test. */
  readonly httpFetch: typeof fetch;
  private readonly clientValue: FicClient | undefined;
  private company: Company | undefined;
  private companies: Company[] | undefined;

  constructor(opts: {
    config: Config;
    log: Logger;
    fetch?: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
    now?: () => Date;
    confirm?: ConfirmService;
    cacheDir?: string;
  }) {
    this.config = opts.config;
    this.log = opts.log;
    this.now = opts.now ?? (() => new Date());
    this.httpFetch = opts.fetch ?? fetch;
    this.confirm = opts.confirm ?? new ConfirmService();
    this.cache = new Cache({
      mode: opts.config.cache,
      namespace: cacheNamespace(opts.config.token, opts.config.companyId),
      logger: opts.log,
      ...(opts.cacheDir ? { dir: opts.cacheDir } : {}),
    });
    this.clientValue = opts.config.token
      ? new FicClient({
          token: opts.config.token,
          logger: opts.log,
          ...(opts.fetch ? { fetch: opts.fetch } : {}),
          ...(opts.sleep ? { sleep: opts.sleep } : {}),
        })
      : undefined;
  }

  /** Client pronto all'uso, con l'azienda verificata. */
  async api(): Promise<FicClient> {
    const client = this.rawClient();
    await this.activeCompany();
    return client;
  }

  /** Client senza azienda: solo per i metodi non legati all'azienda (/user, /info). */
  rawClient(): FicClient {
    if (!this.clientValue) {
      throw new FicError(
        'config',
        'Token di Fatture in Cloud mancante. Cosa fare: imposta FIC_ACCESS_TOKEN (in Claude Desktop: impostazioni dell’estensione). Il token si crea in Fatture in Cloud, Impostazioni > Applicazioni collegate.',
      );
    }
    return this.clientValue;
  }

  async listCompanies(): Promise<Company[]> {
    if (this.companies) return this.companies;
    const res = await this.rawClient().request<UserCompaniesResponse>({
      operationId: 'listUserCompanies',
      method: 'GET',
      path: '/user/companies',
    });
    this.companies = res?.data?.companies ?? [];
    return this.companies;
  }

  /**
   * Azienda attiva, verificata con /user/companies: un company_id sbagliato altrimenti produrrebbe solo 401.
   */
  async activeCompany(): Promise<Company> {
    if (this.company) return this.company;
    const companies = await this.listCompanies();
    const list = companies.map((c) => `${c.id} (${c.name})`).join(', ') || 'nessuna';
    let chosen: Company | undefined;
    if (this.config.companyId !== undefined) {
      chosen = companies.find((c) => c.id === this.config.companyId);
      if (!chosen) {
        throw new FicError(
          'config',
          `L’azienda ${this.config.companyId} indicata in FIC_COMPANY_ID non è accessibile con questo token. Aziende disponibili: ${list}.`,
        );
      }
    } else if (companies.length === 1) {
      chosen = companies[0];
    } else {
      throw new FicError(
        'config',
        companies.length === 0
          ? 'Il token non dà accesso a nessuna azienda. Cosa fare: ricollega l’app in Fatture in Cloud selezionando l’azienda.'
          : `Il token vede più aziende: indica quale usare con FIC_COMPANY_ID. Aziende disponibili: ${list}.`,
      );
    }
    this.company = chosen!;
    this.rawClient().setCompanyId(chosen!.id);
    this.cache.setNamespace(cacheNamespace(this.config.token, chosen!.id));
    return chosen!;
  }
}
