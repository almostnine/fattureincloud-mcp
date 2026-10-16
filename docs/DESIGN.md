# Design

Documento di progettazione del server MCP per Fatture in Cloud (FIC). Le scelte poggiano sull'analisi in [ANALISI.md](ANALISI.md); dove una decisione dipende da una pagina di documentazione, la pagina è citata.

Stato: bozza per il punto di controllo 1 (16 ottobre 2026).

## 1. Linguaggio e packaging

### 1.1 Scelta: TypeScript su Node.js

| Requisito | TypeScript / Node | Python |
|---|---|---|
| Installazione con un clic in Claude Desktop su macOS | Claude Desktop include Node.js: "Included with Claude Desktop on macOS and Windows, so users need no separate runtime" (https://claude.com/docs/connectors/building/mcpb.md) | Python non è incluso; con `server.type: "python"` si usa il Python di sistema dell'utente |
| Nessun problema di versione del runtime | un solo file JavaScript senza moduli nativi gira su qualsiasi Node da 20 in su | le dipendenze compilate (pydantic, richiesto dall'SDK MCP) non si possono impacchettare in modo portabile: "Cannot portably bundle compiled dependencies (e.g., pydantic, which the MCP Python SDK requires)" (https://github.com/modelcontextprotocol/mcpb/blob/main/README.md). È esattamente il guasto del progetto di riferimento |
| Riga di comando su Linux | `npx -y @almostnine/fattureincloud-mcp@<versione>` con Node 20+ | `uvx`, comodo |
| Raccomandazione di Anthropic | "Node.js is strongly recommended" (https://claude.com/docs/connectors/building/mcpb.md); "We recommend implementing MCP servers in Node.js rather than Python to reduce installation friction" (README MCPB) | il tipo `uv` (manifest 0.4) esiste ma ha un solo esempio ufficiale, richiede rete alla prima installazione e la CLI `mcpb init` non lo propone |
| SDK FIC ufficiale | esiste (`@fattureincloud/fattureincloud-ts-sdk` 2.1.3), ma non lo usiamo (vedi sotto) | esiste (`fattureincloud-python-sdk` 2.1.5) |

Python sarebbe stato più comodo solo per l'SDK FIC. Ma l'SDK è generato dall'OpenAPI, e possiamo generare lo stesso i tipi senza portarci dietro il codice: perdiamo poco e guadagniamo un pacchetto che non si rompe.

### 1.2 Dipendenze

Runtime (solo due):
- `@modelcontextprotocol/server` (SDK TypeScript v2, linea stabile, implementa la spec MCP 2026-07-28; `serveStdio` serve sia i client che parlano la spec precedente sia quelli nuovi). Richiede Node 20+ e Zod v4. Fonte: https://github.com/modelcontextprotocol/typescript-sdk (README).
- `zod` v4 per gli schemi di input e output.

Niente SDK FIC a runtime: dipende da `axios` e `form-data`, è generato in modo generico e non ci dà controllo su retry, 403 di quota, paginazione ed errori. Al suo posto un client `fetch` nativo di circa 300 righe, tipizzato con i tipi generati dall'OpenAPI ufficiale (`openapi-typescript`, solo in sviluppo).

Sviluppo: `typescript`, `esbuild`, `vitest`, `@biomejs/biome` (lint e formattazione in un solo strumento), `openapi-typescript`, `ajv` (per validare le fixture contro gli schemi dell'OpenAPI), `@anthropic-ai/mcpb` (CLI di pacchettizzazione), `@modelcontextprotocol/inspector` (solo per le prove, richiede Node 22.19+).

Regole:
- versioni **esatte** in `package.json` e `package-lock.json` versionato; installazione con `npm ci`;
- si adotta una nuova versione di una dipendenza solo se pubblicata da almeno 14 giorni (difesa dagli attacchi alla catena di fornitura);
- `npm audit` in CI, build bloccata da vulnerabilità alte o critiche.

### 1.3 Pacchetti prodotti

Un solo artefatto, `dist/index.js` (bundle esbuild, target `node20`, formato ESM, nessun modulo nativo), distribuito in due forme:

1. **`.mcpb` per Claude Desktop**
   - `manifest_version: "0.3"`, `server.type: "node"`, `entry_point: "dist/index.js"`.
   - `mcp_config`: `node ${__dirname}/dist/index.js`, con le variabili d'ambiente prese da `user_config`.
   - Il bundle contiene `manifest.json`, `dist/index.js`, `icon.png`, `README.md`, `LICENSE`, `NOTICE`. Nessuna cartella `node_modules`.
   - `compatibility.runtimes.node` **non** viene dichiarato (o al massimo `>=20`). Se il vincolo non è soddisfatto dal Node integrato, Claude Desktop passa al Node di sistema dell'utente, cioè proprio al disallineamento che vogliamo evitare (verifica locale sul bundle di Claude Desktop 2.42304.0, riportata in ANALISI.md).
   - `user_config`:
     - `fic_access_token` (string, `sensitive: true`, obbligatorio, conservato nel portachiavi di macOS);
     - `fic_company_id` (number, facoltativo);
     - `fic_mode` (string, default `readonly`, validato all'avvio);
     - `fic_default_payment_account_id` (number, facoltativo).
   - `privacy_policies`: la privacy policy del progetto (sezione nel README) e quella di Fatture in Cloud.
   - Firma del `.mcpb` con `mcpb sign`: facoltativa, da decidere al rilascio.
2. **Pacchetto npm `@almostnine/fattureincloud-mcp`** con `bin: fattureincloud-mcp`, per Linux e per configurazioni manuali. Il nome senza scope `fattureincloud-mcp` su npm è già occupato da un altro progetto.

La directory dei connettori di Anthropic non accetta più MCPB ("the directory no longer accepts MCPB submissions", https://claude.com/docs/connectors/building/mcpb.md): il `.mcpb` si distribuisce dalle release GitHub. Il registro MCP accetta sia il pacchetto npm sia il `.mcpb` da GitHub Releases (`registryType: "mcpb"` con `fileSha256`), quindi un solo `server.json` può elencarli entrambi (https://modelcontextprotocol.io/registry/package-types.md).

Nome e marchio: "Fatture in Cloud" è un marchio di TeamSystem. Nome visualizzato "Fatture in Cloud MCP (non ufficiale)" e avviso di non affiliazione nel README.

## 2. Architettura

### 2.1 Strati

```
Claude Desktop / Hermes Agent
        │  stdio (JSON-RPC)
        ▼
server.ts ── registra i tool ammessi dalla modalità (readonly / write / full)
        │
tools/*  ── schema di input (zod), annotation, descrizione IT+EN, formattazione dell'output
        │
domain/* ── logica di dominio: rate e stato di pagamento, situazione, duplicazione, conversione
        │
api/*    ── client HTTP: autenticazione, retry, quote, paginazione, mappatura degli errori
        │  HTTPS
        ▼
api-v2.fattureincloud.it
```

Trasversali: `config` (variabili d'ambiente validate all'avvio), `log` (solo stderr, con redazione), `safety` (modalità, conferme, testi non fidati), `cache`.

### 2.2 Moduli

```
src/
  index.ts                 avvio: legge la config, crea il server, collega il trasporto stdio
  cli.ts                   comandi: avvio (default), --version, check (verifica token e azienda), cache clear
  config.ts                variabili d'ambiente, validazione, valori di default sicuri
  log.ts                   logger su stderr, livelli, redazione di token e dati personali
  server.ts                creazione del server MCP e registrazione filtrata per modalità
  api/
    client.ts              fetch nativo, Bearer token, timeout, retry, quote
    paginate.ts            lettura di tutte le pagine con tetto massimo esplicito
    errors.ts              errori tipizzati e messaggi per il modello (cosa è successo, cosa fare)
    catalog.generated.ts   catalogo di tutte le operazioni OpenAPI (generato, versionato nel repo)
    scopes.ts              scope richiesto per operazione (dichiarato nella spec o verificato a mano)
    types.generated.ts     tipi TypeScript generati dall'OpenAPI ufficiale
  domain/
    documents.ts           proiezioni compatte dei documenti, ricerca per numero
    installments.ts        rate: stato, scadute, segna pagata o non pagata
    situation.ts           fatturato, incassato, da incassare, scaduto, costi
    duplicate.ts           duplicazione corretta (campi da togliere, copiare, rigenerare)
    reconcile.ts           abbinamento tra movimenti bancari e rate aperte
    money.ts, dates.ts     importi in centesimi interi, date ISO, fuso Europe/Rome
  safety/
    mode.ts                modalità e classe di effetto di ogni operazione
    confirm.ts             anteprima e token di conferma legato ai parametri
    untrusted.ts           sanificazione e delimitazione dei testi liberi
    recipients.ts          destinatari email ammessi
  cache/
    store.ts               cache in memoria (default) e su disco (solo su scelta), TTL, svuotamento
  tools/
    define.ts              helper unico per definire un tool (nome, titolo, schema, annotation, modalità minima)
    account.ts, issued-documents.ts, installments.ts, entities.ts, situation.ts,
    received-documents.ts, cashbook.ts, reference-data.ts, einvoice.ts, files.ts,
    reconcile.ts, send.ts, delete.ts, generic.ts, cache.ts
scripts/
  gen-catalog.ts           OpenAPI -> catalog.generated.ts + types.generated.ts + docs/COVERAGE.md
  build-mcpb.sh            bundle, manifest, pack, verifica
tests/
  unit/, tools/, contract/, fixtures/ (JSON inventati), integration/ (disattivati di default)
```

### 2.3 Client API

- **Un solo host**: `https://api-v2.fattureincloud.it`, fisso nel codice. Nessuna variabile d'ambiente per cambiarlo: un URL configurabile sarebbe un modo per far uscire il token. I test iniettano un `fetch` finto nel costruttore.
- **Autenticazione**: header `Authorization: Bearer <token>`. Il token arriva solo da variabile d'ambiente (in Claude Desktop: campo `sensitive` di `user_config`, conservato nel portachiavi).
- **Timeout** di 30 secondi per richiesta.
- **Retry** (solo dove la documentazione lo consente, vedi ANALISI.md, sezione 3):
  - 429 (limite di 300 richieste ogni 5 minuti per azienda) e 403 di quota esaurita (riconosciuto da `Retry-After` e dal messaggio d'errore, non dallo stato): attende `Retry-After` se è entro un tetto (60 s), altrimenti restituisce subito al modello un errore con il tempo di attesa. Vale per ogni metodo, perché la richiesta rifiutata non è stata eseguita.
  - 409 "già in esecuzione" (concorrenza): al massimo 2 nuovi tentativi dopo qualche secondo.
  - 5xx ed errori di rete: backoff esponenziale con jitter, massimo 3 tentativi, **solo per GET, PUT e DELETE**. Una POST di creazione non si ripete mai in automatico: rischierebbe di creare un duplicato.
  - Mai su 401, 403 di permessi o di licenza, 404, 422.
- **Quote**: legge gli header `RateLimit-HourlyRemaining` e `RateLimit-MonthlyRemaining` e li espone in `fic_account_info`; sotto una soglia avvisa il modello nel risultato.
- **Concorrenza**: richieste in serie, una alla volta. Il limite di 300 richieste ogni 5 minuti è condiviso con tutte le altre app collegate all'azienda, quindi il server non va in parallelo.
- **Validazione all'avvio**: `GET /user/companies` verifica token e `company_id` (un `company_id` sbagliato produce 401, non 404) e legge il piano dell'azienda (`fic_plan`).
- **Paginazione**: `per_page=100` sempre esplicito (il default è 5 nella spec e 50 nella documentazione), iterazione fino a `last_page` con un tetto configurabile (`FIC_MAX_PAGES`, default 20, cioè 2.000 elementi). Se il tetto scatta, il risultato lo dice (`truncated: true`).
- **Campi**: nelle liste si chiedono con `fields=` solo i campi necessari. Il fieldset `basic` non contiene `payments_list`, `ei_status` e `locked`: per rate e stato SDI si chiedono quei campi in modo esplicito, non l'intero `detailed`.
- **Filtri lato server**: `q` e `sort` dell'API, mai filtri applicati in locale dopo aver letto una sola pagina. Gli apici nei valori di `q` (ragioni sociali come "L'Officina") vanno gestiti: l'escape non è documentato e va verificato.
- **Input dal modello**: i testi destinati a FIC vengono ripuliti dai caratteri che l'API non accetta (per esempio le emoji, che possono causare 500).
- **Errori**: ogni risposta non 2xx diventa un `FicApiError` con stato, codice FIC, messaggio sanificato e operazione. Il parser accetta i due formati d'errore documentati (stile OAuth e `error.{message, code, validation_result}`, più `extra.totals`). La traduzione per il modello avviene in un solo punto (`errors.ts`).

### 2.4 Catalogo delle operazioni

Lo script `gen-catalog.ts` legge l'OpenAPI ufficiale (versione bloccata, oggi 2.1.8) e genera:

- `catalog.generated.ts`: per ognuna delle 123 operazioni metodo, percorso, parametri (con enum e obbligatorietà), schema del corpo, scope, **classe di effetto** (lettura, scrittura, cancellazione, cancellazione definitiva, invio, scrittura verso terzi);
- `types.generated.ts`: i tipi delle richieste e delle risposte;
- `docs/COVERAGE.md`: la tabella operazione, tool che la espone, test sì o no.

La classe di effetto non coincide con il metodo HTTP: le quattro operazioni `.../totals` sono POST ma calcolano soltanto; `transform` e `join` sono GET e restituiscono una bozza senza crearla. La classificazione è nel catalogo, rivista a mano e coperta da test. Gli scope della spec sono incompleti: dove mancano, `scopes.ts` riporta lo scope dedotto e lo segna come tale.

## 3. Design dei tool

### 3.1 Il problema

L'API ha 123 operazioni. Un tool per operazione darebbe al modello 123 descrizioni da leggere a ogni turno: costoso e fonte di scelte sbagliate ("Too many tools or overlapping tools can also distract agents", https://www.anthropic.com/engineering/writing-tools-for-agents). Pochi tool generici con un parametro `action` sono compatti, ma mescolano letture e scritture nello stesso tool: le annotation non possono più essere vere, la modalità `readonly` non può nascondere le scritture, e i criteri di revisione di Anthropic lo vietano esplicitamente (un tool unico che mescola GET e POST/PUT/DELETE va separato, https://claude.com/docs/connectors/building/review-criteria.md).

### 3.2 La scelta: tre livelli

1. **Tool curati per i flussi di lavoro reali** (fatture, rate, incassi, clienti, situazione, documenti ricevuti, prima nota, creazione, invio). Nomi chiari con prefisso `fic_`, descrizioni con esempi, output compatti, logica di dominio dove serve (per esempio le rate scadute di tutte le fatture in una chiamata sola).
2. **Separazione per effetto**: nessun tool mescola lettura e scrittura. Così ogni tool ha annotation esatte e la modalità decide quali tool esistono.
3. **Tool generici di riserva**, guidati dal catalogo, per il resto dell'API (prodotti, corrispettivi, F24, archivio, impostazioni, cestino, webhook, listini): `fic_api_catalog` per scoprire le operazioni, `fic_api_read` per eseguire quelle di lettura, `fic_api_write` per quelle di scrittura. Accettano solo `operationId` presenti nel catalogo, validano i parametri e applicano le stesse regole di modalità e conferma dei tool curati. Le descrizioni citano l'API di destinazione con il link alla reference, come chiedono i criteri di Anthropic per i tool che accettano percorsi o query libere.

Risultato: copertura del 100% delle operazioni con 17 tool in sola lettura, 26 in scrittura, 28 in modalità completa.

### 3.3 Elenco dei tool

Annotation: R = `readOnlyHint`, D = `destructiveHint`, I = `idempotentHint`, O = `openWorldHint`. Tutti i tool dichiarano `title`, `readOnlyHint` e `destructiveHint` in modo esplicito (requisito dei connettori Anthropic, https://claude.com/docs/connectors/building/submission.md).

**Modalità `readonly` (default)**

| Tool | Cosa fa | Operazioni | R | D | I | O |
|---|---|---|---|---|---|---|
| `fic_account_info` | utente, aziende accessibili, azienda attiva e piano, uso del piano, quote residue, modalità attiva | getUserInfo, listUserCompanies, getCompanyInfo, getCompanyPlanUsage | sì | no | sì | no |
| `fic_list_issued_documents` | elenco documenti emessi (fatture, note di credito, proforma, preventivi, ordini, DDT, ricevute, rapportini, autofatture) con filtri per data, cliente, numero, sezionale, stato di pagamento, stato SDI; paginazione o lettura completa | listIssuedDocuments | sì | no | sì | no |
| `fic_get_issued_document` | dettaglio per ID o per numero e anno ("33/2026"): righe, totali, rate con stato e conto di saldo, stato SDI, bloccato sì o no, link temporaneo al PDF | getIssuedDocument, getExistingIssuedDocumentTotals | sì | no | sì | no |
| `fic_list_installments` | rate di tutti i documenti filtrate per stato (non pagate, scadute, pagate), scadenza, data di pagamento, cliente; totali e raggruppamento per cliente. Base per solleciti e riconciliazione | listIssuedDocuments | sì | no | sì | no |
| `fic_get_einvoice` | stato SDI con spiegazione, motivo dello scarto, verifica dell'XML | getEInvoiceRejectionReason, verifyEInvoiceXml | sì | no | sì | no |
| `fic_download_file` | salva su disco PDF, XML SDI, allegato o DDT di un documento e restituisce il percorso | getIssuedDocument, getEInvoiceXml | no | no | sì | no |
| `fic_search_entities` | ricerca clienti o fornitori per nome, P.IVA, codice fiscale, email, codice | listClients, listSuppliers | sì | no | sì | no |
| `fic_get_entity` | dettaglio cliente o fornitore, con riepilogo facoltativo di documenti e rate aperte | getClient, getSupplier, getClientInfo | sì | no | sì | no |
| `fic_situation` | fatturato, incassato, da incassare, scaduto, costi; per anno o intervallo, con dettaglio mensile facoltativo; legge tutte le pagine | listIssuedDocuments, listReceivedDocuments | sì | no | sì | no |
| `fic_list_received_documents` | spese e documenti passivi, anche e-fatture ricevute in attesa di registrazione | listReceivedDocuments, listPendingReceivedDocuments | sì | no | sì | no |
| `fic_get_received_document` | dettaglio documento ricevuto o in attesa | getReceivedDocument, getPendingReceivedDocument | sì | no | sì | no |
| `fic_list_cashbook` | movimenti di prima nota per periodo e conto | listCashbookEntries, getCashbookEntry | sì | no | sì | no |
| `fic_reference_data` | elenchi di supporto: conti di saldo, metodi di pagamento, aliquote IVA, centri di costo e ricavo, categorie, valute, paesi, lingue, unità di misura, modelli, causali DDT, comuni, listini | operazioni `info/*` e liste di impostazioni | sì | no | sì | no |
| `fic_reconcile` | confronta movimenti bancari forniti dall'utente (data, importo, causale) con le rate aperte e propone abbinamenti con un grado di confidenza; non modifica nulla | listIssuedDocuments | sì | no | sì | no |
| `fic_api_catalog` | cerca nel catalogo delle operazioni: parametri, scope, modalità richiesta, tool curato che la copre | nessuna (catalogo locale) | sì | no | sì | no |
| `fic_api_read` | esegue qualsiasi operazione di lettura del catalogo (anche i POST di solo calcolo) | tutte le letture | sì | no | sì | no |
| `fic_clear_cache` | svuota la cache locale | nessuna | no | no | sì | no |

**Modalità `write` (si aggiungono)**

| Tool | Cosa fa | R | D | I | O |
|---|---|---|---|---|---|
| `fic_set_installment_status` | segna una rata pagata (conto di saldo esplicito o di default, data di pagamento) o non pagata, senza toccare il resto del documento | no | sì | sì | no |
| `fic_create_entity` | crea cliente o fornitore | no | no | no | no |
| `fic_update_entity` | modifica parziale di cliente o fornitore | no | sì | sì | no |
| `fic_create_issued_document` | crea fattura, nota di credito, proforma, preventivo, ordine, DDT...; `dry_run` calcola i totali con l'endpoint dell'API senza creare | no | no | no | no |
| `fic_update_issued_document` | modifica parziale; preserva rate e stato di pagamento; rifiuta i documenti bloccati | no | sì | sì | no |
| `fic_convert_issued_document` | conversione con l'endpoint `transform` (proforma in fattura, preventivo in ordine o fattura...), con o senza copia dell'originale | no | sì | no | no |
| `fic_duplicate_issued_document` | duplica un documento copiando i campi scrivibili e rigenerando numero, date, rate e campi SDI | no | no | no | no |
| `fic_delete` | cancella documenti, anagrafiche, prodotti, movimenti, F24, allegati, impostazioni; richiede conferma | no | sì | sì | no |
| `fic_api_write` | esegue le altre operazioni di scrittura del catalogo; invii esclusi, webhook solo in modalità `full` con conferma | no | sì | no | sì |

**Modalità `full` (si aggiungono)**

| Tool | Cosa fa | R | D | I | O |
|---|---|---|---|---|---|
| `fic_send_einvoice` | invio allo SDI; senza conferma restituisce l'anteprima e l'esito della prova di invio (`options.dry_run` dell'API) | no | sì | no | sì |
| `fic_send_email` | invio del documento per email; senza conferma restituisce l'anteprima con mittente, destinatari, oggetto e testo | no | sì | no | sì |

Note sulle annotation:
- `destructiveHint`: per la spec MCP `false` significa "solo aggiunte" (https://modelcontextprotocol.io/specification/2026-07-28/server/tools.md). Ogni tool che sovrascrive dati esistenti è quindi `true`, anche se l'effetto è reversibile (segnare una rata pagata, aggiornare un cliente). Le creazioni sono `false`. Nei criteri di Anthropic `destructiveHint: true` fa sempre chiedere conferma all'utente, mentre i tool in sola lettura possono girare senza conferma per chiamata (https://claude.com/docs/connectors/building/review-criteria.md): è il comportamento che vogliamo.
- `openWorldHint`: `false` quando il tool lavora solo dentro l'account FIC (un dominio chiuso), `true` quando i dati escono verso terzi (SDI, destinatari email, URL dei webhook).
- `fic_download_file` scrive un file in locale: non è in sola lettura rispetto all'ambiente, ma è additivo e non tocca FIC. È ammesso in `readonly`.
- `fic_clear_cache` cancella solo dati rigenerabili: `destructiveHint: false`.

### 3.4 Modalità

| Modalità | Tool registrati | Scope consigliati per il token |
|---|---|---|
| `readonly` (default) | solo lettura | solo `:r` |
| `write` | lettura + scrittura, cancellazioni con conferma | `:r` e `:a` sulle risorse da modificare |
| `full` | tutto, compresi invio SDI, email e webhook | come `write` (lo scope per l'invio SDI non è documentato: `issued_documents.invoices:a` è il candidato da verificare) |

- Valore mancante o non riconosciuto di `FIC_MODE`: si parte in `readonly` e si scrive un avviso su stderr. Mai il contrario.
- Doppio controllo: i tool non ammessi non vengono registrati, e ogni handler verifica di nuovo la modalità prima di chiamare l'API. I tool generici controllano la classe di effetto della singola operazione.
- La modalità del server non sostituisce gli scope del token: con un token `:r` anche la modalità `full` fallisce sulle scritture, con un messaggio che spiega quale scope manca.

### 3.5 Conferma delle azioni irreversibili

Si applica a: invio SDI, invio email, cancellazioni, operazioni sui webhook.

1. Il tool chiamato **senza** `confirm` non esegue nulla: restituisce un'anteprima (documento, cliente, importo, destinatari, esito della verifica XML o della prova di invio, recuperabile dal cestino sì o no) e un token del tipo `SDI-12345-7f3a9c`.
2. Il token contiene l'ID del documento ed è un HMAC, con un segreto casuale generato all'avvio del processo, di azione, ID, `updated_at` del documento e parametri. Scade dopo 10 minuti. Il modello non può fabbricarlo.
3. Il tool chiamato **con** `confirm` ricalcola il token: se il documento è cambiato, se i parametri sono diversi (per esempio un altro destinatario email) o se il token è scaduto, rifiuta e chiede una nuova anteprima.
4. Le descrizioni dei tool chiedono al modello di mostrare l'anteprima all'utente e di attendere un sì esplicito prima di usare il token.

Il token non sostituisce l'utente: garantisce che l'azione eseguita sia esattamente quella mostrata in anteprima. L'approvazione umana resta affidata a Claude Desktop, che chiede il permesso per i tool con `destructiveHint: true`; nel README si sconsiglia "consenti sempre" per i tool di invio e di cancellazione.

Difese aggiuntive contro l'esfiltrazione:
- **email**: destinatari ammessi solo tra gli indirizzi del cliente in anagrafica (`email`, `certified_email`) e quelli che FIC propone per il documento, più un elenco esplicito facoltativo (`FIC_EMAIL_ALLOWED_RECIPIENTS`). Un indirizzo diverso viene rifiutato anche con conferma valida. È la difesa contro un'istruzione nascosta in una fattura passiva che chiede di mandare documenti altrove;
- **webhook**: creazione, modifica e verifica solo in modalità `full` e con conferma, perché fanno arrivare notifiche dell'azienda a un URL esterno;
- **conto di saldo**: quando si segna una rata pagata il conto va indicato o configurato come default; il server non sceglie mai "il primo della lista".

### 3.6 Elicitation

La spec 2026-07-28 consente al server di chiedere una conferma direttamente all'utente (`input_required`), ma il supporto in Claude Desktop non è documentato (ANALISI.md, sezione 4). Prima versione: conferma con token più `destructiveHint`. Se il client dichiara il supporto, la richiesta di conferma diretta si aggiunge come livello in più, mai come unica difesa.

## 4. Formato degli output

- Ogni tool curato dichiara un `outputSchema` e restituisce `structuredContent`; il blocco di testo contiene lo stesso oggetto serializzato in JSON compatto, come chiede la specifica MCP per la compatibilità. Non è documentato quale dei due Claude Desktop passi al modello, quindi il testo è sempre completo.
- **Campi utili per primi**: identificativo, tipo, numero, data, controparte, importi, stato. L'anagrafica completa del cliente non si ripete dentro ogni documento di un elenco: bastano ID e nome.
- **Niente null e niente campi vuoti.**
- **Importi**: numeri in euro arrotondati al centesimo, con `currency` a livello di documento o di riepilogo. Le somme si fanno in centesimi interi. Totali e rate di un documento nuovo li calcola sempre l'API (endpoint `totals` o `options.fix_payments`), mai il server.
- **Date**: `YYYY-MM-DD`. "Oggi" e "scaduto" si calcolano nel fuso `Europe/Rome`.
- **Elenchi**: `{ items, page, per_page, total, has_more, next_page }`, oppure `{ items, total, pages_read, truncated }` per le letture complete.
- **Stati**: codici dell'API (`not_paid`, `paid`, `reversed`, i 14 stati SDI) più una breve spiegazione in italiano dove aiuta.
- **Testi liberi** provenienti da FIC (note, descrizioni delle righe, oggetto, nomi, corpo email, testi dei documenti ricevuti da fornitori): sanificati (caratteri di controllo e invisibili rimossi, lunghezza limitata) e racchiusi in delimitatori espliciti; quando presenti, il risultato include l'avviso che sono dati inseriti da terzi e non istruzioni.
- **PDF**: l'URL temporaneo di FIC scade dopo 7 giorni e chiunque lo possieda può scaricare il documento. Il dettaglio lo restituisce con l'avviso; `fic_download_file` permette di salvare il file in locale invece di far girare il link.
- **Dimensione**: risultato massimo di circa 150.000 caratteri in Claude Desktop (https://claude.com/docs/connectors/building/index.md). Le liste hanno default prudenti e il risultato segnala quando qualcosa è stato tagliato.
- **Dettaglio regolabile**: i tool di elenco accettano `detail: "compact" | "full"`; il default è `compact`.

## 5. Configurazione

| Variabile | Default | Note |
|---|---|---|
| `FIC_ACCESS_TOKEN` | obbligatoria | token personale; mai nei log |
| `FIC_COMPANY_ID` | facoltativa | se manca e il token vede una sola azienda, si usa quella; se ne vede più di una, l'errore elenca le aziende disponibili |
| `FIC_MODE` | `readonly` | `readonly`, `write`, `full` |
| `FIC_DEFAULT_PAYMENT_ACCOUNT_ID` | facoltativa | conto di saldo usato quando si segna una rata pagata senza indicarlo |
| `FIC_EMAIL_ALLOWED_RECIPIENTS` | vuota | indirizzi email extra ammessi per l'invio, separati da virgola |
| `FIC_DOWNLOAD_DIR` | `~/Downloads/fattureincloud-mcp` | cartella per `fic_download_file` |
| `FIC_CACHE` | `memory` | `memory`, `disk`, `off` |
| `FIC_CACHE_TTL_SECONDS` | `86400` | solo per i dati di riferimento |
| `FIC_MAX_PAGES` | `20` | tetto delle letture multipagina |
| `FIC_LOG_LEVEL` | `info` | `error`, `warn`, `info`, `debug` |

### Cache

- La policy d'uso dell'API vieta di mettere in cache dati utente senza consenso esplicito (https://developers.fattureincloud.it/docs/legal/policy-acceptable-use/). Quindi:
  - **default `memory`**: cache solo in memoria, per la durata del processo. Dati di riferimento con TTL configurabile; letture di documenti e anagrafiche con TTL breve (60 secondi), per non ripetere le stesse chiamate dentro una conversazione e risparmiare quota. Ogni scrittura invalida le voci collegate; gli errori non finiscono mai in cache;
  - **`disk` solo su scelta esplicita** dell'utente, e solo per dati di riferimento senza dati personali (aliquote IVA, metodi di pagamento, paesi, valute, lingue, unità di misura, modelli). Conti di saldo (contengono IBAN), documenti e anagrafiche non finiscono mai su disco;
  - gli URL temporanei di PDF e allegati non vengono mai messi in cache.
- Cartella su disco: `~/Library/Caches/fattureincloud-mcp` su macOS, `$XDG_CACHE_HOME/fattureincloud-mcp` su Linux. Permessi `0700` sulla cartella e `0600` sui file, verificati a ogni avvio; scrittura atomica (file temporaneo e rinomina); file scaduti cancellati.
- Chiave della cache: azienda + impronta del token, così cambiare token non mostra dati dell'altro.
- Svuotamento: tool `fic_clear_cache` e comando `fattureincloud-mcp cache clear`.

### Log

- Solo su stderr (stdout è riservato al protocollo). In Claude Desktop finiscono in `~/Library/Logs/Claude/mcp-server-<nome>.log`.
- Mai il token, mai corpi di risposta a livello `info`: solo operazione, stato, durata e quote residue. Il traceback va nei log a livello `debug` o `error`, mai al modello.
- Riga di audit per ogni scrittura e invio: operazione, ID del documento, esito.

## 6. Qualità e test

- **Statico**: `tsc --strict` senza errori, Biome per lint e formattazione.
- **Unitari** (`vitest`), con `fetch` finto e fixture JSON **inventate**:
  - client: paginazione, 429 con `Retry-After`, 403 di quota contro 403 di permessi, `NO_PERMISSION` con scope suggerito, 401, 409 di concorrenza, 422 con `validation_result` e `extra.totals`, POST mai ripetute;
  - dominio: stato delle rate, scadute nel fuso di Roma, situazione, duplicazione (whitelist dei campi), riconciliazione, importi in centesimi;
  - sicurezza: token di conferma (scadenza, parametri cambiati, documento cambiato), destinatari email, sanificazione dei testi, redazione dei log, permessi della cache.
- **Tool** via client MCP in memoria: per ogni modalità, l'elenco dei tool registrati è esattamente quello atteso (in `readonly` nessun tool di scrittura); annotation di ogni tool confrontate con una tabella attesa; ogni tool chiamato almeno una volta.
- **Contratto**: le fixture vengono validate contro gli schemi di risposta dell'OpenAPI (ajv), così restano realistiche anche se inventate.
- **Integrazione** (disattivati di default):
  - `FIC_IT_READONLY=1`: sola lettura sull'account reale con il token in sola lettura letto da `.env`; il server viene avviato in modalità `readonly` e il test verifica che nessuna operazione di scrittura sia raggiungibile;
  - `FIC_IT_TRIAL=1`: scritture sull'account di prova. Il test parte solo se `/user/companies` riporta per quell'azienda `fic_plan: "trial"` e l'ID coincide con `FIC_IT_TRIAL_COMPANY_ID`; altrimenti si ferma prima di qualsiasi scrittura. L'invio SDI, anche in prova (`dry_run`), non è disponibile sul piano Trial: si verifica solo l'anteprima e il rifiuto corretto.
- **MCP Inspector**: `npx @modelcontextprotocol/inspector --cli node dist/index.js --method tools/list --strict` in CI per ogni modalità; prova interattiva documentata in `docs/REVIEW.md`.
- **CI GitHub Actions**: lint, type check, test, `npm audit`, build del bundle e del `.mcpb`, controllo con Inspector. Dependabot non va attivato: il mirror dall'hub (`git push --mirror`) cancellerebbe i suoi branch. Gli aggiornamenti si fanno in locale.
- **Copertura dell'API**: `docs/COVERAGE.md` generato dal catalogo; un test fallisce se un'operazione del catalogo non è raggiungibile da nessun tool.
