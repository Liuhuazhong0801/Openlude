export const THEMES = [
  {
    id: "comic",
    name: "漫画疾速",
    en: "COMIC",
    description: "分镜依次展开，跃入下一幕。",
    motion: "原创漫画 · 动态分镜与速度线",
    light: true,
    accent: "#e69b35",
  },
  {
    id: "anime",
    name: "晴空来信",
    en: "ANIME",
    description: "掠过海岸与云层，风带来飞鸟和樱花。",
    motion: "日漫风景 · 运镜、飞鸟与樱花",
    light: true,
    accent: "#6fbae5",
  },
  {
    id: "portal",
    name: "星海列车",
    en: "TRAIN",
    description: "隔着雨窗，驶过灯火与夜色。",
    motion: "车厢内视角 · 立体窗框、玻璃雨滴与窗外视差",
    light: false,
    accent: "#8cd8d0",
  },
  {
    id: "paper",
    name: "纸鹤山海",
    en: "FOLD",
    description: "纸鹤越过金箔山峦，花瓣随风掠过。",
    motion: "纸雕山海 · 振翅、金箔与前景花瓣",
    light: true,
    accent: "#6f83de",
  },
  {
    id: "pixel",
    name: "像素星航",
    en: "PIXEL",
    description: "驾驶像素飞船，穿过星云和远方城市。",
    motion: "像素太空 · 飞船、行星与分层视差",
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
  {
    id: "frog",
    name: "奶蛙大笑",
    en: "NAIWA",
    description: "原版奶蛙的捧腹大笑。",
    motion: "原版视频 · 原动作与原声 · 4.2 秒",
    light: true,
    accent: "#e6bf29",
  },
  {
    id: "feidudu",
    name: "肥嘟嘟",
    en: "FEIDUDU",
    description: "单只黄色袋鼠，抬腿扭胯跳起来。",
    motion: "原版独舞视频 · 原动作与原声 · 4 秒",
    light: true,
    accent: "#e0b849",
  },
] as const;
export type ThemeId = (typeof THEMES)[number]["id"];
export const themeHasSound = (theme: ThemeId) => theme === "frog" || theme === "feidudu";
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
  showAppIcon: boolean;
  playThemeSound?: boolean;
}
export interface GeneralSettings {
  appearance: "system" | "light" | "dark";
  autoStart: boolean;
  startInBackground: boolean;
  closeBehavior: "background" | "quit";
  autoCheckUpdates: boolean;
  animateExternalLaunches: boolean;
}
export interface ExternalLaunchStatus {
  state: "off" | "waiting" | "starting" | "ready" | "error";
  message: string;
}
export type SettingsSection = "general" | "appearance" | "updates" | "about";
export interface UpdateStatus {
  state: "idle" | "checking" | "current" | "empty" | "available" | "downloading" | "ready" | "error" | "development";
  message: string;
  version?: string;
  progress?: number;
}
export interface SavedState {
  version: 2;
  targets: Target[];
  preferences: Preferences;
  settings: GeneralSettings;
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
  showAppIcon: boolean;
  playThemeSound?: boolean;
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
  add(): Promise<AppState | null>;
  remove(id: string): Promise<AppState>;
  bind(
    id: string,
    theme: ThemeId,
    preferences?: Preferences,
  ): Promise<AppState>;
  preferences(value: Preferences): Promise<AppState>;
  settings(value: GeneralSettings): Promise<GeneralSettings>;
  externalLaunchStatus(): Promise<ExternalLaunchStatus>;
  onExternalLaunchStatus(callback: (status: ExternalLaunchStatus) => void): () => void;
  updateStatus(): Promise<UpdateStatus>;
  checkUpdates(): Promise<UpdateStatus>;
  downloadUpdate(): Promise<void>;
  installUpdate(): Promise<void>;
  openProject(): Promise<void>;
  onUpdate(callback: (status: UpdateStatus) => void): () => void;
  onOpenSettings(callback: (section?: SettingsSection) => void): () => void;
  launch(id: string): Promise<LaunchResult>;
  preview(
    theme: ThemeId,
    targetId?: string,
    preferences?: Preferences,
  ): Promise<LaunchResult>;
  overlayPayload(): Promise<AnimationPayload | null>;
  overlayReady(operationId: string): void;
  overlayFinish(operationId: string): void;
  overlaySkip(operationId: string): void;
  onAnimate(callback: () => void): () => void;
}
