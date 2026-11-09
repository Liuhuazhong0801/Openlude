import * as THREE from "three";
import { THEMES, type Preferences, type ThemeId } from "../shared/types";
import { playbackPreferences } from "../shared/transition";
import { IllustrationScene } from "./illustration";
import { StylizedScene } from "./stylized";
import { PaperScene } from "./paper";
import { InkScene } from "./ink";
import { TrainScene } from "./train-scene";
import { VideoScene } from "./video-scene";
import { renderPixelRatio } from "../shared/render-quality";

/** Every visual style shares the same icon timeline and native-window reveal. */
export class MotionScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(46, 1, .1, 110);
  private observer: ResizeObserver;
  private theme?: ThemeId;
  private disposed = false;
  private progress = .4;
  private train?: TrainScene;
  private video?: VideoScene;
  private illustration?: IllustrationScene;
  private stylized?: StylizedScene;
  private paper?: PaperScene;
  private ink?: InkScene;
  constructor(private host: HTMLElement, initialTheme?: ThemeId) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "low-power" });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.45;
    this.renderer.domElement.className = "motion-canvas";
    this.renderer.domElement.setAttribute("aria-label", "实时绘制的启动动画");
    host.prepend(this.renderer.domElement);
    this.camera.position.set(0, 0, 10);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
    if (initialTheme) this.setTheme(initialTheme);
  }
  private resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight; if (this.disposed || !w || !h) return;
    this.renderer.setDrawingBufferSize(w, h, renderPixelRatio(w, h, devicePixelRatio)); this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix(); this.render(this.progress);
  }
  private clearScene() {
    this.train?.dispose(); this.video?.dispose(); this.illustration?.dispose(); this.paper?.dispose();
    this.train = undefined; this.video = undefined;
    this.illustration = undefined; this.stylized = undefined;
    this.paper = undefined; this.ink = undefined;
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    this.scene.traverse(object => {
      const mesh = object as THREE.Mesh;
      if (mesh.geometry) geometries.add(mesh.geometry);
      if (Array.isArray(mesh.material)) mesh.material.forEach(m => materials.add(m));
      else if (mesh.material) materials.add(mesh.material);
      if ((object as THREE.InstancedMesh).isInstancedMesh) (object as THREE.InstancedMesh).dispose();
    });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); this.scene.clear();
  }
  setTheme(theme: ThemeId) {
    if (this.disposed) return;
    if (this.theme === theme) { this.render(.43); return; }
    this.clearScene(); this.theme = theme; this.host.dataset.theme = theme;
    const light = THEMES.find(t => t.id === theme)!.light;
    this.host.classList.toggle("light-stage", light);
    this.scene.background = new THREE.Color(light ? "#f2efe7" : "#080e16");
    this.scene.fog = null; this.scene.environment = null; this.camera.position.set(0, 0, 10); this.camera.fov = 46;
    this.camera.lookAt(0, 0, 0); this.camera.updateProjectionMatrix();
    if (theme === "comic" || theme === "anime") this.illustration = new IllustrationScene(this.scene, theme, () => this.render(this.progress));
    else if (theme === "portal") this.train = new TrainScene(this.scene, () => this.render(this.progress));
    else if (theme === "frog" || theme === "feidudu") this.video = new VideoScene(this.scene, theme, this.host, () => this.render(this.progress));
    else if (theme === "pixel") this.stylized = new StylizedScene(this.scene);
    else if (theme === "paper") this.paper = new PaperScene(this.scene, () => this.render(this.progress));
    else this.ink = new InkScene(this.scene);
    this.render(.43);
  }
  render(progress: number) {
    if (this.disposed || !this.theme) return;
    this.progress = progress; const aspect = this.camera.aspect;
    this.illustration?.render(progress, aspect);
    this.train?.render(progress, aspect); this.video?.render(progress, aspect);
    this.stylized?.render(progress, aspect); this.paper?.render(progress, aspect); this.ink?.render(progress, aspect);
    this.renderer.render(this.scene, this.camera);
  }
  setOpacity(opacity: number) { this.renderer.domElement.style.opacity = String(opacity); }
  playbackSettings(settings: Preferences): Preferences { return this.theme ? playbackPreferences(this.theme, settings) : settings; }
  async preparePlayback() { await this.train?.prepare(); await this.video?.prepare(); await this.illustration?.prepare(); await this.paper?.prepare(); }
  beginPlayback(settings: Preferences) { this.video?.beginPlayback(settings); }
  stopPlayback() { this.video?.stopPlayback(); }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.observer.disconnect(); this.clearScene();
    this.renderer.dispose(); this.renderer.forceContextLoss(); this.renderer.domElement.remove();
  }
}
