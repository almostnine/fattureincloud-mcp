# Sicurezza

## Segnalare una vulnerabilità

Usa la funzione **Report a vulnerability** (GitHub Security Advisories) di questo repository, oppure apri una issue senza dettagli sfruttabili e chiedi un canale privato. Non inserire token, dati di clienti o documenti reali nelle segnalazioni.

## Modello di sicurezza

Il server agisce sul tuo account Fatture in Cloud per conto di un modello linguistico, che può sbagliare o essere manipolato da testi inseriti da terzi (per esempio la descrizione di una fattura passiva). Le difese sono a più livelli e indipendenti tra loro.

| Livello | Difesa | Dove |
|---|---|---|
| Permessi del token | gli scope scelti in Fatture in Cloud limitano tutto il resto: con un token `:r` nessuna scrittura è possibile | Fatture in Cloud |
| Modalità | `readonly` (default): i tool di scrittura e invio non vengono registrati; `write` aggiunge creazione, modifica e cancellazione; `full` aggiunge webhook e, solo con `FIC_ENABLE_SEND=true`, invio SDI ed email. Un valore non valido ricade su `readonly`. `fic_delete` esiste solo con `FIC_ENABLE_DELETE=true`. `FIC_EXTRA_TOOLS` non abilita più nulla (elenco chiuso, ignorato in `readonly`). Ogni handler ricontrolla la modalità | `src/config.ts`, `src/server.ts`, `src/tools/define.ts` |
| Invii | senza `FIC_ENABLE_SEND=true` il client HTTP rifiuta ogni operazione di invio (SDI, email), riconosciuta per operationId o per percorso, prima che parta, qualunque tool la chieda | `src/api/client.ts` |
| Classe di effetto | i tool generici eseguono un'operazione solo se la sua classe (lettura, scrittura, cancellazione, invio, scrittura verso terzi) è ammessa: le letture non possono scrivere, le scritture non possono inviare né cancellare. `fic_api_write` rifiuta sempre creazione e modifica di documenti emessi, recupero dal cestino, conti di saldo e metodi di pagamento | `src/api/catalog.generated.ts`, `src/tools/generic.ts` |
| Anteprima e token | ogni scrittura parte da un'anteprima (`dry_run` vale `true` di default) che restituisce il testo esatto dell'operazione e un token HMAC legato ad azione, ID, stato della risorsa e corpo esatto, con segreto casuale per processo, monouso, con scadenza di 10 minuti. Il token arriva al modello: lega l'anteprima al corpo, ma da solo non autorizza nulla | `src/safety/confirm.ts`, `src/tools/confirm-flow.ts` |
| Conferma umana fuori banda | al momento di eseguire ogni scrittura (documenti, rate, anagrafiche, scritture generiche, cancellazioni, invii, webhook) il server chiede la conferma alla persona su un canale che il modello non può usare: elicitation MCP (era 2025 con richiesta dal server, era 2026-07-28 con `input_required` e stato firmato), con la casella "Confermo" da spuntare; se il client non la supporta, su macOS una finestra di sistema (osascript, "Annulla" predefinito, chiusura automatica dopo 2 minuti, testo passato come argomento e non come script); altrimenti la scrittura è rifiutata. `FIC_CONFIRM_METHOD` sceglie il canale | `src/safety/human.ts` |
| Coordinate bancarie | nessun corpo in uscita può contenere chiavi bancarie (iban, bank_*, BIC, ABI, CAB, beneficiario, anche nei dati FatturaPA) né testi con la forma di un IBAN, con o senza spazi, di qualsiasi paese: il client rifiuta la richiesta prima di inviarla. Duplicazione, conversione e modifica tolgono le coordinate copiate dal documento d'origine e del metodo di pagamento inviano solo l'id | `src/safety/bank.ts`, `src/api/client.ts`, `src/domain/compose.ts` |
| Approvazione del client | i tool che modificano dati sono `destructiveHint: true`: Claude Desktop chiede il permesso per ogni chiamata. Non scegliere "consenti sempre" per invii e cancellazioni | annotation dei tool |
| Destinatari email | solo indirizzi del cliente in anagrafica o nel documento, quello proposto da Fatture in Cloud ed eventuali indirizzi configurati; un indirizzo scritto in Fatture in Cloud durante la stessa sessione non è ammesso | `src/tools/send.ts`, `src/tools/define.ts` |
| Testi non fidati | i testi liberi in arrivo da Fatture in Cloud (compresi i messaggi d'errore) vengono ripuliti dai caratteri invisibili, limitati in lunghezza e racchiusi tra ⟦ ⟧, con un avviso al modello; nelle risposte generiche si delimita ogni testo salvo i campi tecnici noti, e solo se il valore ha il formato atteso (data, URL https, email, codice senza spazi); le risposte testuali e XML sono sempre delimitate | `src/safety/untrusted.ts`, `src/safety/wrap.ts` |
| Rete | un solo host API, fisso nel codice; i file dei documenti si scaricano solo da host `*.fattureincloud.it`, senza inviare il token; nessun redirect seguito | `src/api/client.ts`, `src/tools/einvoice.ts` |
| File locali | download solo nella cartella configurata, con permessi 0700 (file 0600), massimo 50 MB, senza seguire link simbolici, estensione dal tipo di contenuto; pulizia facoltativa all'avvio dei file scaricati più vecchi di `FIC_DOWNLOAD_RETENTION_DAYS`; upload di allegati solo da quella cartella, con controllo dei link simbolici | `src/tools/einvoice.ts`, `src/tools/generic.ts` |
| Limiti dell'API | richieste in serie, al massimo 300 ogni 5 minuti per azienda lato client, stop quando restano meno di 20 richieste nell'ora o nel mese; retry solo delle richieste ripetibili, mai di una creazione, nemmeno sul 409 "già in esecuzione" | `src/api/client.ts` |
| Segreti | token solo da variabile d'ambiente o dal portachiavi (Claude Desktop); oscurato nei log; log solo su stderr | `src/log.ts` |
| Cache | in memoria di default; su disco solo su scelta e solo per dati di riferimento non personali, con permessi 0700/0600 | `src/cache/store.ts` |
| Errori | al modello solo messaggi spiegati, mai traceback o percorsi locali | `src/api/errors.ts` |
| Dipendenze | due dipendenze a runtime, versioni esatte, lock file, `npm audit` in CI, action GitHub fissate per SHA, script di installazione disattivati in CI | `package.json`, `.github/workflows/ci.yml` |

## Cosa non copre

- Un token con permessi di scrittura in modalità `full`, insieme a un utente che conferma ogni richiesta senza leggerla, può fare danni: la finestra di conferma mostra il testo esatto dell'operazione, leggilo.
- La conferma via elicitation si fida del client MCP: è il client (Claude Desktop) a mostrare la richiesta alla persona e a restituire la risposta. Un client che rispondesse da solo annullerebbe questa difesa; in quel caso usa `FIC_CONFIRM_METHOD=dialog` su macOS.
- Il client MCP (Claude Desktop o altro) vede tutti i dati che i tool restituiscono e li tratta secondo le proprie regole.
- I link temporanei ai PDF restituiti da Fatture in Cloud funzionano senza autenticazione per 7 giorni: non condividerli.

## Versioni supportate

Solo l'ultima versione pubblicata riceve correzioni di sicurezza.
