import { execFile } from 'node:child_process';
import {
  type ElicitRequestFormParams,
  type ElicitResult,
  type InputRequiredResult,
  inputRequired,
  inputResponse,
} from '@modelcontextprotocol/server';
import { refused } from '../api/errors.js';
import type { Logger } from '../log.js';
import { sanitizeText } from './untrusted.js';

/**
 * Conferma umana fuori banda per ogni scrittura e ogni azione irreversibile.
 *
 * Il token di conferma (`confirm.ts`) arriva al modello, quindi da solo non prova che una persona abbia
 * detto sì. Al momento di eseguire il server chiede la conferma direttamente alla persona, su un canale
 * che il modello non può usare:
 * 1. elicitation MCP, se il client l'ha dichiarata: Claude Desktop mostra il testo dell'anteprima e un
 *    modulo con la casella "Confermo"; sull'era 2025 con una richiesta dal server al client, sull'era
 *    2026-07-28 con un risultato `input_required` che il client soddisfa e poi ripete la chiamata;
 * 2. su macOS, una finestra di dialogo di sistema (osascript) con "Annulla" come pulsante predefinito;
 * 3. altrimenti la scrittura viene rifiutata.
 */

export type ConfirmMethod = 'auto' | 'elicitation' | 'dialog';

/** Canale della singola chiamata di tool verso il client, ricavato dal contesto della richiesta MCP. */
export interface HumanChannel {
  /** Il client ha dichiarato la capability elicitation (modulo). */
  elicitation: boolean;
  /** Era 2025: richiesta di elicitation dal server al client, in attesa della risposta. */
  elicit?: (params: ElicitRequestFormParams) => Promise<ElicitResult>;
  /** Era 2026-07-28: risposte e stato portati dalla chiamata ripetuta dal client. */
  modern?: { inputResponses?: Record<string, unknown>; requestState?: string };
}

/** Esegue osascript con gli argomenti dati; iniettabile nei test. */
export type DialogRunner = (
  args: string[],
  timeoutMs: number,
) => Promise<{ code: number | null; stdout: string }>;

export interface HumanPrompt {
  /** Titolo breve, per esempio "Crea fattura". */
  title: string;
  /** Testo esatto dell'anteprima che la persona approva. */
  text: string;
}

/** Il tool deve restituire `result` al client (era 2026-07-28): non è un errore. */
export class InputRequiredSignal extends Error {
  readonly result: InputRequiredResult;
  constructor(result: InputRequiredResult) {
    super('input_required');
    this.result = result;
  }
}

const KEY = 'fic_conferma';
const DIALOG_MAX_CHARS = 1800;

export const defaultDialogRunner: DialogRunner = (args, timeoutMs) =>
  new Promise((resolve) => {
    execFile('/usr/bin/osascript', args, { timeout: timeoutMs + 5000 }, (err, stdout) => {
      const code = err ? (typeof err.code === 'number' ? err.code : 1) : 0;
      resolve({ code, stdout: String(stdout ?? '') });
    });
  });

function declined(how: string): never {
  throw refused(
    `L’utente non ha confermato (${how}): non è stato inviato nulla a Fatture in Cloud. Se vuole procedere, ripeti l’anteprima e chiedigli di confermare nella finestra di conferma.`,
  );
}

export class HumanConfirm {
  private readonly method: ConfirmMethod;
  private readonly platform: NodeJS.Platform;
  private readonly dialog: DialogRunner | undefined;
  private readonly sign: (text: string) => string;
  private readonly log: Logger;
  readonly dialogTimeoutSeconds: number;
  readonly elicitTimeoutMs: number;

  constructor(opts: {
    method: ConfirmMethod;
    sign: (text: string) => string;
    log: Logger;
    platform?: NodeJS.Platform;
    /** `null` disattiva la finestra di dialogo. */
    dialog?: DialogRunner | null;
    dialogTimeoutSeconds?: number;
    elicitTimeoutMs?: number;
  }) {
    this.method = opts.method;
    this.sign = opts.sign;
    this.log = opts.log;
    this.platform = opts.platform ?? process.platform;
    this.dialog = opts.dialog === null ? undefined : (opts.dialog ?? defaultDialogRunner);
    this.dialogTimeoutSeconds = opts.dialogTimeoutSeconds ?? 120;
    this.elicitTimeoutMs = opts.elicitTimeoutMs ?? 10 * 60 * 1000;
  }

  private dialogAvailable(): boolean {
    return this.platform === 'darwin' && this.dialog !== undefined;
  }

  /** Canale che verrà usato per la conferma, o undefined se non ce n'è nessuno. */
  channelFor(channel: HumanChannel | undefined): 'elicitation' | 'dialog' | undefined {
    if (this.method !== 'dialog' && channel?.elicitation) return 'elicitation';
    if (this.method !== 'elicitation' && this.dialogAvailable()) return 'dialog';
    return undefined;
  }

  /** Frase per l'anteprima: come verrà chiesta la conferma. */
  describe(channel: HumanChannel | undefined): string {
    switch (this.channelFor(channel)) {
      case 'elicitation':
        return 'Al momento di eseguire, Claude Desktop mostrerà all’utente questo testo con la casella "Confermo": solo la sua spunta autorizza l’operazione.';
      case 'dialog':
        return 'Al momento di eseguire, il Mac mostrerà all’utente una finestra di sistema con questo testo e i pulsanti "Annulla" e "Conferma": solo il suo clic su "Conferma" autorizza l’operazione.';
      default:
        return this.unavailableMessage();
    }
  }

  private unavailableMessage(): string {
    if (this.method === 'elicitation')
      return 'Nessuna conferma umana possibile: FIC_CONFIRM_METHOD=elicitation, ma il client non supporta l’elicitation MCP. L’operazione verrà rifiutata.';
    if (this.method === 'dialog')
      return 'Nessuna conferma umana possibile: FIC_CONFIRM_METHOD=dialog, ma la finestra di dialogo esiste solo su macOS. L’operazione verrà rifiutata.';
    return 'Nessuna conferma umana possibile: il client non supporta l’elicitation MCP e la finestra di dialogo esiste solo su macOS. L’operazione verrà rifiutata.';
  }

  /**
   * Chiede la conferma e ritorna solo se la persona ha confermato; altrimenti lancia `refused`.
   * Sull'era 2026-07-28 la prima volta lancia `InputRequiredSignal`: il client chiede alla persona e
   * ripete la chiamata con la risposta. `binding` lega la risposta a questa operazione esatta.
   */
  async confirm(channel: HumanChannel | undefined, prompt: HumanPrompt, binding: string): Promise<void> {
    const how = this.channelFor(channel);
    if (how === 'elicitation') return this.viaElicitation(channel!, prompt, binding);
    if (how === 'dialog') return this.viaDialog(prompt);
    throw refused(
      `${this.unavailableMessage()} Per scrivere in Fatture in Cloud usa un client con elicitation (Claude Desktop aggiornato) oppure macOS.`,
    );
  }

  private params(prompt: HumanPrompt): ElicitRequestFormParams {
    return {
      mode: 'form',
      message: `${prompt.text}\n\nConfermi questa operazione su Fatture in Cloud? Spunta "Confermo" e invia solo se tutto è corretto.`,
      requestedSchema: {
        type: 'object',
        properties: {
          conferma: {
            type: 'boolean',
            title: 'Confermo',
            description: `Autorizzo: ${prompt.title}`,
            default: false,
          },
        },
        required: ['conferma'],
      },
    };
  }

  private async viaElicitation(channel: HumanChannel, prompt: HumanPrompt, binding: string): Promise<void> {
    const check = (action: string | undefined, content: Record<string, unknown> | undefined) => {
      if (action === 'accept' && content?.conferma === true) {
        this.log.audit('conferma umana ricevuta', { via: 'elicitation', what: prompt.title });
        return;
      }
      this.log.audit('conferma umana negata', { via: 'elicitation', what: prompt.title, action });
      declined(action === 'accept' ? 'casella "Confermo" non spuntata' : 'richiesta annullata o rifiutata');
    };
    if (channel.modern) {
      const state = this.sign(binding);
      const responses = channel.modern.inputResponses;
      if (responses && KEY in responses) {
        if (channel.modern.requestState !== state)
          throw refused(
            'La conferma ricevuta non corrisponde a questa operazione (stato non valido o anteprima cambiata). Ripeti l’anteprima.',
          );
        const view = inputResponse(responses, KEY);
        return check(
          view.kind === 'elicit' ? view.action : undefined,
          view.kind === 'elicit' ? view.content : undefined,
        );
      }
      throw new InputRequiredSignal(
        inputRequired({
          inputRequests: { [KEY]: inputRequired.elicit(this.params(prompt)) },
          requestState: state,
        }),
      );
    }
    if (!channel.elicit) throw refused(this.unavailableMessage());
    let res: ElicitResult;
    try {
      res = await channel.elicit(this.params(prompt));
    } catch (err) {
      this.log.warn('elicitation non riuscita', { error: err instanceof Error ? err.message : String(err) });
      throw refused(
        'La richiesta di conferma all’utente non è riuscita (finestra chiusa, scaduta o non supportata): non è stato inviato nulla a Fatture in Cloud.',
      );
    }
    return check(res.action, res.content as Record<string, unknown> | undefined);
  }

  private async viaDialog(prompt: HumanPrompt): Promise<void> {
    let text = sanitizeText(prompt.text, 100_000);
    if (text.length > DIALOG_MAX_CHARS)
      text = `${text.slice(0, DIALOG_MAX_CHARS)}…\n[anteprima troncata: il testo completo è nella chat]`;
    const script = [
      'on run argv',
      `display dialog (item 1 of argv) with title (item 2 of argv) buttons {"Annulla", "Conferma"} default button "Annulla" cancel button "Annulla" with icon caution giving up after ${this.dialogTimeoutSeconds}`,
      'end run',
    ];
    const args = [
      ...script.flatMap((l) => ['-e', l]),
      `${text}\n\nConfermi questa operazione?`,
      `Fatture in Cloud MCP: ${prompt.title}`,
    ];
    const out = await this.dialog!(args, this.dialogTimeoutSeconds * 1000);
    if (out.code === 0 && /button returned:Conferma/.test(out.stdout) && !/gave up:true/.test(out.stdout)) {
      this.log.audit('conferma umana ricevuta', { via: 'dialog', what: prompt.title });
      return;
    }
    this.log.audit('conferma umana negata', { via: 'dialog', what: prompt.title });
    declined(
      /gave up:true/.test(out.stdout)
        ? 'finestra scaduta senza risposta'
        : 'premuto "Annulla" o finestra chiusa',
    );
  }
}
