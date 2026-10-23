import { z } from 'zod';
import { catalogOperation } from '../api/client.js';
import { FicError, refused } from '../api/errors.js';
import { callOp } from '../api/ops.js';
import type { DataResponse } from '../domain/types.js';
import { untrusted } from '../safety/untrusted.js';
import { authorize, confirmSchema, humanPrompt, type Pending, previewFields } from './confirm-flow.js';
import { defineTool } from './define.js';

interface Target {
  del: string;
  get?: string;
  label: string;
  /** Cosa succede dopo la cancellazione. */
  effect: string;
}

export const DELETE_TARGETS = {
  issued_document: {
    del: 'deleteIssuedDocument',
    get: 'getIssuedDocument',
    label: 'documento emesso',
    effect: 'finisce nel cestino di Fatture in Cloud e si può recuperare',
  },
  received_document: {
    del: 'deleteReceivedDocument',
    get: 'getReceivedDocument',
    label: 'documento ricevuto',
    effect: 'finisce nel cestino e si può recuperare',
  },
  client: {
    del: 'deleteClient',
    get: 'getClient',
    label: 'cliente',
    effect: 'viene eliminato dall’anagrafica',
  },
  supplier: {
    del: 'deleteSupplier',
    get: 'getSupplier',
    label: 'fornitore',
    effect: 'viene eliminato dall’anagrafica',
  },
  product: { del: 'deleteProduct', get: 'getProduct', label: 'prodotto', effect: 'viene eliminato' },
  receipt: { del: 'deleteReceipt', get: 'getReceipt', label: 'corrispettivo', effect: 'viene eliminato' },
  f24: { del: 'deleteF24', get: 'getF24', label: 'F24', effect: 'viene eliminato' },
  archive_document: {
    del: 'deleteArchiveDocument',
    get: 'getArchiveDocument',
    label: 'documento d’archivio',
    effect: 'viene eliminato',
  },
  cashbook_entry: {
    del: 'deleteCashbookEntry',
    get: 'getCashbookEntry',
    label: 'movimento di prima nota',
    effect: 'viene eliminato',
  },
  payment_account: {
    del: 'deletePaymentAccount',
    get: 'getPaymentAccount',
    label: 'conto di saldo',
    effect: 'viene eliminato',
  },
  payment_method: {
    del: 'deletePaymentMethod',
    get: 'getPaymentMethod',
    label: 'metodo di pagamento',
    effect: 'viene eliminato',
  },
  vat_type: { del: 'deleteVatType', get: 'getVatType', label: 'aliquota IVA', effect: 'viene eliminata' },
  webhook_subscription: {
    del: 'deleteWebhooksSubscription',
    get: 'getWebhooksSubscription',
    label: 'sottoscrizione webhook',
    effect: 'viene eliminata',
  },
  issued_document_attachment: {
    del: 'deleteIssuedDocumentAttachment',
    get: 'getIssuedDocument',
    label: 'allegato del documento emesso',
    effect: 'viene rimosso',
  },
  received_document_attachment: {
    del: 'deleteReceivedDocumentAttachment',
    get: 'getReceivedDocument',
    label: 'allegato del documento ricevuto',
    effect: 'viene rimosso',
  },
  f24_attachment: {
    del: 'deleteF24Attachment',
    get: 'getF24',
    label: 'allegato dell’F24',
    effect: 'viene rimosso',
  },
  bin_issued_document: {
    del: 'DeleteBinIssuedDocument',
    get: 'GetBinIssuedDocument',
    label: 'documento emesso nel cestino',
    effect: 'viene eliminato DEFINITIVAMENTE, senza possibilità di recupero',
  },
  bin_received_document: {
    del: 'DeleteBinReceivedDocument',
    get: 'GetBinReceivedDocument',
    label: 'documento ricevuto nel cestino',
    effect: 'viene eliminato DEFINITIVAMENTE, senza possibilità di recupero',
  },
} satisfies Record<string, Target>;

type Resource = keyof typeof DELETE_TARGETS;
const RESOURCES = Object.keys(DELETE_TARGETS) as [Resource, ...Resource[]];

function pathParam(operationId: string): string {
  const op = catalogOperation(operationId);
  const p = op?.pathParams[0];
  if (!p) throw new Error(`Operazione senza parametro di percorso: ${operationId}`);
  return p;
}

/** Riepilogo di quello che si sta per cancellare, con i testi delimitati. */
function describe(data: Record<string, unknown>): Record<string, unknown> {
  const entity = data.entity as { name?: string } | undefined;
  return {
    id: data.id,
    type: data.type,
    number:
      data.number !== undefined && data.number !== null
        ? `${data.number}${data.numeration ?? ''}`
        : undefined,
    date: data.date,
    name: untrusted((data.name as string) ?? entity?.name, 200),
    description: untrusted(data.description, 300),
    amount_gross: data.amount_gross,
    ei_status: data.ei_status,
    locked: data.locked || undefined,
  };
}

export const deleteResource = defineTool({
  name: 'fic_delete',
  title: 'Cancella in Fatture in Cloud',
  description: `Cancella un elemento in Fatture in Cloud: documento emesso o ricevuto, cliente, fornitore, prodotto, corrispettivo, F24, documento d'archivio, movimento di prima nota, conto di saldo, metodo di pagamento, aliquota IVA, sottoscrizione webhook, allegato, oppure svuota definitivamente un documento dal cestino.
Esiste solo con FIC_ENABLE_DELETE=true, oltre alla modalità write o full.
Funziona in due passi:
1. senza confirm: non cancella nulla, restituisce cosa verrebbe cancellato, se sarà recuperabile e un token;
2. mostra l'anteprima all'utente; per cancellare richiama con confirm uguale al token. Il server chiede allora la conferma direttamente all'utente: senza la sua conferma non viene cancellato nulla.
Attenzione: cancellare una fattura lascia un buco nella numerazione.
Deletes a resource after a preview and explicit confirmation.`,
  minMode: 'write',
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  input: z.object({
    resource: z.enum(RESOURCES),
    id: z
      .union([z.number().int().positive(), z.string().min(1).max(60)])
      .describe('ID dell’elemento (per gli allegati: ID del documento).'),
    confirm: confirmSchema,
  }),
  operations: Object.values(DELETE_TARGETS).flatMap((t: Target) => (t.get ? [t.del, t.get] : [t.del])),
  handler: async (args, app, call) => {
    const target: Target = DELETE_TARGETS[args.resource];
    const client = await app.api();
    const id = String(args.id);
    let current: Record<string, unknown> | undefined;
    if (target.get) {
      try {
        const res = await callOp<DataResponse<Record<string, unknown>>>(client, target.get, {
          pathParams: { [pathParam(target.get)]: id },
        });
        current = res?.data;
      } catch (err) {
        if (err instanceof FicError && err.kind === 'not_found')
          throw refused(`Nessun ${target.label} con ID ${id}.`);
        throw err;
      }
    }
    if (args.resource === 'issued_document' && current?.locked) {
      throw refused(
        'Il documento è bloccato (di solito perché già inviato allo SDI): Fatture in Cloud non ne consente la cancellazione.',
      );
    }
    const state = String(current?.updated_at ?? '');
    const params = { resource: args.resource };
    const item = current ? describe(current) : { id };
    const pending: Pending = {
      action: 'DEL',
      id,
      state,
      params,
      prompt: humanPrompt(`Cancellazione: ${target.label}`, {
        elemento: item,
        dopo_la_cancellazione: target.effect,
      }),
    };

    if (!args.confirm) {
      return {
        preview: true,
        deleted: false,
        resource: args.resource,
        what: target.label,
        item,
        after_delete: target.effect,
        ...previewFields(app, call, pending),
      };
    }

    await authorize(app, call, args.confirm, pending);
    await callOp(client, target.del, { pathParams: { [pathParam(target.del)]: id } });
    app.cache.invalidate('issued:', 'entity:', 'ref:');
    app.log.audit('cancellazione', { resource: args.resource, id });
    return { deleted: true, resource: args.resource, id, after_delete: target.effect };
  },
});
