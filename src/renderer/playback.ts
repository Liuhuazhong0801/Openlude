import type { Preferences } from "../shared/types";
import { animationDuration, animationFrame } from "../shared/transition";
import type { MotionScene } from "./motion";

interface PlaybackOptions {
  nativeWindow?: boolean;
  revealLead?: number;
  onReveal?: () => void;
  onProgress?: (progress: number) => void;
}

export class LaunchPlayback {
  private frame = 0;
  private resolvePlay?: () => void;
  private generation = 0;

  constructor(private scene: MotionScene | null, private emblem: HTMLElement) {}

  async play(settings: Preferences, options: PlaybackOptions = {}): Promise<void> {
    this.stop();
    const generation = this.generation;
    const icon = this.emblem.querySelector<HTMLImageElement>("img");
    if (settings.showAppIcon && icon?.getAttribute("src"))
      await icon.decode().catch(() => {});
    if (generation !== this.generation) return;
    const effective = {
      ...settings,
      showAppIcon: settings.showAppIcon && !!icon?.naturalWidth,
    };
    this.emblem.hidden = !effective.showAppIcon;
    this.emblem.style.transform = "translate(-50%, -50%)";
    const start = performance.now();
    const total = animationDuration(effective);
    let revealing = false;
    return new Promise((resolve) => {
      this.resolvePlay = resolve;
      const tick = (now: number) => {
        const elapsed = Math.max(0, now - start);
        const phase = animationFrame(elapsed, effective);
        this.emblem.style.opacity = String(phase.iconOpacity);
        this.emblem.parentElement?.style.setProperty("--scene-opacity", String(phase.sceneOpacity));
        this.scene?.setOpacity(
          phase.sceneOpacity * (options.nativeWindow ? 1 : phase.coverOpacity),
        );
        this.scene?.render(settings.reducedMotion ? 0.7 : phase.motionProgress);
        options.onProgress?.(Math.min(1, elapsed / total));
        if (!revealing && elapsed >= Math.max(0, phase.revealAt - (options.revealLead ?? 0))) {
          revealing = true;
          options.onReveal?.();
        }
        // The native compositor fades the whole window while this RAF keeps moving.
        if (elapsed < total || options.nativeWindow)
          this.frame = requestAnimationFrame(tick);
        else {
          this.frame = 0;
          this.resolvePlay = undefined;
          resolve();
        }
      };
      tick(start);
    });
  }

  stop() {
    ++this.generation;
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.resolvePlay?.();
    this.resolvePlay = undefined;
  }

  reset(showAppIcon: boolean) {
    this.stop();
    this.emblem.hidden = !showAppIcon;
    this.emblem.style.opacity = showAppIcon ? "1" : "0";
    this.emblem.style.transform = "translate(-50%, -50%)";
    this.scene?.setOpacity(1);
    this.emblem.parentElement?.style.setProperty("--scene-opacity", "1");
  }
}
