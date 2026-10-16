import { mkdirSync, writeFileSync } from 'node:fs';
import { afterAll } from 'vitest';
import { exercisedOperations } from './helpers/fake-fetch.js';

/** Ogni file di test salva le operazioni API che ha esercitato; scripts/gen-coverage.ts le unisce. */
afterAll(() => {
  if (!exercisedOperations.size) return;
  mkdirSync('coverage/ops', { recursive: true });
  const name = `${process.pid}-${Math.random().toString(36).slice(2)}.json`;
  writeFileSync(`coverage/ops/${name}`, JSON.stringify([...exercisedOperations]));
});
