import { z } from 'zod';
import { FicError, refused } from '../api/errors.js';
import { callOp } from '../api/ops.js';
import type { AppContext } from '../context.js';
import { displayNumber, EI_STATUS_IT, entityName } from '../domain/documents.js';
import type { DataResponse, Entity, IssuedDocument } from '../domain/types.js';
import { cleanOutgoingText, untrusted } from '../safety/untrusted.js';
import { authorize, confirmSchema, humanPrompt, type Pending, previewFields } from './confirm-flow.js';
import { defineTool } from './define.js';
import { getEntity } from './entities.js';
import { getIssued } from './issued-documents.js';

/** Stati SDI dai quali un invio (o un nuovo invio dopo la correzione) ha senso. */
const SENDABLE = new Set(['', 'not_sent', 'missing', 'error', 'discarded']);

export const sendEInvoice = defineTool({
  name: 'fic_send_einvoice',
  title: 'Invia fattura elettronica allo SDI',
  description: `Invia allo SDI una fattura elettronica già creata. È un'azione IRREVERSIBILE verso l'Agenzia delle Entrate e il cliente.
Funziona in due passi:
1. senza confirm: non invia nulla, restituisce l'anteprima (numero, cliente, codice destinatario o PEC, importi, verifica dell'XML) e un token;
2. mostra l'anteprima all'utente; per inviare richiama con confirm uguale al token. Il server chiede allora la conferma direttamente all'utente (finestra di Claude Desktop o del Mac): senza la sua conferma non parte nulla.
Il token scade dopo 10 minuti e non vale più se il documento cambia. L'anteprima usa solo la verifica dell'XML: non chiama mai l'endpoint di invio.
Sends an e-invoice to SDI. Irreversible: preview first; execution requires the token and an out-of-band human confirmation.`,
  minMode: 'full',
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  input: z.object({
    document_id: z.number().int().positive(),
    confirm: confirmSchema,
  }),
  operations: ['getIssuedDocument', 'verifyEInvoiceXml', 'sendEInvoice'],
  docTypeOf: () => 'invoice',
  handler: async (args, app, call) => {
    const doc = await getIssued(app, args.document_id);
    if (!doc.e_invoice) throw refused('Il documento non è una fattura elettronica: non si invia allo SDI.');
    const status = doc.ei_status ?? '';
    if (!SENDABLE.has(status)) {
      throw refused(
        `La fattura risulta già trasmessa o in lavorazione (stato SDI: ${status}, ${EI_STATUS_IT[status] ?? ''}). Non la invio di nuovo.`,
      );
    }
    const state = String(doc.updated_at ?? '');
    const client = await app.api();
    const pending: Pending = {
      action: 'SDI',
      id: args.document_id,
      state,
      params: {},
      prompt: humanPrompt('Invio allo SDI', {
        documento: `fattura elettronica n. ${displayNumber(doc) ?? '?'} del ${doc.date ?? '?'}`,
        cliente: entityName(doc.entity),
        codice_destinatario: doc.entity?.ei_code ?? undefined,
        pec: doc.entity?.certified_email ?? undefined,
        totale: doc.amount_gross,
        attenzione: 'invio IRREVERSIBILE all’Agenzia delle Entrate e al cliente',
      }),
    };

    if (!args.confirm) {
      // Solo la verifica dell'XML: l'endpoint di invio non si chiama mai in anteprima, nemmeno con dry_run.
      let xml: Record<string, unknown>;
      try {
        await callOp(client, 'verifyEInvoiceXml', { pathParams: { document_id: args.document_id } });
        xml = { valid: true };
      } catch (err) {
        if (err instanceof FicError && err.kind === 'validation')
          xml = { valid: false, errors: err.details.validation ?? [err.details.apiMessage] };
        else throw err;
      }
      return {
        preview: true,
        sent: false,
        document: {
          id: doc.id,
          number: displayNumber(doc),
          date: doc.date,
          client: untrusted(entityName(doc.entity), 200),
          ei_code: doc.entity?.ei_code ?? undefined,
          certified_email: doc.entity?.certified_email ?? undefined,
          amount_gross: doc.amount_gross,
          current_status: status || 'not_sent',
        },
        xml_verification: xml,
        ...(xml.valid
          ? previewFields(app, call, pending)
          : { instructions: 'L’XML non è valido: correggi il documento prima dell’invio.' }),
      };
    }

    await authorize(app, call, args.confirm, pending);
    const r = await callOp<DataResponse<{ name?: string; date?: string }>>(client, 'sendEInvoice', {
      pathParams: { document_id: args.document_id },
      body: { data: {} },
    });
    app.cache.invalidate('issued:');
    app.log.audit('fattura elettronica inviata allo SDI', {
      document_id: args.document_id,
      number: displayNumber(doc),
    });
    return {
      sent: true,
      document_id: args.document_id,
      number: displayNumber(doc),
      message: r?.data?.name,
      sent_at: r?.data?.date,
      next_step:
        'L’esito è asincrono (lo stato "attempt" può durare fino a 2 ore): controlla con fic_get_einvoice.',
    };
  },
});

interface EmailData {
  recipient_email?: string | null;
  default_sender_email?: { id?: number | null; email?: string | null } | null;
  sender_emails_list?: Array<{ id?: number | null; email?: string | null }> | null;
  cc_email?: string | null;
  subject?: string | null;
  body?: string | null;
  default_attach_pdf?: boolean | null;
}

function splitEmails(s: string | null | undefined): string[] {
  return (s ?? '')
    .split(/[,;]/)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
}

/** Destinatari ammessi: indirizzi del cliente in anagrafica e nel documento, quello proposto da FIC, l'elenco configurato. */
async function allowedRecipients(
  app: AppContext,
  doc: IssuedDocument,
  data: EmailData,
): Promise<Set<string>> {
  const set = new Set<string>(app.config.emailAllowedRecipients);
  const add = (e: Entity | null | undefined) => {
    for (const v of [e?.email, e?.certified_email]) for (const x of splitEmails(v)) set.add(x);
  };
  add(doc.entity);
  if (doc.entity?.id) {
    try {
      add(await getEntity(app, 'client', doc.entity.id));
    } catch {
      // cliente non più in anagrafica: restano gli indirizzi del documento
    }
  }
  for (const x of splitEmails(data.recipient_email)) set.add(x);
  return set;
}

export const sendEmail = defineTool({
  name: 'fic_send_email',
  title: 'Invia documento per email',
  description: `Invia un documento emesso per email tramite Fatture in Cloud (per esempio la copia di cortesia della fattura o un sollecito con il documento allegato). È un'azione IRREVERSIBILE verso terzi.
Destinatari ammessi: solo gli indirizzi del cliente in anagrafica o nel documento, quello proposto da Fatture in Cloud e quelli configurati in FIC_EMAIL_ALLOWED_RECIPIENTS. Qualsiasi altro indirizzo viene rifiutato.
Funziona in due passi:
1. senza confirm: non invia nulla, restituisce l'anteprima (mittente, destinatari, oggetto, testo, allegato) e un token;
2. mostra l'anteprima all'utente; per inviare richiama con gli STESSI parametri e confirm uguale al token. Il server chiede allora la conferma direttamente all'utente: senza la sua conferma non parte nulla.
Il testo non può contenere IBAN o altre coordinate bancarie.
Sends a document by email. Irreversible: preview first; execution requires the token and an out-of-band human confirmation.`,
  minMode: 'full',
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  input: z.object({
    document_id: z.number().int().positive(),
    recipients: z
      .array(z.string().email())
      .min(1)
      .max(5)
      .optional()
      .describe('Default: destinatario proposto da Fatture in Cloud.'),
    subject: z.string().min(1).max(300).optional().describe('Default: oggetto proposto da Fatture in Cloud.'),
    body: z
      .string()
      .min(1)
      .max(5000)
      .optional()
      .describe('Testo semplice (massimo 5.000 caratteri); default il testo proposto da Fatture in Cloud.'),
    sender_email: z
      .string()
      .email()
      .optional()
      .describe('Mittente tra quelli configurati in Fatture in Cloud; default quello predefinito.'),
    attach_pdf: z.boolean().default(true),
    include_document_link: z.boolean().default(true).describe('Pulsante per visualizzare il documento.'),
    send_copy: z.boolean().default(false).describe('Invia una copia all’indirizzo dell’azienda.'),
    confirm: confirmSchema,
  }),
  operations: ['getIssuedDocument', 'getEmailData', 'getClient', 'scheduleEmail'],
  handler: async (args, app, call) => {
    const doc = await getIssued(app, args.document_id);
    const client = await app.api();
    const res = await callOp<DataResponse<EmailData>>(client, 'getEmailData', {
      pathParams: { document_id: args.document_id },
    });
    const data = res?.data ?? {};
    const allowed = await allowedRecipients(app, doc, data);
    const recipients = (
      args.recipients?.map((r) => r.toLowerCase()) ?? splitEmails(data.recipient_email)
    ).sort();
    if (!recipients.length)
      throw refused(
        'Nessun destinatario: il cliente non ha un’email in anagrafica. Aggiungila con fic_update_entity oppure indica recipients.',
      );
    const notAllowed = recipients.filter((r) => !allowed.has(r));
    if (notAllowed.length) {
      throw refused(
        `Destinatari non ammessi: ${notAllowed.join(', ')}. Si può inviare solo agli indirizzi del cliente (${[...allowed].join(', ') || 'nessuno'}) o a quelli configurati in FIC_EMAIL_ALLOWED_RECIPIENTS. Se l’indirizzo è giusto, aggiornalo prima nell’anagrafica del cliente.`,
      );
    }
    const configured = new Set(app.config.emailAllowedRecipients);
    const changedNow = recipients.filter((r) => app.sessionEmails.has(r) && !configured.has(r));
    if (changedNow.length) {
      throw refused(
        `Destinatari non ammessi: ${changedNow.join(', ')} è stato scritto in Fatture in Cloud durante questa sessione. Per sicurezza non si invia a un indirizzo appena inserito o modificato: verifica l’indirizzo con l’utente e riprova in una nuova sessione, oppure aggiungilo a FIC_EMAIL_ALLOWED_RECIPIENTS.`,
      );
    }
    const senders = (data.sender_emails_list ?? []).filter((s) => s.email);
    let sender: { id?: number; email?: string };
    if (args.sender_email) {
      const found = senders.find((s) => s.email!.toLowerCase() === args.sender_email!.toLowerCase());
      if (!found)
        throw refused(
          `Mittente non configurato in Fatture in Cloud. Disponibili: ${senders.map((s) => s.email).join(', ') || 'nessuno'}.`,
        );
      sender = { id: found.id ?? undefined, email: found.email ?? undefined };
    } else if (data.default_sender_email?.id || data.default_sender_email?.email) {
      sender = {
        id: data.default_sender_email.id ?? undefined,
        email: data.default_sender_email.email ?? undefined,
      };
    } else {
      sender = { id: 0, email: 'no-reply di Fatture in Cloud' };
    }
    // Oggetto su una sola riga: niente a capo che possano alterare le intestazioni.
    const subject = cleanOutgoingText(args.subject ?? data.subject ?? `Documento ${displayNumber(doc) ?? ''}`)
      .replace(/[\r\n]+/g, ' ')
      .slice(0, 300);
    const body = args.body !== undefined ? escapeHtml(cleanOutgoingText(args.body)) : (data.body ?? '');
    if (!body) throw refused('Testo dell’email vuoto: indica body.');
    if (Buffer.byteLength(body, 'utf8') > 50 * 1024)
      throw refused('Il testo dell’email supera 50 KiB, il limite di Fatture in Cloud: accorcialo.');
    const payload = {
      ...(sender.id !== undefined ? { sender_id: sender.id } : { sender_email: sender.email }),
      recipient_email: recipients.join(','),
      subject,
      body,
      include: {
        document: args.include_document_link,
        delivery_note: false,
        attachment: false,
        accompanying_invoice: false,
      },
      attach_pdf: args.attach_pdf,
      send_copy: args.send_copy,
    };
    const state = String(doc.updated_at ?? '');
    const plainBody = body.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
    const pending: Pending = {
      action: 'EMAIL',
      id: args.document_id,
      state,
      params: payload,
      prompt: humanPrompt('Invio email', {
        documento: `${doc.type ?? 'documento'} n. ${displayNumber(doc) ?? '?'}`,
        da: sender.email,
        a: recipients.join(', '),
        copia_a: args.send_copy ? (data.cc_email ?? 'indirizzo dell’azienda') : undefined,
        oggetto: subject,
        pdf_allegato: args.attach_pdf ? 'sì' : 'no',
        testo: plainBody,
      }),
    };

    if (!args.confirm) {
      return {
        preview: true,
        sent: false,
        document: {
          id: doc.id,
          type: doc.type,
          number: displayNumber(doc),
          client: untrusted(entityName(doc.entity), 200),
        },
        from: sender.email,
        to: recipients,
        cc: args.send_copy ? (data.cc_email ?? undefined) : undefined,
        subject: untrusted(subject, 300),
        // L'anteprima mostra il testo per intero: l'utente approva esattamente quello che parte.
        body: untrusted(plainBody, 60_000),
        attach_pdf: args.attach_pdf,
        ...previewFields(app, call, pending),
      };
    }

    await authorize(app, call, args.confirm, pending);
    await callOp(client, 'scheduleEmail', {
      pathParams: { document_id: args.document_id },
      body: { data: payload },
    });
    app.log.audit('email inviata', { document_id: args.document_id, recipients: recipients.length });
    return { sent: true, document_id: args.document_id, to: recipients, subject: untrusted(subject, 300) };
  },
});
