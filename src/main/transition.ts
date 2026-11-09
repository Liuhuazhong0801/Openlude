import type { BrowserWindow } from "electron";
import { setTimeout as delay } from "node:timers/promises";

/** Fade the native window, including its opaque WebGL surface, onto the app below. */
export async function fadeWindowOut(win: BrowserWindow, duration: number) {
  if (win.isDestroyed() || !win.isVisible()) return;
  const opacity = win.getOpacity();
  const start = performance.now();
  win.setIgnoreMouseEvents(true);
  while (!win.isDestroyed()) {
    const progress =
      duration > 0
        ? Math.min(1, (performance.now() - start) / duration)
        : 1;
    const eased = progress * progress * (3 - 2 * progress);
    win.setOpacity(opacity * (1 - eased));
    if (progress === 1) break;
    await delay(16);
  }
}
