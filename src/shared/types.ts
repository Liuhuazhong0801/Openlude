export const THEMES = [
  {
    id: "portal",
    name: "光环穿梭",
    en: "PORTAL",
    description: "银灰轮廓缓缓展开，显现应用。",
    motion: "轮廓展开 · 轻缓景深",
    light: false,
    accent: "#8cd8d0",
  },
  {
    id: "aurora",
    name: "极光流体",
    en: "AURORA",
    description: "柔和光带在应用图标后流动。",
    motion: "程序化光带 · 流动显现",
    light: false,
    accent: "#80ddcd",
  },
  {
    id: "paper",
    name: "几何折叠",
    en: "FOLD",
    description: "纸片翻折并向外展开。",
    motion: "三维纸片 · 翻折展开",
    light: true,
    accent: "#6f83de",
  },
  {
    id: "pixel",
    name: "像素聚合",
    en: "PIXEL",
    description: "方块聚合成应用周围的轮廓。",
    motion: "三维方块 · 聚合成形",
    light: false,
    accent: "#ffb86a",
  },
  {
    id: "ink",
    name: "水墨晕染",
    en: "INK",
    description: "墨迹向两侧晕开，留出中央区域。",
    motion: "噪声遮罩 · 墨迹扩散",
    light: true,
    accent: "#9b9d91",
  },
] as const;
export type ThemeId = (typeof THEMES)[number]["id"];
export interface Target {
  id: string;
  name: string;
  path: string | null;
  url?: string;
  theme: ThemeId;
  builtin?: boolean;
  preferences?: Preferences;
}
export interface ViewTarget extends Target {
  available: boolean;
  icon?: string;
}
export interface Preferences {
  duration: number;
  reducedMotion: boolean;
}
export interface SavedState {
  version: 1;
  targets: Target[];
  preferences: Preferences;
}
export interface AppState extends Omit<SavedState, "targets"> {
  targets: ViewTarget[];
  platform: string;
  versionName: string;
}
export interface AnimationPayload {
  operationId: string;
  theme: ThemeId;
  duration: number;
  reducedMotion: boolean;
  name: string;
  icon?: string;
  preview: boolean;
}
export interface LaunchResult {
  ok: boolean;
  error?: string;
  focusConfirmed?: boolean;
}
export interface DesktopAPI {
  state(): Promise<AppState>;
  add(targetId?: string): Promise<AppState | null>;
  remove(id: string): Promise<AppState>;
  bind(
    id: string,
    theme: ThemeId,
    preferences?: Preferences,
  ): Promise<AppState>;
  preferences(value: Preferences): Promise<AppState>;
  launch(id: string): Promise<LaunchResult>;
  preview(
    theme: ThemeId,
    targetId?: string,
    preferences?: Preferences,
  ): Promise<LaunchResult>;
  overlayPayload(): Promise<AnimationPayload | null>;
  overlayReady(operationId: string): void;
  overlayFinish(operationId: string): void;
  onAnimate(callback: () => void): () => void;
}
