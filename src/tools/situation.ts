import { z } from 'zod';
import { fetchAll } from '../api/paginate.js';
import { todayRome } from '../domain/dates.js';
import { fromCents, toCents } from '../domain/money.js';
import { Q } from '../domain/query.js';
import type { IssuedDocument, PaymentItem, ReceivedDocument } from '../domain/types.js';
import { periodShape, resolvePeriod } from './common.js';
import { defineTool } from './define.js';

interface Acc {
  net: number;
  vat: number;
  gross: number;
  count: number;
}
const acc = (): Acc => ({ net: 0, vat: 0, gross: 0, count: 0 });
function add(
  a: Acc,
  d: { amount_net?: number | null; amount_vat?: number | null; amount_gross?: number | null },
  sign = 1,
) {
  a.net += sign * toCents(d.amount_net);
  a.vat += sign * toCents(d.amount_vat);
  a.gross += sign * toCents(d.amount_gross);
  a.count++;
}
const euro = (a: Acc) => ({
  net: fromCents(a.net),
  vat: fromCents(a.vat),
  gross: fromCents(a.gross),
  documents: a.count,
});

export const situation = defineTool({
  name: 'fic_situation',
  title: 'Situazione: fatturato, incassi, costi',
  description: `Riepilogo economico di un periodo (default: anno corrente), calcolato leggendo tutte le pagine:
- fatturato: fatture meno note di credito del periodo (per data documento), netto, IVA e lordo;
- incassato, da incassare e scaduto sulle fatture del periodo, dalle rate;
- incassato nel periodo per data di pagamento (cash_basis: true; legge anche le fatture dell'anno precedente);
- costi: spese e note di credito passive del periodo; differenza netta (fatturato netto meno costi netti, IVA esclusa);
- dettaglio mensile facoltativo.
Esempi: "situazione dell'anno" -> {}; "situazione del 2025 mese per mese" -> {year:2025, monthly:true}.
Revenue, collected, outstanding, overdue and costs for a period, reading all pages.`,
  minMode: 'readonly',
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  input: z.object({
    ...periodShape,
    client_id: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Limita i ricavi a un cliente (i costi vengono esclusi).'),
    include_costs: z.boolean().default(true).describe('Include i documenti ricevuti (costi).'),
    monthly: z.boolean().default(false).describe('Aggiunge il dettaglio mese per mese.'),
    cash_basis: z
      .boolean()
      .default(false)
      .describe('Aggiunge l’incassato per data di pagamento nel periodo.'),
  }),
  operations: ['listIssuedDocuments', 'listReceivedDocuments'],
  handler: async (args, app) => {
    const client = await app.api();
    const today = todayRome(app.now());
    const p = resolvePeriod(args, app.now(), true);
    // Con un solo estremo: dal 1° gennaio dell'anno di date_to, oppure fino al 31 dicembre dell'anno di date_from.
    const from = p.from ?? `${(p.to ?? today).slice(0, 4)}-01-01`;
    const period = { from, to: p.to ?? `${from.slice(0, 4)}-12-31` };
    const max = app.config.maxPages;
    const issuedFields = 'id,type,date,currency,amount_net,amount_vat,amount_gross,payments_list';
    // Gli importi sono nella valuta del documento: i documenti non in euro restano fuori dalle somme.
    const other = new Map<string, { documents: number; gross: number }>();
    const inEuro = (
      d: { currency?: { id?: string | null } | null; amount_gross?: number | null },
      sign = 1,
    ) => {
      const cur = d.currency?.id;
      if (!cur || cur === 'EUR') return true;
      const o = other.get(cur) ?? { documents: 0, gross: 0 };
      o.documents++;
      o.gross += sign * toCents(d.amount_gross);
      other.set(cur, o);
      return false;
    };
    const issuedQ = (from: string) => {
      const q = new Q().dateGte('date', from).dateLte('date', period.to);
      if (args.client_id) q.eq('entity.id', args.client_id);
      return q.build();
    };
    const issued = (type: string, from = period.from) =>
      fetchAll<IssuedDocument>(
        client,
        {
          operationId: 'listIssuedDocuments',
          path: '/c/{company_id}/issued_documents',
          query: { type, q: issuedQ(from), fields: issuedFields },
        },
        max,
      );

    const invoices = await issued('invoice');
    const creditNotes = await issued('credit_note');
    const truncated: string[] = [];
    if (invoices.truncated) truncated.push('fatture');
    if (creditNotes.truncated) truncated.push('note di credito');

    const revenue = { invoices: acc(), credit_notes: acc() };
    const months = new Map<
      string,
      { revenue_net: number; revenue_gross: number; costs_net: number; collected: number }
    >();
    const month = (date: string | null | undefined) => {
      const k = (date ?? '').slice(0, 7);
      if (!months.has(k)) months.set(k, { revenue_net: 0, revenue_gross: 0, costs_net: 0, collected: 0 });
      return months.get(k)!;
    };

    let collected = 0;
    let outstanding = 0;
    let overdue = 0;
    const inst = (p: PaymentItem) => {
      if (p.status === 'reversed') return;
      if (p.status === 'paid') collected += toCents(p.amount);
      else {
        outstanding += toCents(p.amount);
        if (p.due_date && p.due_date < today) overdue += toCents(p.amount);
      }
    };
    for (const d of invoices.items) {
      if (!inEuro(d)) continue;
      add(revenue.invoices, d);
      (d.payments_list ?? []).forEach(inst);
      const m = month(d.date);
      m.revenue_net += toCents(d.amount_net);
      m.revenue_gross += toCents(d.amount_gross);
    }
    for (const d of creditNotes.items) {
      if (!inEuro(d, -1)) continue;
      add(revenue.credit_notes, d);
      const m = month(d.date);
      m.revenue_net -= toCents(d.amount_net);
      m.revenue_gross -= toCents(d.amount_gross);
    }
    const net: Acc = {
      net: revenue.invoices.net - revenue.credit_notes.net,
      vat: revenue.invoices.vat - revenue.credit_notes.vat,
      gross: revenue.invoices.gross - revenue.credit_notes.gross,
      count: revenue.invoices.count + revenue.credit_notes.count,
    };

    let cashBasis: Record<string, unknown> | undefined;
    if (args.cash_basis) {
      // Gli incassi del periodo possono riguardare fatture dell'anno precedente.
      const wideFrom = `${Number(period.from.slice(0, 4)) - 1}-01-01`;
      const wide = await issued('invoice', wideFrom);
      if (wide.truncated) truncated.push('fatture per gli incassi');
      let cash = 0;
      for (const d of wide.items) {
        if (d.currency?.id && d.currency.id !== 'EUR') continue;
        for (const p of d.payments_list ?? []) {
          if (p.status === 'paid' && p.paid_date && p.paid_date >= period.from && p.paid_date <= period.to) {
            cash += toCents(p.amount);
            month(p.paid_date).collected += toCents(p.amount);
          }
        }
      }
      cashBasis = {
        collected_in_period: fromCents(cash),
        note: `Rate pagate con data di pagamento nel periodo, su fatture emesse dal ${wideFrom}.`,
      };
    }

    let costs: Record<string, unknown> | undefined;
    let costsNet = 0;
    if (args.include_costs && !args.client_id) {
      const rq = new Q().dateGte('date', period.from).dateLte('date', period.to).build();
      const received = (type: string) =>
        fetchAll<ReceivedDocument>(
          client,
          {
            operationId: 'listReceivedDocuments',
            path: '/c/{company_id}/received_documents',
            query: { type, q: rq, fields: 'id,type,date,currency,amount_net,amount_vat,amount_gross' },
          },
          max,
        );
      const expenses = await received('expense');
      const passiveCn = await received('passive_credit_note');
      if (expenses.truncated || passiveCn.truncated) truncated.push('costi');
      const c = acc();
      for (const d of expenses.items) {
        if (!inEuro(d, -1)) continue;
        add(c, d);
        month(d.date).costs_net += toCents(d.amount_net);
      }
      for (const d of passiveCn.items) {
        if (!inEuro(d)) continue;
        add(c, d, -1);
        month(d.date).costs_net -= toCents(d.amount_net);
      }
      costsNet = c.net;
      costs = { ...euro(c), expenses: expenses.items.length, passive_credit_notes: passiveCn.items.length };
    }

    return {
      period,
      today,
      currency: 'EUR',
      revenue: { ...euro(net), invoices: euro(revenue.invoices), credit_notes: euro(revenue.credit_notes) },
      on_period_invoices: {
        collected: fromCents(collected),
        outstanding: fromCents(outstanding),
        overdue: fromCents(overdue),
        note: 'Dalle rate delle fatture emesse nel periodo; le note di credito non sono abbinate alle rate.',
      },
      cash_basis: cashBasis,
      costs,
      net_difference: costs ? fromCents(net.net - costsNet) : undefined,
      monthly: args.monthly
        ? [...months.entries()]
            .filter(([k]) => k)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => ({
              month: k,
              revenue_net: fromCents(v.revenue_net),
              revenue_gross: fromCents(v.revenue_gross),
              costs_net: costs ? fromCents(v.costs_net) : undefined,
              collected: args.cash_basis ? fromCents(v.collected) : undefined,
            }))
        : undefined,
      other_currencies: other.size
        ? {
            note: 'Documenti in valuta diversa dall’euro, esclusi dalle somme: importi lordi nella loro valuta (ricavi meno costi).',
            by_currency: Object.fromEntries(
              [...other].map(([k, v]) => [k, { documents: v.documents, gross: fromCents(v.gross) }]),
            ),
          }
        : undefined,
      truncated: truncated.length
        ? `Dati incompleti per: ${truncated.join(', ')}. Restringi il periodo o aumenta FIC_MAX_PAGES.`
        : undefined,
    };
  },
});
