/** Keep the reveal inside the selected animation duration. */
import type { Preferences } from "./types";

export const REVEAL_DURATION = 650;
export const QUICK_REVEAL_DURATION = 160;
// Give Launch Services and the compositor time to put the app under the overlay.
export const HANDOFF_LEAD = 160;

export function revealDuration(reducedMotion: boolean, duration: number): number {
  return Math.min(
    reducedMotion ? QUICK_REVEAL_DURATION : REVEAL_DURATION,
    Math.round(duration * 0.4),
  );
}

const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

export function animationDuration(settings: Preferences): number {
  return settings.reducedMotion ? Math.min(settings.duration, 650) : settings.duration;
}

/** One timeline for the workspace, standalone preview and native overlay. */
export function animationFrame(elapsed: number, settings: Preferences) {
  const total = animationDuration(settings);
  const intro = settings.showAppIcon ? Math.min(700, total * 0.32) : 0;
  const motionDuration = total - intro;
  const motionTime = Math.max(0, elapsed - intro);
  const iconProgress = intro ? elapsed / intro : 1;
  const reveal = revealDuration(settings.reducedMotion, total);
  return {
    // Keep advancing past the nominal end if a native app takes longer to activate.
    motionProgress: motionTime / motionDuration,
    sceneOpacity: smooth(motionTime / Math.min(140, motionDuration * 0.15)),
    iconOpacity: settings.showAppIcon
      ? smooth(iconProgress / 0.2) * (1 - smooth((iconProgress - 0.6) / 0.4))
      : 0,
    coverOpacity: 1 - smooth((elapsed - (total - reveal)) / reveal),
    revealAt: total - reveal,
  };
}
