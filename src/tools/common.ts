import { z } from 'zod';
import { refused } from '../api/errors.js';
import { isoDate, monthRange, todayRome, yearOf, yearRange } from '../domain/dates.js';
import { ISSUED_TYPES } from '../domain/types.js';

export const docTypeSchema = z
  .enum(ISSUED_TYPES)
  .describe(
    'Tipo di documento emesso: invoice (fattura), credit_note (nota di credito), proforma, quote (preventivo), order (ordine), delivery_note (DDT), receipt (ricevuta), work_report (rapportino), supplier_order (ordine a fornitore), self_own_invoice / self_supplier_invoice (autofatture).',
  );

export const periodShape = {
  year: z.number().int().min(2000).max(2100).optional().describe('Anno, per esempio 2026.'),
  month: z.number().int().min(1).max(12).optional().describe('Mese 1-12; senza anno vale l’anno corrente.'),
  date_from: isoDate.optional().describe('Data iniziale inclusa (YYYY-MM-DD). Prevale su anno e mese.'),
  date_to: isoDate.optional().describe('Data finale inclusa (YYYY-MM-DD). Prevale su anno e mese.'),
};

export interface Period {
  from?: string;
  to?: string;
}

/** Periodo da anno, mese o intervallo esplicito. Con `defaultYear` un periodo vuoto diventa l'anno corrente. */
export function resolvePeriod(
  args: { year?: number; month?: number; date_from?: string; date_to?: string },
  now: Date,
  defaultYear = false,
): Period {
  if (args.date_from || args.date_to) {
    if (args.date_from && args.date_to && args.date_from > args.date_to) {
      throw refused('date_from è successiva a date_to: correggi l’intervallo.');
    }
    return { from: args.date_from, to: args.date_to };
  }
  const currentYear = yearOf(todayRome(now));
  if (args.month) return monthRange(args.year ?? currentYear, args.month);
  if (args.year) return yearRange(args.year);
  return defaultYear ? yearRange(currentYear) : {};
}

export const pagingShape = {
  page: z.number().int().min(1).default(1).describe('Pagina da leggere (da 1).'),
  per_page: z.number().int().min(1).max(100).default(50).describe('Elementi per pagina, massimo 100.'),
  all_pages: z
    .boolean()
    .default(false)
    .describe(
      'Legge tutte le pagine (fino al tetto FIC_MAX_PAGES) invece di una sola. Più lento, consuma più richieste.',
    ),
};

export const detailSchema = z
  .enum(['compact', 'full'])
  .default('compact')
  .describe('compact: campi essenziali; full: tutti i campi utili.');
