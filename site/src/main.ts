import { THEMES, type ThemeId, type Preferences } from "../../src/shared/types";
import metadata from "../metadata.json";
import type { MotionScene } from "../../src/renderer/motion";

const query = <T extends HTMLElement>(selector: string) => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing website element: ${selector}`);
  return element;
};
const host = query<HTMLDivElement>("#canvas-host");
const stage = query<HTMLDivElement>("#demo-stage");
const poster = query<HTMLImageElement>("#demo-poster");
const playButton = query<HTMLButtonElement>("#play-control");
const soundButton = query<HTMLButtonElement>("#sound-control");
const picker = query<HTMLDivElement>("#theme-picker");
const status = query<HTMLParagraphElement>("#demo-status");
const progress = query<HTMLDivElement>("#demo-progress");
const progressFill = query<HTMLSpanElement>("#demo-progress > span");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
let selected: ThemeId = "portal";
let scene: MotionScene | undefined;
let sceneLoading: Promise<MotionScene> | undefined;
let operation = 0;
let frame = 0;
let running = false;
let sound = false;
let visible = false;
let attemptedAutoplay = false;
const themeSummaries: Record<ThemeId, string> = {
  comic: "动态漫画分镜与速度线", anime: "海岸、云层、飞鸟与樱花",
  portal: "车窗、雨滴与移动的城市夜景", paper: "折纸鹤、山峦与花瓣",
  pixel: "像素飞船与分层星空", ink: "纸面上的水墨扩散",
  frog: "原版视频 · 4.2 秒", feidudu: "单只袋鼠原版视频 · 4 秒",
};

const version = metadata.releaseTag.replace(/^v/, "");
const releaseURL = `${metadata.repository}/releases/tag/${metadata.releaseTag}`;
document.querySelectorAll<HTMLElement>("[data-version]").forEach(element => { element.textContent = metadata.releaseTag; });
document.querySelectorAll<HTMLAnchorElement>("[data-release-link]").forEach(link => { link.href = releaseURL; });
document.querySelectorAll<HTMLAnchorElement>("[data-download]").forEach(link => {
  const platform = link.dataset.download!;
  const file = `Openlude-${version}-${platform}${platform === "windows-x64" ? "-setup.exe" : ".dmg"}`;
  link.href = `${metadata.repository}/releases/download/${metadata.releaseTag}/${file}`;
});

picker.innerHTML = THEMES.map(theme => `<button type="button" class="theme-option" data-theme="${theme.id}" aria-pressed="${theme.id === selected}" tabindex="${theme.id === selected ? 0 : -1}" title="预览${theme.name}"><img src="./assets/themes/thumbnails/${theme.id}.webp" alt="" width="256" height="144" loading="lazy" decoding="async"><span>${theme.name}</span></button>`).join("");
const themeButtons = Array.from(picker.querySelectorAll<HTMLButtonElement>("button"));

function settings(): Preferences {
  return { duration: 3000, reducedMotion: false, showAppIcon: false, playThemeSound: sound };
}

async function getScene(): Promise<MotionScene> {
  if (scene) return scene;
  sceneLoading ??= (async () => {
    const [runtime, three] = await Promise.all([import("../../src/renderer/motion"), import("three")]);
    // Keep the desktop artwork untouched; this browser uses smaller, generated WebP copies.
    const optimized = new Set(["comic", "anime", "paper-world", "night-train"]);
    three.DefaultLoadingManager.setURLModifier(url => {
      const filename = url.match(/^\.\/assets\/themes\/([^/]+)\.png$/)?.[1];
      return filename && optimized.has(filename) ? `./assets/themes/web/${filename}.webp` : url;
    });
    scene = new runtime.MotionScene(host);
    return scene;
  })();
  try { return await sceneLoading; }
  catch (error) { sceneLoading = undefined; throw error; }
}

function stopPlayback() {
  ++operation;
  cancelAnimationFrame(frame);
  scene?.stopPlayback();
  running = false;
  playButton.disabled = false;
  playButton.innerHTML = '<span aria-hidden="true">↻</span> 重播';
  playButton.setAttribute("aria-label", `重新播放${THEMES.find(theme => theme.id === selected)!.name}主题`);
}

async function showTheme(play: boolean) {
  stopPlayback();
  const token = operation;
  const theme = THEMES.find(item => item.id === selected)!;
  host.classList.remove("ready");
  poster.src = `./assets/previews/${selected}.webp`;
  poster.alt = `${theme.name}主题预览`;
  stage.dataset.theme = selected;
  query<HTMLHeadingElement>("#theme-name").textContent = theme.name;
  query<HTMLParagraphElement>("#theme-caption").textContent = themeSummaries[theme.id];
  query<HTMLSpanElement>("#theme-count").textContent = `${String(THEMES.findIndex(item => item.id === selected) + 1).padStart(2, "0")} / 08`;
  progressFill.style.transform = "scaleX(0)";
  progress.setAttribute("aria-valuenow", "0");
  soundButton.hidden = selected !== "frog" && selected !== "feidudu";
  themeButtons.forEach(button => {
    const active = button.dataset.theme === selected;
    button.setAttribute("aria-pressed", String(active));
    button.tabIndex = active ? 0 : -1;
  });
  playButton.disabled = true;
  playButton.textContent = "准备中…";
  status.textContent = "正在加载主题…";
  try {
    const current = await getScene();
    if (token !== operation) return;
    current.setTheme(selected);
    await current.preparePlayback();
    if (token !== operation) return;
    current.render(.43);
    host.classList.add("ready");
    playButton.disabled = false;
    playButton.innerHTML = '<span aria-hidden="true">▶</span> 播放';
    playButton.setAttribute("aria-label", `播放${theme.name}主题`);
    status.textContent = "演示默认静音，不会启动本机应用。";
    if (!play || document.hidden || !visible) return;
    current.beginPlayback(settings());
    const duration = current.playbackSettings(settings()).duration;
    const start = performance.now();
    let lastDraw = -Infinity;
    running = true;
    playButton.innerHTML = '<span aria-hidden="true">■</span> 停止';
    playButton.setAttribute("aria-label", `停止${theme.name}主题播放`);
    const draw = (now: number) => {
      if (token !== operation || !running) return;
      const elapsed = Math.min(1, (now - start) / duration);
      if (now - lastDraw >= 1000 / 30 || elapsed === 1) {
        current.render(elapsed);
        progressFill.style.transform = `scaleX(${elapsed})`;
        progress.setAttribute("aria-valuenow", String(Math.round(elapsed * 100)));
        lastDraw = now;
      }
      if (elapsed < 1) frame = requestAnimationFrame(draw);
      else {
        stopPlayback();
        status.textContent = "播放完成，可重新播放或选择其他主题。";
      }
    };
    frame = requestAnimationFrame(draw);
  } catch {
    if (token !== operation) return;
    scene?.dispose();
    scene = undefined;
    sceneLoading = undefined;
    host.classList.remove("ready");
    playButton.disabled = false;
    playButton.innerHTML = '<span aria-hidden="true">↻</span> 重试';
    status.textContent = "暂时无法播放动画，可查看主题图片或下载安装包。";
  }
}

function selectTheme(id: ThemeId) {
  selected = id;
  void showTheme(true);
}

picker.addEventListener("click", event => {
  const button = (event.target as Element).closest<HTMLButtonElement>("button[data-theme]");
  if (button) selectTheme(button.dataset.theme as ThemeId);
});
picker.addEventListener("keydown", event => {
  const from = themeButtons.findIndex(button => button === document.activeElement);
  if (from < 0 || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const verticalStep = matchMedia("(max-width: 760px)").matches ? 4 : 1;
  const offset = event.key === "ArrowDown" ? verticalStep : event.key === "ArrowUp" ? -verticalStep : event.key === "ArrowRight" ? 1 : -1;
  const next = event.key === "Home" ? 0 : event.key === "End" ? themeButtons.length - 1
    : (from + offset + themeButtons.length) % themeButtons.length;
  themeButtons[next].focus();
  selectTheme(themeButtons[next].dataset.theme as ThemeId);
});
playButton.addEventListener("click", () => {
  if (running) stopPlayback();
  else void showTheme(true);
});
soundButton.addEventListener("click", () => {
  sound = !sound;
  soundButton.setAttribute("aria-pressed", String(sound));
  soundButton.textContent = `原声：${sound ? "开" : "关"}`;
  const video = host.querySelector("video");
  if (video) video.muted = !sound || !running;
});

const visibility = new IntersectionObserver(entries => {
  visible = entries.some(entry => entry.isIntersecting);
  if (!visible) stopPlayback();
  else if (!attemptedAutoplay) {
    attemptedAutoplay = true;
    void showTheme(!reducedMotion.matches);
  }
}, { threshold: .2 });
visibility.observe(stage);
document.addEventListener("visibilitychange", () => { if (document.hidden) stopPlayback(); });
reducedMotion.addEventListener("change", event => { if (event.matches) stopPlayback(); });
window.addEventListener("pagehide", event => {
  stopPlayback();
  if (!event.persisted) { visibility.disconnect(); scene?.dispose(); }
});
