/** DOM-based portrait surface. */
export class ImagePortrait {
  /** @type {?HTMLElement} */
  #host = null;

  /** @type {?HTMLImageElement} */
  #img = null;

  /** @type {string} */
  #currentSrc = '';

  /** @type {{x:number, y:number}} */
  #pan = { x: 0, y: 0 };

  /** @type {number} */
  #zoom = 1;

  /** @type {?{x:number, y:number, panX:number, panY:number, pointerId:number}} */
  #drag = null;

  /** @type {?Function} */
  #onPointerDown = null;

  /** @type {?Function} */
  #onPointerMove = null;

  /** @type {?Function} */
  #onPointerUp = null;

  /** @type {?Function} */
  #onWheel = null;

  /** @type {boolean} */
  #disposed = false;

  /**
   * Mount onto a host element.
   * @param {HTMLElement} host Portrait container.
   * @param {object} [opts] Options.
   * @param {string} [opts.src] Initial image URL.
   * @returns {Promise<void>}
   */
  async mount(host, { src = '' } = {}) {
    if (this.#disposed) return;
    this.#host = host;
    this.#img = document.createElement('img');
    this.#img.className = 'hm-hud-portrait-img';
    this.#img.alt = '';
    this.#img.draggable = false;
    this.#applyTransform();
    host.appendChild(this.#img);
    this.#installPointer();
    if (src) this.setTexture(src);
  }

  /**
   * Swap the displayed image. Pan + zoom reset.
   * @param {string} src Image URL.
   */
  setTexture(src) {
    if (this.#disposed || !this.#img || !src || src === this.#currentSrc) return;
    this.#currentSrc = src;
    this.#pan.x = 0;
    this.#pan.y = 0;
    this.#zoom = 1;
    this.#img.src = src;
    this.#applyTransform();
  }

  /** Tear down listeners + DOM. */
  destroy() {
    if (this.#disposed) return;
    this.#disposed = true;
    if (this.#host && this.#onPointerDown) {
      this.#host.removeEventListener('pointerdown', this.#onPointerDown);
      this.#host.removeEventListener('pointermove', this.#onPointerMove);
      this.#host.removeEventListener('pointerup', this.#onPointerUp);
      this.#host.removeEventListener('pointercancel', this.#onPointerUp);
      this.#host.removeEventListener('wheel', this.#onWheel);
    }
    if (this.#img && this.#img.parentNode) this.#img.parentNode.removeChild(this.#img);
    this.#host = null;
    this.#img = null;
  }

  /** Wire drag-pan + wheel-zoom on the host. */
  #installPointer() {
    if (!this.#host) return;
    this.#onPointerDown = (event) => {
      if (event.button !== 0) return;
      this.#drag = { x: event.clientX, y: event.clientY, panX: this.#pan.x, panY: this.#pan.y, pointerId: event.pointerId };
      this.#host.classList.add('is-dragging');
      this.#host.setPointerCapture?.(event.pointerId);
    };
    this.#onPointerMove = (event) => {
      if (!this.#drag || event.pointerId !== this.#drag.pointerId) return;
      this.#pan.x = this.#drag.panX + (event.clientX - this.#drag.x);
      this.#pan.y = this.#drag.panY + (event.clientY - this.#drag.y);
      this.#applyTransform();
    };
    this.#onPointerUp = (event) => {
      if (!this.#drag || event.pointerId !== this.#drag.pointerId) return;
      this.#drag = null;
      this.#host.classList.remove('is-dragging');
      this.#host.releasePointerCapture?.(event.pointerId);
    };
    this.#onWheel = (event) => {
      event.preventDefault();
      const step = event.deltaY < 0 ? 1.12 : 1 / 1.12;
      this.#zoom = Math.min(4, Math.max(0.4, this.#zoom * step));
      this.#applyTransform();
    };
    this.#host.addEventListener('pointerdown', this.#onPointerDown);
    this.#host.addEventListener('pointermove', this.#onPointerMove);
    this.#host.addEventListener('pointerup', this.#onPointerUp);
    this.#host.addEventListener('pointercancel', this.#onPointerUp);
    this.#host.addEventListener('wheel', this.#onWheel, { passive: false });
  }

  /** Push the current pan + zoom to the img element. */
  #applyTransform() {
    if (!this.#img) return;
    this.#img.style.transform = `translate(${this.#pan.x}px, ${this.#pan.y}px) scale(${this.#zoom})`;
  }
}
