# Changelog

Il formato segue [Keep a Changelog](https://keepachangelog.com/it-IT/1.1.0/) e il progetto usa il [versionamento semantico](https://semver.org/lang/it/).

## [1.0.0] - non ancora rilasciata

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
