import { THEMES, type ThemeId } from "../shared/types";

/** One real button per theme; the selected item anchors the circular strip. */
export class ThemeCarousel {
  private active: ThemeId = THEMES[0].id;
  private offsets = new Map<HTMLElement, number>();
  private gesture?: { x: number; y: number };
  private ignoreClickUntil = 0;
  private wheelAmount = 0;
  private lastWheel = 0;
  private images: IntersectionObserver;
  constructor(private row: HTMLElement, private select: (theme: ThemeId) => void) {
    this.images = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const image = entry.target as HTMLImageElement;
        if (image.dataset.src) image.src = image.dataset.src;
        this.images.unobserve(image);
      }
    }, { root: row, rootMargin: "0px 60px" });
    row.querySelectorAll<HTMLImageElement>("img[data-src]").forEach(image => this.images.observe(image));
    row.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      if (event.key === "Home" || event.key === "End") this.select(THEMES[event.key === "Home" ? 0 : THEMES.length - 1].id);
      else this.step(event.key === "ArrowLeft" ? -1 : 1);
      row.querySelector<HTMLButtonElement>(`[data-theme="${this.active}"]`)?.focus({ preventScroll: true });
    });
    row.addEventListener("wheel", event => {
      const amount = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.shiftKey ? event.deltaY : 0;
      if (!amount) return;
      event.preventDefault();
      const now = performance.now();
      if (now - this.lastWheel < 300) return;
      this.wheelAmount += amount;
      if (Math.abs(this.wheelAmount) < 45) return;
      this.step(this.wheelAmount > 0 ? 1 : -1);
      this.wheelAmount = 0; this.lastWheel = now;
    }, { passive: false });
    row.addEventListener("pointerdown", event => { this.gesture = { x: event.clientX, y: event.clientY }; });
    row.addEventListener("pointerup", event => {
      const start = this.gesture; this.gesture = undefined;
      if (!start) return;
      const x = event.clientX - start.x, y = event.clientY - start.y;
      if (Math.abs(x) < 40 || Math.abs(x) < Math.abs(y) * 1.3) return;
      this.ignoreClickUntil = performance.now() + 350;
      this.step(x < 0 ? 1 : -1);
    });
    row.addEventListener("pointercancel", () => { this.gesture = undefined; });
    row.addEventListener("click", event => {
      if (performance.now() < this.ignoreClickUntil) { event.preventDefault(); event.stopImmediatePropagation(); }
    }, true);
    this.center(this.active, false);
  }
  step(direction: number) {
    const index = THEMES.findIndex(theme => theme.id === this.active);
    this.select(THEMES[(index + direction + THEMES.length) % THEMES.length].id);
  }
  dispose() { this.images.disconnect(); }
  center(theme: ThemeId, animate = true) {
    this.active = theme;
    const index = THEMES.findIndex(item => item.id === theme), count = THEMES.length;
    for (const [i, card] of [...this.row.querySelectorAll<HTMLButtonElement>(".theme-card")].entries()) {
      let offset = (i - index + count) % count;
      if (offset > count / 2) offset -= count;
      const previous = this.offsets.get(card);
      const wrapping = previous !== undefined && Math.abs(offset - previous) > count / 2;
      if (!animate || wrapping) card.style.transition = "none";
      card.style.setProperty("--theme-offset", String(offset));
      card.dataset.offset = String(offset);
      card.tabIndex = offset === 0 ? 0 : -1;
      this.offsets.set(card, offset);
      if (!animate || wrapping) {
        // Commit the offscreen wrap without sweeping that card through the center.
        card.getBoundingClientRect();
        requestAnimationFrame(() => { card.style.removeProperty("transition"); });
      }
    }
  }
}
