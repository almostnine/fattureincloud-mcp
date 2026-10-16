import { accountInfo } from './account.js';
import type { ToolDef } from './define.js';

/** Tutti i tool, nell'ordine in cui vengono elencati al client (ordine deterministico). */
// biome-ignore lint/suspicious/noExplicitAny: elenco eterogeneo di tool con schemi diversi
export const ALL_TOOLS: ToolDef<any>[] = [accountInfo];
