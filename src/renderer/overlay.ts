import "./style.css";
import { MotionScene, animateEmblem } from "./motion";
import { revealDuration } from "../shared/transition";
const host = document.querySelector<HTMLElement>("#overlay-stage")!;
const emblem = host.querySelector<HTMLElement>(".app-emblem")!;
let scene: MotionScene | null = null;
let completed = false;
const payload = await window.timegate.overlayPayload();
if (payload) {
  const finish = () => {
    if (completed) return;
    completed = true;
    // Preserve the final frame and app identity until the native window has faded.
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
    const totalDuration = payload.reducedMotion
      ? Math.min(payload.duration, 650)
      : payload.duration;
    const motionDuration = Math.max(
      240,
      totalDuration - revealDuration(payload.reducedMotion, payload.duration),
    );
    if (scene)
      void scene
        .play(motionDuration, payload.reducedMotion, (p) =>
          animateEmblem(emblem, p, payload.reducedMotion, true),
        )
        .then(finish);
    else {
      emblem.style.opacity = "1";
      emblem.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 350,
        fill: "forwards",
      });
      setTimeout(finish, motionDuration);
    }
  });
  const skip = () => window.timegate.overlaySkip(payload.operationId);
  document.querySelector("#skip")!.addEventListener("click", skip);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") skip();
  });
  window.addEventListener("pagehide", () => scene?.dispose(), { once: true });
  requestAnimationFrame(() =>
    requestAnimationFrame(() =>
      window.timegate.overlayReady(payload.operationId),
    ),
  );
}
