/** Classe di effetto reale di un'operazione, indipendente dal metodo HTTP. */
export type Effect = 'read' | 'write' | 'delete' | 'delete_permanent' | 'send' | 'external';

export interface CatalogQueryParam {
  name: string;
  type: string;
  required: boolean;
  enum?: unknown[];
  max?: number;
  description?: string;
}

export interface CatalogOperation {
  id: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  tag: string;
  summary: string;
  effect: Effect;
  /** Scope necessari: dichiarati nella spec oppure dedotti (scopesDeclared = false). */
  scopes: string[];
  scopesDeclared: boolean;
  companyScoped: boolean;
  pathParams: string[];
  query: CatalogQueryParam[];
  body?: {
    contentType: string;
    required: boolean;
    fields?: { data: Record<string, string>; options: string[] };
  };
  paginated: boolean;
  responseType: string | null;
}
