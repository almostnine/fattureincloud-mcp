# Changelog

Il formato segue [Keep a Changelog](https://keepachangelog.com/it-IT/1.1.0/) e il progetto usa il [versionamento semantico](https://semver.org/lang/it/).

## [1.2.0] - 2026-10-23

Versione di sicurezza: nessuna scrittura senza una conferma umana che il modello non può dare, e nessun IBAN inviato a Fatture in Cloud.

### Sicurezza

- **Conferma umana fuori banda** per ogni scrittura e azione irreversibile (documenti, rate, anagrafiche, `fic_api_write`, cancellazioni, invio SDI, email, webhook): elicitation MCP (era 2025 e 2026-07-28) con la casella "Confermo"; se il client non la supporta, su macOS finestra di sistema con "Annulla" predefinito; altrimenti rifiuto. Il token dell'anteprima resta, ma lega solo l'anteprima al corpo esatto: da solo non basta più. Nuova variabile `FIC_CONFIRM_METHOD` (`auto`, `elicitation`, `dialog`).
- **Anteprima di default**: `dry_run` vale `true` per creazione, modifica, duplicazione e conversione di documenti, stato delle rate e anagrafiche; per eseguire servono `dry_run: false`, `confirm` e la conferma umana.
- **Mai IBAN**: il client rifiuta qualsiasi corpo con chiavi bancarie o testi con la forma di un IBAN (con o senza spazi, qualsiasi paese). Duplicazione, conversione e modifica dei dati SDI tolgono `bank_iban`, `bank_name`, `bank_beneficiary` e simili e non copiano `ei_raw`; del metodo di pagamento si invia solo l'`id`.
- `fic_delete` esiste solo con `FIC_ENABLE_DELETE=true`, oltre alla modalità `write` o `full`.
- `fic_api_write` rifiuta creazione e modifica di documenti emessi, recupero dal cestino, conti di saldo e metodi di pagamento.
- L'anteprima dell'invio SDI usa solo la verifica dell'XML: l'endpoint di invio non viene mai chiamato, nemmeno con `dry_run`.
- Il client non ripete più una creazione sul 409 "già in esecuzione"; limite lato client di 300 richieste ogni 5 minuti per azienda; stop quando restano meno di 20 richieste nell'ora o nel mese.
- Risposte generiche: i campi "tecnici" (stato, tipo, date, URL, email...) restano senza delimitatori solo se il valore ha il formato atteso; XML e testi sono sempre delimitati.
- Cartella dei download con permessi 0700 (corretti anche se esisteva), estensione del file dal tipo di contenuto, pulizia facoltativa all'avvio con `FIC_DOWNLOAD_RETENTION_DAYS`.

### Corretto

- Riconciliazione: le fatture con sezionale (numero "33/A") si riconoscono da "fattura 33", "33/2026" e "33/a"; una rata viene proposta per un solo movimento, qualunque sia la confidenza, assegnandola al movimento che le somiglia di più.
- Rate esplicite: gli importi si arrotondano al centesimo (metà per eccesso) e si inviano così; se la somma arrotondata non torna con il totale il tool rifiuta invece di lasciar correggere `fix_payments`.

### Cambiato

- `FIC_EXTRA_TOOLS` non abilita più nulla: è un elenco chiuso (mai `fic_api_write`, `fic_delete` o invii) ignorato in `readonly`. Il campo è stato tolto dalle impostazioni di Claude Desktop; se impostato, il server lo segnala nei log.
- `fic_account_info` riporta il metodo di conferma e se le cancellazioni sono attive, non più i tool abilitati singolarmente.

## [1.1.0] - 2026-10-19

### Aggiunto

- `FIC_EXTRA_TOOLS` (campo "Tool di scrittura abilitati singolarmente" in Claude Desktop): attiva singoli tool di scrittura restando in `readonly`, per esempio solo `fic_create_entity` per creare clienti. Gli invii non si attivano così.
- `fic_create_entity` controlla i doppioni prima di creare (stessa partita IVA, codice fiscale, email o nome) e, se ne trova, li mostra invece di creare; `allow_duplicate: true` crea comunque dopo la conferma dell'utente.
- `fic_account_info` riporta i tool abilitati singolarmente.

## [1.0.0] - 2026-10-17

Prima versione, scritta da zero.

### Aggiunto

- Copertura di tutte le 123 operazioni dell'API v2 di Fatture in Cloud (OpenAPI 2.1.8): 28 tool, di cui 17 in sola lettura.
- Documenti emessi: elenco con filtri e paginazione completa, dettaglio per ID o per numero e anno, stato di pagamento, PDF e XML, stato SDI con motivo dello scarto e verifica dell'XML.
- Rate: elenco delle rate scadute, non pagate o pagate di tutti i documenti, con riepilogo per cliente; rate segnate come pagate (conto di saldo e data) o non pagate.
- Riconciliazione in sola lettura tra movimenti bancari e rate aperte.
- Clienti e fornitori: ricerca per nome, partita IVA, codice fiscale, email; dettaglio con rate aperte; creazione e modifica.
- Situazione: fatturato, incassato, da incassare, scaduto, costi, dettaglio mensile, incassi per data di pagamento.
- Documenti ricevuti, e-fatture in attesa, prima nota, elenchi di supporto (conti di saldo, metodi di pagamento, aliquote IVA, centri di costo e ricavo...).
- Creazione di documenti con totali calcolati dall'API e anteprima, modifica che preserva le rate pagate, conversione ufficiale (proforma in fattura...), duplicazione corretta.
- Invio allo SDI ed email con anteprima, prova di invio e token di conferma.
- Tool generici guidati dal catalogo per tutto il resto dell'API, cancellazioni con anteprima e conferma.
- Modalità `readonly` (default), `write`, `full`; annotation MCP esplicite su tutti i tool.
- Pacchetto `.mcpb` per Claude Desktop (un solo file JavaScript, nessuna dipendenza dalla versione di Node dell'utente) e pacchetto npm `fattureincloud-mcp-server`.

### Sicurezza

- Token di conferma monouso; conferma anche per conversioni che eliminano l'originale e per le modifiche ai dati di pagamento (IBAN).
- Un indirizzo email scritto in Fatture in Cloud durante la sessione non è un destinatario ammesso.
- Revisione di sicurezza e di correttezza indipendenti: esito e correzioni in `docs/REVIEW.md`.

### Differenze rispetto al progetto di riferimento (aringad/fattureincloud-mcp)

- Aliquote IVA indicate per `id` e totali calcolati da Fatture in Cloud: corregge il bug di `duplicate_invoice` e la gestione del regime forfettario.
- Rate segnate pagate o non pagate di nuovo disponibili, con conto di saldo esplicito.
- Paginazione completa con avviso quando i dati sono parziali.
- Nessun traceback al modello, nessun dato personale nella cache su disco, `send_to_sdi` e gli altri tool distruttivi marcati come tali.
