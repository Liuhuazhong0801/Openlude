import "./style.css";
import { MotionScene, animateBrand } from "./motion";
const host = document.querySelector<HTMLElement>("#overlay-stage")!;
const brand = host.querySelector<HTMLElement>(".brand-center")!;
let scene: MotionScene | null = null;
let completed = false;
const payload = await window.timegate.overlayPayload();
if (payload) {
  const finish = () => {
    if (completed) return;
    completed = true;
    scene?.dispose();
    window.timegate.overlayFinish(payload.operationId);
  };
  document.querySelector("#launch-name")!.textContent = payload.name;
  document.querySelector("#launch-label")!.textContent = payload.preview
    ? "每一次开始，都有一点不同"
    : "正在为你打开";
  const image = document.querySelector<HTMLImageElement>("#launch-icon")!;
  image.src = payload.icon || "./assets/branding/app-icon.png";
  await image.decode().catch(() => {});
  try {
    scene = new MotionScene(host);
    scene.setTheme(payload.theme);
    scene.render(0);
  } catch {
    host.classList.add("fallback-stage");
  }
  animateBrand(brand, 0, payload.reducedMotion);
  window.timegate.onAnimate(() => {
    if (scene)
      void scene
        .play(payload.duration, payload.reducedMotion, (p) =>
          animateBrand(brand, p, payload.reducedMotion),
        )
        .then(finish);
    else {
      brand.style.opacity = "1";
      brand.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 350,
        fill: "forwards",
      });
      setTimeout(finish, 650);
    }
  });
  document.querySelector("#skip")!.addEventListener("click", finish);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") finish();
  });
  requestAnimationFrame(() =>
    requestAnimationFrame(() =>
      window.timegate.overlayReady(payload.operationId),
    ),
  );
}
