/** Importi: le somme si fanno in centesimi interi, mai in virgola mobile. */

export function toCents(amount: number | null | undefined): number {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return 0;
  return Math.round(amount * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

export function sumCents(values: Array<number | null | undefined>): number {
  return values.reduce<number>((acc, v) => acc + toCents(v), 0);
}

/** Divide un importo in `n` parti uguali al centesimo; l'ultima parte assorbe il resto. */
export function splitCents(totalCents: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.trunc(totalCents / n);
  const parts = Array.from({ length: n }, () => base);
  parts[n - 1] = totalCents - base * (n - 1);
  return parts;
}
