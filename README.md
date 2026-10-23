# Fatture in Cloud MCP

Server [MCP](https://modelcontextprotocol.io) per [Fatture in Cloud](https://www.fattureincloud.it): porta in Claude fatture, rate, incassi, clienti e situazione economica, e copre 117 delle 123 operazioni dell'API v2 (conti di saldo, metodi di pagamento e recupero dal cestino restano, per sicurezza, solo nell'app web). Parte in **sola lettura**; scrittura e invio si attivano solo se lo scegli, e ogni scrittura chiede anteprima e una tua conferma esplicita, data fuori dalla chat.

[English below](#english)

> Progetto indipendente, **non ufficiale**: non è affiliato né approvato da TeamSystem o da Fatture in Cloud, marchi dei rispettivi titolari.

## Cosa puoi chiedere a Claude

- "Elenca le fatture di ottobre 2026"
- "Quali rate sono scadute e non pagate? Raggruppale per cliente"
- "Dettaglio della fattura 33/2026"
- "Situazione dell'anno, mese per mese"
- "Ecco i movimenti dell'estratto conto di settembre: quali bonifici corrispondono a rate aperte?"
- Con la modalità `write`: "segna pagata la seconda rata della fattura 33/2026, bonifico del 10 ottobre", "duplica la fattura 41 con data di oggi sostituendo settembre con ottobre", "converti la proforma 12 in fattura"
- Con la modalità `full` e `FIC_ENABLE_SEND=true`: "invia la fattura 35 allo SDI", "manda al cliente la copia di cortesia"

## Installazione

Serve Node.js 20 o superiore solo per l'uso da riga di comando: Claude Desktop ha già il suo.

### Claude Desktop (consigliato)

1. Scarica `fattureincloud-mcp-server-<versione>.mcpb` dalla pagina [Releases](https://github.com/almostnine/fattureincloud-mcp/releases).
2. Aprilo con un doppio clic (oppure Impostazioni > Estensioni > Impostazioni avanzate > Installa estensione).
3. Inserisci il token di Fatture in Cloud (vedi sotto). Il token viene salvato nel portachiavi del sistema.
4. Lascia la modalità su `readonly` finché non ti serve altro.

### Riga di comando (Linux, macOS, Windows)

```bash
FIC_ACCESS_TOKEN=... npx -y fattureincloud-mcp-server@1.3.0
```

Oppure dal codice sorgente:

```bash
git clone https://github.com/almostnine/fattureincloud-mcp.git
cd fattureincloud-mcp
npm ci --ignore-scripts && npm run build
FIC_ACCESS_TOKEN=... node dist/index.js
```

Verifica rapida della configurazione: `FIC_ACCESS_TOKEN=... node dist/index.js check`.

### Configurazione manuale di Claude Desktop o di un altro client MCP

```json
{
  "mcpServers": {
    "fattureincloud": {
      "command": "npx",
      "args": ["-y", "fattureincloud-mcp-server@1.3.0"],
      "env": {
        "FIC_ACCESS_TOKEN": "il-tuo-token",
        "FIC_MODE": "readonly"
      }
    }
  }
}
```

Il file di Claude Desktop è `~/Library/Application Support/Claude/claude_desktop_config.json` su macOS. Con questa configurazione il token sta in chiaro nel file: l'installazione `.mcpb` lo tiene invece nel portachiavi.

## Il token di Fatture in Cloud

Il server usa un **token personale** (autenticazione manuale, https://developers.fattureincloud.it/docs/authentication/manual-authentication/):

1. In Fatture in Cloud: **Impostazioni > Sviluppatore > Nuova app**. L'app nasce privata: aggiungi la tua email tra gli utenti autorizzati e annota il **Client ID**.
2. **Impostazioni > Applicazioni collegate > Collega una nuova applicazione**: incolla il Client ID, scegli l'azienda e i permessi (scope), poi copia l'**Access Token**.
3. Il token non scade, ma puoi revocarlo o cambiarne i permessi dalla stessa pagina.

### Permessi consigliati per modalità

| Modalità | Cosa può fare | Scope consigliati |
|---|---|---|
| `readonly` (default) | solo lettura | `:r` su `issued_documents.*` che usi (almeno `invoices` e `credit_notes`), `entity.clients`, `entity.suppliers`, `received_documents`, `cashbook`, `settings`, più `products`, `receipts`, `taxes`, `archive`, `emails` se ti servono |
| `write` | anche crea, modifica, segna rate pagate, ognuna con anteprima e conferma umana; cancella solo con `FIC_ENABLE_DELETE=true` | `:a` sulle risorse da modificare (per esempio `issued_documents.invoices:a`, `entity.clients:a`) |
| `full` | anche webhook e, solo con `FIC_ENABLE_SEND=true`, invio allo SDI ed email, con conferma | come `write`; l'invio SDI richiede un piano a pagamento con fatturazione elettronica attiva |

La modalità del server e i permessi del token sono due protezioni indipendenti: con un token `:r` nessuna scrittura passa, qualunque sia la modalità.

Attenzione: lo scope `issued_documents.invoices:a` serve per creare fatture e segnare le rate pagate, ma permette tecnicamente anche l'invio allo SDI. Fatture in Cloud non distingue i due permessi: il blocco degli invii è nel server (`FIC_ENABLE_SEND` spento di default).

### Come si conferma una scrittura

Dalla versione 1.2.0 nessuna scrittura parte senza il tuo sì, dato fuori dalla chat:

1. Claude chiama il tool e riceve solo un'**anteprima** (per i documenti, le rate e le anagrafiche `dry_run` vale `true` di default) con il testo esatto dell'operazione e un token.
2. Claude ti mostra l'anteprima. Se gli dici di procedere, richiama il tool con il token (e `dry_run: false`).
3. Il server ti chiede la conferma **direttamente**, su un canale che Claude non può usare:
   - in Claude Desktop con l'**elicitation** MCP: compare una richiesta con il testo dell'anteprima e la casella "Confermo", da spuntare e inviare;
   - se il client non supporta l'elicitation, su **macOS** si apre una finestra di sistema con il testo e i pulsanti "Annulla" (predefinito) e "Conferma", che si chiude da sola dopo 2 minuti senza fare nulla;
   - altrimenti la scrittura viene rifiutata.

Il token lega la conferma al corpo esatto mostrato nell'anteprima: se qualcosa cambia, serve una nuova anteprima. Con `FIC_CONFIRM_METHOD` scegli il canale (`auto`, `elicitation`, `dialog`).

**Coordinate bancarie**: il server non invia mai IBAN, banca o beneficiario a Fatture in Cloud. I documenti usano solo il metodo di pagamento configurato nell'account (`payment_method_id`); un IBAN in note, righe o altri campi viene rifiutato. Conti di saldo e metodi di pagamento si gestiscono solo dall'app web.

## Configurazione

| Variabile | Default | Descrizione |
|---|---|---|
| `FIC_ACCESS_TOKEN` | obbligatoria | token personale |
| `FIC_COMPANY_ID` | | necessario solo se il token vede più aziende |
| `FIC_MODE` | `readonly` | `readonly`, `write`, `full`; un valore non valido vale `readonly` |
| `FIC_CONFIRM_METHOD` | `auto` | conferma umana delle scritture: `auto` (elicitation se il client la supporta, altrimenti finestra di dialogo su macOS), `elicitation`, `dialog` |
| `FIC_ENABLE_DELETE` | `false` | `true` registra `fic_delete` (solo in `write` o `full`) |
| `FIC_ENABLE_SEND` | `false` | `true` registra `fic_send_einvoice` e `fic_send_email` (solo in `full`); senza, il server rifiuta ogni invio anche a livello HTTP |
| `FIC_EXTRA_TOOLS` | | dalla 1.2.0 senza effetto: in `readonly` non abilita più nessuna scrittura (resta solo un avviso nei log) |
| `FIC_DEFAULT_PAYMENT_ACCOUNT_ID` | | conto di saldo usato quando segni una rata pagata senza indicarlo |
| `FIC_EMAIL_ALLOWED_RECIPIENTS` | | indirizzi extra ammessi per le email, separati da virgola |
| `FIC_DOWNLOAD_DIR` | `~/Downloads/fattureincloud-mcp` | cartella (permessi 0700) dei file scaricati e, per gli allegati, di quelli da caricare |
| `FIC_DOWNLOAD_RETENTION_DAYS` | | se indicato (per esempio `30`), all'avvio cancella i file scaricati dal server più vecchi di tanti giorni; non tocca i file messi lì da te |
| `FIC_CACHE` | `memory` | `memory`, `disk` (solo dati di riferimento non personali), `off` |
| `FIC_CACHE_TTL_SECONDS` | `86400` | durata della cache dei dati di riferimento |
| `FIC_MAX_PAGES` | `20` | pagine massime (da 100 elementi) per le letture complete |
| `FIC_LOG_LEVEL` | `info` | `error`, `warn`, `info`, `debug` (solo su stderr) |

## Tool

**Sola lettura** (sempre disponibili)

| Tool | A cosa serve |
|---|---|
| `fic_account_info` | account, aziende, modalità, quote API residue |
| `fic_list_issued_documents` | fatture, note di credito, proforma, preventivi, ordini, DDT... con filtri e stato di pagamento |
| `fic_get_issued_document` | dettaglio per ID o per numero e anno, con rate e stato SDI |
| `fic_list_installments` | rate scadute, non pagate o pagate di tutti i documenti, riepilogo per cliente |
| `fic_get_einvoice` | stato SDI spiegato, motivo dello scarto, verifica dell'XML |
| `fic_download_file` | salva PDF, XML, DDT o allegato nella cartella locale |
| `fic_search_entities`, `fic_get_entity` | clienti e fornitori, con le rate aperte del cliente |
| `fic_situation` | fatturato, incassato, da incassare, scaduto, costi, mese per mese |
| `fic_list_received_documents`, `fic_get_received_document` | spese, fatture passive, e-fatture in attesa |
| `fic_list_cashbook` | prima nota |
| `fic_reference_data` | conti di saldo, metodi di pagamento, aliquote IVA, centri di costo e ricavo, valute, paesi... |
| `fic_reconcile` | abbina movimenti bancari e rate aperte, senza modificare nulla |
| `fic_api_catalog`, `fic_api_read` | ricerca ed esecuzione di qualsiasi lettura dell'API |
| `fic_clear_cache` | svuota la cache locale |

**Scrittura** (`FIC_MODE=write`, ognuno con anteprima e conferma umana)

| Tool | A cosa serve |
|---|---|
| `fic_set_installment_status` | segna una rata pagata (conto e data) o non pagata; sulle fatture già inviate allo SDI cambia solo le rate e rilegge il documento per verificare che non sia cambiato altro (se Fatture in Cloud non lo consente via API, si fa dal pannello) |
| `fic_create_entity`, `fic_update_entity` | crea o modifica clienti e fornitori |
| `fic_create_issued_document` | crea fatture e altri documenti, senza inviarli, con anteprima dei totali (`dry_run`, default `true`); rivalsa (`rivalsa`, `ei_cassa_type` come TC22) e avviso sul bollo sopra 77,47 euro nei documenti senza IVA |
| `fic_update_issued_document` | modifica un documento preservando le rate pagate |
| `fic_convert_issued_document` | proforma in fattura, preventivo in ordine... |
| `fic_duplicate_issued_document` | duplica con nuova data e sostituzioni di testo |
| `fic_delete` | cancella qualsiasi elemento, con anteprima e conferma; esiste solo con `FIC_ENABLE_DELETE=true` |
| `fic_api_write` | altre scritture dell'API (prodotti, corrispettivi, F24, archivio, prima nota, aliquote, allegati); mai documenti emessi, cancellazioni, recupero dal cestino, conti e metodi di pagamento |

**Invio** (`FIC_MODE=full` e `FIC_ENABLE_SEND=true`)

| Tool | A cosa serve |
|---|---|
| `fic_send_einvoice` | invio allo SDI, con verifica XML (l'anteprima non chiama mai l'invio) e conferma |
| `fic_send_email` | invio del documento per email ai soli indirizzi del cliente, con conferma |

L'elenco completo delle operazioni API e del tool che le espone è in [docs/COVERAGE.md](docs/COVERAGE.md).

## Sicurezza

- **Sola lettura di default**: in `readonly` i tool di scrittura e di invio non vengono registrati.
- **Ogni scrittura e ogni azione irreversibile** (documenti, rate, anagrafiche, scritture generiche, invio SDI, email, cancellazioni, webhook) parte da un'anteprima e si esegue solo dopo la tua **conferma fuori banda** (elicitation di Claude Desktop o finestra di macOS), che Claude non può dare al posto tuo. Il token dell'anteprima è legato al corpo esatto, vale una volta e scade dopo 10 minuti, ma da solo non basta.
- **Mai IBAN**: nessun corpo con coordinate bancarie esce dal server; i documenti usano solo il metodo di pagamento configurato.
- **Invii spenti di default**: `fic_send_einvoice` e `fic_send_email` esistono solo in `full` con `FIC_ENABLE_SEND=true`; senza, il client HTTP rifiuta qualsiasi invio allo SDI o per email, da qualunque tool.
- **Cancellazioni spente di default**: `fic_delete` esiste solo con `FIC_ENABLE_DELETE=true`.
- **In Claude Desktop non scegliere "consenti sempre"** per i tool di invio e di cancellazione: così l'ultima parola resta a te.
- **Email solo verso gli indirizzi del cliente** in anagrafica o configurati: difesa contro istruzioni nascoste nei documenti dei fornitori.
- **Testi da Fatture in Cloud delimitati** con ⟦ ⟧ e trattati come dati.
- **Nessuna telemetria**, un solo host contattato (`api-v2.fattureincloud.it`), token mai nei log, nessun dato personale nella cache su disco.

Dettagli in [SECURITY.md](SECURITY.md) e [PRIVACY.md](PRIVACY.md).

## Limiti noti

- L'API v2 non ha operazioni per il calendario (Scadenziario Plus) né per i movimenti di magazzino: il magazzino compare solo nei campi dei prodotti e nei documenti.
- L'invio allo SDI, anche in prova, funziona solo con un piano a pagamento.
- I webhook si possono gestire ma non ricevere: servirebbe un endpoint HTTPS pubblico.
- Limiti dell'API: 300 richieste ogni 5 minuti per azienda (condivise con le altre app collegate), 1.000 all'ora, 40.000 al mese. Il server lavora in serie, si limita da solo a 300 richieste ogni 5 minuti, si ferma quando restano meno di 20 richieste nell'ora o nel mese e lo dice quando legge dati parziali.
- Alcuni comportamenti dell'API non sono documentati e sono verificati sull'account di prova: lo stato è in [docs/REVIEW.md](docs/REVIEW.md).

## Sviluppo

```bash
npm ci --ignore-scripts
npm run check            # lint, type check, test
npm run build            # dist/index.js
npm run pack:mcpb        # pacchetto .mcpb
npm run coverage:doc     # rigenera docs/COVERAGE.md
npm run gen              # rigenera il catalogo dall'OpenAPI (serve reference/openapi-fattureincloud)
```

Test di integrazione, disattivati di default (leggono `.env`, mai committato):

- `FIC_IT_READONLY=1 npm run test:integration`: sola lettura sull'account reale; ogni richiesta che non sia GET viene bloccata in rete.
- `FIC_IT_TRIAL=1 FIC_IT_TRIAL_TOKEN=... FIC_IT_TRIAL_COMPANY_ID=... npm run test:integration`: scritture solo su un account Trial; il test si ferma se il piano dell'azienda non è `trial`.

Progettazione e analisi: [docs/ANALISI.md](docs/ANALISI.md), [docs/DESIGN.md](docs/DESIGN.md). Evoluzioni future (tra cui l'uso dall'app Claude sul telefono): [docs/ROADMAP.md](docs/ROADMAP.md).

## Ringraziamenti

Scritto da zero. Grazie a [aringad/fattureincloud-mcp](https://github.com/aringad/fattureincloud-mcp) di Mediaform s.c.r.l., studiato come spunto, e a Fatture in Cloud per l'[OpenAPI pubblica](https://github.com/fattureincloud/openapi-fattureincloud).

## Licenza

MIT

---

<a id="english"></a>

# Fatture in Cloud MCP (English)

An [MCP](https://modelcontextprotocol.io) server for [Fatture in Cloud](https://www.fattureincloud.it), the Italian invoicing platform. It brings invoices, installments, payments, clients and financial summaries into Claude and covers 117 of the 123 operations of the v2 API (payment accounts, payment methods and bin recovery are left to the web app on purpose). It starts **read-only**: write and send capabilities are opt-in, and every write requires a preview plus an out-of-band human confirmation.

> Independent, **unofficial** project, not affiliated with or endorsed by TeamSystem or Fatture in Cloud.

## Installation

- **Claude Desktop**: download the `.mcpb` from [Releases](https://github.com/almostnine/fattureincloud-mcp/releases), double-click it, paste your Fatture in Cloud token (stored in the OS keychain), keep the mode on `readonly`.
- **Command line** (Node.js 20+): `FIC_ACCESS_TOKEN=... npx -y fattureincloud-mcp-server@1.3.0`, or build from source with `npm ci --ignore-scripts && npm run build && node dist/index.js`.
- **Manual client config**: see the JSON example above (`command`, `args`, `env`).

## Token

Create a private app in Fatture in Cloud (**Settings > Developer > New app**, add your email to the allowed users), then **Settings > Connected applications > Connect a new application**, paste the Client ID, pick the company and the scopes, copy the access token. Recommended scopes: `:r` only for `readonly`; `:a` on the resources you want to change for `write`; the same for `full`, where SDI sending also requires a paid plan.

## Modes

| Mode | Tools | Notes |
|---|---|---|
| `readonly` (default) | 17 read tools | write and send tools are not registered at all |
| `write` | + 8 tools (+ `fic_delete` with `FIC_ENABLE_DELETE=true`) | create and update documents and contacts, mark installments paid |
| `full` | + 2 tools with `FIC_ENABLE_SEND=true` | SDI e-invoice sending and email (off by default) |

Every write is two-step: the tool first returns a preview (`dry_run` defaults to `true`) and a token; when called again with the token, the server asks **you** directly, through MCP elicitation in Claude Desktop or, if the client lacks it, a native macOS dialog ("Annulla" is the default button). The model cannot answer that prompt. Without a human channel the write is refused. Choose the channel with `FIC_CONFIRM_METHOD` (`auto`, `elicitation`, `dialog`).

Configuration variables, the tool list and known limitations are in the Italian section above; the full API coverage table is in [docs/COVERAGE.md](docs/COVERAGE.md).

## Security

Read-only by default; every write needs an out-of-band human confirmation, and the preview token (bound to the exact payload, single use, 10-minute expiry) is never enough on its own; the server never sends IBANs or other bank details (documents only reference the configured payment method); deletions are off unless `FIC_ENABLE_DELETE=true`; sending to SDI and by email is off unless `FIC_ENABLE_SEND=true`, blocked at the HTTP client too; email only to the client's own addresses; text coming from Fatture in Cloud is delimited and treated as data; no telemetry; one host only; the token never appears in logs. Do not pick "always allow" in Claude Desktop for send and delete tools. See [SECURITY.md](SECURITY.md) and [PRIVACY.md](PRIVACY.md).

## License

MIT. Written from scratch; thanks to [aringad/fattureincloud-mcp](https://github.com/aringad/fattureincloud-mcp) (Mediaform s.c.r.l.) for the inspiration.
