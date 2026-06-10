/** Slide-in side panel summarising the impact of a multiclass pick on the level-up tab. */
export class MulticlassImpactPanel {
  /** @type {WeakMap<HTMLElement, MulticlassImpactPanel>} */
  static #instances = new WeakMap();

  /**
   * @param {HTMLElement} root Panel root with `[data-multiclass-impact-panel]`.
   * @returns {MulticlassImpactPanel} New or cached instance.
   */
  static attach(root) {
    const existing = MulticlassImpactPanel.#instances.get(root);
    if (existing) return existing;
    return new MulticlassImpactPanel(root);
  }

  /**
   * Attach every impact panel under `scope`.
   * @param {Element|Document} scope Container to query.
   * @returns {MulticlassImpactPanel[]} Attached instances.
   */
  static attachAll(scope) {
    return Array.from(scope.querySelectorAll('[data-multiclass-impact-panel]')).map((el) => MulticlassImpactPanel.attach(el));
  }

  /** @param {HTMLElement} root Panel root. */
  constructor(root) {
    this.root = root;
    this.#bind();
    MulticlassImpactPanel.#instances.set(root, this);
    this.#open();
  }

  /** Wire close-button click. */
  #bind() {
    this.root.addEventListener('click', (e) => {
      if (e.target.closest('[data-impact-close]')) {
        e.preventDefault();
        this.close();
      }
    });
  }

  /** Reveal the panel + animate the slide-in. */
  #open() {
    this.root.hidden = false;
    requestAnimationFrame(() => this.root.classList.add('is-open'));
  }

  /** Slide the panel out and re-hide it. */
  close() {
    this.root.classList.remove('is-open');
    this.root.hidden = true;
  }
}
