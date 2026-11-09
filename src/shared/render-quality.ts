// Keep large/Retina displays within the same shader workload as a QHD frame.
export const RENDER_PIXEL_BUDGET = 2560 * 1440;

export function renderPixelRatio(width: number, height: number, displayScale: number): number {
  if (!(width > 0) || !(height > 0) || !Number.isFinite(width * height)) return 1;
  const scale = Number.isFinite(displayScale) && displayScale > 0 ? displayScale : 1;
  return Math.min(scale, 2, Math.sqrt(RENDER_PIXEL_BUDGET / (width * height)));
}
