import { z } from 'zod';
import { SPEC_VERSION } from '../api/catalog.generated.js';
import { FicError } from '../api/errors.js';
import type { AppContext } from '../context.js';
import { VERSION } from '../version.js';
import { defineTool } from './define.js';

interface UserInfoResponse {
  data?: { id?: number; name?: string; first_name?: string; last_name?: string; email?: string };
}
interface CompanyInfoResponse {
  data?: {
    id?: number;
    name?: string;
    type?: string;
    fic_plan_name?: string;
    fic_license_expire?: string;
    plan_info?: unknown;
  };
}
interface PlanUsageResponse {
  data?: { limit?: number; usage?: number };
}

async function planUsage(app: AppContext): Promise<Record<string, unknown>> {
  const client = await app.api();
  const out: Record<string, unknown> = {};
  for (const category of ['documents', 'clients', 'suppliers', 'products'] as const) {
    try {
      const res = await client.request<PlanUsageResponse>({
        operationId: 'getCompanyPlanUsage',
        method: 'GET',
        path: '/c/{company_id}/company/plan_usage',
        query: { category },
      });
      out[category] = { usati: res?.data?.usage, limite: res?.data?.limit };
    } catch {
      // l'uso del piano è accessorio: non deve far fallire il resto
    }
  }
  return out;
}

export const accountInfo = defineTool({
  name: 'fic_account_info',
  title: 'Account e azienda attiva',
  description: `Informazioni sull'account Fatture in Cloud collegato: utente, aziende accessibili con il loro piano, azienda attiva, modalità del server (readonly, write, full), quote di richieste API residue e, facoltativamente, l'uso dei limiti del piano.
Usalo all'inizio, per capire cosa si può fare, o quando un errore parla di token, azienda o permessi.
Shows the connected Fatture in Cloud account, accessible companies, active company, server mode and remaining API quota.`,
  minMode: 'readonly',
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  input: z.object({
    include_plan_usage: z
      .boolean()
      .default(false)
      .describe(
        'Aggiunge l’uso dei limiti del piano (documenti, clienti, fornitori, prodotti): 4 richieste in più.',
      ),
  }),
  operations: ['getUserInfo', 'listUserCompanies', 'getCompanyInfo', 'getCompanyPlanUsage'],
  handler: async (args, app) => {
    const raw = app.rawClient();
    const user = await raw.request<UserInfoResponse>({
      operationId: 'getUserInfo',
      method: 'GET',
      path: '/user/info',
    });
    const companies = await app.listCompanies();
    const u = user?.data;
    const base = {
      utente: {
        id: u?.id,
        nome: u?.name ?? [u?.first_name, u?.last_name].filter(Boolean).join(' '),
        email: u?.email,
      },
      aziende_accessibili: companies.map((c) => ({ id: c.id, nome: c.name, piano: c.fic_plan })),
      modalita_server: app.config.mode,
      versione_server: VERSION,
      versione_api: SPEC_VERSION,
    };
    let active: Awaited<ReturnType<typeof app.activeCompany>>;
    try {
      active = await app.activeCompany();
    } catch (err) {
      // Proprio quando l'azienda è configurata male questo tool deve dire quali sono disponibili.
      if (err instanceof FicError && err.kind === 'config') return { ...base, problema: err.message };
      throw err;
    }
    const client = await app.api();
    const info = await client.request<CompanyInfoResponse>({
      operationId: 'getCompanyInfo',
      method: 'GET',
      path: '/c/{company_id}/company/info',
    });
    const usage = args.include_plan_usage ? await planUsage(app) : undefined;
    return {
      ...base,
      azienda_attiva: {
        id: active.id,
        nome: info?.data?.name ?? active.name,
        piano: info?.data?.fic_plan_name ?? active.fic_plan,
        scadenza_licenza: info?.data?.fic_license_expire ?? active.fic_license_expire,
      },
      quote_api: {
        richieste_residue_ora: client.quota.hourlyRemaining,
        limite_orario: client.quota.hourlyLimit,
        richieste_residue_mese: client.quota.monthlyRemaining,
        limite_mensile: client.quota.monthlyLimit,
      },
      uso_piano: usage,
    };
  },
});
