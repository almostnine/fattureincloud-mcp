# Evoluzioni future

## Uso dall'app Claude sul telefono (connettore remoto)

Stato: proposta, non pianificata.

L'app Claude per telefono non avvia server MCP locali: usa solo connettori remoti, aggiunti per URL su claude.ai e poi disponibili su web, desktop e telefono. Le richieste al server partono dall'infrastruttura di Anthropic (`160.79.104.0/21`), non dal telefono. Fonti: https://claude.com/docs/connectors/building/index.md e https://claude.com/docs/connectors/building/authentication.md

Proposta, con le difese in ordine di forza:

1. **Token Fatture in Cloud con soli scope `:r`**, conservato solo sul server e mai trasmesso a Claude.
2. **Sola lettura fissata nel codice**: la versione remota rifiuta di avviarsi in `write` o `full`.
3. **OAuth per un solo utente** (password + TOTP, oppure passkey), con registrazione dinamica del client (DCR) o Client ID Metadata Document, PKCE S256, token di accesso brevi e refresh a rotazione. Niente server senza autenticazione.
4. **Rete**:
   - endpoint MCP e token raggiungibili solo dagli indirizzi di Anthropic;
   - pagina di login pubblica, perché si apre nel browser del telefono, protetta da limite di tentativi;
   - solo HTTPS, sottodominio dedicato.
5. **Controllo**: revoca immediata di tutte le sessioni con un comando, log degli accessi senza dati dei documenti.

Lavoro necessario:
- trasporto Streamable HTTP (SDK MCP v2);
- server di autorizzazione minimale (metadata RFC 9728 e RFC 8414, `/register`, `/authorize`, `/token`, redirect `https://claude.ai/api/mcp/auth_callback`);
- distribuzione su un server dedicato con proxy HTTPS e firewall;
- nuove revisioni di sicurezza prima della messa in linea.

Decisioni aperte: dove ospitarlo (server dedicato consigliato), dominio, metodo di login.

## Altre idee

- Test delle scritture su un account Trial di Fatture in Cloud, prima di usare la modalità `write` sull'account reale.
- Pubblicazione su npm e sul registro MCP.
