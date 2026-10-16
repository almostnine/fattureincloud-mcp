import { daysBetween } from './dates.js';
import type { InstallmentRow } from './installments.js';
import { fromCents, toCents } from './money.js';

export interface BankTransaction {
  date: string;
  amount: number;
  description?: string;
  ref?: string;
}

export interface Match {
  document_id: number;
  document_number?: string;
  client_name?: string;
  installments: number[];
  due_date?: string;
  amount: number;
  confidence: 'high' | 'medium' | 'low';
  score: number;
  reasons: string[];
}

const STOP = new Set([
  'srl',
  'srls',
  'spa',
  'sas',
  'snc',
  'studio',
  'societa',
  'della',
  'delle',
  'degli',
  'bonifico',
  'fattura',
  'saldo',
  'pagamento',
]);

export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9/ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Parole significative del nome del cliente (senza delimitatori, forme societarie e parole comuni). */
export function nameTokens(name: string | undefined): string[] {
  if (!name) return [];
  return normalize(name.replace(/[⟦⟧]/g, ''))
    .split(' ')
    .filter((t) => t.length >= 4 && !STOP.has(t));
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Il numero del documento compare nella causale: "fatt 33", "fattura n 33", "ft 33", "33/2026", "33/26".
 * Un "n" isolato non basta ("rata n 2" non è la fattura 2).
 */
export function numberMentioned(desc: string, num: string | undefined, date: string | undefined): boolean {
  if (!num) return false;
  const n = escapeRe(normalize(num).replace(/\s/g, ''));
  const year = date?.slice(0, 4);
  const patterns = [
    new RegExp(`(?:^|\\s)(?:fatt|fattura|ft|nr|num)(?:\\s+(?:n|nr|num))?\\s*${n}(?![0-9])`),
    ...(year
      ? [
          new RegExp(`(?<![0-9])${n}\\s*/\\s*${year}(?![0-9])`),
          new RegExp(`(?<![0-9])${n}\\s*/\\s*${year.slice(2)}(?![0-9])`),
        ]
      : []),
  ];
  return patterns.some((p) => p.test(desc));
}

/** Indice delle rate aperte per importo e dei residui per documento: una passata sola, poi ricerche dirette. */
export interface RowIndex {
  byAmount: Map<number, InstallmentRow[]>;
  byDocTotal: Map<number, InstallmentRow[][]>;
  rows: InstallmentRow[];
}

export function buildIndex(rows: InstallmentRow[]): RowIndex {
  const byAmount = new Map<number, InstallmentRow[]>();
  const docs = new Map<number, InstallmentRow[]>();
  for (const r of rows) {
    const c = toCents(r.amount);
    byAmount.set(c, [...(byAmount.get(c) ?? []), r]);
    docs.set(r.document_id, [...(docs.get(r.document_id) ?? []), r]);
  }
  const byDocTotal = new Map<number, InstallmentRow[][]>();
  for (const rs of docs.values()) {
    if (rs.length < 2) continue;
    const total = rs.reduce((a, r) => a + toCents(r.amount), 0);
    byDocTotal.set(total, [...(byDocTotal.get(total) ?? []), rs]);
  }
  return { byAmount, byDocTotal, rows };
}

const rowKey = (r: InstallmentRow) => `${r.document_id}:${r.installment}`;

/** Margine minimo sul secondo candidato per dichiarare un abbinamento "high". */
const HIGH_MARGIN = 20;

/**
 * Propone gli abbinamenti tra un movimento in entrata e le rate aperte.
 * Candidati: una singola rata con lo stesso importo, oppure tutto il residuo di un documento.
 * Le rate in `used` (già abbinate con alta confidenza a un altro movimento) vengono escluse.
 */
export function matchTransaction(
  tx: BankTransaction,
  index: RowIndex,
  toleranceCents = 0,
  used: Set<string> = new Set(),
): Match[] {
  const amount = toCents(tx.amount);
  const desc = normalize(`${tx.description ?? ''} ${tx.ref ?? ''}`);
  const words = new Set(desc.split(' '));
  const candidates: Match[] = [];
  const nameIn = (name: string | undefined) => nameTokens(name).some((t) => words.has(t));

  const score = (
    base: number,
    reasons: string[],
    r: { client_name?: string; document_number?: string; document_date?: string; due_date?: string },
  ) => {
    let s = base;
    if (nameIn(r.client_name)) {
      s += 30;
      reasons.push('nome del cliente nella causale');
    }
    if (numberMentioned(desc, r.document_number, r.document_date)) {
      s += 25;
      reasons.push('numero del documento nella causale');
    }
    if (r.due_date) {
      const d = daysBetween(r.due_date, tx.date);
      if (d >= -20 && d <= 60) {
        s += 10;
        reasons.push(`data vicina alla scadenza (${d >= 0 ? `${d} giorni dopo` : `${-d} giorni prima`})`);
      }
    }
    return s;
  };

  for (let c = amount - toleranceCents; c <= amount + toleranceCents; c++) {
    for (const r of index.byAmount.get(c) ?? []) {
      if (used.has(rowKey(r))) continue;
      const reasons = [c === amount ? 'importo uguale alla rata' : 'importo entro la tolleranza'];
      candidates.push({
        document_id: r.document_id,
        document_number: r.document_number,
        client_name: r.client_name,
        installments: [r.installment],
        due_date: r.due_date,
        amount: r.amount,
        score: score(50, reasons, r),
        confidence: 'low',
        reasons,
      });
    }
    for (const rs of index.byDocTotal.get(c) ?? []) {
      if (rs.some((r) => used.has(rowKey(r)))) continue;
      const first = rs[0]!;
      const reasons = ['importo uguale a tutto il residuo del documento'];
      candidates.push({
        document_id: first.document_id,
        document_number: first.document_number,
        client_name: first.client_name,
        installments: rs.map((r) => r.installment),
        due_date: first.due_date,
        amount: fromCents(c),
        score: score(45, reasons, first),
        confidence: 'low',
        reasons,
      });
    }
  }

  if (candidates.length === 0) {
    // Nessun importo coincide: segnala i clienti citati nella causale, utile per pagamenti parziali.
    for (const r of index.rows) {
      if (used.has(rowKey(r)) || !nameIn(r.client_name)) continue;
      candidates.push({
        document_id: r.document_id,
        document_number: r.document_number,
        client_name: r.client_name,
        installments: [r.installment],
        due_date: r.due_date,
        amount: r.amount,
        score: 20,
        confidence: 'low',
        reasons: ['nome del cliente nella causale, ma importo diverso (pagamento parziale o cumulativo?)'],
      });
    }
  }

  // A parità di punteggio, prima la scadenza più vecchia (la prima rata non pagata dello stesso documento).
  candidates.sort((a, b) => b.score - a.score || (a.due_date ?? '').localeCompare(b.due_date ?? ''));
  // Solo il primo può essere "high", e solo se stacca di almeno HIGH_MARGIN punti il miglior candidato di un
  // altro documento: più rate uguali dello stesso documento non rendono ambiguo a quale documento va il bonifico.
  const top = candidates[0];
  const rival = candidates.find((c) => c.document_id !== top?.document_id)?.score ?? Number.NEGATIVE_INFINITY;
  candidates.forEach((c, i) => {
    c.confidence =
      i === 0 && c.score >= 80 && c.score - rival >= HIGH_MARGIN ? 'high' : c.score >= 60 ? 'medium' : 'low';
  });
  return candidates.slice(0, 3);
}

/** Chiave della rata, per escluderla dagli abbinamenti successivi. */
export function matchKeys(m: Match): string[] {
  return m.installments.map((i) => `${m.document_id}:${i}`);
}
