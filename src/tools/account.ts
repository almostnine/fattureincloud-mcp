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
      out[category] = { used: res?.data?.usage, limit: res?.data?.limit };
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
      user: {
        id: u?.id,
        name: u?.name ?? [u?.first_name, u?.last_name].filter(Boolean).join(' '),
        email: u?.email,
      },
      companies: companies.map((c) => ({ id: c.id, name: c.name, plan: c.fic_plan })),
      server_mode: app.config.mode,
      server_version: VERSION,
      api_version: SPEC_VERSION,
    };
    let active: Awaited<ReturnType<typeof app.activeCompany>>;
    try {
      active = await app.activeCompany();
    } catch (err) {
      // Proprio quando l'azienda è configurata male questo tool deve dire quali sono disponibili.
      if (err instanceof FicError && err.kind === 'config') return { ...base, problem: err.message };
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
      active_company: {
        id: active.id,
        name: info?.data?.name ?? active.name,
        plan: info?.data?.fic_plan_name ?? active.fic_plan,
        license_expires: info?.data?.fic_license_expire ?? active.fic_license_expire,
      },
      api_quota: {
        hourly_remaining: client.quota.hourlyRemaining,
        hourly_limit: client.quota.hourlyLimit,
        monthly_remaining: client.quota.monthlyRemaining,
        monthly_limit: client.quota.monthlyLimit,
      },
      plan_usage: usage,
    };
  },
});
