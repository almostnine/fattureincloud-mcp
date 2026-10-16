import { accountInfo } from './account.js';
import type { ToolDef } from './define.js';
import { listInstallments, setInstallmentStatus } from './installments.js';
import { getIssuedDocument, listIssuedDocuments } from './issued-documents.js';
import { referenceData } from './reference-data.js';

/** Tutti i tool, nell'ordine in cui vengono elencati al client (ordine deterministico). */
// biome-ignore lint/suspicious/noExplicitAny: elenco eterogeneo di tool con schemi diversi
export const ALL_TOOLS: ToolDef<any>[] = [
  accountInfo,
  listIssuedDocuments,
  getIssuedDocument,
  listInstallments,
  referenceData,
  setInstallmentStatus,
];
