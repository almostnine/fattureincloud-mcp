import { describe, expect, it } from 'vitest';
import { silentLogger } from '../../src/log.js';
import { HumanConfirm } from '../../src/safety/human.js';
import { CLIENT_ROSSI, page } from '../fixtures/issued.js';
import { call, connect, fakeDialog, testApp } from '../helpers/app.js';
import { FakeFic } from '../helpers/fake-fetch.js';

/**
 * Conferma umana fuori banda: il token dell'anteprima arriva al modello, quindi da solo non deve bastare.
 * Ogni esecuzione chiede la conferma alla persona (elicitation o finestra del Mac) e senza il suo sì
 * non parte nessuna richiesta di scrittura verso Fatture in Cloud.
 */

function entityFic() {
  return new FakeFic()
    .withCompany()
    .on('GET', '/c/1001/entities/clients', { body: page([]) })
    .on('POST', '/c/1001/entities/clients', (c) => ({
      body: { data: { id: 700, ...(c.body as { data: object }).data } },
    }));
}

const NEW_CLIENT = { name: 'Nuova Cliente Srl', vat_number: '09876543210' };
const writes = (fic: FakeFic) => fic.calls.filter((c) => c.method !== 'GET');

const ACCEPT = () => ({ action: 'accept' as const, content: { conferma: true } });

describe('conferma umana delle scritture', () => {
  it('il token da solo non basta: senza elicitation né finestra di dialogo la scrittura è rifiutata', async () => {
    const fic = entityFic();
    const { app } = testApp({ fic, mode: 'write', human: 'none' });
    const client = await connect(app);
    const preview = await call(client, 'fic_create_entity', NEW_CLIENT);
    expect(preview.data.human_confirmation).toContain('Nessuna conferma umana possibile');
    const res = await call(client, 'fic_create_entity', {
      ...NEW_CLIENT,
      dry_run: false,
      confirm: preview.data.confirm_token,
    });
    expect(res.isError).toBe(true);
    expect(res.text).toContain('Nessuna conferma umana possibile');
    expect(writes(fic)).toHaveLength(0);
  });

  it('fuori da macOS, senza elicitation, la finestra di dialogo non viene usata', async () => {
    const fic = entityFic();
    const { app, dialogs } = testApp({ fic, mode: 'write', platform: 'linux' });
    const client = await connect(app);
    const preview = await call(client, 'fic_create_entity', NEW_CLIENT);
    const res = await call(client, 'fic_create_entity', {
      ...NEW_CLIENT,
      dry_run: false,
      confirm: preview.data.confirm_token,
    });
    expect(res.isError).toBe(true);
    expect(dialogs).toHaveLength(0);
    expect(writes(fic)).toHaveLength(0);
  });

  it('con l’elicitation accettata esegue una sola volta, mostrando il testo esatto dell’anteprima', async () => {
    const fic = entityFic();
    const { app, dialogs } = testApp({ fic, mode: 'write', human: 'none' });
    const asked: string[] = [];
    const client = await connect(app, {
      elicitation: (p) => {
        asked.push(p.message);
        return ACCEPT();
      },
    });
    const preview = await call(client, 'fic_create_entity', NEW_CLIENT);
    expect(preview.data.human_confirmation).toContain('Confermo');
    const args = { ...NEW_CLIENT, dry_run: false, confirm: preview.data.confirm_token };
    const done = await call(client, 'fic_create_entity', args);
    expect(done.data, done.text).toMatchObject({ created: true, id: 700 });
    expect(asked).toHaveLength(1);
    expect(asked[0]).toContain(preview.data.confirmation_text as string);
    expect(asked[0]).toContain('Nuova Cliente Srl');
    expect(dialogs).toHaveLength(0);
    // Lo stesso token non vale una seconda volta.
    const again = await call(client, 'fic_create_entity', args);
    expect(again.isError).toBe(true);
    expect(writes(fic)).toHaveLength(1);
  });

  it.each([
    ['rifiuto', { action: 'decline' as const }],
    ['annullamento', { action: 'cancel' as const }],
    ['casella non spuntata', { action: 'accept' as const, content: { conferma: false } }],
  ])('con %s nella finestra di Claude Desktop non invia nulla', async (_label, answer) => {
    const fic = entityFic();
    const { app } = testApp({ fic, mode: 'write', human: 'none' });
    const client = await connect(app, { elicitation: () => answer });
    const preview = await call(client, 'fic_create_entity', NEW_CLIENT);
    const res = await call(client, 'fic_create_entity', {
      ...NEW_CLIENT,
      dry_run: false,
      confirm: preview.data.confirm_token,
    });
    expect(res.isError).toBe(true);
    expect(res.text).toContain('non ha confermato');
    expect(writes(fic)).toHaveLength(0);
  });

  it('protocollo 2026-07-28: chiede la conferma con input_required ed esegue dopo il sì', async () => {
    const fic = entityFic();
    const { app } = testApp({ fic, mode: 'write', human: 'none' });
    const asked: string[] = [];
    const client = await connect(app, {
      modern: true,
      elicitation: (p) => {
        asked.push(p.message);
        return ACCEPT();
      },
    });
    const preview = await call(client, 'fic_create_entity', NEW_CLIENT);
    const done = await call(client, 'fic_create_entity', {
      ...NEW_CLIENT,
      dry_run: false,
      confirm: preview.data.confirm_token,
    });
    expect(done.data, done.text).toMatchObject({ created: true });
    expect(asked).toHaveLength(1);
    expect(writes(fic)).toHaveLength(1);
  });

  it('protocollo 2026-07-28: con il rifiuto non invia nulla', async () => {
    const fic = entityFic();
    const { app } = testApp({ fic, mode: 'write', human: 'none' });
    const client = await connect(app, { modern: true, elicitation: () => ({ action: 'decline' as const }) });
    const preview = await call(client, 'fic_create_entity', NEW_CLIENT);
    const res = await call(client, 'fic_create_entity', {
      ...NEW_CLIENT,
      dry_run: false,
      confirm: preview.data.confirm_token,
    });
    expect(res.isError).toBe(true);
    expect(writes(fic)).toHaveLength(0);
  });

  it('su macOS senza elicitation usa la finestra di dialogo; "Annulla" o nessuna risposta non inviano nulla', async () => {
    for (const [human, ok] of [
      ['accept', true],
      ['decline', false],
      ['timeout', false],
    ] as const) {
      const fic = entityFic();
      const { app, dialogs } = testApp({ fic, mode: 'write', human });
      const client = await connect(app);
      const preview = await call(client, 'fic_create_entity', NEW_CLIENT);
      expect(preview.data.human_confirmation).toContain('Conferma');
      const res = await call(client, 'fic_create_entity', {
        ...NEW_CLIENT,
        dry_run: false,
        confirm: preview.data.confirm_token,
      });
      expect(dialogs, human).toHaveLength(1);
      expect(dialogs[0]).toContain('Nuova Cliente Srl');
      expect(res.isError, human).toBe(!ok);
      expect(writes(fic), human).toHaveLength(ok ? 1 : 0);
    }
  });

  it('FIC_CONFIRM_METHOD sceglie il canale: dialog ignora l’elicitation, elicitation non ripiega sul dialogo', async () => {
    const asked: string[] = [];
    const dialogOnly = testApp({ fic: entityFic(), mode: 'write', config: { confirmMethod: 'dialog' } });
    const c1 = await connect(dialogOnly.app, {
      elicitation: (p) => {
        asked.push(p.message);
        return ACCEPT();
      },
    });
    const p1 = await call(c1, 'fic_create_entity', NEW_CLIENT);
    const r1 = await call(c1, 'fic_create_entity', {
      ...NEW_CLIENT,
      dry_run: false,
      confirm: p1.data.confirm_token,
    });
    expect(r1.data.created).toBe(true);
    expect(dialogOnly.dialogs).toHaveLength(1);
    expect(asked).toHaveLength(0);

    const fic = entityFic();
    const elicitOnly = testApp({ fic, mode: 'write', config: { confirmMethod: 'elicitation' } });
    const c2 = await connect(elicitOnly.app);
    const p2 = await call(c2, 'fic_create_entity', NEW_CLIENT);
    const r2 = await call(c2, 'fic_create_entity', {
      ...NEW_CLIENT,
      dry_run: false,
      confirm: p2.data.confirm_token,
    });
    expect(r2.isError).toBe(true);
    expect(r2.text).toContain('FIC_CONFIRM_METHOD=elicitation');
    expect(elicitOnly.dialogs).toHaveLength(0);
    expect(writes(fic)).toHaveLength(0);
  });

  it('se il corpo cambia dopo l’anteprima il token non vale e la persona non viene nemmeno interpellata', async () => {
    const fic = entityFic();
    const { app, dialogs } = testApp({ fic, mode: 'write' });
    const client = await connect(app);
    const preview = await call(client, 'fic_create_entity', NEW_CLIENT);
    const res = await call(client, 'fic_create_entity', {
      ...NEW_CLIENT,
      name: 'Altro Nome Srl',
      dry_run: false,
      confirm: preview.data.confirm_token,
    });
    expect(res.isError).toBe(true);
    expect(res.text).toContain('non corrisponde');
    expect(dialogs).toHaveLength(0);
    expect(writes(fic)).toHaveLength(0);
  });

  it('senza dry_run: false o senza token restituisce solo l’anteprima', async () => {
    const fic = entityFic();
    const { app, dialogs } = testApp({ fic, mode: 'write' });
    const client = await connect(app);
    const a = await call(client, 'fic_create_entity', { ...NEW_CLIENT, dry_run: false });
    const b = await call(client, 'fic_create_entity', { ...NEW_CLIENT, confirm: a.data.confirm_token });
    expect(a.data).toMatchObject({ dry_run: true, created: false });
    expect(b.data).toMatchObject({ dry_run: true, created: false });
    expect(dialogs).toHaveLength(0);
    expect(writes(fic)).toHaveLength(0);
  });

  it('anche la modifica di un’anagrafica e le cancellazioni passano dalla conferma umana', async () => {
    const fic = new FakeFic()
      .withCompany()
      .on('GET', '/c/1001/entities/clients/501', { body: { data: CLIENT_ROSSI } })
      .on('PUT', '/c/1001/entities/clients/501', { body: { data: CLIENT_ROSSI } })
      .on('DELETE', '/c/1001/entities/clients/501', { body: {} });
    const { app } = testApp({ fic, mode: 'write', human: 'decline', config: { enableDelete: true } });
    const client = await connect(app);
    const up = await call(client, 'fic_update_entity', { id: 501, phone: '021234567' });
    const upRes = await call(client, 'fic_update_entity', {
      id: 501,
      phone: '021234567',
      dry_run: false,
      confirm: up.data.confirm_token,
    });
    const del = await call(client, 'fic_delete', { resource: 'client', id: 501 });
    const delRes = await call(client, 'fic_delete', {
      resource: 'client',
      id: 501,
      confirm: del.data.confirm_token,
    });
    expect(upRes.isError).toBe(true);
    expect(delRes.isError).toBe(true);
    expect(writes(fic)).toHaveLength(0);
  });
});

describe('finestra di dialogo del Mac', () => {
  it('usa osascript con "Annulla" come pulsante predefinito e un tempo massimo', async () => {
    const seen: string[][] = [];
    const human = new HumanConfirm({
      method: 'auto',
      sign: (t) => t,
      log: silentLogger,
      platform: 'darwin',
      dialogTimeoutSeconds: 90,
      dialog: async (args) => {
        seen.push(args);
        return fakeDialog('accept', [])(args, 0);
      },
    });
    await human.confirm({ elicitation: false }, { title: 'Prova', text: 'TESTO DELL’ANTEPRIMA' }, 'x');
    const script = seen[0]!.filter((_, i, a) => a[i - 1] === '-e').join('\n');
    expect(script).toContain('default button "Annulla"');
    expect(script).toContain('cancel button "Annulla"');
    expect(script).toContain('giving up after 90');
    // Il testo passa come argomento, mai dentro lo script: niente iniezioni di AppleScript.
    expect(script).not.toContain('TESTO');
    expect(seen[0]!.at(-2)).toContain('TESTO DELL’ANTEPRIMA');
  });
});
