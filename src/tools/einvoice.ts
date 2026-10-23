import {
  chmodSync,
  closeSync,
  constants,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { z } from 'zod';
import { FicError, refused } from '../api/errors.js';
import { callOp } from '../api/ops.js';
import { displayNumber, EI_STATUS_IT } from '../domain/documents.js';
import type { DataResponse, IssuedDocument } from '../domain/types.js';
import { untrusted } from '../safety/untrusted.js';
import { defineTool } from './define.js';
import { getIssued } from './issued-documents.js';

const NEEDS_REASON = new Set(['error', 'discarded', 'rejected', 'manual_rejected', 'not_delivered']);

export const getEInvoice = defineTool({
  name: 'fic_get_einvoice',
  title: 'Stato della fattura elettronica',
  description: `Stato SDI di un documento emesso, con la spiegazione in italiano. Se la fattura è stata scartata, rifiutata o non consegnata riporta il motivo. Con verify_xml controlla l'XML (campi obbligatori e formato) senza inviare nulla.
Stati: ${Object.entries(EI_STATUS_IT)
    .map(([k, v]) => `${k} = ${v}`)
    .join('; ')}.
Shows the SDI status of an e-invoice, the rejection reason and optionally verifies the XML.`,
  minMode: 'readonly',
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  input: z.object({
    document_id: z.number().int().positive(),
    verify_xml: z.boolean().default(false).describe('Verifica l’XML della fattura elettronica.'),
  }),
  operations: ['getIssuedDocument', 'getEInvoiceRejectionReason', 'verifyEInvoiceXml'],
  handler: async (args, app) => {
    const doc = await getIssued(app, args.document_id);
    const client = await app.api();
    const status = doc.ei_status ?? undefined;
    let reason: Record<string, unknown> | undefined;
    if (status && NEEDS_REASON.has(status)) {
      try {
        const r = await callOp<DataResponse<{ reason?: string; code?: string; date?: string }>>(
          client,
          'getEInvoiceRejectionReason',
          {
            pathParams: { document_id: args.document_id },
          },
        );
        reason = { reason: untrusted(r?.data?.reason), code: r?.data?.code, date: r?.data?.date };
      } catch (err) {
        if (!(err instanceof FicError) || err.kind !== 'not_found') throw err;
      }
    }
    let verification: Record<string, unknown> | undefined;
    if (args.verify_xml) {
      try {
        await callOp(client, 'verifyEInvoiceXml', { pathParams: { document_id: args.document_id } });
        verification = { valid: true };
      } catch (err) {
        if (err instanceof FicError && err.kind === 'validation') {
          verification = {
            valid: false,
            errors: err.details.validation?.length ? err.details.validation : [err.details.apiMessage],
          };
        } else throw err;
      }
    }
    return {
      document_id: doc.id,
      number: displayNumber(doc),
      date: doc.date,
      e_invoice: Boolean(doc.e_invoice),
      status: status ?? (doc.e_invoice ? 'not_sent' : undefined),
      status_meaning: status
        ? EI_STATUS_IT[status]
        : doc.e_invoice
          ? EI_STATUS_IT.not_sent
          : 'documento non elettronico',
      locked: doc.locked || undefined,
      recipient: doc.entity
        ? {
            ei_code: doc.entity.ei_code ?? undefined,
            certified_email: doc.entity.certified_email ?? undefined,
          }
        : undefined,
      rejection: reason,
      xml_verification: verification,
    };
  },
});

const MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return 'URL non valido';
  }
}

/** Host da cui il server accetta di scaricare i file dei documenti (link temporanei restituiti da FIC). */
export function isAllowedFileHost(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    return u.hostname === 'fattureincloud.it' || u.hostname.endsWith('.fattureincloud.it');
  } catch {
    return false;
  }
}

/** Estensione del file scaricato: dal tipo di contenuto, poi dal nome nel link, altrimenti quella attesa. */
const EXT_BY_TYPE: Record<string, string> = {
  'application/pdf': '.pdf',
  'application/xml': '.xml',
  'text/xml': '.xml',
  'application/pkcs7-mime': '.p7m',
  'application/x-pkcs7-mime': '.p7m',
  'application/zip': '.zip',
  'application/x-zip-compressed': '.zip',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'text/plain': '.txt',
  'text/csv': '.csv',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
};
const KNOWN_EXT = new Set([...Object.values(EXT_BY_TYPE), '.jpeg']);

export function fileExtension(contentType: string | null, url: string, fallback: string): string {
  const type = (contentType ?? '').split(';')[0]!.trim().toLowerCase();
  if (EXT_BY_TYPE[type]) return EXT_BY_TYPE[type];
  let fromName = '';
  try {
    fromName = extname(new URL(url).pathname).toLowerCase();
  } catch {
    // link non valido: si usa l'estensione attesa
  }
  if (KNOWN_EXT.has(fromName)) return fromName === '.jpeg' ? '.jpg' : fromName;
  return fallback;
}

/** Cartella di scambio solo per l'utente (0700), anche se esisteva già con permessi più larghi. */
export function prepareDownloadDir(dir: string): void {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (process.platform === 'win32' || resolve(dir) === resolve(homedir())) return;
  try {
    if ((lstatSync(dir).mode & 0o077) !== 0) chmodSync(dir, 0o700);
  } catch {
    // cartella non nostra: i file restano comunque 0600
  }
}

// Nomi dei file scritti da fic_download_file: tipo_numero_data_id[_ddt|_allegato].estensione.
const DOWNLOAD_NAME = /^[a-z_]+_[A-Za-z0-9._-]*_\d+(?:_ddt|_allegato)?\.[a-z0-9]{2,4}$/;

/**
 * Cancella i file scaricati dal server più vecchi di `days` giorni. Tocca solo i file che il server stesso
 * ha scritto (riconosciuti dal nome), mai sottocartelle, link o file messi lì dall'utente per i caricamenti.
 */
export function cleanupDownloads(dir: string, days: number, now = Date.now()): number {
  let removed = 0;
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return 0;
  }
  const limit = now - days * 24 * 60 * 60 * 1000;
  for (const name of names) {
    if (!DOWNLOAD_NAME.test(name)) continue;
    const file = join(dir, name);
    try {
      const st = lstatSync(file);
      if (st.isFile() && st.mtimeMs < limit) {
        unlinkSync(file);
        removed++;
      }
    } catch {
      // file sparito o non accessibile: si passa oltre
    }
  }
  return removed;
}

function safeName(s: string): string {
  return (
    s
      .replace(/[^A-Za-z0-9._-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 80) || 'documento'
  );
}

export const downloadFile = defineTool({
  name: 'fic_download_file',
  title: 'Scarica PDF o XML di un documento',
  description: `Salva su disco, nella cartella FIC_DOWNLOAD_DIR, il PDF di un documento emesso, il PDF del DDT collegato, l'allegato oppure l'XML della fattura elettronica, e restituisce il percorso del file. Non modifica nulla in Fatture in Cloud.
Usalo quando serve il file e non basta il link temporaneo restituito da fic_get_issued_document.
Saves the PDF, delivery note, attachment or e-invoice XML of an issued document to a local folder.`,
  minMode: 'readonly',
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  input: z.object({
    document_id: z.number().int().positive(),
    kind: z.enum(['pdf', 'xml', 'delivery_note', 'attachment']).default('pdf'),
  }),
  operations: ['getIssuedDocument', 'getEInvoiceXml'],
  handler: async (args, app) => {
    const doc: IssuedDocument = await getIssued(app, args.document_id);
    const base = safeName(
      `${doc.type ?? 'documento'}_${displayNumber(doc) ?? doc.id}_${doc.date ?? ''}_${doc.id}`,
    );
    const dir = resolve(app.config.downloadDir);
    prepareDownloadDir(dir);
    let bytes: Buffer;
    let file: string;
    if (args.kind === 'xml') {
      if (!doc.e_invoice) throw refused('Il documento non è una fattura elettronica: non ha un XML.');
      const client = await app.api();
      const xml = await callOp<string>(client, 'getEInvoiceXml', {
        pathParams: { document_id: args.document_id },
        responseType: 'text',
      });
      bytes = Buffer.from(xml, 'utf8');
      file = join(dir, `${base}.xml`);
    } else {
      const url =
        args.kind === 'pdf' ? doc.url : args.kind === 'delivery_note' ? doc.dn_url : doc.attachment_url;
      if (!url)
        throw refused(
          `Il documento non ha ${args.kind === 'pdf' ? 'un PDF' : args.kind === 'delivery_note' ? 'un DDT collegato' : 'un allegato'}.`,
        );
      if (!isAllowedFileHost(url)) {
        throw refused(
          `Il link del file punta a un host non previsto (${hostOf(url)}): download non eseguito per sicurezza. Usa il link da fic_get_issued_document.`,
        );
      }
      // Link firmato e temporaneo: niente header di autenticazione verso questo host.
      const res = await app.httpFetch(url, { signal: AbortSignal.timeout(60_000), redirect: 'error' });
      if (!res.ok)
        throw new FicError('server', `Download non riuscito (HTTP ${res.status})`, { status: res.status });
      const declared = Number(res.headers.get('content-length') ?? 0);
      if (declared > MAX_DOWNLOAD_BYTES)
        throw refused('File troppo grande (oltre 50 MB): scaricalo dal link.');
      bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.length > MAX_DOWNLOAD_BYTES)
        throw refused('File troppo grande (oltre 50 MB): scaricalo dal link.');
      // L'allegato può essere di qualsiasi tipo; PDF e DDT sono PDF salvo diversa indicazione del server.
      const ext = fileExtension(res.headers.get('content-type'), url, '.pdf');
      file = join(
        dir,
        `${base}${args.kind === 'attachment' ? '_allegato' : args.kind === 'delivery_note' ? '_ddt' : ''}${ext}`,
      );
    }
    // O_NOFOLLOW: se al posto del file c'è un link simbolico, non lo si segue.
    const fd = openSync(
      file,
      constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW,
      0o600,
    );
    try {
      writeSync(fd, bytes);
    } finally {
      closeSync(fd);
    }
    return { document_id: doc.id, kind: args.kind, path: file, bytes: bytes.length };
  },
});
