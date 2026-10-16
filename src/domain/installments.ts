import { untrusted } from '../safety/untrusted.js';
import { daysBetween } from './dates.js';
import { displayNumber, entityName, isOpen } from './documents.js';
import { fromCents, toCents } from './money.js';
import type { IssuedDocument } from './types.js';

export type InstallmentFilter = 'overdue' | 'not_paid' | 'paid' | 'all';

export interface InstallmentRow {
  document_id: number;
  document_type: string;
  document_number?: string;
  document_date?: string;
  client_id?: number;
  client_name?: string;
  client_email?: string;
  client_certified_email?: string;
  installment: number;
  installments_total: number;
  installment_id?: number;
  due_date?: string;
  amount: number;
  status: string;
  overdue?: boolean;
  days_overdue?: number;
  paid_date?: string;
  payment_account?: { id: number; name?: string };
  ei_status?: string;
}

export interface RowFilter {
  status: InstallmentFilter;
  today: string;
  dueFrom?: string;
  dueTo?: string;
  paidFrom?: string;
  paidTo?: string;
}

/** Una riga per rata, già filtrata. Le rate stornate (`reversed`) compaiono solo con status "all". */
export function installmentRows(docs: IssuedDocument[], f: RowFilter): InstallmentRow[] {
  const rows: InstallmentRow[] = [];
  for (const d of docs) {
    const list = d.payments_list ?? [];
    list.forEach((p, i) => {
      const status = p.status ?? 'not_paid';
      const open = isOpen(p);
      const overdue = open && Boolean(p.due_date && p.due_date < f.today);
      if (f.status === 'overdue' && !overdue) return;
      if (f.status === 'not_paid' && !open) return;
      if (f.status === 'paid' && status !== 'paid') return;
      if (f.dueFrom && (!p.due_date || p.due_date < f.dueFrom)) return;
      if (f.dueTo && (!p.due_date || p.due_date > f.dueTo)) return;
      if (f.paidFrom && (!p.paid_date || p.paid_date < f.paidFrom)) return;
      if (f.paidTo && (!p.paid_date || p.paid_date > f.paidTo)) return;
      rows.push({
        document_id: d.id!,
        document_type: d.type ?? 'invoice',
        document_number: displayNumber(d),
        document_date: d.date ?? undefined,
        client_id: d.entity?.id ?? undefined,
        client_name: untrusted(entityName(d.entity), 200),
        client_email: d.entity?.email ?? undefined,
        client_certified_email: d.entity?.certified_email ?? undefined,
        installment: i + 1,
        installments_total: list.length,
        installment_id: p.id ?? undefined,
        due_date: p.due_date ?? undefined,
        amount: p.amount ?? 0,
        status,
        overdue: overdue || undefined,
        days_overdue: overdue && p.due_date ? daysBetween(p.due_date, f.today) : undefined,
        paid_date: p.paid_date ?? undefined,
        payment_account: p.payment_account?.id
          ? { id: p.payment_account.id, name: p.payment_account.name ?? undefined }
          : undefined,
        ei_status: d.ei_status ?? undefined,
      });
    });
  }
  rows.sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? '') || a.document_id - b.document_id);
  return rows;
}

export function groupByClient(rows: InstallmentRow[]) {
  const map = new Map<string, { rows: InstallmentRow[] }>();
  for (const r of rows) {
    const key = String(r.client_id ?? r.client_name ?? 'sconosciuto');
    const g = map.get(key) ?? { rows: [] };
    g.rows.push(r);
    map.set(key, g);
  }
  return [...map.values()]
    .map(({ rows: rs }) => {
      const first = rs[0]!;
      return {
        client_id: first.client_id,
        client_name: first.client_name,
        client_email: first.client_email,
        client_certified_email: first.client_certified_email,
        installments: rs.length,
        amount: fromCents(rs.reduce((a, r) => a + toCents(r.amount), 0)),
        oldest_due_date: rs
          .map((r) => r.due_date)
          .filter(Boolean)
          .sort()[0],
        max_days_overdue: Math.max(0, ...rs.map((r) => r.days_overdue ?? 0)) || undefined,
        documents: [...new Set(rs.map((r) => r.document_number ?? String(r.document_id)))],
      };
    })
    .sort((a, b) => b.amount - a.amount);
}
