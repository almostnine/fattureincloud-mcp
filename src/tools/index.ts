import { accountInfo } from './account.js';
import { clearCache } from './cache.js';
import type { ToolDef } from './define.js';
import { deleteResource } from './delete.js';
import { downloadFile, getEInvoice } from './einvoice.js';
import { createEntity, getEntityTool, searchEntities, updateEntity } from './entities.js';
import { apiCatalog, apiRead, apiWrite } from './generic.js';
import { listInstallments, setInstallmentStatus } from './installments.js';
import { getIssuedDocument, listIssuedDocuments } from './issued-documents.js';
import {
  convertIssuedDocument,
  createIssuedDocument,
  duplicateIssuedDocument,
  updateIssuedDocument,
} from './issued-write.js';
import { getReceivedDocument, listCashbook, listReceivedDocuments } from './received-documents.js';
import { reconcile } from './reconcile.js';
import { referenceData } from './reference-data.js';
import { toolRegistry } from './registry.js';
import { sendEInvoice, sendEmail } from './send.js';
import { situation } from './situation.js';

/** Tutti i tool, nell'ordine in cui vengono elencati al client (ordine deterministico). */
// biome-ignore lint/suspicious/noExplicitAny: elenco eterogeneo di tool con schemi diversi
export const ALL_TOOLS: ToolDef<any>[] = [
  // lettura (modalità readonly)
  accountInfo,
  listIssuedDocuments,
  getIssuedDocument,
  listInstallments,
  getEInvoice,
  downloadFile,
  searchEntities,
  getEntityTool,
  situation,
  listReceivedDocuments,
  getReceivedDocument,
  listCashbook,
  referenceData,
  reconcile,
  apiCatalog,
  apiRead,
  clearCache,
  // scrittura (modalità write)
  setInstallmentStatus,
  createEntity,
  updateEntity,
  createIssuedDocument,
  updateIssuedDocument,
  convertIssuedDocument,
  duplicateIssuedDocument,
  deleteResource,
  apiWrite,
  // invio (modalità full)
  sendEInvoice,
  sendEmail,
];

toolRegistry.tools = ALL_TOOLS;
