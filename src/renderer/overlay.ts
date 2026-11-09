import "./style.css";
import { MotionScene } from "./motion";
import { LaunchPlayback } from "./playback";
import { HANDOFF_LEAD } from "../shared/transition";
const host = document.querySelector<HTMLElement>("#overlay-stage")!;
const emblem = host.querySelector<HTMLElement>(".app-emblem")!;
let scene: MotionScene | null = null;
let completed = false;
const payload = await window.openlude.overlayPayload();
if (payload) {
  const finish = () => {
    if (completed) return;
    completed = true;
    // Start the native reveal before playback ends; keep drawing throughout it.
    window.openlude.overlayFinish(payload.operationId);
  };
  const image = document.querySelector<HTMLImageElement>("#launch-icon")!;
  image.alt = payload.name ? `${payload.name} 图标` : "";
  if (payload.showAppIcon && payload.icon) {
    image.src = payload.icon;
    await image
      .decode()
      .then(() => {
        image.hidden = false;
      })
      .catch(() => {});
  }
  try {
    scene = new MotionScene(host, payload.theme);
    await scene.preparePlayback();
    scene.render(0);
  } catch {
    host.classList.add("fallback-stage");
  }
  emblem.hidden = !payload.showAppIcon;
  emblem.style.opacity = "0";
  scene?.setOpacity(0);
  const playback = new LaunchPlayback(scene, emblem);
  window.openlude.onAnimate(() => {
    void playback.play(payload, {
      nativeWindow: true,
      revealLead: payload.preview ? 0 : HANDOFF_LEAD,
      onReveal: finish,
    }).catch(finish);
  });
  const skip = () => window.openlude.overlaySkip(payload.operationId);
  document.querySelector("#skip")!.addEventListener("click", skip);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") skip();
  });
  window.addEventListener("pagehide", () => {
    playback.stop();
    scene?.dispose();
  }, { once: true });
  requestAnimationFrame(() =>
    requestAnimationFrame(() =>
      window.openlude.overlayReady(payload.operationId),
    ),
  );
}
