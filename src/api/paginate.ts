import type { FicClient, QueryValue } from './client.js';

/** Massimo consentito dall'API (il default è 5 nella spec e 50 nella documentazione: va sempre esplicitato). */
export const MAX_PER_PAGE = 100;

export interface PageResponse<T> {
  data?: T[];
  current_page?: number;
  last_page?: number;
  per_page?: number;
  total?: number;
}

export interface Page<T> {
  items: T[];
  page: number;
  perPage: number;
  total: number;
  lastPage: number;
  hasMore: boolean;
}

export interface AllPages<T> {
  items: T[];
  total: number;
  pagesRead: number;
  truncated: boolean;
}

interface ListSpec {
  operationId: string;
  path: string;
  query?: Record<string, QueryValue>;
}

export async function fetchPage<T>(
  client: FicClient,
  spec: ListSpec,
  page: number,
  perPage: number,
): Promise<Page<T>> {
  const res = await client.request<PageResponse<T>>({
    operationId: spec.operationId,
    method: 'GET',
    path: spec.path,
    query: { ...spec.query, page, per_page: perPage },
  });
  const items = res?.data ?? [];
  const lastPage = res?.last_page ?? page;
  return {
    items,
    page: res?.current_page ?? page,
    perPage: res?.per_page ?? perPage,
    total: res?.total ?? items.length,
    lastPage,
    hasMore: page < lastPage,
  };
}

/** Legge tutte le pagine fino a `maxPages`; se il tetto scatta il risultato lo dice (`truncated`). */
export async function fetchAll<T>(client: FicClient, spec: ListSpec, maxPages: number): Promise<AllPages<T>> {
  const items: T[] = [];
  let page = 1;
  let total = 0;
  let lastPage = 1;
  do {
    const p = await fetchPage<T>(client, spec, page, MAX_PER_PAGE);
    items.push(...p.items);
    total = p.total;
    lastPage = p.lastPage;
    page++;
  } while (page <= lastPage && page <= maxPages);
  return { items, total, pagesRead: page - 1, truncated: lastPage > maxPages };
}
