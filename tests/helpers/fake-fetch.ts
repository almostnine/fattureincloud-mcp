/** fetch finto per i test: risposte per metodo e percorso, registro delle chiamate. Nessuna rete. */

export interface FakeResponse {
  status?: number;
  body?: unknown;
  text?: string;
  headers?: Record<string, string>;
}

export interface RecordedCall {
  method: string;
  url: URL;
  path: string;
  query: Record<string, string>;
  body: unknown;
  headers: Record<string, string>;
}

type Handler = FakeResponse | FakeResponse[] | ((call: RecordedCall) => FakeResponse);

export class FakeFic {
  readonly calls: RecordedCall[] = [];
  private readonly routes: Array<{ method: string; pattern: RegExp; handler: Handler; used: number }> = [];

  on(method: string, path: string | RegExp, handler: Handler): this {
    const pattern =
      typeof path === 'string' ? new RegExp(`^${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) : path;
    this.routes.push({ method, pattern, handler, used: 0 });
    return this;
  }

  /** Aziende di prova con un'azienda attiva e quote negli header. */
  withCompany(id = 1001, plan = 'standard'): this {
    return this.on('GET', '/user/companies', {
      body: { data: { companies: [{ id, name: 'Azienda di Prova Srl', type: 'company', fic_plan: plan }] } },
    });
  }

  callsTo(path: string | RegExp): RecordedCall[] {
    return this.calls.filter((c) => (typeof path === 'string' ? c.path === path : path.test(c.path)));
  }

  fetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries((init?.headers as Record<string, string>) ?? {}))
      headers[k.toLowerCase()] = v;
    const call: RecordedCall = {
      method: init?.method ?? 'GET',
      url,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams.entries()),
      body:
        init?.body instanceof FormData
          ? { form: [...init.body.keys()] }
          : init?.body
            ? JSON.parse(String(init.body))
            : undefined,
      headers,
    };
    this.calls.push(call);
    const route = this.routes.find((r) => r.method === call.method && r.pattern.test(call.path));
    if (!route) {
      return new Response(
        JSON.stringify({ error: { message: `Nessuna risposta finta per ${call.method} ${call.path}` } }),
        {
          status: 404,
          headers: { 'content-type': 'application/json' },
        },
      );
    }
    let res: FakeResponse;
    if (typeof route.handler === 'function') res = route.handler(call);
    else if (Array.isArray(route.handler))
      res = route.handler[Math.min(route.used, route.handler.length - 1)]!;
    else res = route.handler;
    route.used++;
    const body = res.text ?? (res.body === undefined ? '' : JSON.stringify(res.body));
    return new Response(res.status === 204 ? null : body, {
      status: res.status ?? 200,
      headers: {
        'content-type': res.text ? 'text/xml' : 'application/json',
        'ratelimit-hourlyremaining': '990',
        'ratelimit-hourlylimit': '1000',
        'ratelimit-monthlyremaining': '39000',
        'ratelimit-monthlylimit': '40000',
        ...res.headers,
      },
    });
  };
}

export const noSleep = async (): Promise<void> => {};
