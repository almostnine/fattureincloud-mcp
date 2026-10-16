# Analisi

Analisi preliminare alla progettazione del server MCP per Fatture in Cloud (FIC). Fonti:

- il progetto di riferimento [aringad/fattureincloud-mcp](https://github.com/aringad/fattureincloud-mcp) v2.0.0 (licenza MIT, Mediaform s.c.r.l.), letto senza eseguirne il codice, storia git compresa;
- l'OpenAPI ufficiale [fattureincloud/openapi-fattureincloud](https://github.com/fattureincloud/openapi-fattureincloud), versione 2.1.8;
- la documentazione per sviluppatori di FIC (https://developers.fattureincloud.it), letta per intero il 16 ottobre 2026;
- la documentazione di MCP, MCPB e Claude Desktop.

Convenzioni: `server.py:N` indica una riga del progetto di riferimento. "Non documentato" significa che né la spec né la documentazione lo dicono: va verificato su un account di prova, mai sull'account reale.

## 1. Lezioni dal progetto di riferimento

Il progetto di riferimento ha 23 tool (11 di lettura, 10 di scrittura, 2 di invio) in un solo file `server.py` di circa 1.470 righe. È un buon catalogo di idee e un ottimo elenco di trappole.

### 1.1 Sicurezza

| Area | Cosa fa il riferimento | Cosa faremo |
|---|---|---|
| Token | letto da variabile d'ambiente e passato solo all'SDK; `sensitive: true` nel manifest. Nessuna validazione all'avvio: un `FIC_COMPANY_ID` non numerico fa morire il server in silenzio (`server.py:41-47`) | stesso principio, più validazione all'avvio con `GET /user/companies` e messaggi chiari |
| Host | oggi solo l'SDK; nella v1.7.2 una chiamata `urllib` mandava il token a `api.fattureincloud.it/v2/...`, host e percorso sbagliati | un solo host fisso nel codice, non configurabile |
| Errori | `traceback.format_exc()` restituito al modello per ogni eccezione (`server.py:1456-1457`), come risultato normale e non come errore; `except:` nudi che trasformano un 401 o un 429 in "cliente non trovato" (`server.py:79-80`) | errori tipizzati, `isError: true`, messaggio "cosa è successo, cosa fare", traceback solo su stderr |
| Log | nessun log, stdout pulito (bene), ma nessuna traccia delle azioni di scrittura; `docs/PRIVACY.md` dice il falso (log su stdout) | log su stderr con redazione e riga di audit per scritture e invii |
| Cache | `~/.fattureincloud-mcp/cache`: anagrafica completa dei clienti (P.IVA, indirizzi, IBAN) in chiaro, permessi di default (leggibili da altri utenti), file scaduti mai cancellati, invalidazione mai chiamata. Dopo `update_client` le fatture usano per 24 ore il vecchio codice SDI. Un errore API salva un elenco vuoto per 24 ore (`cache.py`, `server.py:107-125`) | cache in memoria di default, su disco solo per dati di riferimento senza dati personali e solo su scelta, 0700/0600, invalidazione sulle scritture, errori mai in cache |
| Annotation | `send_to_sdi` con `destructiveHint=False` (`server.py:492`); anche `send_email`, `update_document`, `update_client` dichiarati non distruttivi; il manifest non ha annotation benché il CHANGELOG dica il contrario | annotation esplicite e verificate da un test su ogni tool |
| Conferme | affidate al testo della descrizione ("IMPORTANTE: chiedere sempre conferma") | anteprima + token HMAC legato ai parametri + `destructiveHint` |
| Prompt injection | tutti i testi liberi (nomi, oggetti, righe, descrizioni dei documenti ricevuti) tornano al modello senza delimitazione. I documenti ricevuti arrivano dallo SDI, cioè da qualsiasi fornitore. Nello stesso server `send_email` accetta destinatario, oggetto e testo arbitrari e allega il PDF: c'è un canale per far uscire documenti | testi sanificati e delimitati, destinatari email limitati all'anagrafica, webhook solo in `full` con conferma |
| Dipendenze | solo versioni minime (`>=`), nessun lock, nessuna CI; `python-dotenv` dichiarato ma mai importato | versioni esatte, lock file, `npm audit` in CI |
| Input | quasi nessuna validazione: mese 13 accettato, febbraio sempre di 29 giorni, anno di default 2024 cablato | schemi zod con enum, formati e limiti |

### 1.2 Correttezza rispetto all'OpenAPI

- **IVA sbagliata ovunque**: ogni riga parte con `vat: {id: 0, value: X}` (`server.py:164,864,957,1059`). `value` è di sola lettura e FIC usa l'`id`, e `id: 0` è il 22%. Ogni aliquota diversa (forfettario, esenti, reverse charge, esteri) viene persa.
- **Totali calcolati a mano** in virgola mobile con `round()`. Non usa mai gli endpoint `totals` né `options.fix_payments`, e ignora sconti, ritenute, cassa, bollo e split payment. FIC rifiuta con 422 quando la somma delle rate non coincide col totale da pagare.
- **Solo la prima pagina**: `list_invoices`, `list_clients`, `list_received_documents` e `get_situation` leggono 100 elementi senza `sort` e filtrano in locale. Oltre 100 documenti i dati sono troncati senza avviso. L'issue #3 sulla paginazione è stata chiusa senza correzione.
- **Enum e campi errati**:
  - per i documenti ricevuti usa `credit_note` invece di `passive_credit_note`, e `number` invece di `invoice_number`;
  - collega le note di credito con `original_document`, un campo che non esiste;
  - `get_pdf_url` preferisce `attachment_url` a `url` e restituisce l'allegato invece del PDF;
  - la mappa degli stati SDI usa uno stato inesistente (`delivered`) e ne ignora sette;
  - il reinvio dopo `discarded` o `error`, cioè proprio i casi da correggere, è bloccato;
  - il campo `locked` non viene mai controllato.
- **`update_document` cancella i pagamenti**: qualsiasi modifica reinvia una sola rata `not_paid`, perdendo rate multiple, stato pagato e conto di saldo (`server.py:996-1001`). Sovrascrive anche `ei_data` (CIG, CUP) e forza `MP05`.
- **`get_situation`**: il "fatturato" è la somma delle rate, quindi al netto di ritenute e split payment, mentre il "margine" include l'IVA da entrambi i lati.
- **Proforma in fattura**: il documento viene ricostruito a mano e la proforma cancellata, senza atomicità. La spec offre `transformIssuedDocument`, che conserva il legame tra i documenti.

### 1.3 Il bug di `duplicate_invoice`

Causa principale (alta confidenza): la duplicazione ricostruisce le righe con `vat.id = 0` e calcola le rate in locale con l'aliquota originale. FIC ricalcola al 22% e la somma delle rate non torna più col totale da pagare (422). Lo stesso autore ha visto FIC rifiutare questo caso (commit `a9f7dd4`). Succede "solo con alcuni clienti" perché il regime IVA dipende dal cliente (esteri, esenti, reverse charge, PA in split payment) o dall'emittente (forfettario).

Cause secondarie: `.replace()` su campi `null` quando si usa `description_replace` (`server.py:1053-1064`); `type` forzato a `invoice` ed `e_invoice` a `true`; `numeration` non copiata.

Correzione (DESIGN.md, `domain/duplicate.ts`): partire dal documento sorgente letto per intero e copiare una **whitelist** di campi scrivibili (righe con `vat.id` originale, sconti, ritenute, cassa, split payment, sezionale, metodo di pagamento); togliere `id`, numero, importi di sola lettura, URL, stato SDI e ID di righe e rate; rigenerare date e scadenze mantenendo `payment_terms`; far calcolare i totali all'API (`totals` o `fix_payments`); applicare le sostituzioni di testo solo a stringhe non nulle.

### 1.4 Rate pagate e conti di saldo

La motivazione della rimozione nella 1.8.0 ("conto di saldo non recuperabile in modo affidabile via SDK") è sbagliata. La storia git mostra due errori di implementazione:
- nella 1.7.1 viene importata una classe SDK inesistente (`PaymentAccountsApi`);
- nella 1.7.2 il conto viene letto con una chiamata diretta a host e percorso sbagliati, quindi la lista risulta sempre vuota.

La 1.7.2 inoltre sceglieva da sola "il primo conto disponibile", registrando potenzialmente l'incasso sul conto sbagliato.

L'OpenAPI conferma che la funzione si può reintrodurre:
- `listPaymentAccounts`: `GET /c/{company_id}/info/payment_accounts`, non paginata, nessuno scope dichiarato;
- `IssuedDocumentPaymentsListItem`: `status` (`not_paid`, `paid`, `reversed`), `paid_date`, `payment_account`;
- si segna pagata con `PUT /c/{company_id}/issued_documents/{id}` (`modifyIssuedDocument`), rimandando la `payments_list` completa con la rata aggiornata e gli ID delle altre rate invariati.

Che serva un `payment_account.id` esistente con `status: paid` lo dice la guida alla creazione delle fatture (https://developers.fattureincloud.it/docs/guides/invoice-creation/), non la spec. Non sono documentati, e vanno verificati sull'account di prova:
- se una `payments_list` parziale sostituisce o si unisce alle rate esistenti;
- se il PUT accetta un corpo parziale;
- il comportamento su documenti bloccati;
- il significato di `reversed`.

### 1.5 Packaging

- Il `.mcpb` contiene librerie compilate per un solo Python (3.12), un solo sistema operativo e una sola architettura, ma il manifest promette darwin, linux e win32 con Python 3.10 o superiore. Si avvia col `python3` di sistema dell'utente.
- L'installazione da PyPI è rotta: lo script console chiama una funzione `async` che non viene mai eseguita, e il modulo indicato nel README non esiste.
- `server.json` è fermo alla 1.2.0.

### 1.6 Test

42 test, tutti con mock scritti a mano che confermano le assunzioni sbagliate (per esempio `"number"` per i documenti ricevuti, `vat.id: 0`). Non coprono importi, IVA, rate, duplicazione, invio SDI, paginazione, errori, annotation né l'avvio del server. Nessuna CI.

### 1.7 Da tenere e da evitare

Da tenere come idea:
- tool orientati al compito invece che uno per endpoint: crea fattura, crea nota di credito, converti proforma, duplica, situazione, controllo della numerazione;
- duplicazione con sostituzione di testo ("2025" in "2026") per le fatture ricorrenti;
- note di credito con importi positivi in input;
- codice SDI e PEC presi dall'anagrafica del cliente;
- controlli di stato prima di modificare, cancellare o inviare;
- messaggi con il passo successivo ("creata come bozza, per inviarla usa...");
- errori che elencano i valori ammessi;
- stati SDI spiegati in italiano;
- descrizioni in italiano e liste compatte.

Da evitare:
- monolite con client globali creati all'import;
- documenti ricostruiti a mano e IVA calcolata in locale;
- valori cablati (`vat.id: 0`, `MP05`, `0000000` come codice SDI universale);
- una sola pagina letta e filtri applicati in locale;
- traceback al modello ed errori non marcati come errori;
- cache in chiaro mai invalidata;
- annotation sbagliate, sicurezza affidata al solo testo;
- documentazione non allineata al codice.

## 2. Mappa dell'API Fatture in Cloud v2

### 2.1 Numeri

L'OpenAPI 2.1.8 ha **123 operazioni** in 17 gruppi: 66 GET, 26 POST, 13 PUT, 18 DELETE. Classificate per effetto reale (non per metodo HTTP):

| Effetto | Operazioni | Note |
|---|---|---|
| lettura | 70 | comprese le 4 POST `.../totals`, che calcolano soltanto, e `transform`/`join`, che restituiscono una bozza senza crearla |
| scrittura | 30 | creazioni, modifiche, caricamento allegati, recupero dal cestino |
| cancellazione | 16 | i documenti emessi e ricevuti cancellati finiscono nel cestino e si possono recuperare |
| cancellazione definitiva | 2 | svuotamento dal cestino di un documento emesso o ricevuto |
| invio | 2 | `sendEInvoice` (SDI), `scheduleEmail` (email) |
| scrittura verso terzi | 3 | creazione, modifica e verifica di una sottoscrizione webhook: fanno arrivare notifiche a un URL esterno |

### 2.2 Scope

Formato `risorsa:livello`, con `:r` sola lettura e `:a` lettura e scrittura (https://developers.fattureincloud.it/docs/basics/scopes/). Famiglie: `situation` (solo r), `entity.clients`, `entity.suppliers`, `products`, `stock`, `issued_documents.{invoices, credit_notes, quotes, proformas, receipts, delivery_notes, orders, work_reports, supplier_orders, self_invoices}`, `received_documents`, `receipts`, `calendar`, `archive`, `taxes`, `emails` (solo r), `cashbook`, `settings`.

- La sezione `security` della spec è incompleta: molte operazioni non dichiarano scope (invio e verifica SDI, totali, transform, join, allegati, cestino, webhook, conti di saldo in lettura) e `listIssuedDocuments` non elenca work_reports, supplier_orders e self_invoices. Nella tabella sotto gli scope non dichiarati sono **dedotti** dalla risorsa e marcati come tali; quello per l'invio SDI non è documentato da nessuna parte.
- I webhook non hanno uno scope proprio: serve la lettura sulle risorse degli eventi; un'app non abilitata riceve `NO_PERMISSION` (https://developers.fattureincloud.it/docs/webhooks/subscriptions/).
- Un sub-utente può ricevere 403 anche con gli scope giusti, se l'amministratore non gli ha dato il permesso.

### 2.3 Cosa l'API non ha

Il prompt chiede di coprire anche magazzino, calendario e situazione. Nell'API v2:

- **calendario**: esiste lo scope `calendar` (Scadenziario Plus) ma nessuna operazione;
- **magazzino**: esiste lo scope `stock` ma nessuna operazione dedicata. Il magazzino compare solo nei campi dei prodotti (`in_stock`, `stock_initial`, `stock_current`), nelle righe dei documenti e nei documenti ricevuti, più un evento webhook `products.stock_update`;
- **situazione**: esiste lo scope `situation:r` ma nessuna operazione. Fatturato, incassato e da incassare vanno calcolati dai documenti;
- **segnare pagata una rata**: nessun endpoint dedicato, si passa dalla modifica del documento;
- **duplicare un documento**: nessun endpoint;
- **annullare un invio SDI o email**: nessun endpoint.

Corrispondenze con i termini del prompt: corrispettivi = `receipts`; prima nota = `cashbook`; F24 = `taxes`; preventivi, ordini, DDT, ricevute e rapportini sono tipi di documento emesso.

### 2.4 Tabella delle operazioni

Priorità (colonna P) secondo l'ordine della Fase 3:
1. fatture emesse e note di credito;
2. pagamenti e conti di saldo;
3. clienti;
4. situazione e account;
5. documenti ricevuti, centri di costo e ricavo;
6. creazione documenti;
7. invio;
8. tutto il resto.

Le operazioni di priorità 8 sono comunque tutte raggiungibili (DESIGN.md, sezione 3). I percorsi sono relativi a `/c/{company_id}` salvo quelli sotto `/user` e `/info`. Nella colonna scope, `{tipo}` è il tipo di documento (per esempio `invoices`).

#### Archive

| Metodo | Percorso | operationId | Effetto | Scope | P |
|---|---|---|---|---|---|
| GET | `/archive` | `listArchiveDocuments` | lettura | `archive:r` | 8 |
| POST | `/archive` | `createArchiveDocument` | scrittura | `archive:a` | 8 |
| POST | `/archive/attachment` | `uploadArchiveDocumentAttachment` | scrittura | `archive:a` | 8 |
| DELETE | `/archive/{document_id}` | `deleteArchiveDocument` | cancellazione | `archive:a` | 8 |
| GET | `/archive/{document_id}` | `getArchiveDocument` | lettura | `archive:r` | 8 |
| PUT | `/archive/{document_id}` | `modifyArchiveDocument` | scrittura | `archive:a` | 8 |

#### Cashbook

| Metodo | Percorso | operationId | Effetto | Scope | P |
|---|---|---|---|---|---|
| GET | `/cashbook` | `listCashbookEntries` | lettura | `cashbook:r` | 2 |
| POST | `/cashbook` | `createCashbookEntry` | scrittura | `cashbook:a` | 8 |
| DELETE | `/cashbook/{document_id}` | `deleteCashbookEntry` | cancellazione | `cashbook:a` | 8 |
| GET | `/cashbook/{document_id}` | `getCashbookEntry` | lettura | `cashbook:r` | 2 |
| PUT | `/cashbook/{document_id}` | `modifyCashbookEntry` | scrittura | `cashbook:a` | 8 |

#### Clients

| Metodo | Percorso | operationId | Effetto | Scope | P |
|---|---|---|---|---|---|
| GET | `/entities/clients` | `listClients` | lettura | `entity.clients:r` | 3 |
| POST | `/entities/clients` | `createClient` | scrittura | `entity.clients:a` | 3 |
| GET | `/entities/clients/info` | `getClientInfo` | lettura | `entity.clients:r` | 3 |
| DELETE | `/entities/clients/{client_id}` | `deleteClient` | cancellazione | `entity.clients:a` | 8 |
| GET | `/entities/clients/{client_id}` | `getClient` | lettura | `entity.clients:r` | 3 |
| PUT | `/entities/clients/{client_id}` | `modifyClient` | scrittura | `entity.clients:a` | 3 |

#### Companies

| Metodo | Percorso | operationId | Effetto | Scope | P |
|---|---|---|---|---|---|
| GET | `/company/info` | `getCompanyInfo` | lettura | nessuno dichiarato | 4 |
| GET | `/company/plan_usage` | `getCompanyPlanUsage` | lettura | nessuno dichiarato | 8 |

#### Emails

| Metodo | Percorso | operationId | Effetto | Scope | P |
|---|---|---|---|---|---|
| GET | `/emails` | `listEmails` | lettura | `emails:r` (dedotto) | 7 |

#### Info

| Metodo | Percorso | operationId | Effetto | Scope | P |
|---|---|---|---|---|---|
| GET | `/info/archive_categories` | `listArchiveCategories` | lettura | nessuno dichiarato | 8 |
| GET | `/info/cost_centers` | `listCostCenters` | lettura | nessuno dichiarato | 5 |
| GET | `/info/payment_accounts` | `listPaymentAccounts` | lettura | nessuno dichiarato | 2 |
| GET | `/info/payment_methods` | `listPaymentMethods` | lettura | nessuno dichiarato | 2 |
| GET | `/info/product_categories` | `listProductCategories` | lettura | nessuno dichiarato | 8 |
| GET | `/info/received_document_categories` | `listReceivedDocumentCategories` | lettura | nessuno dichiarato | 5 |
| GET | `/info/revenue_centers` | `listRevenueCenters` | lettura | nessuno dichiarato | 5 |
| GET | `/info/vat_types` | `listVatTypes` | lettura | `settings:r` | 8 |
| GET | `/info/cities` | `listCities` | lettura | nessuno dichiarato | 8 |
| GET | `/info/countries` | `listCountries` | lettura | nessuno dichiarato | 8 |
| GET | `/info/currencies` | `listCurrencies` | lettura | nessuno dichiarato | 8 |
| GET | `/info/detailed_countries` | `listDetailedCountries` | lettura | nessuno dichiarato | 8 |
| GET | `/info/dn_causals` | `listDeliveryNotesDefaultCausals` | lettura | nessuno dichiarato | 8 |
| GET | `/info/languages` | `listLanguages` | lettura | nessuno dichiarato | 8 |
| GET | `/info/measures` | `listUnitsOfMeasure` | lettura | nessuno dichiarato | 8 |
| GET | `/info/templates` | `listDefaultTemplates` | lettura | nessuno dichiarato | 8 |

#### Issued Documents

| Metodo | Percorso | operationId | Effetto | Scope | P |
|---|---|---|---|---|---|
| GET | `/bin/issued_documents` | `ListBinIssuedDocuments` | lettura | `issued_documents.{tipo}:r` | 8 |
| DELETE | `/bin/issued_documents/{document_id}` | `DeleteBinIssuedDocument` | cancellazione definitiva | `issued_documents.{tipo}:a` (dedotto) | 8 |
| GET | `/bin/issued_documents/{document_id}` | `GetBinIssuedDocument` | lettura | `issued_documents.{tipo}:r` | 8 |
| POST | `/bin/issued_documents/{document_id}/recover` | `RecoverBinIssuedDocument` | scrittura | `issued_documents.{tipo}:a` (dedotto) | 8 |
| GET | `/issued_documents` | `listIssuedDocuments` | lettura | `issued_documents.{tipo}:r` | 1 |
| POST | `/issued_documents` | `createIssuedDocument` | scrittura | `issued_documents.{tipo}:a` | 6 |
| POST | `/issued_documents/attachment` | `uploadIssuedDocumentAttachment` | scrittura | `issued_documents.{tipo}:a` (dedotto) | 6 |
| GET | `/issued_documents/info` | `getIssuedDocumentPreCreateInfo` | lettura | `issued_documents.{tipo}:a` (dedotto) | 6 |
| GET | `/issued_documents/join` | `joinIssuedDocuments` | lettura | `issued_documents.{tipo}:a` (dedotto) | 6 |
| POST | `/issued_documents/totals` | `getNewIssuedDocumentTotals` | lettura | `issued_documents.{tipo}:a` (dedotto) | 6 |
| GET | `/issued_documents/transform` | `transformIssuedDocument` | lettura | `issued_documents.{tipo}:a` (dedotto) | 6 |
| DELETE | `/issued_documents/{document_id}` | `deleteIssuedDocument` | cancellazione | `issued_documents.{tipo}:a` | 6 |
| GET | `/issued_documents/{document_id}` | `getIssuedDocument` | lettura | `issued_documents.{tipo}:r` | 1 |
| PUT | `/issued_documents/{document_id}` | `modifyIssuedDocument` | scrittura | `issued_documents.{tipo}:a` | 2 |
| DELETE | `/issued_documents/{document_id}/attachment` | `deleteIssuedDocumentAttachment` | cancellazione | `issued_documents.{tipo}:a` (dedotto) | 6 |
| GET | `/issued_documents/{document_id}/email` | `getEmailData` | lettura | `issued_documents.{tipo}:r` | 7 |
| POST | `/issued_documents/{document_id}/email` | `scheduleEmail` | invio | `issued_documents.{tipo}:r` | 7 |
| POST | `/issued_documents/{document_id}/totals` | `getExistingIssuedDocumentTotals` | lettura | `issued_documents.{tipo}:a` (dedotto) | 1 |

#### Issued e-invoices

| Metodo | Percorso | operationId | Effetto | Scope | P |
|---|---|---|---|---|---|
| GET | `/issued_documents/{document_id}/e_invoice/error_reason` | `getEInvoiceRejectionReason` | lettura | `issued_documents.{tipo}:r` (dedotto) | 1 |
| POST | `/issued_documents/{document_id}/e_invoice/send` | `sendEInvoice` | invio | `issued_documents.{tipo}:a` (dedotto) | 7 |
| GET | `/issued_documents/{document_id}/e_invoice/xml` | `getEInvoiceXml` | lettura | `issued_documents.{tipo}:r` (dedotto) | 1 |
| GET | `/issued_documents/{document_id}/e_invoice/xml_verify` | `verifyEInvoiceXml` | lettura | `issued_documents.{tipo}:r` (dedotto) | 1 |

#### PriceLists

| Metodo | Percorso | operationId | Effetto | Scope | P |
|---|---|---|---|---|---|
| GET | `/price_lists` | `getPriceLists` | lettura | `products:r` (dedotto) | 8 |
| GET | `/price_lists/{price_list_id}/items` | `getPriceListItems` | lettura | `products:r` (dedotto) | 8 |

#### Products

| Metodo | Percorso | operationId | Effetto | Scope | P |
|---|---|---|---|---|---|
| GET | `/products` | `listProducts` | lettura | `products:r` | 8 |
| POST | `/products` | `createProduct` | scrittura | `products:a` | 8 |
| DELETE | `/products/{product_id}` | `deleteProduct` | cancellazione | `products:a` | 8 |
| GET | `/products/{product_id}` | `getProduct` | lettura | `products:r` | 8 |
| PUT | `/products/{product_id}` | `modifyProduct` | scrittura | `products:a` | 8 |

#### Receipts

| Metodo | Percorso | operationId | Effetto | Scope | P |
|---|---|---|---|---|---|
| GET | `/receipts` | `listReceipts` | lettura | `receipts:r` | 8 |
| POST | `/receipts` | `createReceipt` | scrittura | `receipts:a` | 8 |
| GET | `/receipts/info` | `getReceiptPreCreateInfo` | lettura | `receipts:r` | 8 |
| GET | `/receipts/monthly_totals` | `getReceiptsMonthlyTotals` | lettura | `receipts:r` | 8 |
| DELETE | `/receipts/{document_id}` | `deleteReceipt` | cancellazione | `receipts:a` | 8 |
| GET | `/receipts/{document_id}` | `getReceipt` | lettura | `receipts:r` | 8 |
| PUT | `/receipts/{document_id}` | `modifyReceipt` | scrittura | `receipts:a` | 8 |

#### Received Documents

| Metodo | Percorso | operationId | Effetto | Scope | P |
|---|---|---|---|---|---|
| GET | `/bin/received_documents` | `ListBinReceivedDocuments` | lettura | `received_documents:r` (dedotto) | 8 |
| DELETE | `/bin/received_documents/{document_id}` | `DeleteBinReceivedDocument` | cancellazione definitiva | `received_documents:a` (dedotto) | 8 |
| GET | `/bin/received_documents/{document_id}` | `GetBinReceivedDocument` | lettura | `received_documents:r` (dedotto) | 8 |
| POST | `/bin/received_documents/{document_id}/recover` | `RecoverBinReceivedDocument` | scrittura | `received_documents:a` (dedotto) | 8 |
| GET | `/received_documents` | `listReceivedDocuments` | lettura | `received_documents:r`, `stock:r` | 5 |
| POST | `/received_documents` | `createReceivedDocument` | scrittura | `received_documents:a`, `stock:a` | 8 |
| POST | `/received_documents/attachment` | `uploadReceivedDocumentAttachment` | scrittura | `received_documents:a`, `stock:a` | 8 |
| GET | `/received_documents/info` | `getReceivedDocumentPreCreateInfo` | lettura | `received_documents:r` | 5 |
| GET | `/received_documents/pending` | `listPendingReceivedDocuments` | lettura | `received_documents:r` | 5 |
| GET | `/received_documents/pending/{document_id}` | `getPendingReceivedDocument` | lettura | `received_documents:r` | 5 |
| POST | `/received_documents/totals` | `getNewReceivedDocumentTotals` | lettura | `received_documents:a`, `stock:a` | 8 |
| DELETE | `/received_documents/{document_id}` | `deleteReceivedDocument` | cancellazione | `received_documents:a`, `stock:a` | 8 |
| GET | `/received_documents/{document_id}` | `getReceivedDocument` | lettura | `received_documents:r`, `stock:r` | 5 |
| PUT | `/received_documents/{document_id}` | `modifyReceivedDocument` | scrittura | `received_documents:a`, `stock:a` | 8 |
| DELETE | `/received_documents/{document_id}/attachment` | `deleteReceivedDocumentAttachment` | cancellazione | `received_documents:a`, `stock:a` | 8 |
| POST | `/received_documents/{document_id}/totals` | `getExistingReceivedDocumentTotals` | lettura | `received_documents:a`, `stock:a` | 8 |

#### Settings

| Metodo | Percorso | operationId | Effetto | Scope | P |
|---|---|---|---|---|---|
| POST | `/settings/payment_accounts` | `createPaymentAccount` | scrittura | `settings:a` | 8 |
| DELETE | `/settings/payment_accounts/{payment_account_id}` | `deletePaymentAccount` | cancellazione | `settings:a` | 8 |
| GET | `/settings/payment_accounts/{payment_account_id}` | `getPaymentAccount` | lettura | `settings:r` (dedotto) | 2 |
| PUT | `/settings/payment_accounts/{payment_account_id}` | `modifyPaymentAccount` | scrittura | `settings:a` | 8 |
| POST | `/settings/payment_methods` | `createPaymentMethod` | scrittura | `settings:a` | 8 |
| DELETE | `/settings/payment_methods/{payment_method_id}` | `deletePaymentMethod` | cancellazione | `settings:a` | 8 |
| GET | `/settings/payment_methods/{payment_method_id}` | `getPaymentMethod` | lettura | `settings:r` (dedotto) | 2 |
| PUT | `/settings/payment_methods/{payment_method_id}` | `modifyPaymentMethod` | scrittura | `settings:a` | 8 |
| GET | `/settings/tax_profile` | `getTaxProfile` | lettura | `settings:r` | 8 |
| GET | `/settings/templates` | `listTemplates` | lettura | `settings:r` (dedotto) | 8 |
| GET | `/settings/templates/{template_id}` | `getTemplate` | lettura | `settings:r` (dedotto) | 8 |
| POST | `/settings/vat_types` | `createVatType` | scrittura | `settings:a` | 8 |
| DELETE | `/settings/vat_types/{vat_type_id}` | `deleteVatType` | cancellazione | `settings:a` | 8 |
| GET | `/settings/vat_types/{vat_type_id}` | `getVatType` | lettura | `settings:r` (dedotto) | 8 |
| PUT | `/settings/vat_types/{vat_type_id}` | `modifyVatType` | scrittura | `settings:a` | 8 |

#### Suppliers

| Metodo | Percorso | operationId | Effetto | Scope | P |
|---|---|---|---|---|---|
| GET | `/entities/suppliers` | `listSuppliers` | lettura | `entity.suppliers:r` | 8 |
| POST | `/entities/suppliers` | `createSupplier` | scrittura | `entity.suppliers:a` | 8 |
| DELETE | `/entities/suppliers/{supplier_id}` | `deleteSupplier` | cancellazione | `entity.suppliers:a` | 8 |
| GET | `/entities/suppliers/{supplier_id}` | `getSupplier` | lettura | `entity.suppliers:r` | 8 |
| PUT | `/entities/suppliers/{supplier_id}` | `modifySupplier` | scrittura | `entity.suppliers:a` | 8 |

#### Taxes

| Metodo | Percorso | operationId | Effetto | Scope | P |
|---|---|---|---|---|---|
| GET | `/taxes` | `listF24` | lettura | `taxes:r` | 8 |
| POST | `/taxes` | `createF24` | scrittura | `taxes:a` | 8 |
| POST | `/taxes/attachment` | `uploadF24Attachment` | scrittura | `taxes:a` | 8 |
| DELETE | `/taxes/{document_id}` | `deleteF24` | cancellazione | `taxes:a` | 8 |
| GET | `/taxes/{document_id}` | `getF24` | lettura | `taxes:r` | 8 |
| PUT | `/taxes/{document_id}` | `modifyF24` | scrittura | `taxes:a` | 8 |
| DELETE | `/taxes/{document_id}/attachment` | `deleteF24Attachment` | cancellazione | `taxes:a` | 8 |

#### User

| Metodo | Percorso | operationId | Effetto | Scope | P |
|---|---|---|---|---|---|
| GET | `/user/companies` | `listUserCompanies` | lettura | nessuno dichiarato | 4 |
| GET | `/user/info` | `getUserInfo` | lettura | nessuno dichiarato | 4 |

#### Webhooks

| Metodo | Percorso | operationId | Effetto | Scope | P |
|---|---|---|---|---|---|
| GET | `/subscriptions` | `listWebhooksSubscriptions` | lettura | nessuno dichiarato | 8 |
| POST | `/subscriptions` | `CreateWebhooksSubscription` | scrittura verso terzi | nessuno dichiarato | 8 |
| DELETE | `/subscriptions/{subscription_id}` | `deleteWebhooksSubscription` | cancellazione | nessuno dichiarato | 8 |
| GET | `/subscriptions/{subscription_id}` | `getWebhooksSubscription` | lettura | nessuno dichiarato | 8 |
| PUT | `/subscriptions/{subscription_id}` | `modifyWebhooksSubscription` | scrittura verso terzi | nessuno dichiarato | 8 |
| POST | `/subscriptions/{subscription_id}/verify` | `verifyWebhooksSubscription` | scrittura verso terzi | nessuno dichiarato | 8 |

## 3. Trappole dell'API

Fonti: documentazione FIC (pagine citate) e OpenAPI 2.1.8. Le deduzioni sono marcate.

### 3.1 Paginazione e filtri

- `per_page`: default 5 nella spec, 50 nella documentazione, massimo 100 (https://developers.fattureincloud.it/docs/basics/paginate-results/). Va sempre passato in modo esplicito. La paginazione non si può disattivare.
- Paginate: clienti, fornitori, prodotti, documenti emessi, ricevuti e in attesa, corrispettivi, F24, archivio, email. Non paginate: conti di saldo, metodi di pagamento, aliquote IVA, prima nota (che richiede invece `date_from` e `date_to` obbligatori), elenchi `info/*`, modelli, webhook, cestino, listini.
- `type` è obbligatorio nelle liste di documenti emessi, ricevuti e in attesa, con enum diversi per ciascuna. Per i ricevuti: `expense`, `passive_credit_note`, `passive_delivery_note`, `self_invoice`. Per gli emessi non esiste `self_invoice`, ma `self_own_invoice` e `self_supplier_invoice`.
- Il fieldset `basic`, usato di default dalle liste, **non** contiene `payments_list`, `ei_status`, `locked` e `items_list` (https://developers.fattureincloud.it/docs/basics/customize-response/). Per le rate e lo stato SDI servono `fields=` espliciti o `detailed`.
- Filtro `q`: triplette `campo operatore valore`, stringhe tra apici singoli, `and`/`or` e parentesi, operatori `like`, `contains`, `starts with` sulle stringhe (https://developers.fattureincloud.it/docs/basics/filter-results/queries/). Sui documenti emessi si filtrano tra l'altro `entity.id`, `entity.name`, `date`, `number`, `numeration`, `next_due_date`, gli importi. Non documentati: la sintassi delle date e l'escape di un apice dentro un valore (ragioni sociali come "L'Officina").
- `next_due_date` ("data della prossima rata non pagata") è filtrabile e ordinabile: permette di trovare le fatture con rate scadute senza leggere tutto l'archivio (deduzione, da verificare).

### 3.2 Limiti e quote

Da https://developers.fattureincloud.it/docs/basics/limits-and-quotas/:

| Limite | Valore | Ambito | Superamento |
|---|---|---|---|
| breve periodo | 300 richieste ogni 5 minuti | per azienda, **condiviso con tutte le app collegate** | 429 con `Retry-After` |
| orario | 1.000 richieste | coppia azienda-app | **403** con `Retry-After` |
| mensile | 40.000 richieste | per azienda con app privata | **403** con `Retry-After` |

- Una quota esaurita produce 403, come uno scope mancante o una licenza scaduta: va distinta da `Retry-After`, `error.code` e messaggio.
- Header `RateLimit-HourlyRemaining`, `RateLimit-HourlyLimit`, `RateLimit-MonthlyRemaining`, `RateLimit-MonthlyLimit` in ogni risposta.
- Superare i limiti ripetutamente può portare all'interdizione (https://developers.fattureincloud.it/docs/legal/policy-acceptable-use/).
- Deduzione: il server deve fare richieste in serie, non in parallelo.

### 3.3 Errori

Da https://developers.fattureincloud.it/docs/basics/errors/:

- **Due formati JSON**: stile OAuth (`error`, `error_description`) e `error.{message, code, validation_result}`, con `extra.totals` nell'errore dei totali. `validation_result` può essere una mappa di campi, un oggetto `{xml_errors: [...]}` o un array (verifica XML).
- **Codici documentati**: solo `LICENSE_EXPIRED` e `NO_PERMISSION`.
- **401**: token non valido o revocato, `company_id` sbagliato (non 404), utente non nella whitelist dell'app privata.
- **403**: scope mancante, quota esaurita, licenza scaduta, sub-utente senza permessi.
- **404**: ID errato o risorsa cancellata.
- **409**:
  - numero duplicato o cliente duplicato (stesso codice fiscale, P.IVA o codice);
  - numerazione non cronologica;
  - documento bloccato, di solito perché già inviato allo SDI;
  - servizio e-fattura non attivo o tipo di documento non inviabile;
  - limiti del piano, mittente email non configurato, quota email del trial;
  - "creazione o modifica già in esecuzione": si riprova dopo qualche secondo.
- **422**: tipo di campo errato, validazione XML, totale dei pagamenti diverso dal totale da pagare.
- **500**: errore del server, oppure caratteri non supportati (per esempio emoji) in un campo.
- **Retry**: gli esempi ufficiali ritentano su qualsiasi eccezione. Va fatto solo su 429, 403 di quota, 409 di concorrenza e 5xx; mai su 422 o 403 di permessi.

### 3.4 Pagamenti e conti di saldo

- Segnare pagata una rata richiede `payment_account.id` esistente (regola del server, non della spec) e `paid_date`. La somma delle rate deve restare uguale al totale da pagare.
- Merge o sostituzione della `payments_list` nel PUT: non documentato (sezione 1.4).
- Il conto non va mai scelto in automatico: va indicato dall'utente o configurato come default. Un default sensato è il `default_payment_account` del metodo di pagamento del documento.
- `reversed` (rata stornata) esiste ma il significato non è documentato: va riportato, non interpretato.

### 3.5 Date, importi, arrotondamenti

- Date `YYYY-MM-DD`. `created_at` e `updated_at` senza fuso orario; fuso dell'API non documentato. Deduzione: "oggi" e "scaduto" si calcolano nel fuso `Europe/Rome`.
- Importi `number` JSON; FIC arrotonda a 2 decimali le righe e le rate **prima** dei calcoli, ed è questa la causa tipica del 422 sui totali (https://developers.fattureincloud.it/docs/guides/invoice-totals/). Rimedi documentati: endpoint `totals` per l'anteprima e `options.fix_payments: true` per correggere l'ultima rata.
- `amount_net`, `amount_vat`, `amount_gross` del documento sono di sola lettura; `amount_due` (totale da pagare) arriva solo dagli endpoint dei totali.
- `currency.exchange_rate` è una stringa; nei campi `ei_raw` tutti i valori sono stringhe.
- `use_gross_prices: true` richiede `gross_price` sulle righe invece di `net_price`.

### 3.6 IVA a zero e regime forfettario

- L'aliquota si indica **solo per `id`** (`vat.value` è di sola lettura). Gli ID cambiano da azienda ad azienda: vanno letti da `GET /info/vat_types` (scope `settings:r`) e mai cablati.
- Forfettario: nessuna guida. L'unico riferimento è un esempio della spec con un'aliquota "Contribuenti forfettari" a valore 0 ed `ei_type` "2.2" (senza la "N"). Il profilo fiscale (`getTaxProfile`) riporta il regime dell'azienda.
- Bollo: su una fattura elettronica `stamp_duty` mette il bollo a carico dell'emittente; per addebitarlo al cliente serve una riga dedicata non imponibile con l'aliquota "Escluso Art.15" (https://developers.fattureincloud.it/docs/guides/invoice-creation/). L'ID indicato nella guida (21) va verificato con `info/vat_types`.

### 3.7 Documenti bloccati e importati

- Campo `locked` ("il documento non si può modificare"), tipicamente dopo l'invio SDI: modifica e cancellazione danno 409. Va controllato prima di proporre una modifica.
- Documenti importati: la spec ha `extra_data.imported_by`, ma restrizioni specifiche non sono documentate.
- Le fatture `discarded` o `error` vanno corrette e reinviate: non vanno trattate come bloccate.

### 3.8 Fattura elettronica ed email

- L'invio SDI, anche in prova (`options.dry_run`), funziona **solo con piano a pagamento** e fatturazione elettronica attiva; non funziona con il Trial (https://developers.fattureincloud.it/docs/basics/activation/). Non esiste una sandbox.
- 14 stati SDI (`attempt`, `missing`, `not_sent`, `sent`, `pending`, `processing`, `error`, `discarded`, `not_delivered`, `accepted`, `rejected`, `no_response`, `manual_accepted`, `manual_rejected`). `attempt` può durare fino a 2 ore. L'esito dell'invio è asincrono: la risposta della POST non significa "consegnata".
- Email: `recipient_email` separati da virgola, `subject` e `body` obbligatori, corpo HTML con escape e massimo 50 KiB, mittente `sender_id` oppure `sender_email` (`0` = no-reply di FIC). Nessun endpoint per annullare un invio.

### 3.9 Altro

- **Nessun autocompletamento**: passando `entity.id` o `product_id` il documento non si riempie da solo; vanno inviati tutti i campi da mostrare (https://developers.fattureincloud.it/docs/FAQs/).
- **Numerazione cronologica**: numero e data devono essere coerenti con i documenti esistenti, altrimenti 409.
- **Transform e join** non creano nulla: restituiscono un corpo da inviare a `createIssuedDocument` lasciando intatta la sezione `options` (https://developers.fattureincloud.it/docs/guides/invoice-join-transform/). Trasformazioni ammesse: preventivo e rapportino verso ordine, proforma, ricevuta, fattura; ordine verso proforma, ricevuta, fattura; proforma verso ricevuta e fattura.
- **URL temporanei**: `url` (PDF) e `attachment_url` scadono 7 giorni dopo la lettura; chi ha il link scarica il documento senza autenticazione.
- **Documenti in attesa** (e-fatture ricevute non registrate): si possono solo leggere.
- **Webhook**: richiedono un endpoint HTTPS pubblico, CloudEvents e verifica JWT. Un server stdio locale non può riceverli: può solo gestire le sottoscrizioni.
- **Policy d'uso**: vietato mettere in cache o copiare dati utente senza consenso esplicito e usare API non documentate.
- **Token personale**: non scade, ma si può revocare. Si genera collegando un'app privata e richiede che l'email dell'utente sia nella whitelist dell'app, che ammette al massimo 20 indirizzi (https://developers.fattureincloud.it/docs/authentication/manual-authentication/).
- **Trial**: le API funzionano su tutti i piani, Trial compreso; si può chiedere al supporto di prolungare il trial per lo sviluppo.

## 4. MCP, MCPB e Claude Desktop

Fatti che determinano le scelte di DESIGN.md:

- **MCPB**:
  - il manifest corrente è la versione 0.3; la 0.4 aggiunge `server.type: "uv"` (https://github.com/modelcontextprotocol/mcpb/blob/main/MANIFEST.md);
  - tipi di `user_config`: `string`, `number`, `boolean`, `directory`, `file`, senza enum. I valori `sensitive` finiscono nel portachiavi di macOS.
- **Runtime**:
  - Claude Desktop include Node.js su macOS e Windows; Python non è incluso (https://claude.com/docs/connectors/building/mcpb.md);
  - la versione del Node integrato non è documentata. Verifica locale su Claude Desktop 2.42304.0: Electron 44.7.2, cioè Node 24.21.0;
  - verifica locale: se il manifest dichiara `compatibility.runtimes.node` e il Node integrato non lo soddisfa, Claude Desktop passa al Node di sistema.
- **Directory dei connettori**: non accetta più MCPB; i server locali entrano solo dentro un plugin, che però la chat di Claude Desktop ignora. Il `.mcpb` resta il modo per l'installazione con un clic e lo distribuiamo noi.
- **Annotation**:
  - Anthropic chiede `title` più `readOnlyHint` o `destructiveHint` su ogni tool (https://claude.com/docs/connectors/building/submission.md);
  - i tool in sola lettura possono girare senza conferma per chiamata, quelli distruttivi chiedono sempre conferma (https://claude.com/docs/connectors/building/review-criteria.md);
  - default della spec in assenza di valori: `readOnlyHint` false, `destructiveHint` true, `idempotentHint` false, `openWorldHint` true.
- **Spec MCP**:
  - ultima revisione 2026-07-28: protocollo senza stato e senza `initialize`, elicitation sostituita dal pattern `input_required`, logging MCP deprecato a favore di stderr (https://modelcontextprotocol.io/specification/2026-07-28/changelog.md);
  - il supporto dell'elicitation in Claude Desktop non è documentato.
- **SDK TypeScript**: v2 stabile `@modelcontextprotocol/server` 2.3.1, Node 20+, Zod v4; `serveStdio` serve sia la spec vecchia sia la nuova. La v1 (`@modelcontextprotocol/sdk`) è in sola manutenzione.
- **Limiti di Claude Desktop**: risultato di un tool di circa 150.000 caratteri e timeout di 240 secondi (https://claude.com/docs/connectors/building/index.md).
- **MCP Inspector**: 2.11.0, richiede Node 22.19+. Ha una modalità `--cli` con codici di uscita stabili, utile in CI.
- **Registro MCP**: è in anteprima. Namespace `io.github.almostnine/...` con `mcpName` nel `package.json`; accetta pacchetti npm e `.mcpb` da GitHub Releases.

## 5. Punti del prompt da chiarire

1. **Remote e repository pubblico.** Il CLAUDE.md globale prevede un solo remote, l'hub, con mirror GitHub privato. Ho tenuto l'hub come unico remote e creato un mirror pubblico `almostnine/fattureincloud-mcp`. Conseguenze:
   - il `push --mirror` cancella i branch creati direttamente su GitHub, quindi niente Dependabot;
   - le release con il `.mcpb` allegato passano dall'API GitHub (`gh release`), non da git.
2. **Magazzino e calendario** non hanno operazioni nell'API v2 (sezione 2.3): la copertura "senza eccezioni" si riferisce alle 123 operazioni esistenti.
3. **Test di invio sull'account di prova**: l'invio SDI, anche in `dry_run`, non è disponibile sul piano Trial. Sull'account di prova si possono testare scritture ed email, ma non l'invio SDI reale. Per quello restano due strade: un piano a pagamento di prova o la sola verifica dell'anteprima.
4. **Nome del pacchetto npm**: `fattureincloud-mcp` è già occupato. Deciso: `fattureincloud-mcp-server`.
5. **Marchio**: "Fatture in Cloud" è di TeamSystem. Nome visualizzato "Fatture in Cloud MCP (non ufficiale)" con avviso di non affiliazione.
6. **Dati dell'attività**: per rispettare la regola sul repository pubblico, la documentazione descrive il caso d'uso in modo generico (piccola attività con fatture a rate, bonifici, solleciti, riconciliazione bancaria), senza nomi né banca.
7. **Installazione reale in Claude Desktop** (Fase 6, punto 4): va fatta da te, con il doppio clic sul `.mcpb`. Io preparo i passi e verifico i log.
