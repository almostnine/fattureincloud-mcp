# Piano di lavoro

Fasi del prompt originale, tradotte in passi concreti. Ogni passo si chiude con un commit piccolo e descrittivo, spinto sull'hub (che lo inoltra al mirror GitHub).

## Fase 2: architettura

1. Scheletro del progetto: `package.json` con versioni esatte, `tsconfig` strict, Biome, esbuild, vitest, `.env.example`.
2. `scripts/gen-catalog.ts`: catalogo delle 123 operazioni, tipi generati, classe di effetto rivista a mano, prima versione di `docs/COVERAGE.md`.
3. `config.ts`, `log.ts` (solo stderr, redazione), `cli.ts`.
4. Client API: fetch, timeout, retry secondo le regole di DESIGN.md 2.3, quote, paginazione, parser degli errori nei due formati.
5. `tools/define.ts` e `server.ts`: registrazione filtrata per modalità, annotation obbligatorie per costruzione (un tool senza annotation non compila).
6. Primo tool end-to-end (`fic_account_info`) e prova con MCP Inspector.

## Fase 3: funzionalità (in ordine di priorità)

1. Documenti emessi: `fic_list_issued_documents`, `fic_get_issued_document` (anche per numero e anno), `fic_get_einvoice`, `fic_download_file`.
2. Rate e pagamenti:
   - `fic_list_installments` (scadute e non pagate su tutte le fatture);
   - `fic_reference_data` con i conti di saldo;
   - `fic_set_installment_status`, provato **solo sull'account di prova**: merge della `payments_list`, PUT parziale, documenti bloccati.
3. Anagrafiche: `fic_search_entities`, `fic_get_entity`, `fic_create_entity`, `fic_update_entity`.
4. `fic_situation` con lettura di tutte le pagine; `fic_reconcile`.
5. Documenti ricevuti e prima nota: `fic_list_received_documents`, `fic_get_received_document`, `fic_list_cashbook`.
6. Creazione documenti: `fic_create_issued_document` (con `dry_run` sui totali), `fic_update_issued_document`, `fic_convert_issued_document`, `fic_duplicate_issued_document` (correzione del bug noto).
7. Invio: `fic_send_einvoice`, `fic_send_email`, con anteprima e conferma.
8. Resto dell'API: `fic_api_catalog`, `fic_api_read`, `fic_api_write`, `fic_delete`; test che ogni operazione del catalogo sia raggiungibile.

## Fase 4: sicurezza

Già incorporata nei passi precedenti (modalità, conferme, testi non fidati, destinatari email, cache, log). In questa fase:
- revisione dedicata con l'agente di code review e la skill `security-review`;
- `SECURITY.md`;
- verifica di `npm audit`.

## Fase 5: test

- Unitari e di tool per ogni funzione, con fixture inventate validate contro l'OpenAPI.
- Test delle modalità e delle annotation.
- Integrazione facoltativa:
  - sola lettura sull'account reale con il tuo token (letto da `.env`, mai stampato);
  - scrittura solo su un account Trial separato, con il blocco automatico se il piano non è `trial`.
- MCP Inspector in CI e prova interattiva documentata.
- CI GitHub Actions: lint, type check, test, audit, build del `.mcpb`.

## Fase 6: documentazione e rilascio

1. README in italiano e inglese:
   - installazione (`.mcpb`, `npx`, configurazione manuale);
   - creazione dell'app privata e del token;
   - scope per modalità, tool con esempi, limiti noti;
   - privacy policy e avviso sul marchio.
2. `CHANGELOG.md`, `SECURITY.md`, `docs/REVIEW.md`, `docs/COVERAGE.md` completo.
3. `manifest.json` 0.3 con `user_config`, `privacy_policies`, icona.
4. Build del `.mcpb`; installazione in Claude Desktop fatta da te; controllo dei log; prova dei quattro esempi della definizione di finito.
5. **Punto di controllo 2**: riepilogo, esito dei test, istruzioni di installazione.
6. Dopo il tuo ok:
   - tag `v1.0.0` e release GitHub con il `.mcpb` allegato;
   - pubblicazione su npm e sul registro MCP preparata ma non eseguita senza un tuo secondo ok.

## Cosa mi serve da te

- Ok su ANALISI.md, DESIGN.md e questo piano (punto di controllo 1).
- Risposte ai punti della sezione 5 di ANALISI.md: remote, nome npm, account Trial, invio SDI non testabile sul Trial.
- Per i test di integrazione:
  - il token in sola lettura in un file `.env` locale (escluso dal repository), che leggerò senza stamparlo;
  - più avanti, il token dell'account Trial.
