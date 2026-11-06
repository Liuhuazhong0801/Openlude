import "./style.css";
import { MotionScene, animateEmblem } from "./motion";
const host = document.querySelector<HTMLElement>("#overlay-stage")!;
const emblem = host.querySelector<HTMLElement>(".app-emblem")!;
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
  const image = document.querySelector<HTMLImageElement>("#launch-icon")!;
  image.alt = payload.name ? `${payload.name} 图标` : "";
  if (payload.icon) {
    image.src = payload.icon;
    await image
      .decode()
      .then(() => {
        image.hidden = false;
      })
      .catch(() => {});
  }
  try {
    scene = new MotionScene(host);
    scene.setTheme(payload.theme);
    scene.render(0);
  } catch {
    host.classList.add("fallback-stage");
  }
  animateEmblem(emblem, 0, payload.reducedMotion);
  window.timegate.onAnimate(() => {
    if (scene)
      void scene
        .play(payload.duration, payload.reducedMotion, (p) =>
          animateEmblem(emblem, p, payload.reducedMotion),
        )
        .then(finish);
    else {
      emblem.style.opacity = "1";
      emblem.animate([{ opacity: 0 }, { opacity: 1 }], {
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
