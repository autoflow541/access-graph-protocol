import { Slider } from "SpectaclesUIKit.lspkg/Scripts/Components/Slider/Slider";

/**
 * Lives on the parameter-slider prefab. Drives a single numeric
 * AGP action parameter (the "value" parameter WoT property writes like
 * write_targettemperature produce: see adapters/wot/index.js
 * schemaParameter) through SpectaclesUIKit's Slider component.
 *
 * Slider.currentValue is normalized to [0, 1]: it has no native
 * min/max/step of its own: so this class does the linear mapping to and
 * from the parameter's actual `minimum`/`maximum` range itself.
 *
 * The AGP action id this configures is NOT selected/proposed on every
 * drag tick (Slider.onValueChange): only once the interaction finishes
 * (Slider.onFinished), so dragging through intermediate values doesn't
 * create a new confirmation proposal for each one. This mirrors the
 * browser demo (examples/smart-device/app.js), where the temperature
 * slider only calls session.request() on the range input's "change"
 * event, not on every "input" tick.
 */
@component
export class AgpParameterSlider extends BaseScriptComponent {
  @input
  slider: Slider;

  @input
  @hint("Text showing the current value while dragging, e.g. \"21°C\".")
  valueLabel: Text;

  @input
  @hint("Appended after the numeric value in valueLabel, e.g. \"°C\". Optional.")
  unitSuffix: string = "";

  private minimum = 0;
  private maximum = 1;
  private stepSize: number | null = null;
  private onCommit: ((value: number) => void) | null = null;

  onAwake() {
    this.slider.onValueChange.add((normalized: number) => this.updateLabel(normalized));
    this.slider.onFinished.add(() => this.commit());
  }

  /**
   * @param minimum the parameter schema's `minimum`
   * @param maximum the parameter schema's `maximum`
   * @param initialValue the device's current value for this property, to position the slider without proposing an action
   * @param stepSize optional rounding step (e.g. 1 for whole-degree steps)
   * @param onCommit called once, with the final actual (non-normalized) value, when the user finishes dragging
   */
  configure(minimum: number, maximum: number, initialValue: number, stepSize: number | undefined, onCommit: (value: number) => void) {
    this.minimum = minimum;
    this.maximum = maximum;
    this.stepSize = stepSize ?? null;
    this.onCommit = onCommit;

    const normalized = this.normalize(initialValue);
    this.slider.updateCurrentValue(normalized, false);
    this.updateLabel(normalized);
  }

  private normalize(actualValue: number): number {
    if (this.maximum === this.minimum) return 0;
    const ratio = (actualValue - this.minimum) / (this.maximum - this.minimum);
    return Math.min(1, Math.max(0, ratio));
  }

  private actualValue(normalized: number): number {
    let value = this.minimum + normalized * (this.maximum - this.minimum);
    if (this.stepSize) value = Math.round(value / this.stepSize) * this.stepSize;
    return value;
  }

  private updateLabel(normalized: number): void {
    if (!this.valueLabel) return;
    this.valueLabel.text = `${this.actualValue(normalized)}${this.unitSuffix}`;
  }

  private commit(): void {
    if (!this.onCommit) return;
    this.onCommit(this.actualValue(this.slider.currentValue));
  }
}
