import { existsSync, readFileSync } from 'node:fs';

/** Legge .env senza dipendenze e senza mai stampare i valori. Le variabili già presenti vincono. */
export function loadDotEnv(path = '.env'): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    const [, key, raw] = m as unknown as [string, string, string];
    const value = raw.replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[key] === undefined && value) process.env[key] = value;
  }
}

/**
 * fetch che consente solo letture: protezione di rete per i test sull'account reale.
 * Qualsiasi POST, PUT o DELETE fa fallire il test prima di uscire dalla macchina.
 */
export const readOnlyFetch: typeof fetch = async (input, init) => {
  const method = (init?.method ?? 'GET').toUpperCase();
  if (method !== 'GET')
    throw new Error(
      `Bloccata una richiesta ${method} verso l'account reale: i test di integrazione in sola lettura non scrivono mai.`,
    );
  return fetch(input, init);
};
