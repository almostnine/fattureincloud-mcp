import { z } from 'zod';

/** Data ISO `YYYY-MM-DD`, validata davvero (niente 2026-02-30). */
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato atteso YYYY-MM-DD')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'Data inesistente');

/** "Oggi" nel fuso di Roma: è il riferimento per scadenze e ritardi. */
export function todayRome(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function yearOf(date: string): number {
  return Number(date.slice(0, 4));
}

export function yearRange(year: number): { from: string; to: string } {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

export function monthRange(year: number, month: number): { from: string; to: string } {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, '0');
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${String(last).padStart(2, '0')}` };
}

/** Giorni tra due date ISO (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Ultimo giorno del mese della data indicata (termini di pagamento "fine mese"). */
export function endOfMonth(date: string): string {
  const [y, m] = date.split('-').map(Number) as [number, number];
  return monthRange(y, m).to;
}
