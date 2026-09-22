import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable";

/**
 * Lives on the action-button prefab. Drives interaction through SIK's
 * verified Interactable.onTriggerStart event (hand pinch/poke) so the same
 * component works regardless of which visual (RoundButton, plain quad,
 * text-only) is wired to `label`. This is the single place a hand-input
 * trigger becomes an AGP action id — it never itself decides the action is
 * authorized, it only reports the selection upward.
 */
@component
export class AgpActionButton extends BaseScriptComponent {
  @input
  @hint("SIK Interactable driving hand/pinch input for this button.")
  interactable: Interactable;

  @input
  label: Text;

  actionId: string = "";
  private handler: (() => void) | null = null;

  onAwake() {
    this.interactable.onTriggerStart.subscribe(() => {
      if (this.handler) this.handler();
    });
  }

  configure(actionId: string, labelText: string, onSelect: () => void) {
    this.actionId = actionId;
    this.label.text = labelText;
    this.handler = onSelect;
  }
}
