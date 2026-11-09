import { MotionScene } from "../../src/renderer/motion";
import type { ThemeId } from "../../src/shared/types";
const stage = document.querySelector<HTMLElement>("#stage")!;
let scene: MotionScene;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
Object.assign(window, {
  fixtureReady: true,
  create: async (theme: ThemeId) => { scene?.dispose(); scene = new MotionScene(stage, theme); await scene.preparePlayback(); },
  select: async (theme: ThemeId) => { scene.setTheme(theme); await scene.preparePlayback(); },
  sampleTrain: (progress: number) => {
    scene.render(progress);
    const canvas = stage.querySelector("canvas")!;
    const gl = canvas.getContext("webgl2")!;
    return [[.5, .95], [.5, .70], [.5, .27]].map(([x, y]) => {
      const pixel = new Uint8Array(4);
      gl.readPixels(Math.floor(canvas.width * x), Math.floor(canvas.height * y), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      return [...pixel];
    });
  },
  stopRace: async () => {
    scene.beginPlayback({ duration: 4200, reducedMotion: false, showAppIcon: false, playThemeSound: false });
    scene.stopPlayback(); await sleep(350);
    const video = stage.querySelector("video")!;
    return { paused: video.paused, currentTime: video.currentTime, muted: video.muted };
  },
  disposePending: async () => {
    scene?.dispose(); scene = new MotionScene(stage, "frog");
    let settled = false;
    const loading = scene.preparePlayback().then(() => { settled = true; });
    scene.dispose(); await Promise.race([loading, sleep(350)]);
    return { settled, videos: stage.querySelectorAll("video").length };
  },
  dispose: () => scene?.dispose(),
});
