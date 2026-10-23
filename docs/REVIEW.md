# Revisione finale

Stato al 17 ottobre 2026, versione 1.0.0.

## 1. Verifiche automatiche

| Controllo | Esito |
|---|---|
| Test (Vitest) | 264 test verdi: unitari (client, sicurezza, dominio), tool via client MCP in memoria, contratto (fixture validate contro gli schemi OpenAPI), test a tappeto su tutte le 123 operazioni |
| Copertura API | 123 operazioni su 123 raggiungibili e esercitate dai test, vedi [COVERAGE.md](COVERAGE.md) |
| Type check | `tsc --strict` senza errori (TypeScript 7) |
| Lint | Biome senza errori né avvisi |
| Vulnerabilità | `npm audit`: 0 |
| CI GitHub Actions | lint, type check, test, audit su Node 22, 24, 26; bundle avviato su Node 20; `.mcpb` costruito e controllato con MCP Inspector |
| MCP Inspector (`--cli`, `--strict`) sul bundle impacchettato | `readonly` 17 tool, `write` 26, `full` 28, valore non valido 17; schemi portabili |
| Manifest MCPB | `mcpb validate` superato (manifest 0.3), pacchetto di 6 file, nessun `node_modules` |

## 2. Revisioni indipendenti

Due agenti che non avevano scritto il codice hanno rivisto il progetto in sola lettura, riproducendo i problemi con script di prova contro le funzioni reali e il server con un Fatture in Cloud simulato.

### 2.1 Correttezza rispetto all'OpenAPI

| # | Rilievo | Risoluzione |
|---|---|---|
| A1 | Riconciliazione: due candidati "high", "rata n 2" letto come fattura 2, nomi confrontati come sottostringhe | un solo "high", con 20 punti di margine sul miglior candidato di un altro documento; numero con confine di parola e senza "n" isolato; nomi a parole intere; una rata abbinata non viene riproposta; indice per importo (500 movimenti su 4.000 rate in meno di 3 secondi) |
| A2 | Rate esplicite: importi ignorati o corretti in silenzio da `fix_payments` | importi rispettati, residuo diviso tra le rate senza importo, rifiuto se la somma non torna |
| A3 | Duplicazione con "fine mese": scadenza spostata di un mese | scadenze ricalcolate dai termini della rata |
| M1 | `fic_situation` in errore con solo `date_to` | periodo completato dal 1° gennaio o fino al 31 dicembre |
| M2 | Prezzi lordi di default: rischio di netto messo nel lordo | con soli prezzi netti si lavora al netto; messaggio esplicito sulla differenza |
| M3 | Valuta estera sommata come euro | documenti non in euro esclusi dalle somme e riportati a parte |
| M4 | Documenti in attesa letti con lo schema sbagliato | proiezione dedicata (`supplier_name`, `subject`, `document_type`), filtri non supportati rifiutati |
| M5 | "Riprova" dopo timeout di una creazione | avviso di verificare prima di ripetere, per non duplicare |
| M6 | Rate scadute basate su un'ipotesi non verificata (`next_due_date < oggi`) | lato server solo "almeno una rata aperta", scadenza valutata in locale su ogni rata |
| M7, M8 | Duplicazione e fotografia del cliente incomplete | aggiunti sconto sul totale, imponibili, `ei_raw`, `extra_data` (senza stati di invio), dati DDT, fattura elettronica e dichiarazione d'intento del cliente |
| M9 | Termini "fine mese" del cliente ignorati | usati di default |
| M10 | 403 "limite del piano" scambiato per quota API | quota solo con `Retry-After` o formulazione esplicita |
| M11 | Conversione con eliminazione dell'originale senza conferma | anteprima e token |
| M12 | `ei_raw` delle rate perso segnando una rata pagata | conservato |
| B1-B14 | segnaposto negli scope, periodi ambigui, "null" in anteprima, apici nei filtri, campi da cliente sui fornitori, `amount_due` nullo, corpo email oltre 50 KiB, rate inventate in duplicazione, duplicazione senza cliente, elenchi vuoti senza `items`, note di credito non abbinate | tutti corretti o, per le note di credito, segnalati nell'output |

### 2.2 Sicurezza

Nessun problema critico o alto. Modalità, host unico, upload, cache e gestione del token verificati come corretti.

| # | Rilievo | Risoluzione |
|---|---|---|
| M1 | Allowlist email aggirabile cambiando l'email del cliente e poi inviando | un indirizzo scritto in Fatture in Cloud durante la sessione non è un destinatario ammesso (salvo configurazione esplicita) |
| M2 | Token di conferma riutilizzabile | token monouso |
| M3 | IBAN di conti e metodi di pagamento modificabili senza conferma | anteprima e token per conti, metodi di pagamento e qualsiasi scrittura con dati bancari |
| M4 | Testi di terzi non delimitati in alcuni campi | nelle risposte generiche si delimita ogni testo salvo i campi tecnici noti; delimitati anche città e nomi, listini, prima nota, messaggi d'errore di Fatture in Cloud |
| M5 | Strumenti di build scaricati fuori dal lock file con script attivi | versioni fisse e `npm_config_ignore_scripts` negli script di build |
| L1 | ID "." o ".." cambiano l'endpoint | rifiutati |
| L2, L5 | Anteprima email parziale; a capo nell'oggetto | anteprima completa (corpo limitato a 5.000 caratteri); oggetto su una riga |
| L4 | Riconciliazione lenta su grandi volumi | indice per importo |
| L6 | Un'operazione nuova della spec diventerebbe una scrittura senza revisione | test che fissa la classificazione: una spec nuova va rivista |
| L7 | Elenchi vuoti in cache per 24 ore | non conservati |
| L8 | Download senza limite, che segue i link simbolici | limite di 50 MB, scrittura con `O_NOFOLLOW`, URL malformati gestiti |
| L9 | Credenziali persistite nel checkout della CI | `persist-credentials: false` |
| L3 | Anteprima SDI basata su `dry_run` mai provato su un account reale | aperto, vedi sezione 3 |

Rischio residuo noto nella 1.0.0 e nella 1.1.0: il modello poteva chiamare l'anteprima e poi confermare da solo. Chiuso nella 1.2.0 con la conferma umana fuori banda (sezione 4).

## 3. Da verificare sugli account reali

| Verifica | Dove | Stato |
|---|---|---|
| I quattro esempi della definizione di finito ("fatture di ottobre 2026", "rate scadute e non pagate", "dettaglio della fattura 33/2026", "situazione dell'anno") | account reale, token in sola lettura, `npm run test:integration` con `FIC_IT_READONLY=1` | superato il 17 ottobre 2026 (8 test, ogni richiesta non GET bloccata in rete) |
| `fields=` restituisce `payments_list`, `ei_status`, `locked` negli elenchi; sintassi delle date in `q`; operatore `contains` | account reale, sola lettura | verificato: rate e stato SDI presenti negli elenchi, filtro per date funzionante |
| Host e redirect dei link ai PDF (oggi ammessi solo `*.fattureincloud.it`, senza redirect) | account reale, sola lettura | verificato: host `compute.fattureincloud.it`, risposta diretta `application/pdf`, nessun redirect |
| PUT parziale con la sola `payments_list`: le altre rate e il resto del documento restano invariati | account Trial | in attesa dell'account |
| Creazione, duplicazione, conversione, cancellazione | account Trial | in attesa dell'account |
| `sendEInvoice` con `dry_run` | dalla 1.2.0 non serve più: l'anteprima usa solo `verifyEInvoiceXml` | chiuso |
| Conferma via elicitation in Claude Desktop (casella "Confermo") | Mac di Marco, modalità `write`, una scrittura innocua | da verificare |
| Finestra di conferma macOS (osascript) avviata dal server dentro Claude Desktop, se il client non dichiara l'elicitation | Mac di Marco, `FIC_CONFIRM_METHOD=dialog` | da verificare |
| `fic_update_issued_document` con `ei_payment_method`: i dati SDI reinviati senza `bank_*` non creano problemi all'XML (le coordinate arrivano dal metodo di pagamento) | account Trial | da verificare |
| Installazione del `.mcpb` in Claude Desktop su macOS | Mac di Marco | fatta il 17 ottobre 2026: installazione e uso in sola lettura funzionanti |

## 4. Revisione di sicurezza della 1.2.0

Stato al 23 ottobre 2026. Una revisione sull'uso con l'account reale ha trovato dodici difetti; l'account era già stato bloccato una volta da Fatture in Cloud per "tentativo di inserimento di un IBAN non autorizzato" da una fattura creata via API.

| # | Rilievo | Risoluzione |
|---|---|---|
| 1 | Il token di conferma tornava al modello, che poteva fare anteprima e conferma da solo (un test lo dava per atteso) | conferma umana fuori banda a ogni esecuzione: elicitation MCP (era 2025 ed era 2026-07-28), finestra macOS in mancanza, altrimenti rifiuto; il token lega solo l'anteprima al corpo. Il test di autoconferma è sostituito da test che provano il rifiuto senza persona, l'esecuzione unica dopo il sì, il rifiuto, il corpo cambiato |
| 2 | In `write` quasi tutte le scritture partivano subito (`dry_run` false di default, rate, anagrafiche, `fic_api_write` su documenti, F24, prima nota, cestino); `fic_delete` sempre attivo | `dry_run` vale `true` per documenti, rate e anagrafiche; tutte le scritture passano da anteprima, token e conferma umana; `fic_api_write` rifiuta documenti emessi, recupero dal cestino, conti e metodi di pagamento; `fic_delete` solo con `FIC_ENABLE_DELETE=true` |
| 3 | IBAN riconosciuto solo dal nome del campo, con conferma aggirabile | controllo nel client HTTP su ogni corpo in uscita: chiavi bancarie (anche FatturaPA) e testi con la forma di un IBAN, con o senza spazi, di qualsiasi paese; sempre rifiutati |
| 4 | La duplicazione copiava `ei_data.bank_*` e `ei_raw`; la modifica reinviava tutto `ei_data` | coordinate tolte da `ei_data`, `ei_raw` non copiato, del metodo di pagamento solo l'`id`; lo stesso per la conversione |
| 5 | L'anteprima SDI chiamava il vero `sendEInvoice` con `dry_run` | anteprima solo con `verifyEInvoiceXml`; test che nessuna chiamata all'invio parta in anteprima |
| 6 | `FIC_EXTRA_TOOLS` poteva abilitare `fic_api_write` e `fic_delete` in `readonly` | elenco chiuso senza `fic_api_write`, `fic_delete` e invii, ignorato in `readonly`: di fatto non abilita più nulla |
| 7 | Sul 409 "già in esecuzione" il client ripeteva anche le creazioni | retry solo delle richieste ripetibili |
| 8 | Quote lette dagli header ma non usate, nessun limite lato client | secchiello di 300 richieste ogni 5 minuti per azienda; stop sotto 20 richieste rimaste nell'ora o nel mese; Retry-After invariato |
| 9 | Valori fino a 300 caratteri con spazi non delimitati se la chiave era "sicura"; XML grezzo non delimitato | formato atteso per ogni chiave sicura, altrimenti delimitato; testi e XML sempre delimitati |
| 10 | Riconciliazione: sezionali ("33/a") mai riconosciuti; una rata proposta come "medium" per due movimenti | numero con sezionale riconosciuto da "fattura 33", "33/2026", "33/a"; assegnazione globale per punteggio, una rata per un solo movimento |
| 11 | Importi espliciti delle rate inviati senza arrotondare | arrotondati al centesimo (metà per eccesso, in centesimi interi); rifiuto se la somma arrotondata non torna |
| 12 | Cartella dei download senza 0700, file mai puliti, allegati sempre `.pdf` | 0700 anche su cartella esistente, estensione dal tipo di contenuto, pulizia facoltativa all'avvio (`FIC_DOWNLOAD_RETENTION_DAYS`) dei soli file scritti dal server |

Rischio residuo: la conferma via elicitation si fida del client MCP, che mostra la richiesta e restituisce la risposta della persona. Se un client rispondesse da solo, la difesa cadrebbe: in quel caso `FIC_CONFIRM_METHOD=dialog` su macOS usa una finestra di sistema che nessun client controlla.
