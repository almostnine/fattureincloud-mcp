import { z } from 'zod';
import { defineTool } from './define.js';

export const clearCache = defineTool({
  name: 'fic_clear_cache',
  title: 'Svuota la cache',
  description: `Svuota la cache locale del server (in memoria e, se attiva, su disco). Utile se un dato modificato dall'app web non risulta aggiornato. Non tocca nulla in Fatture in Cloud.
Clears the server's local cache.`,
  minMode: 'readonly',
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  input: z.object({}),
  operations: [],
  handler: async (_args, app) => {
    const files = app.cache.clear();
    return {
      cleared: true,
      cache_mode: app.config.cache,
      disk_files_removed: app.cache.diskEnabled ? files : undefined,
    };
  },
});
