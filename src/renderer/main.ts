import "./style.css";
import { THEMES, type AppState, type ThemeId } from "../shared/types";
import { MotionScene, animateBrand } from "./motion";

const paths: Record<string, string> = {
  play: "M9 5l11 7-11 7V5z",
  plus: "M12 5v14M5 12h14",
  grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  expand: "M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5",
  folder: "M3 7V5h7l2 2h9v13H3z",
  check: "M5 12l4 4L19 6",
  settings: "M4 7h16M7 4v6M4 17h16M16 14v6",
  info: "M12 11v6M12 7h.01M22 12a10 10 0 11-20 0 10 10 0 0120 0",
  arrow: "M7 17L17 7M7 7h10v10",
  close: "M6 6l12 12M6 18L18 6",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14",
};
const icon = (name: string, size = 18) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]}"/></svg>`;
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
<div class="shell">
  <aside class="sidebar">
    <div class="window-drag"></div>
    <div class="identity"><img src="./assets/branding/app-icon.png" alt="TimeGate 图标"><div><strong>TimeGate</strong><span>让开始，有所不同</span></div></div>
    <div class="nav-label">工作空间</div>
    <button class="nav active" id="nav-studio">${icon("grid")}启动工作台<span class="nav-dot"></span></button>
    <button class="nav" id="nav-apps">${icon("folder")}我的应用<span id="app-count" class="nav-count">4</span></button>
    <div class="sidebar-note"><div class="note-glyph">✳</div><strong>一点仪式感，<br>一个新的开始。</strong><p>为熟悉的应用，<br>选一种喜欢的登场方式。</p></div>
    <div class="sidebar-bottom"><button class="nav" id="nav-settings">${icon("settings")}偏好设置</button><button class="nav" id="nav-help">${icon("info")}使用说明</button><div class="version">TimeGate <span>0.1 · 技术样机</span></div></div>
  </aside>
  <div class="main-shell">
    <header class="topbar"><span>工作空间 <span class="slash">/</span> 启动工作台</span><span class="local-badge"><i></i> 本地运行</span></header>
    <main class="content">
      <div class="page-heading"><div class="eyebrow">A LITTLE MAGIC, EVERY LAUNCH</div><div class="heading-row"><h1>给每一次启动，一点惊喜。</h1><button class="button secondary" id="add-app">${icon("plus")}添加应用</button></div><p>选一个主题，按下播放。让日常从你喜欢的方式开始。</p></div>
      <section aria-labelledby="themes-title"><div class="section-title"><h2 id="themes-title">选择一种登场方式</h2><span>5 款内置主题</span></div><div class="theme-grid" role="group" aria-label="动画主题">${THEMES.map((t) => `<button class="theme-card ${t.id === "portal" ? "selected" : ""}" data-theme="${t.id}" aria-pressed="${t.id === "portal"}"><div class="theme-art"><img src="./assets/themes/${t.id}.png" alt=""><span class="theme-tick">${icon("check", 13)}</span></div><div class="theme-caption"><strong>${t.name}</strong><span>${t.en}</span></div></button>`).join("")}</div></section>
      <section class="preview-panel" aria-label="动态预览">
        <div class="preview-left"><div class="stage" id="preview-stage"><div class="stage-label"><span class="live-dot"></span> 实时动效</div><div class="brand-center"><img id="preview-icon" src="./assets/branding/app-icon.png" alt=""><div id="preview-name">TimeGate</div><small>让开始，有所不同</small></div><div class="stage-corner" id="stage-caption">PORTAL / 01</div></div><div class="playback-bar"><button class="button play-button" id="play">${icon("play", 16)}播放动效</button><div class="playback-track"><i id="preview-progress"></i></div><span id="time-label">1.8 秒</span><button class="icon-button" id="fullscreen" aria-label="全屏预览" title="全屏预览">${icon("expand")}</button></div></div>
        <div class="preview-settings" id="settings"><div class="preview-tag">当前主题</div><h2 id="theme-name">光环穿梭</h2><p id="theme-description"></p><div class="motion-detail" id="motion-detail"></div><div class="divider"></div><label class="field-label" for="preview-target">展示应用</label><select id="preview-target"><option value="">TimeGate · 自身预览</option></select><div class="range-label"><label class="field-label" for="duration">动画时长</label><span id="duration-label">1.8s</span></div><input id="duration" type="range" min="600" max="3000" step="100" value="1800"><label class="toggle-line"><span>柔和模式<small>降低运动幅度</small></span><input type="checkbox" id="reduced-motion"><span class="switch"></span></label><button class="button apply-button" id="apply" disabled>${icon("check", 16)}绑定到应用</button><span class="binding-hint" id="binding-hint">选择应用后，即可绑定主题</span></div>
      </section>
      <section id="applications" aria-labelledby="apps-title"><div class="section-title"><h2 id="apps-title">我的应用 <span class="inline-count" id="inline-count"></span></h2><span>主题可自由搭配</span></div><div class="application-grid" id="application-list"></div></section>
      <footer><span>启动动画由本工具入口触发</span><span><kbd>Esc</kbd> 随时跳过全屏动画</span></footer>
    </main>
  </div>
</div>
<div class="toast" role="status" aria-live="polite" id="toast"></div>
<dialog id="help"><button class="icon-button dialog-close" id="close-help" aria-label="关闭说明">${icon("close")}</button><div class="eyebrow">GETTING STARTED</div><h2>为应用选择一种登场方式</h2><ol><li>添加本机应用，或定位已有预设。</li><li>选择主题，在“展示应用”中选中目标，点击“绑定到应用”。</li><li>点击应用卡片的启动按钮，播放动画并打开应用。</li></ol><p>“播放动效”和“全屏预览”只展示效果。DeepSeek、豆包在未定位客户端时可打开网页版。</p><p>原来的 Dock、任务栏图标仍按系统原有方式启动。全屏动画支持 Esc 跳过，柔和模式会降低运动幅度。</p><button class="button primary" id="help-done">开始体验</button></dialog>`;

let state: AppState;
let selectedTheme: ThemeId = "portal";
let selectedTarget = "";
let scene: MotionScene | null = null;
let localPlaying = false;
let nativeBusy = false;
let toastTimer: ReturnType<typeof setTimeout>;
const stage = document.querySelector<HTMLElement>("#preview-stage")!;
const brand = stage.querySelector<HTMLElement>(".brand-center")!;
const playButton = document.querySelector<HTMLButtonElement>("#play")!;
const applyButton = document.querySelector<HTMLButtonElement>("#apply")!;
const targetSelect =
  document.querySelector<HTMLSelectElement>("#preview-target")!;
function toast(message: string, error = false) {
  const element = document.querySelector<HTMLElement>("#toast")!;
  element.textContent = message;
  element.classList.toggle("error", error);
  element.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(
    () => element.classList.remove("show"),
    error ? 5500 : 3200,
  );
}
function message(error: unknown) {
  return String(error instanceof Error ? error.message : error).replace(
    /^Error invoking remote method '[^']+': (Error: )?/,
    "",
  );
}
async function guard(action: () => Promise<void>) {
  try {
    await action();
  } catch (e) {
    toast(message(e), true);
  }
}
function resetBrand() {
  brand.style.opacity = "1";
  brand.style.transform = "translate(-50%, -50%)";
  brand.style.filter = "none";
}
function updateTheme() {
  const theme = THEMES.find((t) => t.id === selectedTheme)!;
  document
    .querySelectorAll<HTMLButtonElement>(".theme-card")
    .forEach((card) => {
      const yes = card.dataset.theme === selectedTheme;
      card.classList.toggle("selected", yes);
      card.setAttribute("aria-pressed", String(yes));
    });
  document.querySelector("#theme-name")!.textContent = theme.name;
  document.querySelector("#theme-description")!.textContent = theme.description;
  document.querySelector("#motion-detail")!.textContent = theme.motion;
  document.querySelector("#stage-caption")!.textContent =
    `${theme.en} / 0${THEMES.indexOf(theme) + 1}`;
  scene?.setTheme(selectedTheme);
  resetBrand();
  updateBrand();
}
function updateBrand() {
  const target = state.targets.find((t) => t.id === selectedTarget);
  document.querySelector<HTMLImageElement>("#preview-icon")!.src =
    target?.icon || "./assets/branding/app-icon.png";
  document.querySelector("#preview-name")!.textContent =
    target?.name || "TimeGate";
  applyButton.disabled = !target || nativeBusy;
  document.querySelector("#binding-hint")!.textContent = target
    ? `已绑定：${THEMES.find((t) => t.id === target.theme)!.name}`
    : "选择应用后，即可绑定主题";
}
function renderTargets() {
  document.querySelector("#app-count")!.textContent = String(
    state.targets.length,
  );
  document.querySelector("#inline-count")!.textContent = String(
    state.targets.length,
  );
  const previous = selectedTarget;
  targetSelect.innerHTML =
    '<option value="">TimeGate · 自身预览</option>' +
    state.targets
      .map((t) => `<option value="${escape(t.id)}">${escape(t.name)}</option>`)
      .join("");
  targetSelect.value = state.targets.some((t) => t.id === previous)
    ? previous
    : "";
  selectedTarget = targetSelect.value;
  document.querySelector("#application-list")!.innerHTML = state.targets
    .map((t) => {
      const theme = THEMES.find((th) => th.id === t.theme)!;
      const badge = t.path
        ? t.available
          ? "本机应用"
          : "路径失效"
        : t.url
          ? "网页入口"
          : "待定位";
      return `<article class="app-card" data-id="${escape(t.id)}"><button class="app-identity" data-action="select" aria-label="选择 ${escape(t.name)}">${t.icon ? `<img class="app-icon" src="${t.icon}" alt="">` : `<span class="app-monogram ${t.id}">${escape(t.name.slice(0, 1))}</span>`}<div><strong>${escape(t.name)}</strong><span><i style="background:${theme.accent}"></i>${theme.name}<b>·</b>${badge}</span></div></button><div class="app-actions"><button class="icon-button locate-button" data-action="locate" aria-label="定位 ${escape(t.name)}" title="定位本机应用">${icon("folder", 16)}</button>${!t.builtin ? `<button class="icon-button" data-action="remove" aria-label="移除 ${escape(t.name)}" title="移除应用">${icon("trash", 16)}</button>` : ""}<button class="launch-button" data-action="launch" ${!t.available || nativeBusy ? "disabled" : ""} aria-label="启动 ${escape(t.name)}">${icon("arrow", 17)}</button></div></article>`;
    })
    .join("");
  updateBrand();
}
async function savePreferences() {
  const duration = Number(
    document.querySelector<HTMLInputElement>("#duration")!.value,
  );
  const reducedMotion =
    document.querySelector<HTMLInputElement>("#reduced-motion")!.checked;
  state = await window.timegate.preferences({ duration, reducedMotion });
}
async function nativeAction(
  action: () => ReturnType<typeof window.timegate.launch>,
) {
  if (nativeBusy) return;
  scene?.stop();
  resetBrand();
  nativeBusy = true;
  renderTargets();
  document.querySelector<HTMLButtonElement>("#fullscreen")!.disabled = true;
  try {
    const result = await action();
    if (!result.ok) toast(result.error || "启动失败", true);
  } finally {
    nativeBusy = false;
    renderTargets();
    document.querySelector<HTMLButtonElement>("#fullscreen")!.disabled = false;
  }
}

document.querySelector(".theme-grid")!.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
    "[data-theme]",
  );
  if (button) {
    selectedTheme = button.dataset.theme as ThemeId;
    updateTheme();
  }
});
targetSelect.addEventListener("change", () => {
  selectedTarget = targetSelect.value;
  updateBrand();
});
applyButton.addEventListener("click", () => {
  void guard(async () => {
    if (!selectedTarget) return;
    state = await window.timegate.bind(selectedTarget, selectedTheme);
    renderTargets();
    toast("已保存，下次启动将使用这个主题");
  });
});
document.querySelector("#add-app")!.addEventListener("click", () => {
  void guard(async () => {
    const next = await window.timegate.add();
    if (next) {
      state = next;
      selectedTarget = next.targets.at(-1)!.id;
      renderTargets();
      toast("应用已添加");
    }
  });
});
document
  .querySelector("#application-list")!
  .addEventListener("click", (event) => {
    void guard(async () => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
        "[data-action]",
      );
      const card = button?.closest<HTMLElement>("[data-id]");
      if (!button || !card) return;
      const id = card.dataset.id!;
      if (button.dataset.action === "select") {
        selectedTarget = id;
        targetSelect.value = id;
        selectedTheme = state.targets.find((t) => t.id === id)!.theme;
        updateTheme();
        stage.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      if (button.dataset.action === "locate") {
        const next = await window.timegate.add(id);
        if (next) {
          state = next;
          renderTargets();
          toast("已更新应用位置");
        }
      }
      if (button.dataset.action === "remove") {
        state = await window.timegate.remove(id);
        renderTargets();
        toast("已从列表移除");
      }
      if (button.dataset.action === "launch")
        await nativeAction(() => window.timegate.launch(id));
    });
  });
playButton.addEventListener("click", () => {
  void guard(async () => {
    if (!scene || localPlaying) return;
    localPlaying = true;
    playButton.disabled = true;
    await scene.play(
      state.preferences.duration,
      state.preferences.reducedMotion,
      (p) => {
        animateBrand(brand, p, state.preferences.reducedMotion);
        document.querySelector<HTMLElement>("#preview-progress")!.style.width =
          `${p * 100}%`;
      },
    );
    localPlaying = false;
    playButton.disabled = false;
    resetBrand();
  });
});
document.querySelector("#fullscreen")!.addEventListener("click", () => {
  void guard(() =>
    nativeAction(() =>
      window.timegate.preview(selectedTheme, selectedTarget || undefined),
    ),
  );
});
document
  .querySelector<HTMLInputElement>("#duration")!
  .addEventListener("input", (event) => {
    const value = Number((event.target as HTMLInputElement).value);
    document.querySelector("#duration-label")!.textContent =
      `${(value / 1000).toFixed(1)}s`;
    document.querySelector("#time-label")!.textContent =
      `${(value / 1000).toFixed(1)} 秒`;
  });
document.querySelector("#duration")!.addEventListener("change", () => {
  void guard(savePreferences);
});
document.querySelector("#reduced-motion")!.addEventListener("change", () => {
  void guard(savePreferences);
});
document
  .querySelector("#nav-studio")!
  .addEventListener("click", () =>
    document
      .querySelector(".content")!
      .scrollTo({ top: 0, behavior: "smooth" }),
  );
document
  .querySelector("#nav-apps")!
  .addEventListener("click", () =>
    document
      .querySelector("#applications")!
      .scrollIntoView({ behavior: "smooth" }),
  );
document.querySelector("#nav-settings")!.addEventListener("click", () => {
  document
    .querySelector("#settings")!
    .scrollIntoView({ behavior: "smooth", block: "center" });
  document
    .querySelector<HTMLInputElement>("#duration")!
    .focus({ preventScroll: true });
});
const help = document.querySelector<HTMLDialogElement>("#help")!;
document
  .querySelector("#nav-help")!
  .addEventListener("click", () => help.showModal());
document
  .querySelector("#close-help")!
  .addEventListener("click", () => help.close());
document
  .querySelector("#help-done")!
  .addEventListener("click", () => help.close());
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    scene?.stop();
    resetBrand();
  }
});
window.addEventListener("beforeunload", () => scene?.dispose());

try {
  state = await window.timegate.state();
  document.querySelector<HTMLInputElement>("#duration")!.value = String(
    state.preferences.duration,
  );
  document.querySelector<HTMLInputElement>("#reduced-motion")!.checked =
    state.preferences.reducedMotion;
  document.querySelector("#duration-label")!.textContent =
    `${(state.preferences.duration / 1000).toFixed(1)}s`;
  document.querySelector("#time-label")!.textContent =
    `${(state.preferences.duration / 1000).toFixed(1)} 秒`;
  try {
    scene = new MotionScene(stage);
  } catch {
    stage.classList.add("fallback-stage");
    playButton.disabled = true;
    toast("此设备暂无法绘制动态预览；启动时将使用简短淡入。", true);
  }
  renderTargets();
  updateTheme();
} catch (error) {
  toast(`初始化失败：${message(error)}`, true);
}
