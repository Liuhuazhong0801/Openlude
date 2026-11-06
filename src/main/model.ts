import path from "node:path";
import {
  THEMES,
  type ThemeId,
  type SavedState,
  type Target,
  type Preferences,
} from "../shared/types";
export function themeId(value: unknown): ThemeId {
  if (!THEMES.some((t) => t.id === value)) throw new Error("未知动画主题");
  return value as ThemeId;
}
export function preferences(value: unknown): Preferences {
  const p = value as Partial<Preferences> | null;
  if (
    !p ||
    typeof p.duration !== "number" ||
    !Number.isFinite(p.duration) ||
    p.duration < 600 ||
    p.duration > 3000 ||
    typeof p.reducedMotion !== "boolean"
  )
    throw new Error("动画设置无效");
  return { duration: Math.round(p.duration), reducedMotion: p.reducedMotion };
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
  const s = input as SavedState | null;
  if (
    !s ||
    s.version !== 1 ||
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
      builtin: !!t.builtin,
      ...(t.url ? { url: t.url } : {}),
    };
  });
  return { version: 1, targets, preferences: preferences(s.preferences) };
}
