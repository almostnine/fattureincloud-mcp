/**
 * Elenco dei tool visibile ai tool generici (catalogo) senza import circolari:
 * lo popola tools/index.ts. Un import() dinamico qui rompe l'ordine di inizializzazione del bundle.
 */
export const toolRegistry: { tools: Array<{ name: string; operations: string[] }> } = { tools: [] };
