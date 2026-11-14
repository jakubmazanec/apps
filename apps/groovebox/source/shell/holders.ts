// Which sources hold each control. The core sees one physical control, so a control is pressed when
// its first source takes it and released when its last source lets go. A control and a source are
// opaque strings, for example `pad-0` and `key:KeyZ`
export class Holders {
  readonly #sources = new Map<string, Set<string>>();

  // Returns true when `source` is the first to hold `control`: the shell then sends the press. A
  // source that already holds it changes nothing
  press(control: string, source: string) {
    let sources = this.#sources.get(control);

    if (!sources) {
      this.#sources.set(control, new Set([source]));

      return true;
    }

    sources.add(source);

    return false;
  }

  // Returns true when `source` was the last to hold `control`: the shell then sends the release. A
  // source that does not hold it changes nothing
  release(control: string, source: string) {
    let sources = this.#sources.get(control);

    if (!sources?.delete(source)) {
      return false;
    }

    if (sources.size > 0) {
      return false;
    }

    this.#sources.delete(control);

    return true;
  }

  // Lets go of everything, for a window that lost focus. Returns the controls that were held, so
  // that the shell can send their releases
  releaseAll() {
    let controls = [...this.#sources.keys()];

    this.#sources.clear();

    return controls;
  }
}
