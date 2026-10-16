import { catalogOperation, type FicClient, type QueryValue } from './client.js';

export interface OpArgs {
  pathParams?: Record<string, string | number>;
  query?: Record<string, QueryValue>;
  body?: unknown;
  responseType?: 'json' | 'text';
  retrySafe?: boolean;
}

/** Chiama un'operazione del catalogo per operationId: metodo e percorso vengono dalla spec, non dal codice. */
export function callOp<T = unknown>(client: FicClient, operationId: string, args: OpArgs = {}): Promise<T> {
  const op = catalogOperation(operationId);
  if (!op) throw new Error(`Operazione sconosciuta nel catalogo: ${operationId}`);
  return client.request<T>({
    operationId,
    method: op.method,
    path: op.path,
    ...args,
    ...(op.effect === 'read' && op.method === 'POST' ? { retrySafe: true } : {}),
  });
}
