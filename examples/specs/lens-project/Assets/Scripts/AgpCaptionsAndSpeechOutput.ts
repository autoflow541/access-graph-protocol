import { AgpSpecsSessionController, AgpSpecsSurface, SpecsActionState } from "./AgpSpecsSessionController";

/**
 * Owns the "announce" side of AgpSpecsSurface: on-screen captions and
 * synthesized speech, each independently gated by the Access Profile output
 * preferences the adapter already resolved (view.presentation.captions /
 * .speech) rather than any decision made here.
 */
@component
export class AgpCaptionsAndSpeechOutput extends BaseScriptComponent implements AgpSpecsSurface {
  @input
  controller: AgpSpecsSessionController;

  @input
  @hint("Text Component used to display captions for spoken/announced messages.")
  captionText: Text;

  @input
  @hint("Text To Speech Module asset (Resources > Text To Speech Module).")
  ttsModule: TextToSpeechModule;

  @input
  @hint("Audio Component that plays back synthesized speech.")
  speechAudio: AudioComponent;

  private captionsEnabled = true;
  private speechEnabled = true;

  onAwake() {
    this.controller.registerSurface(this);
  }

  showPanel(view: any): void {
    this.captionsEnabled = Boolean(view?.presentation?.captions);
    this.speechEnabled = Boolean(view?.presentation?.speech);
    if (!this.captionsEnabled) this.captionText.sceneObject.enabled = false;
  }

  showPrompt(_message: string, _status: SpecsActionState): void {
    // Handled by announce(); prompts and announcements are the same text in this Lens.
  }

  announce(message: string): void {
    if (!message) return;
    if (this.captionsEnabled) this.showCaption(message);
    if (this.speechEnabled) this.speak(message);
  }

  setBusy(_busy: boolean): void {
    // No busy-specific captioning/speech behavior.
  }

  private showCaption(message: string): void {
    this.captionText.sceneObject.enabled = true;
    this.captionText.text = message;
  }

  private speak(message: string): void {
    if (!this.ttsModule) return;
    const options = TextToSpeech.Options.create();
    this.ttsModule.synthesize(
      message,
      options,
      (audioTrack: AudioTrackAsset) => {
        if (this.speechAudio) {
          this.speechAudio.audioTrack = audioTrack;
          this.speechAudio.play(1);
        }
      },
      (error: string) => print(`AgpCaptionsAndSpeechOutput: TTS error ${error}`)
    );
  }
}
