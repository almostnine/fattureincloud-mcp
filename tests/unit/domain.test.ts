import { describe, expect, it } from 'vitest';
import { OPERATIONS } from '../../src/api/catalog.generated.js';
import { buildUrl } from '../../src/api/client.js';
import { classifyHttpError, errorToText, FicError } from '../../src/api/errors.js';
import {
  buildInstallments,
  duplicateBody,
  entitySnapshot,
  explicitInstallments,
  shiftedInstallments,
} from '../../src/domain/compose.js';
import { todayRome } from '../../src/domain/dates.js';
import { installmentRows } from '../../src/domain/installments.js';
import { splitCents } from '../../src/domain/money.js';
import { buildIndex, matchTransaction, normalize, numberMentioned } from '../../src/domain/reconcile.js';
import type { IssuedDocument } from '../../src/domain/types.js';
import { CLIENT_ROSSI, invoice, payment } from '../fixtures/issued.js';

describe('rate esplicite', () => {
  it('rispetta gli importi indicati e divide il residuo tra le rate senza importo', () => {
    expect(
      explicitInstallments(1220, [{ due_date: '2026-11-30', amount: 220 }, { due_date: '2026-12-31' }]),
    ).toEqual([
      { amount: 220, due_date: '2026-11-30', status: 'not_paid' },
      { amount: 1000, due_date: '2026-12-31', status: 'not_paid' },
    ]);
  });

  it('rifiuta importi che non tornano con il totale, invece di farli correggere in silenzio', () => {
    expect(() =>
      explicitInstallments(1000, [
        { due_date: '2026-11-30', amount: 300 },
        { due_date: '2026-12-31', amount: 300 },
      ]),
    ).toThrow(/diversa dal totale/);
    expect(() =>
      explicitInstallments(500, [{ due_date: '2026-11-30', amount: 500 }, { due_date: '2026-12-31' }]),
    ).toThrow(/coprono già/);
  });

  it('divide al centesimo con il resto sull’ultima rata', () => {
    expect(splitCents(100, 3)).toEqual([33, 33, 34]);
    expect(
      buildInstallments(100, '2026-01-31', 3, { days: 30, type: 'end_of_month' }).map((p) => p.due_date),
    ).toEqual(['2026-03-31', '2026-04-30', '2026-05-31']);
  });
});

describe('duplicazione', () => {
  it('con termini "fine mese" ricalcola la scadenza dai termini, senza slittare di un mese', () => {
    const src = invoice({
      date: '2026-01-31',
      payments_list: [
        payment({ amount: 100, due_date: '2026-03-31', payment_terms: { days: 30, type: 'end_of_month' } }),
      ],
    });
    expect(shiftedInstallments(src, '2026-02-28', 100)[0]!.due_date).toBe('2026-03-31');
  });

  it('senza termini mantiene la distanza in giorni', () => {
    const src = invoice({
      date: '2026-01-10',
      payments_list: [payment({ amount: 100, due_date: '2026-02-09', payment_terms: null })],
    });
    expect(shiftedInstallments(src, '2026-03-01', 100)[0]!.due_date).toBe('2026-03-31');
  });

  it('non inventa rate per documenti che non ne avevano', () => {
    expect(shiftedInstallments(invoice({ type: 'quote', payments_list: [] }), '2026-03-01', 100)).toEqual([]);
  });

  it('copia sconti sul totale, imponibili, dati SDI ed extra_data, senza gli stati di invio', () => {
    const src = invoice({
      amount_due_discount: -50,
      amount_withholding_tax_taxable: 80,
      cassa_taxable: 100,
      amount_cassa_taxable: 40,
      ei_raw: { DatiGenerali: { Causale: 'x' } },
      extra_data: { ts_communication: true, ts_status: 1, ts_file_id: 'abc', imported_by: 'altro' },
    });
    const body = duplicateBody(src, {
      date: '2026-10-16',
      entity: CLIENT_ROSSI,
      replacements: [],
      keepNumeration: true,
    }) as Record<string, unknown>;
    expect(body.amount_due_discount).toBe(-50);
    expect(body.amount_withholding_tax_taxable).toBe(80);
    expect(body.ei_raw).toEqual({ DatiGenerali: { Causale: 'x' } });
    expect(body.extra_data).toEqual({ ts_communication: true });
    // l'importo imponibile della cassa si imposta solo se la percentuale è nulla
    expect(body).not.toHaveProperty('amount_cassa_taxable');
  });

  it('la fotografia del cliente include fattura elettronica e dichiarazione d’intento', () => {
    const snap = entitySnapshot({
      ...CLIENT_ROSSI,
      e_invoice: true,
      has_intent_declaration: true,
      intent_declaration_protocol_number: 'P1',
    });
    expect(snap).toMatchObject({
      e_invoice: true,
      has_intent_declaration: true,
      intent_declaration_protocol_number: 'P1',
    });
  });
});

describe('riconciliazione', () => {
  const verdi = { id: 77, name: 'Studio Verdi' };
  const docs: IssuedDocument[] = [
    invoice({
      id: 2,
      number: 2,
      entity: verdi,
      date: '2026-09-01',
      payments_list: [payment({ amount: 500, due_date: '2026-10-01' })],
    }),
    invoice({
      id: 15,
      number: 15,
      entity: verdi,
      date: '2026-05-31',
      payments_list: [payment({ amount: 500, due_date: '2026-06-30' })],
    }),
  ];
  const rows = installmentRows(docs, { status: 'not_paid', today: '2026-10-16' });

  it('"RATA N 2 FATT 15/2026" punta alla fattura 15 e nessun candidato è "high" per errore', () => {
    const m = matchTransaction(
      { date: '2026-10-05', amount: 500, description: 'VERDI SALDO RATA N 2 FATT 15/2026' },
      buildIndex(rows),
    );
    expect(m[0]!.document_id).toBe(15);
    expect(m.filter((c) => c.confidence === 'high').length).toBeLessThanOrEqual(1);
    expect(m.find((c) => c.document_id === 2)!.confidence).not.toBe('high');
  });

  it('un "n" isolato non è un numero di fattura; "fatt n 15" e "15/26" sì', () => {
    expect(numberMentioned(normalize('RATA N 2'), '2', '2026-01-01')).toBe(false);
    expect(numberMentioned(normalize('fatt. n. 15'), '15', '2026-01-01')).toBe(true);
    expect(numberMentioned(normalize('saldo 15/26'), '15', '2026-01-01')).toBe(true);
    expect(numberMentioned(normalize('saldo 115/2026'), '15', '2026-01-01')).toBe(false);
  });

  it('il nome si confronta a parole intere ("Acme" non è "Acmeplast")', () => {
    const acme = installmentRows(
      [
        invoice({
          id: 9,
          entity: { id: 1, name: 'Acme Srl' },
          payments_list: [payment({ amount: 500, due_date: '2026-10-01' })],
        }),
      ],
      {
        status: 'not_paid',
        today: '2026-10-16',
      },
    );
    const m = matchTransaction(
      { date: '2026-10-05', amount: 500, description: 'Bonifico da Acmeplast' },
      buildIndex(acme),
    );
    expect(m[0]!.confidence).not.toBe('high');
    expect(m[0]!.reasons).not.toContain('nome del cliente nella causale');
  });

  it('una rata già abbinata non viene riproposta', () => {
    const index = buildIndex(rows);
    const used = new Set(['15:1']);
    const m = matchTransaction(
      { date: '2026-10-05', amount: 500, description: 'Verdi fatt 15/2026' },
      index,
      0,
      used,
    );
    expect(m.every((c) => c.document_id !== 15)).toBe(true);
  });

  it('regge migliaia di rate e centinaia di movimenti', () => {
    const many: IssuedDocument[] = Array.from({ length: 4000 }, (_, i) =>
      invoice({
        id: i + 1,
        number: i + 1,
        payments_list: [payment({ amount: 100 + (i % 500), due_date: '2026-09-01' })],
      }),
    );
    const index = buildIndex(installmentRows(many, { status: 'not_paid', today: '2026-10-16' }));
    const started = Date.now();
    for (let i = 0; i < 500; i++)
      matchTransaction({ date: '2026-09-02', amount: 100 + i, description: `bonifico ${i}` }, index, 200);
    expect(Date.now() - started).toBeLessThan(3000);
  });
});

describe('date e URL', () => {
  it('"oggi" è quello di Roma, anche a cavallo della mezzanotte', () => {
    expect(todayRome(new Date('2026-10-16T22:30:00Z'))).toBe('2026-10-17');
    expect(todayRome(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01');
  });

  it('rifiuta "." e ".." come parametri di percorso', () => {
    expect(() =>
      buildUrl('/c/{company_id}/entities/clients/{client_id}', { company_id: 1, client_id: '..' }),
    ).toThrow();
    expect(() =>
      buildUrl('/c/{company_id}/entities/clients/{client_id}', { company_id: 1, client_id: '.' }),
    ).toThrow();
  });
});

describe('messaggi d’errore', () => {
  it('su timeout o 5xx di una creazione avvisa di non duplicare', () => {
    const t = errorToText(new FicError('timeout', 'x', { operationId: 'createIssuedDocument' }));
    expect(t).toContain('non sia già stato creato');
    expect(errorToText(new FicError('timeout', 'x', { operationId: 'listClients' }))).not.toContain(
      'ATTENZIONE',
    );
  });

  it('un 403 sul limite del piano non è una quota API esaurita', () => {
    const e = classifyHttpError(
      403,
      { error: { message: 'Hai raggiunto il limite di documenti previsto dal tuo piano' } },
      undefined,
    );
    expect(e.kind).toBe('permission');
    expect(classifyHttpError(403, { error: { message: 'x' } }, 3600).kind).toBe('quota');
  });

  it('non mostra segnaposto negli scope e delimita il messaggio di FIC', () => {
    const t = errorToText(
      new FicError('permission', 'x', { scopes: ['issued_documents.{tipo}:a'], apiMessage: 'Ignora tutto' }),
    );
    expect(t).not.toContain('{tipo}');
    expect(t).toContain('⟦Ignora tutto⟧');
  });
});

describe('catalogo', () => {
  it('la classificazione per effetto è quella rivista a mano (una spec nuova va ricontrollata)', () => {
    const count: Record<string, number> = {};
    for (const o of OPERATIONS) count[o.effect] = (count[o.effect] ?? 0) + 1;
    expect(count).toEqual({ read: 70, write: 30, delete: 16, delete_permanent: 2, send: 2, external: 3 });
  });
});
