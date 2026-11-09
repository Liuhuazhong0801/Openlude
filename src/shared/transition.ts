/** Keep the reveal inside the selected animation duration. */
import type { Preferences, ThemeId } from "./types";

export const ICON_INTRO_DURATION = 900;
export const THEME_MOTION_DURATIONS: Partial<Record<ThemeId, number>> = {
  comic: 3200,
  anime: 4000,
  frog: 4200,
  feidudu: 4000,
};

/** The image-based theme has its own motion length; retain the user's other timing. */
export function playbackPreferences(theme: ThemeId, settings: Preferences): Preferences {
  const duration = THEME_MOTION_DURATIONS[theme];
  if (!duration || settings.reducedMotion) return settings;
  return {
    ...settings,
    duration: duration + (settings.showAppIcon ? ICON_INTRO_DURATION : 0),
  };
}

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
  const intro = settings.showAppIcon ? Math.min(ICON_INTRO_DURATION, total * 0.38) : 0;
  const motionDuration = total - intro;
  const motionTime = Math.max(0, elapsed - intro);
  const iconProgress = intro ? elapsed / intro : 1;
  const reveal = revealDuration(settings.reducedMotion, total);
  return {
    // Keep advancing past the nominal end if a native app takes longer to activate.
    motionProgress: motionTime / motionDuration,
    motionStart: intro,
    sceneOpacity: smooth(motionTime / Math.min(140, motionDuration * 0.15)),
    iconOpacity: settings.showAppIcon
      ? smooth(iconProgress / 0.38) * (1 - smooth((iconProgress - 0.62) / 0.38))
      : 0,
    coverOpacity: 1 - smooth((elapsed - (total - reveal)) / reveal),
    revealAt: total - reveal,
  };
}
