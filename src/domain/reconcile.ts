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

function numberMentioned(desc: string, num: string | undefined, date: string | undefined): boolean {
  if (!num) return false;
  const n = normalize(num).replace(/\s/g, '');
  const year = date?.slice(0, 4);
  const patterns = [
    new RegExp(`(?:fatt|fattura|ft|fatt\\.|n|nr|num)\\s*\\.?\\s*${n}(?![0-9])`),
    ...(year
      ? [
          new RegExp(`(?<![0-9])${n}\\s*/\\s*${year}(?![0-9])`),
          new RegExp(`(?<![0-9])${n}\\s*/\\s*${year.slice(2)}(?![0-9])`),
        ]
      : []),
  ];
  return patterns.some((p) => p.test(desc));
}

/**
 * Propone gli abbinamenti tra un movimento in entrata e le rate aperte.
 * Candidati: una singola rata con lo stesso importo, oppure tutto il residuo di un documento.
 */
export function matchTransaction(tx: BankTransaction, rows: InstallmentRow[], toleranceCents = 0): Match[] {
  const amount = toCents(tx.amount);
  const desc = normalize(`${tx.description ?? ''} ${tx.ref ?? ''}`);
  const candidates: Match[] = [];

  const score = (
    base: number,
    reasons: string[],
    r: { client_name?: string; document_number?: string; document_date?: string; due_date?: string },
  ) => {
    let s = base;
    const tokens = nameTokens(r.client_name);
    if (tokens.length && tokens.some((t) => desc.includes(t))) {
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

  for (const r of rows) {
    if (Math.abs(toCents(r.amount) - amount) <= toleranceCents) {
      const reasons = [
        toleranceCents && toCents(r.amount) !== amount
          ? 'importo entro la tolleranza'
          : 'importo uguale alla rata',
      ];
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
  }

  const byDoc = new Map<number, InstallmentRow[]>();
  for (const r of rows) byDoc.set(r.document_id, [...(byDoc.get(r.document_id) ?? []), r]);
  for (const [docId, rs] of byDoc) {
    if (rs.length < 2) continue;
    const total = rs.reduce((a, r) => a + toCents(r.amount), 0);
    if (Math.abs(total - amount) <= toleranceCents) {
      const first = rs[0]!;
      const reasons = ['importo uguale a tutto il residuo del documento'];
      candidates.push({
        document_id: docId,
        document_number: first.document_number,
        client_name: first.client_name,
        installments: rs.map((r) => r.installment),
        due_date: first.due_date,
        amount: fromCents(total),
        score: score(45, reasons, first),
        confidence: 'low',
        reasons,
      });
    }
  }

  if (candidates.length === 0) {
    // Nessun importo coincide: segnala i clienti citati nella causale, utile per pagamenti parziali.
    for (const r of rows) {
      const tokens = nameTokens(r.client_name);
      if (tokens.length && tokens.some((t) => desc.includes(t))) {
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
  }

  // Più candidati con lo stesso punteggio massimo: nessuno può essere "high".
  candidates.sort((a, b) => b.score - a.score);
  const top = candidates[0]?.score ?? 0;
  const ties = candidates.filter((c) => c.score === top).length;
  for (const c of candidates) {
    c.confidence = c.score >= 80 && ties === 1 ? 'high' : c.score >= 60 ? 'medium' : 'low';
  }
  return candidates.slice(0, 3);
}
