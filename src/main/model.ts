import path from "node:path";
import {
  THEMES,
  type ThemeId,
  type SavedState,
  type Target,
  type Preferences,
  type GeneralSettings,
} from "../shared/types";
export function themeId(value: unknown): ThemeId {
  if (!THEMES.some((t) => t.id === value)) throw new Error("未知动画主题");
  return value as ThemeId;
}
export function initialState(reducedMotion: boolean): SavedState {
  return {
    version: 2,
    targets: [],
    preferences: { duration: 1800, reducedMotion, showAppIcon: true },
    settings: generalSettings(),
  };
}
export function generalSettings(value?: unknown): GeneralSettings {
  if (value === undefined) return { appearance: "system", autoStart: false, autoCheckUpdates: true };
  const s = value as GeneralSettings | null;
  if (!s || !["system", "light", "dark"].includes(s.appearance) ||
    typeof s.autoStart !== "boolean" || typeof s.autoCheckUpdates !== "boolean")
    throw new Error("应用设置无效");
  return { appearance: s.appearance, autoStart: s.autoStart, autoCheckUpdates: s.autoCheckUpdates };
}
export function preferences(value: unknown): Preferences {
  const p = value as Partial<Preferences> | null;
  if (
    !p ||
    typeof p.duration !== "number" ||
    !Number.isFinite(p.duration) ||
    p.duration < 600 ||
    p.duration > 3000 ||
    typeof p.reducedMotion !== "boolean" ||
    (p.showAppIcon !== undefined && typeof p.showAppIcon !== "boolean")
  )
    throw new Error("动画设置无效");
  return {
    duration: Math.round(p.duration),
    reducedMotion: p.reducedMotion,
    showAppIcon: p.showAppIcon ?? true,
  };
}
export function allowedApplication(file: string, platform: string): boolean {
  if (typeof file !== "string" || file.includes("\0")) return false;
  const paths = platform === "win32" ? path.win32 : path.posix;
  if (!paths.isAbsolute(file)) return false;
  const ext = paths.extname(file).toLowerCase();
  return platform === "darwin"
    ? ext === ".app"
    : platform === "win32" && [".exe", ".lnk"].includes(ext);
}
export function decodeState(input: unknown): SavedState {
  const s = input as (Omit<SavedState, "version"> & { version: number }) | null;
  if (
    !s ||
    (s.version !== 1 && s.version !== 2) ||
    !Array.isArray(s.targets) ||
    s.targets.length > 200
  )
    throw new Error("配置文件格式无效");
  const ids = new Set<string>();
  const targets = s.targets.map((t: Target) => {
    if (
      !t ||
      typeof t.id !== "string" ||
      !t.id ||
      ids.has(t.id) ||
      typeof t.name !== "string" ||
      !t.name ||
      !(t.path === null || typeof t.path === "string")
    )
      throw new Error("应用配置无效");
    ids.add(t.id);
    if (t.url && !/^https:\/\//.test(t.url)) throw new Error("网页地址无效");
    return {
      id: t.id,
      name: t.name.slice(0, 100),
      path: t.path,
      theme: themeId(t.theme),
      ...(t.builtin ? { builtin: true } : {}),
      ...(t.url ? { url: t.url } : {}),
      ...(t.preferences !== undefined
        ? { preferences: preferences(t.preferences) }
        : {}),
    };
  });
  return {
    version: 2,
    // Keep bound local apps and user-added targets. Retire unbound starter entries.
    targets: targets
      .filter((t) => s.version !== 1 || !t.builtin || !!t.path)
      .map(({ builtin: _builtin, ...target }) => target),
    preferences: preferences(s.preferences),
    settings: generalSettings(s.settings),
  };
}
