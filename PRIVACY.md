# Privacy

## Italiano

Questo server MCP gira sul tuo computer (o sul tuo server) ed è un intermediario tra Claude e il tuo account Fatture in Cloud.

- **Dati trattati**: quelli che l'API di Fatture in Cloud restituisce per le richieste che fai tramite Claude (documenti, anagrafiche, pagamenti, impostazioni), più il token di accesso che configuri.
- **Dove vanno**: il server comunica soltanto con `api-v2.fattureincloud.it` e, quando chiedi di scaricare un PDF, con gli host di Fatture in Cloud che lo ospitano. I risultati tornano a Claude, cioè all'applicazione che usi (Claude Desktop o un altro client MCP), che li tratta secondo la propria privacy policy. Nessuna telemetria, nessun servizio di terze parti, nessun invio all'autore del progetto.
- **Token**: in Claude Desktop è salvato nel portachiavi del sistema; da riga di comando arriva da una variabile d'ambiente. Non viene mai scritto nei log.
- **Conservazione**:
  - cache in memoria per la durata del processo;
  - su disco solo se la attivi (`FIC_CACHE=disk`), solo per dati di riferimento senza dati personali (aliquote IVA, metodi di pagamento, paesi, valute), con permessi 0600;
  - i file che scarichi con `fic_download_file` restano nella cartella che hai scelto finché non li cancelli;
  - i log (solo su stderr) non contengono il token né il contenuto delle risposte.
- **Condivisione con terzi**: nessuna da parte di questo software. Le azioni che inviano dati a terzi (invio allo SDI, email, webhook) avvengono solo in modalità `full` e solo dopo un'anteprima e una conferma esplicita.
- **Contatti**: https://github.com/almostnine/fattureincloud-mcp/issues

Il trattamento dei dati da parte di Fatture in Cloud è regolato dalla sua informativa: https://www.fattureincloud.it/privacy/

## English

This MCP server runs on your computer (or your server) as a bridge between Claude and your Fatture in Cloud account.

- **Data processed**: whatever the Fatture in Cloud API returns for the requests you make through Claude (documents, contacts, payments, settings), plus the access token you configure.
- **Where it goes**: the server only talks to `api-v2.fattureincloud.it` and, when you download a PDF, to the Fatture in Cloud hosts serving it. Results go back to Claude, that is the client application you use (Claude Desktop or another MCP client), which handles them under its own privacy policy. No telemetry, no third-party services, nothing is sent to the author.
- **Token**: stored in the OS keychain by Claude Desktop, or read from an environment variable on the command line. Never written to logs.
- **Retention**:
  - in-memory cache for the lifetime of the process;
  - on-disk cache only if you enable it (`FIC_CACHE=disk`), only for non-personal reference data (VAT types, payment methods, countries, currencies), with 0600 permissions;
  - files you save with `fic_download_file` stay in the folder you chose until you delete them;
  - logs (stderr only) contain neither the token nor response contents.
- **Sharing with third parties**: none by this software. Actions that send data to third parties (SDI, email, webhooks) only happen in `full` mode, after a preview and explicit confirmation.
- **Contact**: https://github.com/almostnine/fattureincloud-mcp/issues

Fatture in Cloud's own processing is governed by its policy: https://www.fattureincloud.it/privacy/
