# Sicurezza

## Segnalare una vulnerabilità

Usa la funzione **Report a vulnerability** (GitHub Security Advisories) di questo repository, oppure apri una issue senza dettagli sfruttabili e chiedi un canale privato. Non inserire token, dati di clienti o documenti reali nelle segnalazioni.

## Modello di sicurezza

Il server agisce sul tuo account Fatture in Cloud per conto di un modello linguistico, che può sbagliare o essere manipolato da testi inseriti da terzi (per esempio la descrizione di una fattura passiva). Le difese sono a più livelli e indipendenti tra loro.

| Livello | Difesa | Dove |
|---|---|---|
| Permessi del token | gli scope scelti in Fatture in Cloud limitano tutto il resto: con un token `:r` nessuna scrittura è possibile | Fatture in Cloud |
| Modalità | `readonly` (default): i tool di scrittura e invio non vengono registrati; `write` aggiunge creazione, modifica e cancellazione; `full` aggiunge invio SDI, email e webhook. Un valore non valido ricade su `readonly`. Ogni handler ricontrolla la modalità | `src/config.ts`, `src/server.ts`, `src/tools/define.ts` |
| Classe di effetto | i tool generici eseguono un'operazione solo se la sua classe (lettura, scrittura, cancellazione, invio, scrittura verso terzi) è ammessa: le letture non possono scrivere, le scritture non possono inviare né cancellare | `src/api/catalog.generated.ts`, `src/tools/generic.ts` |
| Conferma | invio SDI, email, cancellazioni, webhook, conversioni che eliminano l'originale e scritture su dati di pagamento (conti, metodi, IBAN) richiedono prima un'anteprima, che restituisce un token HMAC legato ad azione, ID, stato del documento e parametri, con segreto casuale per processo, monouso, con scadenza di 10 minuti | `src/safety/confirm.ts` |
| Approvazione umana | i tool che modificano dati sono `destructiveHint: true`: Claude Desktop chiede il permesso per ogni chiamata. Non scegliere "consenti sempre" per invii e cancellazioni | annotation dei tool |
| Destinatari email | solo indirizzi del cliente in anagrafica o nel documento, quello proposto da Fatture in Cloud ed eventuali indirizzi configurati; un indirizzo scritto in Fatture in Cloud durante la stessa sessione non è ammesso | `src/tools/send.ts`, `src/tools/define.ts` |
| Testi non fidati | i testi liberi in arrivo da Fatture in Cloud (compresi i messaggi d'errore) vengono ripuliti dai caratteri invisibili, limitati in lunghezza e racchiusi tra ⟦ ⟧, con un avviso al modello; nelle risposte generiche si delimita ogni testo salvo i campi tecnici noti | `src/safety/untrusted.ts`, `src/safety/wrap.ts` |
| Rete | un solo host API, fisso nel codice; i file dei documenti si scaricano solo da host `*.fattureincloud.it`, senza inviare il token; nessun redirect seguito | `src/api/client.ts`, `src/tools/einvoice.ts` |
| File locali | download solo nella cartella configurata, massimo 50 MB, senza seguire link simbolici; upload di allegati solo da quella cartella, con controllo dei link simbolici | `src/tools/einvoice.ts`, `src/tools/generic.ts` |
| Segreti | token solo da variabile d'ambiente o dal portachiavi (Claude Desktop); oscurato nei log; log solo su stderr | `src/log.ts` |
| Cache | in memoria di default; su disco solo su scelta e solo per dati di riferimento non personali, con permessi 0700/0600 | `src/cache/store.ts` |
| Errori | al modello solo messaggi spiegati, mai traceback o percorsi locali | `src/api/errors.ts` |
| Dipendenze | due dipendenze a runtime, versioni esatte, lock file, `npm audit` in CI, action GitHub fissate per SHA, script di installazione disattivati in CI | `package.json`, `.github/workflows/ci.yml` |

## Cosa non copre

- Un token con permessi di scrittura in modalità `full`, insieme a un utente che approva ogni richiesta senza leggerla, può fare danni: le anteprime servono a te.
- Il client MCP (Claude Desktop o altro) vede tutti i dati che i tool restituiscono e li tratta secondo le proprie regole.
- I link temporanei ai PDF restituiti da Fatture in Cloud funzionano senza autenticazione per 7 giorni: non condividerli.

## Versioni supportate

Solo l'ultima versione pubblicata riceve correzioni di sicurezza.
