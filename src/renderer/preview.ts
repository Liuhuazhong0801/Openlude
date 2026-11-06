import "./preview.css";
import { MotionScene } from "./motion";
import { LaunchPlayback } from "./playback";
import { THEMES, type ThemeId } from "../shared/types";

const stage = document.querySelector<HTMLElement>("#demo-stage")!;
const emblem = document.querySelector<HTMLElement>(".app-emblem")!;
const picker = document.querySelector<HTMLElement>("#theme-picker")!;
const loop = document.querySelector<HTMLInputElement>("#demo-loop")!;
const progress = document.querySelector<HTMLElement>("#demo-progress")!;
const appPicker = document.querySelector<HTMLSelectElement>("#demo-app")!;
const showIcon = document.querySelector<HTMLInputElement>("#demo-icon")!;
function selectApplication() {
  const option = appPicker.selectedOptions[0];
  const image = document.querySelector<HTMLImageElement>("#demo-app-icon")!;
  const source = option.dataset.icon!;
  image.hidden = true;
  image.src = source;
  image.alt = `${option.textContent} 图标`;
  document.querySelector("#demo-app-name")!.textContent = option.textContent;
  void image
    .decode()
    .then(() => {
      if (image.getAttribute("src") === source) image.hidden = false;
    })
    .catch(() => {});
}
selectApplication();
picker.innerHTML = THEMES.map(
  (t) =>
    `<button data-theme="${t.id}" aria-pressed="${t.id === "portal"}"><span>${t.name}</span><small>${t.en}</small></button>`,
).join("");
let scene: MotionScene;
let playback: LaunchPlayback;
let timer: ReturnType<typeof setTimeout>;
let generation = 0;
function play() {
  clearTimeout(timer);
  const token = ++generation;
  void playback
    .play({ duration: 2600, reducedMotion: false, showAppIcon: showIcon.checked }, {
      onProgress: (p) => { progress.style.width = `${p * 100}%`; },
    })
    .then(() => {
      if (token === generation && loop.checked) timer = setTimeout(play, 700);
    });
}
function select(theme: ThemeId) {
  const item = THEMES.find((t) => t.id === theme)!;
  scene.setTheme(theme);
  picker
    .querySelectorAll<HTMLButtonElement>("button")
    .forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.theme === theme)),
    );
  document.querySelector("#current-name")!.textContent = item.name;
  document.querySelector("#motion-description")!.textContent = item.motion;
  play();
}
try {
  scene = new MotionScene(stage);
  playback = new LaunchPlayback(scene, emblem);
  picker.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      "[data-theme]",
    );
    if (button) select(button.dataset.theme as ThemeId);
  });
  document.querySelector("#demo-play")!.addEventListener("click", play);
  showIcon.addEventListener("change", play);
  appPicker.addEventListener("change", () => {
    selectApplication();
    play();
  });
  loop.addEventListener("change", () => {
    if (loop.checked) play();
    else clearTimeout(timer);
  });
  document.querySelector("#demo-fullscreen")!.addEventListener("click", () => {
    void stage
      .requestFullscreen()
      .then(play)
      .catch(() => {});
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      ++generation;
      clearTimeout(timer);
      playback.stop();
    } else if (loop.checked) play();
  });
  select("portal");
  window.addEventListener("pagehide", () => {
    playback.stop();
    scene.dispose();
  }, { once: true });
} catch (error) {
  document.querySelector("#motion-description")!.textContent =
    "当前浏览器无法创建 WebGL 画布，请在启用硬件加速的新版浏览器中打开。";
  console.error(error);
}
