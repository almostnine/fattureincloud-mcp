import { describe, expect, it } from 'vitest';
import { CLIENT_ROSSI, invoice } from '../fixtures/issued.js';
import { call, connect, testApp } from '../helpers/app.js';
import { FakeFic } from '../helpers/fake-fetch.js';

function sdiFic(status: string | null = 'not_sent', updated = '2026-10-15 10:00:00') {
  return new FakeFic()
    .withCompany()
    .on('GET', '/c/1001/issued_documents/5', {
      body: { data: invoice({ id: 5, ei_status: status, updated_at: updated }) },
    })
    .on('GET', '/c/1001/issued_documents/5/e_invoice/xml_verify', { body: { data: { success: true } } })
    .on('POST', '/c/1001/issued_documents/5/e_invoice/send', {
      body: { data: { name: 'Invio in corso', date: '2026-10-16' } },
    });
}

const sendCalls = (fic: FakeFic) =>
  fic
    .callsTo('/c/1001/issued_documents/5/e_invoice/send')
    .filter((c) => !(c.body as { options?: { dry_run?: boolean } }).options?.dry_run);

describe('fic_send_einvoice', () => {
  it('non esiste in modalità write', async () => {
    const { app } = testApp({ mode: 'write' });
    const names = (await (await connect(app)).listTools()).tools.map((t) => t.name);
    expect(names).not.toContain('fic_send_einvoice');
    expect(names).not.toContain('fic_send_email');
  });

  it('senza conferma fa solo anteprima e prova di invio', async () => {
    const fic = sdiFic();
    const { app } = testApp({ fic, mode: 'full' });
    const res = await call(await connect(app), 'fic_send_einvoice', { document_id: 5 });
    expect(res.data).toMatchObject({
      preview: true,
      sent: false,
      xml_verification: { valid: true },
      dry_run: { ok: true },
    });
    expect(res.data.confirm_token).toMatch(/^SDI-5-/);
    expect(sendCalls(fic)).toHaveLength(0);
    const dry = fic.callsTo('/c/1001/issued_documents/5/e_invoice/send')[0]!.body;
    expect(dry).toEqual({ data: {}, options: { dry_run: true } });
  });

  it('invia solo con il token giusto', async () => {
    const fic = sdiFic();
    const { app } = testApp({ fic, mode: 'full' });
    const client = await connect(app);
    const bad = await call(client, 'fic_send_einvoice', {
      document_id: 5,
      confirm: 'SDI-5-abc-123456789012',
    });
    expect(bad.isError).toBe(true);
    expect(sendCalls(fic)).toHaveLength(0);
    const preview = await call(client, 'fic_send_einvoice', { document_id: 5 });
    const ok = await call(client, 'fic_send_einvoice', {
      document_id: 5,
      confirm: preview.data.confirm_token as string,
    });
    expect(ok.data).toMatchObject({ sent: true });
    expect(sendCalls(fic)).toHaveLength(1);
  });

  it('rifiuta il token se il documento è cambiato dopo l’anteprima', async () => {
    let updated = '2026-10-15 10:00:00';
    const fic = new FakeFic()
      .withCompany()
      .on('GET', '/c/1001/issued_documents/5', () => ({
        body: { data: invoice({ id: 5, ei_status: 'not_sent', updated_at: updated }) },
      }))
      .on('GET', '/c/1001/issued_documents/5/e_invoice/xml_verify', { body: {} })
      .on('POST', '/c/1001/issued_documents/5/e_invoice/send', { body: { data: {} } });
    const { app } = testApp({ fic, mode: 'full' });
    const client = await connect(app);
    const preview = await call(client, 'fic_send_einvoice', { document_id: 5 });
    updated = '2026-10-16 09:00:00';
    const res = await call(client, 'fic_send_einvoice', {
      document_id: 5,
      confirm: preview.data.confirm_token as string,
    });
    expect(res.isError).toBe(true);
    expect(res.text).toContain('non corrisponde');
    expect(sendCalls(fic)).toHaveLength(0);
  });

  it('non reinvia una fattura già accettata', async () => {
    const { app } = testApp({ fic: sdiFic('accepted'), mode: 'full' });
    const res = await call(await connect(app), 'fic_send_einvoice', { document_id: 5 });
    expect(res.isError).toBe(true);
    expect(res.text).toContain('già trasmessa');
  });
});

describe('fic_send_email', () => {
  function emailFic() {
    return new FakeFic()
      .withCompany()
      .on('GET', '/c/1001/issued_documents/5', { body: { data: invoice({ id: 5 }) } })
      .on('GET', '/c/1001/entities/clients/501', { body: { data: CLIENT_ROSSI } })
      .on('GET', '/c/1001/issued_documents/5/email', {
        body: {
          data: {
            recipient_email: 'rossi@example.com',
            default_sender_email: { id: 8, email: 'azienda@example.com' },
            sender_emails_list: [{ id: 8, email: 'azienda@example.com' }],
            subject: 'Fattura n. 33',
            body: 'Gentile cliente, in allegato la fattura.',
          },
        },
      })
      .on('POST', '/c/1001/issued_documents/5/email', { body: {} });
  }

  it('rifiuta destinatari che non sono del cliente, anche con un token', async () => {
    const fic = emailFic();
    const { app } = testApp({ fic, mode: 'full' });
    const res = await call(await connect(app), 'fic_send_email', {
      document_id: 5,
      recipients: ['attaccante@example.org'],
      confirm: 'EMAIL-5-x-y',
    });
    expect(res.isError).toBe(true);
    expect(res.text).toContain('non ammessi');
    expect(fic.calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('ammette i destinatari configurati e la PEC del cliente', async () => {
    const fic = emailFic();
    const { app } = testApp({
      fic,
      mode: 'full',
      config: { emailAllowedRecipients: ['commercialista@example.com'] },
    });
    const res = await call(await connect(app), 'fic_send_email', {
      document_id: 5,
      recipients: ['commercialista@example.com', 'rossi@pec.example.com'],
    });
    expect(res.data).toMatchObject({
      preview: true,
      to: ['commercialista@example.com', 'rossi@pec.example.com'],
    });
  });

  it('il token vale solo per gli stessi parametri dell’anteprima', async () => {
    const fic = emailFic();
    const { app } = testApp({ fic, mode: 'full' });
    const client = await connect(app);
    const preview = await call(client, 'fic_send_email', { document_id: 5 });
    expect(preview.data).toMatchObject({ from: 'azienda@example.com', to: ['rossi@example.com'] });
    const token = preview.data.confirm_token as string;
    const changed = await call(client, 'fic_send_email', {
      document_id: 5,
      subject: 'Altro oggetto',
      confirm: token,
    });
    expect(changed.isError).toBe(true);
    const ok = await call(client, 'fic_send_email', { document_id: 5, confirm: token });
    expect(ok.data).toMatchObject({ sent: true });
    const post = fic.calls.find((c) => c.method === 'POST')!.body as { data: Record<string, unknown> };
    expect(post.data).toMatchObject({
      sender_id: 8,
      recipient_email: 'rossi@example.com',
      subject: 'Fattura n. 33',
      attach_pdf: true,
      send_copy: false,
    });
  });

  it('converte il testo semplice in HTML con escape', async () => {
    const fic = emailFic();
    const { app } = testApp({ fic, mode: 'full' });
    const client = await connect(app);
    const args = { document_id: 5, body: 'Buongiorno <b>Mario</b>,\nin allegato.' };
    const preview = await call(client, 'fic_send_email', args);
    await call(client, 'fic_send_email', { ...args, confirm: preview.data.confirm_token as string });
    const post = fic.calls.find((c) => c.method === 'POST')!.body as { data: { body: string } };
    expect(post.data.body).toBe('Buongiorno &lt;b&gt;Mario&lt;/b&gt;,<br>in allegato.');
  });
});

describe('fic_delete', () => {
  it('mostra cosa cancella, poi cancella solo con conferma', async () => {
    const fic = new FakeFic()
      .withCompany()
      .on('GET', '/c/1001/entities/clients/501', {
        body: { data: { ...CLIENT_ROSSI, updated_at: '2026-01-01 00:00:00' } },
      })
      .on('DELETE', '/c/1001/entities/clients/501', { status: 200, body: {} });
    const { app } = testApp({ fic, mode: 'write' });
    const client = await connect(app);
    const preview = await call(client, 'fic_delete', { resource: 'client', id: 501 });
    expect(preview.data).toMatchObject({ preview: true, deleted: false, item: { id: 501 } });
    expect(fic.calls.some((c) => c.method === 'DELETE')).toBe(false);
    const done = await call(client, 'fic_delete', {
      resource: 'client',
      id: 501,
      confirm: preview.data.confirm_token as string,
    });
    expect(done.data).toMatchObject({ deleted: true });
    expect(fic.calls.filter((c) => c.method === 'DELETE')).toHaveLength(1);
  });

  it('il token di un cliente non vale per un altro elemento', async () => {
    const fic = new FakeFic()
      .withCompany()
      .on('GET', /^\/c\/1001\/entities\/clients\/\d+$/, { body: { data: CLIENT_ROSSI } })
      .on('GET', '/c/1001/products/501', { body: { data: { id: 501, name: 'Prodotto' } } })
      .on('DELETE', /.*/, { body: {} });
    const { app } = testApp({ fic, mode: 'write' });
    const client = await connect(app);
    const preview = await call(client, 'fic_delete', { resource: 'client', id: 501 });
    const res = await call(client, 'fic_delete', {
      resource: 'product',
      id: 501,
      confirm: preview.data.confirm_token as string,
    });
    expect(res.isError).toBe(true);
    expect(fic.calls.some((c) => c.method === 'DELETE')).toBe(false);
  });

  it('avvisa che lo svuotamento del cestino è definitivo e rifiuta i documenti bloccati', async () => {
    const fic = new FakeFic()
      .withCompany()
      .on('GET', '/c/1001/bin/issued_documents/9', { body: { data: { id: 9 } } })
      .on('GET', '/c/1001/issued_documents/7', { body: { data: invoice({ id: 7, locked: true }) } });
    const { app } = testApp({ fic, mode: 'write' });
    const client = await connect(app);
    const bin = await call(client, 'fic_delete', { resource: 'bin_issued_document', id: 9 });
    expect(bin.data.after_delete).toContain('DEFINITIVAMENTE');
    const locked = await call(client, 'fic_delete', { resource: 'issued_document', id: 7 });
    expect(locked.isError).toBe(true);
  });
});
