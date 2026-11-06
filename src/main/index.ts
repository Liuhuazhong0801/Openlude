import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  systemPreferences,
  screen,
  shell,
  type IpcMainInvokeEvent,
} from "electron";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { allowedApplication, decodeState, preferences, themeId } from "./model";
import { applicationIcon, presetIcon } from "./icons";
import { fadeWindowOut } from "./transition";
import { QUICK_REVEAL_DURATION, revealDuration } from "../shared/transition";
import type {
  AnimationPayload,
  AppState,
  LaunchResult,
  SavedState,
  Target,
  ThemeId,
  ViewTarget,
  Preferences,
} from "../shared/types";

const exec = promisify(execFile);
// Use the verified Metal backend while keeping hardware acceleration enabled.
if (process.platform === "darwin")
  app.commandLine.appendSwitch("use-angle", "metal");
if (process.env.TIMEGATE_TEST_DATA)
  app.setPath("userData", process.env.TIMEGATE_TEST_DATA);
let main: BrowserWindow | null = null;
let overlay: BrowserWindow | null = null;
let payload: AnimationPayload | null = null;
let busy = false;
let finishing = false;
let launchStarted = false;
let launchTask: Promise<LaunchResult> | null = null;
let activeTarget: Target | null = null;
let resolveRun: ((value: LaunchResult) => void) | null = null;
let watchdog: ReturnType<typeof setTimeout> | null = null;
let overlayExit: Promise<void> | null = null;
let state: SavedState;
let saveQueue = Promise.resolve();
const renderPath = (name: string) =>
  path.join(__dirname, "../../dist-renderer", name);
const preload = path.join(__dirname, "../preload/index.js");
const configFile = () => path.join(app.getPath("userData"), "settings.json");
const exists = async (file: string) =>
  fs.access(file).then(
    () => true,
    () => false,
  );

async function initialState(): Promise<SavedState> {
  const presets: Target[] = [
    { id: "codex", name: "Codex", path: null, theme: "portal", builtin: true },
    {
      id: "workbuddy",
      name: "WorkBuddy",
      path: null,
      theme: "paper",
      builtin: true,
    },
    {
      id: "deepseek",
      name: "DeepSeek",
      path: null,
      url: "https://chat.deepseek.com/",
      theme: "aurora",
      builtin: true,
    },
    {
      id: "doubao",
      name: "豆包",
      path: null,
      url: "https://www.doubao.com/chat/",
      theme: "pixel",
      builtin: true,
    },
  ];
  if (process.platform === "darwin") {
    const roots = ["/Applications", path.join(os.homedir(), "Applications")];
    const names = [
      "Codex.app",
      "ChatGPT.app",
      "WorkBuddy.app",
      "workbuddy.app",
      "DeepSeek.app",
      "DeepSeek Harness.app",
      "豆包.app",
      "Doubao.app",
    ];
    for (const target of presets) {
      for (const root of roots)
        for (const name of names) {
          const key = name.toLowerCase();
          const match =
            target.id === "codex"
              ? /codex|chatgpt/.test(key)
              : target.id === "doubao"
                ? /doubao|豆包/.test(key)
                : key.includes(target.id);
          if (match && !target.path && (await exists(path.join(root, name)))) {
            const candidate = path.join(root, name);
            // Some Codex builds retain the ChatGPT bundle filename.
            // The ordinary ChatGPT app must not be mistaken for Codex.
            if (name === "ChatGPT.app") {
              const identity = await exec(
                "/usr/libexec/PlistBuddy",
                [
                  "-c",
                  "Print :CFBundleIdentifier",
                  path.join(candidate, "Contents/Info.plist"),
                ],
                { timeout: 2000 },
              ).catch(() => null);
              if (identity?.stdout.trim() !== "com.openai.codex") continue;
            }
            target.path = candidate;
          }
        }
    }
  }
  return {
    version: 1,
    targets: presets,
    preferences: {
      duration: 1800,
      reducedMotion:
        systemPreferences.getAnimationSettings().prefersReducedMotion,
    },
  };
}

async function readState() {
  try {
    state = decodeState(JSON.parse(await fs.readFile(configFile(), "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      const backup = `${configFile()}.invalid-${Date.now()}`;
      await fs.rename(configFile(), backup).catch(() => {});
      console.warn("Invalid configuration was preserved as a backup.");
    }
    state = await initialState();
  }
}
function save(): Promise<void> {
  const snapshot = JSON.stringify(state, null, 2);
  const next = saveQueue
    .catch(() => {})
    .then(async () => {
      await fs.mkdir(app.getPath("userData"), { recursive: true });
      await fs.writeFile(`${configFile()}.tmp`, snapshot, "utf8");
      await fs.rename(`${configFile()}.tmp`, configFile());
    });
  saveQueue = next;
  return next;
}
async function hydrate(target: Target): Promise<ViewTarget> {
  const available = target.path ? await exists(target.path) : !!target.url;
  const icon =
    (target.path && available
      ? await applicationIcon(target.path)
      : undefined) ??
    (target.builtin ? await presetIcon(target.id) : undefined);
  return { ...target, available, icon };
}
async function viewState(): Promise<AppState> {
  return {
    ...state,
    targets: await Promise.all(state.targets.map(hydrate)),
    platform: process.platform,
    versionName: app.getVersion(),
  };
}
function findTarget(id: unknown): Target {
  const target = state.targets.find((t) => t.id === id);
  if (!target) throw new Error("找不到这个应用");
  return target;
}
function mainOnly(event: IpcMainInvokeEvent) {
  if (
    !main ||
    event.sender !== main.webContents ||
    event.senderFrame !== main.webContents.mainFrame
  )
    throw new Error("Invalid window");
}
function protect(win: BrowserWindow) {
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event) => event.preventDefault());
}
async function deadline<T>(
  promise: Promise<T>,
  milliseconds: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("系统打开请求超时")),
          milliseconds,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}

async function startTarget(target: Target): Promise<LaunchResult> {
  try {
    if (target.path) {
      if (
        !allowedApplication(target.path, process.platform) ||
        !(await exists(target.path))
      )
        return { ok: false, error: "应用路径已失效，请重新定位。" };
      if (process.platform === "darwin")
        await exec("/usr/bin/open", ["-g", target.path], { timeout: 8000 });
      else {
        const error = await deadline(shell.openPath(target.path), 8000);
        if (error) return { ok: false, error: `无法启动应用：${error}` };
      }
    } else if (target.url?.startsWith("https://"))
      await deadline(shell.openExternal(target.url), 8000);
    else return { ok: false, error: "请先定位本机应用。" };
    return { ok: true };
  } catch {
    return { ok: false, error: "系统未能打开应用，请检查安装位置后重试。" };
  }
}
async function activateTarget(target: Target): Promise<boolean> {
  if (!target.path) return false;
  if (process.platform === "darwin") {
    await exec("/usr/bin/open", [target.path], { timeout: 8000 });
    return false; // Launch Services accepted the request; it is not proof of foreground focus.
  }
  const script = app.isPackaged
    ? path.join(process.resourcesPath, "native/focus-windows.ps1")
    : path.join(__dirname, "../../native/focus-windows.ps1");
  const result = await exec(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      script,
      "-TargetPath",
      target.path,
    ],
    { timeout: 5000, windowsHide: true },
  );
  return result.stdout.trim() === "True";
}

function dismissOverlay(
  window: BrowserWindow | null,
  duration: number,
): Promise<void> {
  if (!window || window.isDestroyed()) return Promise.resolve();
  if (overlayExit) return overlayExit;
  overlayExit = (async () => {
    try {
      await fadeWindowOut(window, duration);
    } catch {
      // A platform compositor failure should fall back to closing the overlay.
      console.warn("Native fade was unavailable; closing the animation window.");
    } finally {
      if (overlay === window) overlay = null;
      if (!window.isDestroyed()) window.destroy();
    }
  })();
  return overlayExit;
}

function skipRun() {
  // Skipping must release the screen even when the OS launch request is slow.
  void dismissOverlay(overlay, QUICK_REVEAL_DURATION);
  void finishRun();
}

async function finishRun(failure?: string) {
  if (!payload || finishing) return;
  finishing = true;
  if (watchdog) clearTimeout(watchdog);
  watchdog = null;
  const current = payload;
  const target = activeTarget;
  const window = overlay;
  // A slow or unresponsive external application must never trap the user here.
  const handoffDeadline = setTimeout(() => {
    void dismissOverlay(window, QUICK_REVEAL_DURATION);
  }, 1800);
  let result: LaunchResult = failure
    ? { ok: false, error: failure }
    : { ok: true };
  try {
    if (failure) await dismissOverlay(window, 0);
    if (!current.preview && target) {
      const launch = launchTask
        ? await launchTask
        : { ok: false, error: "动画窗口未就绪，应用尚未启动。" };
      if (!launch.ok) result = launch;
      else if (!failure) {
        // Bring the real application forward while the animation still covers it.
        result.focusConfirmed = await activateTarget(target).catch(() => false);
        if (window && !window.isDestroyed()) await delay(120);
      }
    }
    if (current.preview || !result.ok) {
      main?.show();
      main?.focus();
    }
    await dismissOverlay(
      window,
      revealDuration(current.reducedMotion, current.duration),
    );
  } catch {
    result = { ok: false, error: "动画交接失败，请直接打开目标应用。" };
    if (window && !window.isDestroyed()) window.destroy();
    if (overlay === window) overlay = null;
    main?.show();
    main?.focus();
  } finally {
    clearTimeout(handoffDeadline);
    const resolve = resolveRun;
    payload = null;
    activeTarget = null;
    launchTask = null;
    resolveRun = null;
    overlayExit = null;
    launchStarted = false;
    busy = false;
    finishing = false;
    resolve?.(result);
  }
}
async function runAnimation(
  theme: ThemeId,
  target: Target | null,
  preview: boolean,
  previewPreferences?: Preferences,
): Promise<LaunchResult> {
  if (busy) return { ok: false, error: "上一次启动仍在进行。" };
  if (!preview && target && !(await hydrate(target)).available)
    return { ok: false, error: "应用未安装或路径已失效，请重新定位。" };
  if (busy) return { ok: false, error: "上一次启动仍在进行。" };
  busy = true;
  try {
    const hydrated = target ? await hydrate(target) : null;
    const settings =
      previewPreferences ?? target?.preferences ?? state.preferences;
    payload = {
      operationId: randomUUID(),
      theme,
      duration: settings.duration,
      reducedMotion: settings.reducedMotion,
      name: target?.name ?? "",
      icon: hydrated?.icon,
      preview,
    };
    activeTarget = target;
    const display = main
      ? screen.getDisplayMatching(main.getBounds())
      : screen.getPrimaryDisplay();
    const window = new BrowserWindow({
      ...display.bounds,
      frame: false,
      resizable: false,
      movable: false,
      show: false,
      skipTaskbar: true,
      backgroundColor: ["paper", "ink"].includes(theme)
        ? "#f2efe7"
        : theme === "portal"
          ? "#15191e"
          : "#080e16",
      alwaysOnTop: true,
      fullscreenable: false,
      hasShadow: false,
      webPreferences: {
        preload,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    });
    overlay = window;
    protect(window);
    window.webContents.on("before-input-event", (_e, input) => {
      if (input.key === "Escape" && input.type === "keyDown") skipRun();
    });
    window.webContents.on("render-process-gone", () => {
      void finishRun("动画渲染已退出。");
    });
    window.on("closed", () => {
      if (overlay === window) void finishRun();
    });
    const result = new Promise<LaunchResult>((resolve) => {
      resolveRun = resolve;
    });
    watchdog = setTimeout(() => {
      void finishRun("动画加载超时，已关闭动画窗口。");
    }, 7000);
    await window.loadFile(renderPath("overlay.html"));
    return await result;
  } catch {
    if (payload) await finishRun("无法创建动画窗口。");
    busy = false;
    return { ok: false, error: "无法创建动画窗口。" };
  }
}

function registerIPC() {
  ipcMain.handle("state", (event) => {
    mainOnly(event);
    return viewState();
  });
  ipcMain.handle("target:add", async (event, id?: string) => {
    mainOnly(event);
    if (busy) throw new Error("请等待启动完成");
    const existing = id ? findTarget(id) : null;
    const selection = await dialog.showOpenDialog(main!, {
      title: existing ? `定位 ${existing.name}` : "添加本机应用",
      defaultPath: process.platform === "darwin" ? "/Applications" : undefined,
      properties: ["openFile"],
      filters: [
        {
          name: "应用",
          extensions: process.platform === "darwin" ? ["app"] : ["exe", "lnk"],
        },
      ],
    });
    if (selection.canceled || !selection.filePaths[0]) return null;
    const file = selection.filePaths[0];
    if (!allowedApplication(file, process.platform) || !(await exists(file)))
      throw new Error("请选择有效的应用文件");
    const ownExe = app.getPath("exe");
    if (file === ownExe || ownExe.startsWith(file + path.sep))
      throw new Error("请选择要添加启动动画的其他应用。");
    const duplicate = state.targets.find((t) => t.path === file && t.id !== id);
    if (duplicate) throw new Error(`已添加 ${duplicate.name}`);
    if (existing) existing.path = file;
    else
      state.targets.push({
        id: randomUUID(),
        name: path.basename(file, path.extname(file)),
        path: file,
        theme: "portal",
      });
    await save();
    return viewState();
  });
  ipcMain.handle("target:remove", async (event, id: string) => {
    mainOnly(event);
    if (busy) throw new Error("请等待启动完成");
    const target = findTarget(id);
    if (target.builtin) target.path = null;
    else state.targets = state.targets.filter((t) => t.id !== id);
    await save();
    return viewState();
  });
  ipcMain.handle(
    "target:bind",
    async (event, id: string, theme: unknown, value?: unknown) => {
      mainOnly(event);
      const target = findTarget(id);
      const nextTheme = themeId(theme);
      const nextPreferences =
        value === undefined ? target.preferences : preferences(value);
      const previous = { theme: target.theme, preferences: target.preferences };
      target.theme = nextTheme;
      target.preferences = nextPreferences;
      try {
        await save();
      } catch (error) {
        Object.assign(target, previous);
        throw error;
      }
      return viewState();
    },
  );
  ipcMain.handle("preferences", async (event, value: unknown) => {
    mainOnly(event);
    state.preferences = preferences(value);
    await save();
    return viewState();
  });
  ipcMain.handle("launch", (event, id: string) => {
    mainOnly(event);
    const target = findTarget(id);
    return runAnimation(target.theme, target, false);
  });
  ipcMain.handle(
    "preview",
    (event, theme: unknown, id?: string, value?: unknown) => {
      mainOnly(event);
      return runAnimation(
        themeId(theme),
        id ? findTarget(id) : null,
        true,
        value === undefined ? undefined : preferences(value),
      );
    },
  );
  ipcMain.handle("overlay:payload", (event) =>
    event.sender === overlay?.webContents ? payload : null,
  );
  ipcMain.on("overlay:ready", (event, id: string) => {
    if (
      !overlay ||
      event.sender !== overlay.webContents ||
      id !== payload?.operationId ||
      launchStarted ||
      finishing
    )
      return;
    launchStarted = true;
    if (watchdog) clearTimeout(watchdog);
    overlay.show();
    overlay.focus();
    overlay.webContents.send("overlay:animate");
    if (!payload.preview && activeTarget) {
      launchTask = startTarget(activeTarget);
      void launchTask.then((result) => {
        if (!result.ok) void finishRun(result.error);
      });
    }
    watchdog = setTimeout(() => {
      void finishRun();
    }, payload.duration + 1500);
  });
  ipcMain.on("overlay:finish", (event, id: string) => {
    if (event.sender === overlay?.webContents && id === payload?.operationId)
      void finishRun();
  });
  ipcMain.on("overlay:skip", (event, id: string) => {
    if (event.sender === overlay?.webContents && id === payload?.operationId)
      skipRun();
  });
}

async function createMain() {
  main = new BrowserWindow({
    width: 1320,
    height: 850,
    minWidth: 1120,
    minHeight: 760,
    title: "TimeGate",
    backgroundColor: "#ffffff",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: { x: 20, y: 19 },
    icon: renderPath("assets/branding/app-icon.png"),
    webPreferences: {
      preload,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  protect(main);
  main.on("close", () => {
    if (payload) void finishRun("主窗口已关闭。");
  });
  main.on("closed", () => {
    main = null;
  });
  await main.loadFile(renderPath("index.html"));
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    main?.show();
    main?.focus();
  });
  app
    .whenReady()
    .then(async () => {
      Menu.setApplicationMenu(
        Menu.buildFromTemplate([
          ...(process.platform === "darwin"
            ? [
                {
                  label: "TimeGate",
                  submenu: [
                    { role: "about" as const },
                    { role: "quit" as const },
                  ],
                },
              ]
            : []),
          {
            label: "编辑",
            submenu: [
              { role: "undo" },
              { role: "redo" },
              { type: "separator" },
              { role: "cut" },
              { role: "copy" },
              { role: "paste" },
              { role: "selectAll" },
            ],
          },
          { label: "窗口", submenu: [{ role: "minimize" }, { role: "close" }] },
        ]),
      );
      await readState();
      registerIPC();
      await createMain();
    })
    .catch((error) => {
      console.error(error);
      app.quit();
    });
  app.on("activate", () => {
    if (!main && app.isReady()) void createMain();
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
