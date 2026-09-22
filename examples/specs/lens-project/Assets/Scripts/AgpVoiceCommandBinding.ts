import { matchSpecsIntent } from "./AgpCore/AgpSpecsAdapter.js";
import { AgpSpecsSessionController } from "./AgpSpecsSessionController";
import { AgpConfirmationAuthorizationGate } from "./AgpConfirmationAuthorizationGate";

// Fixed control-word vocabulary for the confirmation/authorization gate.
// Deliberately NOT run through matchSpecsIntent (which matches AGP action
// ids/labels/voice_aliases) — these are gate controls, not device actions.
const CONFIRM_WORDS = ["confirm"];
const CANCEL_WORDS = ["cancel"];
const AUTHORIZE_WORDS = ["authorize"];
const DENY_WORDS = ["deny"];
const EXECUTE_WORDS = ["execute"];

/**
 * Exact-phrase voice input only. AGP-0.1 SECURITY.md and the specs adapter
 * tests (tests/specs-adapter-test.mjs) require that free-form speech never
 * be guessed into an action — matchSpecsIntent already enforces this by
 * only matching an action's id, label, or declared voice_aliases verbatim
 * (case/whitespace-normalized). This class does not add any fuzzy matching
 * on top of it, and a recognized utterance is only ever a SELECTION — never
 * itself a confirmation or authorization (AgpSpecsSessionController still
 * requires the separate confirm()/authorize() gate steps below).
 */
@component
export class AgpVoiceCommandBinding extends BaseScriptComponent {
  @input
  controller: AgpSpecsSessionController;

  @input
  gate: AgpConfirmationAuthorizationGate;

  @input
  @hint("Optional on-screen 'listening' indicator toggled while transcription is active.")
  listeningIndicator: SceneObject;

  @input
  @hint('ASR mode: "HighAccuracy", "Balanced", or "HighSpeed" (see AsrModule docs).')
  recognitionMode: string = "HighAccuracy";

  private asrModule: any;
  private listening = false;

  onAwake() {
    this.createEvent("OnStartEvent").bind(() => this.start());
  }

  private start() {
    // Spectacles-only global module; not an @input asset.
    this.asrModule = require("LensStudio:AsrModule");
    this.startListening();
  }

  startListening(): void {
    if (this.listening) return;
    this.listening = true;
    if (this.listeningIndicator) this.listeningIndicator.enabled = true;

    this.asrModule.startTranscribing({
      silenceUntilTerminationMs: 1000,
      mode: this.recognitionMode,
      onTranscriptionUpdateEvent: (eventArgs: { text: string; isFinal: boolean }) => {
        if (eventArgs.isFinal) this.handleUtterance(eventArgs.text);
      },
      onTranscriptionErrorEvent: (errorCode: unknown) => {
        print(`AgpVoiceCommandBinding: ASR error ${errorCode}`);
      }
    });
  }

  stopListening(): void {
    if (!this.listening) return;
    this.listening = false;
    if (this.listeningIndicator) this.listeningIndicator.enabled = false;
    this.asrModule.stopTranscribing();
  }

  private handleUtterance(rawText: string): void {
    const normalized = normalize(rawText);
    if (!normalized) return;

    if (CONFIRM_WORDS.includes(normalized)) return this.gate.confirm(true);
    if (CANCEL_WORDS.includes(normalized)) return this.gate.cancel();
    if (AUTHORIZE_WORDS.includes(normalized)) return this.gate.authorize(true);
    if (DENY_WORDS.includes(normalized)) return this.gate.authorize(false);
    if (EXECUTE_WORDS.includes(normalized)) return this.gate.runExecute();

    const object = this.controller.currentObject();
    if (!object) return;

    const intent = matchSpecsIntent(rawText, object);
    if (intent.status === "matched") {
      this.controller.selectAction(intent.actionId);
    } else if (intent.status === "ambiguous") {
      print(`AgpVoiceCommandBinding: ambiguous utterance "${rawText}" matched ${intent.matches.join(", ")} — ignored`);
    }
    // "no_match" is intentionally silent: unrecognized speech never guesses an action.
  }
}

function normalize(value: string): string {
  return String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}
