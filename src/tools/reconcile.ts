import { z } from 'zod';
import { fetchAll } from '../api/paginate.js';
import { isoDate, todayRome } from '../domain/dates.js';
import { installmentRows } from '../domain/installments.js';
import { matchTransaction } from '../domain/reconcile.js';
import type { IssuedDocument } from '../domain/types.js';
import { untrusted } from '../safety/untrusted.js';
import { defineTool } from './define.js';

export const reconcile = defineTool({
  name: 'fic_reconcile',
  title: 'Riconcilia movimenti bancari e rate',
  description: `Confronta i movimenti in entrata dell'estratto conto (data, importo, causale) con le rate non pagate delle fatture e propone gli abbinamenti, con un grado di confidenza (high, medium, low) e i motivi: importo uguale a una rata o a tutto il residuo, nome del cliente o numero della fattura nella causale, data vicina alla scadenza.
Non modifica nulla: per registrare un incasso confermato dall'utente usa fic_set_installment_status (modalità write).
Passa i movimenti letti dal file della banca; le uscite (importi negativi) vengono ignorate.
Matches incoming bank transactions with unpaid installments and proposes matches with a confidence level. Read-only.`,
  minMode: 'readonly',
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  input: z.object({
    transactions: z
      .array(
        z.object({
          date: isoDate.describe('Data valuta o contabile.'),
          amount: z.number().describe('Importo in euro; positivo per le entrate.'),
          description: z.string().max(500).optional().describe('Causale del movimento.'),
          ref: z.string().max(100).optional().describe('Riferimento libero (CRO, ID del movimento).'),
        }),
      )
      .min(1)
      .max(500),
    tolerance: z
      .number()
      .min(0)
      .max(5)
      .default(0)
      .describe('Tolleranza sull’importo in euro (per commissioni bancarie).'),
  }),
  operations: ['listIssuedDocuments'],
  handler: async (args, app) => {
    const client = await app.api();
    const today = todayRome(app.now());
    const all = await fetchAll<IssuedDocument>(
      client,
      {
        operationId: 'listIssuedDocuments',
        path: '/c/{company_id}/issued_documents',
        query: {
          type: 'invoice',
          q: 'next_due_date is not null',
          fields: 'id,type,number,numeration,date,entity,payments_list',
        },
      },
      app.config.maxPages,
    );
    const rows = installmentRows(all.items, { status: 'not_paid', today });
    const tolerance = Math.round(args.tolerance * 100);
    const results = args.transactions.map((tx, i) => {
      const base = {
        index: i + 1,
        date: tx.date,
        amount: tx.amount,
        description: untrusted(tx.description, 300),
        ref: tx.ref,
      };
      if (tx.amount <= 0) return { ...base, skipped: 'uscita o importo nullo' };
      const matches = matchTransaction(tx, rows, tolerance);
      return {
        ...base,
        matches: matches.length ? matches : undefined,
        unmatched: matches.length ? undefined : true,
      };
    });
    const counted = results.filter((r) => !('skipped' in r && r.skipped));
    return {
      open_installments_considered: rows.length,
      transactions: args.transactions.length,
      high: counted.filter((r) => 'matches' in r && r.matches?.[0]?.confidence === 'high').length,
      medium: counted.filter((r) => 'matches' in r && r.matches?.[0]?.confidence === 'medium').length,
      unmatched: counted.filter((r) => 'unmatched' in r && r.unmatched).length,
      results,
      truncated: all.truncated
        ? 'Non tutte le fatture con rate aperte sono state lette: aumenta FIC_MAX_PAGES.'
        : undefined,
      next_step:
        'Mostra le proposte all’utente; per ogni abbinamento confermato usa fic_set_installment_status con paid_date uguale alla data del movimento.',
    };
  },
});
