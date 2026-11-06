/** Keep the reveal inside the selected animation duration. */
export const REVEAL_DURATION = 520;
export const QUICK_REVEAL_DURATION = 160;

export function revealDuration(reducedMotion: boolean, duration: number): number {
  return Math.min(
    reducedMotion ? QUICK_REVEAL_DURATION : REVEAL_DURATION,
    Math.round(duration * 0.4),
  );
}
