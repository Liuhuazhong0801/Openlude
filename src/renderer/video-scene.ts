import * as THREE from "three";
import type { Preferences } from "../shared/types";

/** Play the source footage in its original proportions and at its original speed. */
export class VideoScene {
  private video = document.createElement("video");
  private texture: THREE.VideoTexture;
  private ready: Promise<void>;
  private disposed = false;
  private generation = 0;
  private cancelLoading?: () => void;
  private uniforms: {
    footage: { value: THREE.VideoTexture };
    aspect: { value: number };
    sourceAspect: { value: number };
    backdrop: { value: THREE.Vector3 };
  };

  constructor(scene: THREE.Scene, theme: "frog" | "feidudu", host: HTMLElement, repaint: () => void) {
    const video = this.video;
    video.dataset.themeVideo = theme;
    video.hidden = true;
    video.preload = "auto";
    video.playsInline = true;
    video.muted = true;
    video.loop = false;
    host.append(video);
    this.texture = new THREE.VideoTexture(video);
    this.texture.colorSpace = THREE.NoColorSpace;
    this.uniforms = {
      footage: { value: this.texture },
      aspect: { value: 16 / 9 },
      sourceAspect: { value: 1 },
      backdrop: { value: new THREE.Vector3(...(theme === "frog" ? [1, 1, 1] as const : [.95, .94, .90] as const)) },
    };
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: "varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}",
      fragmentShader: `precision highp float;varying vec2 vUv;
        uniform sampler2D footage;uniform float aspect,sourceAspect;uniform vec3 backdrop;
        void main(){
          vec2 uv=(vUv-.5)*vec2(max(1.,aspect/sourceAspect),max(1.,sourceAspect/aspect))+.5;
          vec3 color=backdrop;
          if(all(greaterThanEqual(uv,vec2(0.)))&&all(lessThanEqual(uv,vec2(1.))))color=texture2D(footage,uv).rgb;
          gl_FragColor=vec4(color,1.);
        }`,
      depthTest: false, depthWrite: false, toneMapped: false,
    })));
    this.ready = new Promise<void>((resolve, reject) => {
      const clean = () => { video.removeEventListener("loadeddata", loaded); video.removeEventListener("error", failed); this.cancelLoading = undefined; };
      const loaded = () => {
        clean();
        this.uniforms.sourceAspect.value = video.videoWidth / video.videoHeight;
        if (!this.disposed) repaint();
        resolve();
      };
      const failed = () => { clean(); reject(new Error("原版主题视频加载失败，请重新打开应用。")); };
      video.addEventListener("loadeddata", loaded, { once: true });
      video.addEventListener("error", failed, { once: true });
      this.cancelLoading = () => { clean(); resolve(); };
    });
    // Keep failures handled even when a user changes the theme before pressing play.
    void this.ready.catch(() => {});
    video.src = theme === "frog" ? "./assets/themes/originals/frog.mp4" : "./assets/themes/originals/feidudu.mp4";
    video.load();
  }

  async prepare() { await this.ready; }
  beginPlayback(settings: Preferences) {
    if (this.disposed) return;
    const generation = ++this.generation;
    this.video.pause();
    this.video.currentTime = 0;
    this.video.muted = !settings.playThemeSound || settings.reducedMotion;
    if (!settings.reducedMotion) {
      void this.video.play().catch((error: unknown) => {
        if (this.disposed || generation !== this.generation || (error as { name?: string })?.name !== "NotAllowedError") return;
        // Native overlays allow autoplay; browser previews can require a click.
        this.video.muted = true;
        void this.video.play().catch(() => {});
      });
    }
  }
  stopPlayback() { ++this.generation; this.video.pause(); this.video.muted = true; }
  render(_progress: number, aspect: number) { this.uniforms.aspect.value = aspect; }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelLoading?.();
    this.stopPlayback();
    this.video.removeAttribute("src");
    this.video.load();
    this.video.remove();
    this.texture.dispose();
  }
}
