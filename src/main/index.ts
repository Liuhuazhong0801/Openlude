import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  Tray,
  nativeImage,
  systemPreferences,
  nativeTheme,
  screen,
  shell,
  type IpcMainInvokeEvent,
} from "electron";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { allowedApplication, decodeState, generalSettings, initialState, preferences, themeId } from "./model";
import { copyLegacySettings } from "./migration";
import { PROJECT_URL, UpdateManager } from "./updates";
import { applicationIcon } from "./icons";
import { fadeWindowOut } from "./transition";
import { LaunchObserver } from "./launch-observer";
import { StateStore } from "./state-store";
import { playbackPreferences, QUICK_REVEAL_DURATION, revealDuration } from "../shared/transition";
import type {
  AnimationPayload,
  AppState,
  LaunchResult,
  SavedState,
  Target,
  ThemeId,
  ViewTarget,
  Preferences,
  GeneralSettings,
  SettingsSection,
} from "../shared/types";

const exec = promisify(execFile);
// Use the verified Metal backend while keeping hardware acceleration enabled.
if (process.platform === "darwin")
  app.commandLine.appendSwitch("use-angle", "metal");
app.setName("Openlude");
app.setPath("userData", process.env.OPENLUDE_TEST_DATA || path.join(app.getPath("appData"), "Openlude"));
let main: BrowserWindow | null = null;
let overlay: BrowserWindow | null = null;
let payload: AnimationPayload | null = null;
let busy = false;
let finishing = false;
let launchStarted = false;
let launchTask: Promise<LaunchResult> | null = null;
let activeTarget: Target | null = null;
let externalProcessId: number | undefined;
let resolveRun: ((value: LaunchResult) => void) | null = null;
let watchdog: ReturnType<typeof setTimeout> | null = null;
let overlayExit: Promise<void> | null = null;
let state: SavedState;
let updates: UpdateManager;
let launchObserver: LaunchObserver | undefined;
let tray: Tray | null = null;
let quitting = false;
let stateStore: StateStore;
const renderPath = (name: string) =>
  path.join(__dirname, "../../dist-renderer", name);
const preload = path.join(__dirname, "../preload/index.js");
const configFile = () => path.join(app.getPath("userData"), "settings.json");
const exists = async (file: string) =>
  fs.access(file).then(
    () => true,
    () => false,
  );

async function readState() {
  if (!process.env.OPENLUDE_TEST_DATA) {
    // Keep this old name only for upgrade compatibility.
    await copyLegacySettings(configFile(), path.join(app.getPath("appData"), "TimeGate", "settings.json"))
      .catch(() => console.warn("The previous configuration could not be imported; it was left intact."));
  }
  let savedVersion: number;
  let needsMigration = false;
  try {
    const saved = JSON.parse(await fs.readFile(configFile(), "utf8"));
    state = decodeState(saved);
    savedVersion = saved.version;
    needsMigration = savedVersion !== state.version || saved.targets.some((target: Target) =>
      state.targets.find(item => item.id === target.id)?.theme !== target.theme);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      const backup = `${configFile()}.invalid-${Date.now()}`;
      await fs.rename(configFile(), backup).catch(() => {});
      console.warn("Invalid configuration was preserved as a backup.");
    }
    state = initialState(systemPreferences.getAnimationSettings().prefersReducedMotion);
    return;
  }
  if (needsMigration) {
    try {
      const reason = savedVersion === 1 ? "v1-backup" : "themes-backup";
      await fs.copyFile(configFile(), `${configFile()}.${reason}-${Date.now()}`);
      await persistState(state);
    } catch {
      console.warn("Configuration migration is active but could not be saved.");
    }
  }
}
async function persistState(next: SavedState): Promise<void> {
  await fs.mkdir(app.getPath("userData"), { recursive: true });
  await fs.writeFile(`${configFile()}.tmp`, JSON.stringify(next, null, 2), "utf8");
  await fs.rename(`${configFile()}.tmp`, configFile());
}
async function updateState(...args: Parameters<StateStore["update"]>) {
  await stateStore.update(...args);
  if (!quitting) { refreshTray(); syncLaunchObserver(); }
}
function syncLaunchObserver() {
  launchObserver?.configure(state.targets, state.settings.animateExternalLaunches);
}

async function showMain(section?: SettingsSection) {
  if (!state || quitting) return;
  if (!main) await createMain();
  if (!main) return;
  if (main.isMinimized()) main.restore();
  main.show();
  main.focus();
  if (section) main.webContents.send("settings:open", section);
}

function refreshTray() {
  if (!tray || !state) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "打开工作台", click: () => { void showMain(); } },
    { label: "启动应用", enabled: state.targets.length > 0, submenu: state.targets.map(target => ({
      label: target.name.replace(/&/g, "&&"),
      click: async () => {
        const result = await runAnimation(target.theme, target, false);
        if (!result.ok && !quitting) {
          await showMain();
          await dialog.showMessageBox(main!, { type: "error", title: "无法启动应用", message: result.error || "启动失败" });
        }
      },
    })) },
    { type: "separator" },
    { label: "设置…", click: () => { void showMain("general"); } },
    { label: "检查更新", click: async () => { await showMain("updates"); await updates.check(); } },
    { type: "separator" },
    { label: "退出 Openlude", click: () => app.quit() },
  ]));
}

function createTray() {
  const icon = nativeImage.createFromPath(renderPath(process.platform === "darwin"
    ? "assets/branding/trayTemplate.png" : "assets/branding/app-icon.png"));
  if (process.platform === "darwin") icon.setTemplateImage(true);
  tray = new Tray(process.platform === "darwin" ? icon : icon.resize({ width: 24, height: 24 }));
  tray.setToolTip("Openlude");
  if (process.platform !== "darwin") tray.on("click", () => { void showMain(); });
  refreshTray();
}

function setLoginItem(settings: GeneralSettings) {
  app.setLoginItemSettings({
    openAtLogin: settings.autoStart,
    ...(process.platform === "win32" ? {
      path: app.getPath("exe"),
      args: settings.startInBackground ? ["--background"] : [],
    } : {}),
  });
}
async function hydrate(target: Target): Promise<ViewTarget> {
  const available = target.path ? await exists(target.path) : !!target.url;
  const icon = target.path && available ? await applicationIcon(target.path) : undefined;
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
function findTarget(id: unknown, from = state): Target {
  const target = from.targets.find((t) => t.id === id);
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
        return { ok: false, error: "应用路径已失效，请移除后重新添加。" };
      launchObserver?.expectInternal(target.id);
      if (process.platform === "darwin")
        await exec("/usr/bin/open", ["-g", target.path], { timeout: 8000 });
      else {
        const error = await deadline(shell.openPath(target.path), 8000);
        if (error) { launchObserver?.cancelInternal(target.id); return { ok: false, error: `无法启动应用：${error}` }; }
      }
    } else if (target.url?.startsWith("https://"))
      await deadline(shell.openExternal(target.url), 8000);
    else return { ok: false, error: "请先添加本机应用。" };
    return { ok: true };
  } catch {
    launchObserver?.cancelInternal(target.id);
    return { ok: false, error: "系统未能打开应用，请检查安装位置后重试。" };
  }
}
async function activateTarget(target: Target, observedPid?: number): Promise<boolean> {
  if (!target.path) return false;
  if (process.platform === "darwin") {
    if (observedPid !== undefined) return launchObserver?.activate(target.id) ?? false;
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
      ...(observedPid ? ["-ProcessId", String(observedPid)] : []),
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
        result.focusConfirmed = await activateTarget(target, externalProcessId).catch(() => false);
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
    externalProcessId = undefined;
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
  observedPid?: number,
): Promise<LaunchResult> {
  if (busy) return { ok: false, error: "上一次启动仍在进行。" };
  if (!preview && target && !(await hydrate(target)).available)
    return { ok: false, error: "应用未安装或路径已失效，请移除后重新添加。" };
  if (busy) return { ok: false, error: "上一次启动仍在进行。" };
  busy = true;
  try {
    const hydrated = target ? await hydrate(target) : null;
    const savedSettings =
      previewPreferences ?? target?.preferences ?? state.preferences;
    const settings = playbackPreferences(theme, {
      ...savedSettings,
      showAppIcon: savedSettings.showAppIcon && !!hydrated?.icon,
    });
    payload = {
      operationId: randomUUID(),
      theme,
      duration: settings.duration,
      reducedMotion: settings.reducedMotion,
      showAppIcon: settings.showAppIcon,
      playThemeSound: settings.playThemeSound ?? false,
      name: target?.name ?? "",
      icon: hydrated?.icon,
      preview,
    };
    activeTarget = target;
    externalProcessId = observedPid;
    const display = observedPid !== undefined
      ? screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
      : main
      ? screen.getDisplayMatching(main.getBounds())
      : screen.getPrimaryDisplay();
    const window = new BrowserWindow({
      ...display.bounds,
      frame: false,
      resizable: false,
      movable: false,
      show: false,
      skipTaskbar: true,
      transparent: true,
      backgroundColor: "#00000000",
      roundedCorners: false,
      alwaysOnTop: true,
      fullscreenable: false,
      hasShadow: false,
      webPreferences: {
        preload,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        backgroundThrottling: false,
        autoplayPolicy: "no-user-gesture-required",
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
  ipcMain.handle("launch-observer:status", event => {
    mainOnly(event); return launchObserver?.status ?? { state: "starting", message: "正在连接系统启动检测…" };
  });
  ipcMain.handle("settings:update", async (event, value: unknown) => {
    mainOnly(event);
    const next = generalSettings(value);
    await updateState(draft => { draft.settings = next; }, (previous) => {
      const changedLogin = next.autoStart !== previous.settings.autoStart ||
        (next.autoStart && next.startInBackground !== previous.settings.startInBackground);
      if (!changedLogin) return;
      if (!app.isPackaged && !process.env.OPENLUDE_TEST_DATA)
        throw new Error("请在安装版中设置开机启动");
      setLoginItem(next);
      return () => setLoginItem(previous.settings);
    });
    nativeTheme.themeSource = next.appearance;
    updates.autoCheck(next.autoCheckUpdates);
    return next;
  });
  ipcMain.handle("updates:status", event => { mainOnly(event); return updates.status; });
  ipcMain.handle("updates:check", event => { mainOnly(event); return updates.check(); });
  ipcMain.handle("updates:download", event => { mainOnly(event); return updates.download(); });
  ipcMain.handle("updates:install", event => {
    mainOnly(event);
    if (busy) throw new Error("请等待动画播放完成");
    // quitAndInstall closes windows before emitting before-quit.
    quitting = true;
    try { updates.install(); }
    catch (error) { quitting = false; throw error; }
  });
  ipcMain.handle("project:open", event => { mainOnly(event); return shell.openExternal(PROJECT_URL); });
  ipcMain.handle("state", (event) => {
    mainOnly(event);
    return viewState();
  });
  ipcMain.handle("target:add", async (event) => {
    mainOnly(event);
    if (busy) throw new Error("请等待启动完成");
    if (state.targets.length >= 200) throw new Error("最多可添加 200 个应用。");
    const selection = await dialog.showOpenDialog(main!, {
      title: "添加本机应用",
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
    await updateState(draft => {
      if (draft.targets.length >= 200) throw new Error("最多可添加 200 个应用。");
      const duplicate = draft.targets.find((t) => t.path === file);
      if (duplicate) throw new Error(`已添加 ${duplicate.name}`);
      draft.targets.push({ id: randomUUID(), name: path.basename(file, path.extname(file)), path: file, theme: "portal" });
    });
    return viewState();
  });
  ipcMain.handle("target:remove", async (event, id: string) => {
    mainOnly(event);
    if (busy) throw new Error("请等待启动完成");
    await updateState(draft => {
      findTarget(id, draft);
      draft.targets = draft.targets.filter((t) => t.id !== id);
    });
    return viewState();
  });
  ipcMain.handle(
    "target:bind",
    async (event, id: string, theme: unknown, value?: unknown) => {
      mainOnly(event);
      const nextTheme = themeId(theme);
      const nextPreferences = value === undefined ? undefined : preferences(value);
      await updateState(draft => {
        const target = findTarget(id, draft);
        target.theme = nextTheme;
        if (nextPreferences !== undefined) target.preferences = nextPreferences;
      });
      return viewState();
    },
  );
  ipcMain.handle("preferences", async (event, value: unknown) => {
    mainOnly(event);
    const next = preferences(value);
    await updateState(draft => { draft.preferences = next; });
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
      launchTask = externalProcessId !== undefined ? Promise.resolve({ ok: true }) : startTarget(activeTarget);
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

async function createMain(hidden = false) {
  main = new BrowserWindow({
    width: 1320,
    height: 850,
    minWidth: 1120,
    minHeight: 760,
    show: !hidden,
    title: "Openlude",
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#191a1d" : "#ffffff",
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
  main.on("close", event => {
    if (!quitting) {
      event.preventDefault();
      if (state.settings.closeBehavior === "background" && tray) {
        main?.hide();
      } else {
        // Let the cancelled close finish before starting the app-wide quit.
        setImmediate(() => app.quit());
      }
      return;
    }
    if (payload) void finishRun("主窗口已关闭。");
  });
  main.on("closed", () => {
    main = null;
  });
  await main.loadFile(renderPath("index.html"));
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("before-quit", () => { quitting = true; launchObserver?.stop(); });
  app.on("will-quit", () => { tray?.destroy(); tray = null; });
  app.on("second-instance", () => {
    void showMain();
  });
  app
    .whenReady()
    .then(async () => {
      Menu.setApplicationMenu(
        Menu.buildFromTemplate([
          ...(process.platform === "darwin"
            ? [
                {
                  label: "Openlude",
                  submenu: [
                    { role: "about" as const },
                    { label: "设置…", accelerator: "CmdOrCtrl+,", click: () => { void showMain("general"); } },
                    { type: "separator" as const },
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
      stateStore = new StateStore(state, persistState, next => { state = next; });
      nativeTheme.themeSource = state.settings.appearance;
      updates = new UpdateManager(status => main?.webContents.send("updates:status", status));
      const nativeRoot = app.isPackaged ? path.join(process.resourcesPath, "native") : path.join(__dirname, "../../native");
      launchObserver = new LaunchObserver(nativeRoot,
        app.isPackaged ? nativeRoot : path.join(__dirname, "../../dist-native"),
        (id, pid) => {
          if (busy || quitting) return;
          const target = state.targets.find(item => item.id === id);
          if (target) void runAnimation(target.theme, target, false, undefined, pid);
        }, status => main?.webContents.send("launch-observer:status", status));
      registerIPC();
      createTray();
      const backgroundLaunch = process.argv.includes("--background") ||
        (process.platform === "darwin" && state.settings.startInBackground && app.getLoginItemSettings().wasOpenedAtLogin);
      await createMain(backgroundLaunch);
      syncLaunchObserver();
      updates.autoCheck(state.settings.autoCheckUpdates);
    })
    .catch((error) => {
      console.error(error);
      app.quit();
    });
  app.on("activate", () => {
    if (app.isReady()) void showMain();
  });
  app.on("window-all-closed", () => {
    if (!tray && process.platform !== "darwin") app.quit();
  });
}
