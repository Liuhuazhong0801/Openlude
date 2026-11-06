import "./style.css";
import {
  THEMES,
  type AppState,
  type ThemeId,
  type Preferences,
  type ViewTarget,
} from "../shared/types";
import { MotionScene } from "./motion";
import { LaunchPlayback } from "./playback";
import { initializeSettings } from "./settings";
import { animationDuration, playbackPreferences } from "../shared/transition";

const paths: Record<string, string> = {
  play: "M9 5l11 7-11 7V5z",
  plus: "M12 5v14M5 12h14",
  search: "M21 21l-5-5M18 10a8 8 0 11-16 0 8 8 0 0116 0",
  expand: "M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5",
  check: "M5 12l4 4L19 6",
  settings: "M12 8a4 4 0 100 8 4 4 0 000-8M10 2h4l1 3 3 1 3-1 2 4-2 2v3l2 2-2 4-3-1-3 1-1 3h-4l-1-3-3-1-3 1-2-4 2-2v-3L1 9l2-4 3 1 3-1 1-3",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6",
  close: "M6 6l12 12M6 18L18 6",
};
const icon = (name: string, size = 16) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]}"/></svg>`;
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!;
$("#app").innerHTML = `
<header class="titlebar"><span>Openlude</span></header>
<div class="workspace">
  <aside class="sidebar" aria-label="应用列表">
    <div class="sidebar-heading"><h2>应用</h2><span id="app-count"></span></div>
    <label class="search-field">${icon("search")}<input id="app-search" type="search" placeholder="搜索应用" aria-label="搜索应用"></label>
    <div id="application-list" class="application-list"></div>
    <p class="empty-search" id="empty-search" hidden>没有匹配的应用</p>
    <button class="button add-button" id="add-app">${icon("plus")}添加应用</button>
    <div class="sidebar-bottom"><button class="text-button settings-entry" id="nav-settings" aria-current="false">${icon("settings")}设置</button></div>
  </aside>
  <main class="content">
    <section class="empty-workspace" id="empty-workspace" hidden><h1>添加你的第一个应用</h1><p>选择本机应用，为它设置启动动画。</p><button class="button primary" id="add-first-app">添加应用</button></section>
    <header class="target-header" id="target-header">
      <img id="target-icon" alt="" hidden>
      <div class="target-title"><h1 id="target-name">选择应用</h1><p id="target-status">为应用设置启动动画</p></div>
      <div class="target-actions"><button class="button" id="launch-target" disabled>启动应用</button></div>
    </header>
    <section class="themes" id="theme-section" aria-labelledby="themes-title">
      <h2 id="themes-title">动画主题</h2>
      <div class="theme-grid" role="group" aria-label="动画主题">${THEMES.map((t) => `<button class="theme-card" data-theme="${t.id}" aria-pressed="false"><div class="theme-art"><img src="./assets/themes/${t.id === "maple" ? "maple.jpg" : `${t.id}.png`}" alt=""><span class="theme-tick">${icon("check", 12)}</span></div><strong>${t.name}</strong></button>`).join("")}</div>
    </section>
    <section class="preview-section" id="preview-section" aria-labelledby="preview-title">
      <div class="section-heading"><h2 id="preview-title">预览</h2><span id="theme-name"></span></div>
      <div class="stage" id="preview-stage"><div class="app-emblem"><img id="preview-icon" alt="" hidden></div></div>
      <div class="playback-bar"><button class="button" id="play">${icon("play")}播放</button><div class="playback-track" role="progressbar" aria-label="播放进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i id="preview-progress"></i></div><span id="time-label">1.8 秒</span><button class="button" id="fullscreen" aria-label="全屏预览">${icon("expand")}全屏</button></div>
    </section>
  </main>
  <aside class="inspector" id="settings" aria-labelledby="settings-title">
    <h2 id="settings-title">动画设置</h2>
    <div class="setting-block" id="duration-setting"><div class="field-heading"><label for="duration">时长</label><div class="number-field"><input id="duration-value" aria-label="动画时长（秒）" type="number" min="0.6" max="3" step="0.1" value="1.8"><span>秒</span></div></div><input id="duration" type="range" min="600" max="3000" step="100" value="1800"><div class="range-limits"><span>0.6 秒</span><span>3.0 秒</span></div></div>
    <div class="setting-block fixed-duration" id="fixed-duration" hidden><div class="field-heading"><span>动画时长</span><strong>4 秒</strong></div></div>
    <label class="toggle-line"><span>显示应用图标</span><input type="checkbox" id="show-app-icon" checked><span class="switch" aria-hidden="true"></span></label>
    <label class="toggle-line"><span>柔和模式</span><input type="checkbox" id="reduced-motion"><span class="switch" aria-hidden="true"></span></label>
    <div class="inspector-bottom"><p id="save-status" aria-live="polite"></p><button class="button primary" id="apply" disabled>保存绑定</button></div>
  </aside>
</div>
<div class="toast" role="status" aria-live="polite" id="toast"></div>
<dialog id="help"><button class="icon-button dialog-close" id="close-help" aria-label="关闭说明">${icon("close")}</button><h2>使用启动动画</h2><ol><li>点击“添加应用”，选择本机安装的应用。</li><li>选择主题，调整时长、图标开场和柔和模式，点击“保存绑定”。</li><li>点击“启动应用”，播放已保存的动画并打开应用。</li></ol><p>播放和全屏只预览当前设置。切换应用会保留本次未保存的修改，关闭工作台则放弃这些修改。</p><p>原来的 Dock、任务栏图标仍按系统原有方式启动。应用移动后，可将鼠标移到左侧应用上，点击删除图标移除，再重新添加。</p><button class="button" id="help-done">知道了</button></dialog>`;

interface Draft extends Preferences {
  theme: ThemeId;
}
let state: AppState;
let settingsPage = false;
let selectedTarget = "";
const drafts = new Map<string, Draft>();
let scene: MotionScene | null = null;
let playback: LaunchPlayback;
let localPlaying = false;
let nativeBusy = false;
let saving = false;
let playbackGeneration = 0;
let toastTimer: ReturnType<typeof setTimeout>;
const stage = $("#preview-stage");
const emblem = stage.querySelector<HTMLElement>(".app-emblem")!;
const playButton = $<HTMLButtonElement>("#play");
const applyButton = $<HTMLButtonElement>("#apply");
function target() {
  return state.targets.find((t) => t.id === selectedTarget);
}
function saved(t: ViewTarget): Draft {
  return { ...state.preferences, ...t.preferences, theme: t.theme };
}
function draft(): Draft {
  const t = target();
  if (!t) return { ...state.preferences, theme: "portal" };
  if (!drafts.has(t.id)) drafts.set(t.id, saved(t));
  return drafts.get(t.id)!;
}
function changed(t: ViewTarget) {
  const d = drafts.get(t.id);
  const s = saved(t);
  return (
    !!d &&
    (d.theme !== s.theme ||
      d.duration !== s.duration ||
      d.reducedMotion !== s.reducedMotion ||
      d.showAppIcon !== s.showAppIcon)
  );
}
function toast(message: string, error = false) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.toggle("error", error);
  element.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(
    () => element.classList.remove("show"),
    error ? 5500 : 3200,
  );
}
async function guard(action: () => Promise<void>) {
  try {
    await action();
  } catch (e) {
    toast(
      String(e instanceof Error ? e.message : e).replace(
        /^Error invoking remote method '[^']+': (Error: )?/,
        "",
      ),
      true,
    );
  }
}
function setImage(selector: string, source?: string, name = "") {
  const image = $<HTMLImageElement>(selector);
  if (source && image.getAttribute("src") === source) return;
  image.hidden = true;
  image.alt = name ? `${name} 图标` : "";
  if (!source) {
    image.removeAttribute("src");
    return;
  }
  image.src = source;
  void image
    .decode()
    .then(() => {
      if (image.getAttribute("src") === source) image.hidden = false;
    })
    .catch(() => {});
}
function resetEmblem() {
  playback?.reset(draft().showAppIcon);
}
function stopPreview() {
  ++playbackGeneration;
  playback?.stop();
  localPlaying = false;
  resetEmblem();
  $("#preview-progress").style.width = "0%";
  $(".playback-track").setAttribute("aria-valuenow", "0");
}
function status(t: ViewTarget) {
  return t.path
    ? t.available
      ? "本机应用"
      : "路径失效"
    : t.url
      ? "网页入口"
      : "未添加";
}
function updateControls() {
  const t = target();
  const settings = draft();
  const fixed = settings.theme === "maple";
  $("#duration-setting").hidden = fixed;
  $("#fixed-duration").hidden = !fixed;
  $("#time-label").textContent = `${(animationDuration(playbackPreferences(settings.theme, {
    ...settings, showAppIcon: settings.showAppIcon && !!t?.icon,
  })) / 1000).toFixed(1)} 秒`;
  const busy = nativeBusy || saving;
  applyButton.disabled = !t || busy || !changed(t);
  playButton.disabled = !t || !scene || busy || localPlaying;
  $<HTMLButtonElement>("#fullscreen").disabled = !t || busy;
  $<HTMLButtonElement>("#launch-target").disabled = !t?.available || busy;
  $<HTMLButtonElement>("#add-app").disabled = busy;
  $<HTMLButtonElement>("#add-first-app").disabled = busy;
  $("#save-status").textContent = !t
    ? "请选择应用"
    : saving
      ? "正在保存…"
      : changed(t)
        ? "有未保存的修改"
        : "已保存";
  $("#launch-target").title =
    t && changed(t) ? "启动将使用已保存的设置" : "播放动画并打开应用";
  for (const element of document.querySelectorAll<HTMLInputElement>(
    "#duration, #duration-value, #reduced-motion, #show-app-icon",
  ))
    element.disabled = !t || busy;
  for (const element of document.querySelectorAll<HTMLButtonElement>(
    ".theme-card, .app-identity, .remove-app",
  ))
    element.disabled = !t || busy;
}
function renderTargets() {
  $("#app-count").textContent = String(state.targets.length);
  const query = $<HTMLInputElement>("#app-search")
    .value.trim()
    .toLocaleLowerCase();
  const matches = state.targets.filter((t) =>
    t.name.toLocaleLowerCase().includes(query),
  );
  $("#application-list").innerHTML = matches
    .map((t) => {
      const theme = THEMES.find((th) => th.id === t.theme)!;
      return `<article class="app-card ${t.id === selectedTarget ? "active" : ""}" data-id="${escape(t.id)}"><button class="app-identity" data-action="select" aria-label="选择 ${escape(t.name)}" aria-pressed="${t.id === selectedTarget}">${t.icon ? `<img class="app-icon" src="${escape(t.icon)}" alt="">` : `<span class="app-monogram">${escape(t.name.slice(0, 1))}</span>`}<span class="app-copy"><strong>${escape(t.name)}</strong><small>${t.available ? theme.name : status(t)}${t.url && !t.path ? " · 网页" : ""}</small></span>${changed(t) ? '<span class="unsaved" title="未保存" aria-label="有未保存的修改"></span>' : ""}</button><button class="icon-button remove-app" data-action="remove" aria-label="移除 ${escape(t.name)}" title="移除应用">${icon("trash", 15)}</button></article>`;
    })
    .join("");
  $("#empty-search").hidden = matches.length > 0;
  $("#empty-search").textContent = state.targets.length ? "没有匹配的应用" : "暂无应用";
  updateControls();
}
function updateSelection() {
  const t = target();
  const d = draft();
  const theme = THEMES.find((item) => item.id === d.theme)!;
  $(".workspace").classList.toggle("empty", !t);
  $("#empty-workspace").hidden = !!t;
  for (const selector of ["#target-header", "#theme-section", "#preview-section", "#settings"])
    $(selector).hidden = !t;
  for (const [image, label] of [
    ["#target-icon", "#target-name"],
  ]) {
    setImage(image, t?.icon, t?.name);
    $(label).textContent = t?.name ?? "选择应用";
  }
  setImage("#preview-icon", t?.icon, t?.name);
  $("#target-status").textContent = t
    ? (t.available ? "" : status(t))
    : "";
  $("#theme-name").textContent = theme.name;
  for (const card of document.querySelectorAll<HTMLButtonElement>(
    ".theme-card",
  )) {
    const selected = card.dataset.theme === d.theme;
    card.classList.toggle("selected", selected);
    card.setAttribute("aria-pressed", String(selected));
  }
  $<HTMLInputElement>("#duration").value = String(d.duration);
  $<HTMLInputElement>("#duration-value").value = (d.duration / 1000).toFixed(1);
  $<HTMLInputElement>("#reduced-motion").checked = d.reducedMotion;
  $<HTMLInputElement>("#show-app-icon").checked = d.showAppIcon;
  $("#time-label").textContent = `${(d.duration / 1000).toFixed(1)} 秒`;
  stopPreview();
  scene?.setTheme(d.theme);
  renderTargets();
}
function selectTarget(id: string) {
  showWorkspace();
  selectedTarget = id;
  updateSelection();
}
function showWorkspace() {
  settingsPage = false;
  $(".content").hidden = false;
  $("#general-settings").hidden = true;
  $(".workspace").classList.remove("show-settings");
  $("#nav-settings").setAttribute("aria-current", "false");
  $("#settings").hidden = !target();
}
function showSettings() {
  if (nativeBusy) return;
  stopPreview();
  updateControls();
  settingsPage = true;
  $(".content").hidden = true;
  $("#settings").hidden = true;
  $("#general-settings").hidden = false;
  $(".workspace").classList.add("show-settings");
  $("#nav-settings").setAttribute("aria-current", "page");
  $("#general-settings-title").focus();
}
async function nativeAction(
  action: () => ReturnType<typeof window.openlude.launch>,
) {
  if (nativeBusy) return;
  stopPreview();
  nativeBusy = true;
  updateControls();
  try {
    const result = await action();
    if (!result.ok) toast(result.error || "启动失败", true);
  } finally {
    nativeBusy = false;
    updateControls();
  }
}
async function addApplication() {
  const next = await window.openlude.add();
  if (!next) return;
  state = next;
  selectTarget(next.targets.at(-1)!.id);
  toast("应用已添加");
}
$(".theme-grid").addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
    "[data-theme]",
  );
  if (!button || nativeBusy || saving) return;
  draft().theme = button.dataset.theme as ThemeId;
  updateSelection();
});
$("#app-search").addEventListener("input", renderTargets);
$("#application-list").addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
    "[data-action]",
  );
  const id = button?.closest<HTMLElement>("[data-id]")?.dataset.id;
  if (!button || !id || nativeBusy || saving) return;
  if (button.dataset.action === "select") selectTarget(id);
  if (button.dataset.action === "remove") void guard(async () => {
    state = await window.openlude.remove(id);
    drafts.delete(id);
    selectTarget(id === selectedTarget ? state.targets[0]?.id ?? "" : selectedTarget);
  });
});
$("#add-app").addEventListener("click", () => {
  void guard(() => addApplication());
});
$("#add-first-app").addEventListener("click", () => {
  void guard(() => addApplication());
});
$("#launch-target").addEventListener("click", () => {
  void guard(() => nativeAction(() => window.openlude.launch(selectedTarget)));
});
applyButton.addEventListener("click", () => {
  void guard(async () => {
    if (!target() || saving) return;
    const id = selectedTarget;
    const d = { ...draft() };
    saving = true;
    updateControls();
    try {
      state = await window.openlude.bind(id, d.theme, {
        duration: d.duration,
        reducedMotion: d.reducedMotion,
        showAppIcon: d.showAppIcon,
      });
      drafts.delete(id);
      updateSelection();
      toast("已保存");
    } finally {
      saving = false;
      updateControls();
    }
  });
});
playButton.addEventListener("click", () => {
  void guard(async () => {
    if (!scene || localPlaying) return;
    const d = { ...draft() };
    const generation = ++playbackGeneration;
    localPlaying = true;
    updateControls();
    try {
      await playback.play(d, {
      onProgress: (p) => {
        $("#preview-progress").style.width = `${p * 100}%`;
        $(".playback-track").setAttribute(
          "aria-valuenow",
          String(Math.round(p * 100)),
        );
      },
      });
    } finally {
      if (generation === playbackGeneration) {
        localPlaying = false;
        resetEmblem();
        updateControls();
      }
    }
  });
});
$("#fullscreen").addEventListener("click", () => {
  const d = { ...draft() };
  void guard(() =>
    nativeAction(() =>
      window.openlude.preview(d.theme, selectedTarget, {
        duration: d.duration,
        reducedMotion: d.reducedMotion,
        showAppIcon: d.showAppIcon,
      }),
    ),
  );
});
function setDuration(value: number) {
  if (!Number.isFinite(value)) return;
  draft().duration =
    Math.round(Math.min(3000, Math.max(600, value)) / 100) * 100;
  const duration = draft().duration;
  $<HTMLInputElement>("#duration").value = String(duration);
  $<HTMLInputElement>("#duration-value").value = (duration / 1000).toFixed(1);
  $("#time-label").textContent = `${(duration / 1000).toFixed(1)} 秒`;
  renderTargets();
}
$("#duration").addEventListener("input", (event) =>
  setDuration(Number((event.target as HTMLInputElement).value)),
);
$("#duration-value").addEventListener("change", (event) =>
  setDuration(Number((event.target as HTMLInputElement).value) * 1000),
);
$("#reduced-motion").addEventListener("change", (event) => {
  draft().reducedMotion = (event.target as HTMLInputElement).checked;
  stopPreview();
  renderTargets();
});
$("#show-app-icon").addEventListener("change", (event) => {
  draft().showAppIcon = (event.target as HTMLInputElement).checked;
  stopPreview();
  renderTargets();
});
const help = $<HTMLDialogElement>("#help");
$("#close-help").addEventListener("click", () => help.close());
$("#help-done").addEventListener("click", () => help.close());
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (settingsPage && !help.open) showWorkspace();
    stopPreview();
    if (state) updateControls();
  }
});
window.addEventListener("beforeunload", () => {
  playback?.stop();
  scene?.dispose();
});

try {
  state = await window.openlude.state();
  document.documentElement.dataset.platform = state.platform;
  initializeSettings(state.settings, state.versionName, showSettings);
  $("#back-to-workspace").addEventListener("click", showWorkspace);
  try {
    scene = new MotionScene(stage);
  } catch {
    stage.classList.add("fallback-stage");
    toast("此设备暂无法绘制动态预览；启动时将使用简短淡入。", true);
  }
  playback = new LaunchPlayback(scene, emblem);
  selectTarget(state.targets[0]?.id ?? "");
} catch (error) {
  toast(`初始化失败：${String(error)}`, true);
}
