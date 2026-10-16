/**
 * Costruzione del filtro `q` dell'API (https://developers.fattureincloud.it/docs/basics/filter-results/queries/).
 * L'escape di un apice dentro un valore non è documentato: i valori con apici non vengono mai interpolati
 * così come sono (vedi `textContains`).
 */

export class Q {
  private readonly parts: string[] = [];

  /** Condizione già formata, solo da valori controllati dal codice. */
  raw(condition: string): this {
    this.parts.push(condition);
    return this;
  }

  eq(field: string, value: number | boolean): this {
    return this.raw(`${field} = ${value}`);
  }

  dateGte(field: string, date: string | undefined): this {
    return date ? this.raw(`${field} >= '${assertIsoDate(date)}'`) : this;
  }

  dateLte(field: string, date: string | undefined): this {
    return date ? this.raw(`${field} <= '${assertIsoDate(date)}'`) : this;
  }

  dateLt(field: string, date: string): this {
    return this.raw(`${field} < '${assertIsoDate(date)}'`);
  }

  /** Uguaglianza su stringa. Valori con apici: rifiutati (l'escape non è documentato). */
  strEq(field: string, value: string | undefined): this {
    if (value === undefined || value === '') return this;
    if (value.includes("'")) throw new Error(`Valore con apice non filtrabile esattamente: ${value}`);
    return this.raw(`${field} = '${value}'`);
  }

  /**
   * Ricerca per sottostringa. Se il testo contiene apici (es. "L'Officina") si cerca il frammento
   * più lungo senza apici, che è sicuro e quasi sempre sufficiente.
   */
  textContains(field: string, value: string | undefined): this {
    const frag = safeFragment(value);
    return frag ? this.raw(`${field} contains '${frag}'`) : this;
  }

  /** Disgiunzione di condizioni costruite con un'altra istanza di Q. */
  anyOf(...alternatives: Q[]): this {
    const items = alternatives.map((q) => q.build()).filter((s): s is string => Boolean(s));
    if (items.length === 1) return this.raw(items[0]!);
    if (items.length > 1) this.parts.push(`(${items.map((s) => `(${s})`).join(' or ')})`);
    return this;
  }

  build(): string | undefined {
    return this.parts.length ? this.parts.join(' and ') : undefined;
  }
}

export function safeFragment(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const cleaned = value.replace(/[\\%]/g, ' ').trim();
  const frags = cleaned
    .split("'")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!frags.length) return undefined;
  return frags.reduce((a, b) => (b.length > a.length ? b : a));
}

function assertIsoDate(d: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error(`Data non valida: ${d}`);
  return d;
}
