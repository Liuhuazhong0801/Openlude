import * as THREE from "three";
import type { ThemeId } from "../shared/types";

const ease = (x: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, x)), 3);
const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const rand = (n: number) => {
  const v = Math.sin(n * 91.731 + 7.12) * 43758.5453;
  return v - Math.floor(v);
};
const vertexShader = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }`;
const fragmentShader = `
precision highp float;
varying vec2 vUv;
uniform float uProgress;
uniform float uInk;
uniform float uAspect;
float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
float fbm(vec2 p){ float f=0., a=.5; for(int i=0;i<5;i++){ f+=a*noise(p); p=p*2.03+vec2(7.1,1.3); a*=.5; } return f; }
void main(){
  vec2 p=vUv-.5; p.x*=uAspect;
  float t=uProgress;
  vec3 color;
  if(uInk<.5){
    color=vec3(.015,.037,.073);
    for(int i=0;i<4;i++){
      float fi=float(i);
      float wave=.30*sin(p.x*2.4+t*3.0+fi*1.9)+.12*sin(p.x*4.0-t*2.0+fi);
      float y=p.y-wave-(fi-1.5)*.20;
      float width=.045+.025*sin(p.x*3.+fi+t*2.);
      float ribbon=exp(-pow(y/width,2.));
      float halo=exp(-abs(y)*9.0)*.12;
      vec3 tint=fi<1.5?vec3(.12,.85,.72):vec3(.98,.54,.64);
      float center=1.-.88*exp(-dot(p,p)*11.);
      color+=(ribbon*.60+halo)*tint*center;
      color+=pow(ribbon,6.)*vec3(.8,.91,.90)*.20*center;
    }
    color+=vec3(.02,.025,.04)*(1.-length(p)*.4);
  }else{
    color=vec3(.95,.935,.902);
    float texture=fbm(p*160.);
    color+=(texture-.5)*.035;
    float flow=fbm(p*5.0+vec2(t*.32,-t*.2));
    float wave=fbm(p*11.+flow*3.);
    float opening=.15+.43*sin(t*3.1415926);
    float edge=abs(p.x*.72+p.y*.38)-opening+flow*.27;
    float ink=smoothstep(.15,.28,edge+wave*.13);
    float wash=smoothstep(.0,.28,edge)*.36;
    color=mix(color,vec3(.14,.16,.16),max(ink*.89,wash));
    float fleck=smoothstep(.88,.97,noise(p*86.))*smoothstep(.17,.45,edge);
    color=mix(color,vec3(.09,.11,.11),fleck*.3);
  }
  gl_FragColor=vec4(color,1.);
}`;

function rounded(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const x = -w / 2,
    y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** All motion is generated at runtime; theme artwork is used only by the gallery. */
export class MotionScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(46, 1, 0.1, 110);
  private observer: ResizeObserver;
  private frame = 0;
  private theme: ThemeId = "portal";
  private progress = 0.4;
  private uniforms = {
    uProgress: { value: 0.4 },
    uInk: { value: 0 },
    uAspect: { value: 1 },
  };
  private rings: THREE.Mesh[] = [];
  private papers: THREE.Mesh[] = [];
  private cubes?: THREE.InstancedMesh;
  private stars?: THREE.Points;
  private resolvePlay?: () => void;
  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "low-power",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.45;
    this.renderer.domElement.className = "motion-canvas";
    this.renderer.domElement.setAttribute("aria-label", "实时绘制的启动动画");
    host.prepend(this.renderer.domElement);
    this.camera.position.set(0, 0, 10);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.setTheme("portal");
    this.resize();
  }
  private resize() {
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.uniforms.uAspect.value = w / h;
    this.render(this.progress);
  }
  private clearScene() {
    this.scene.traverse((object) => {
      const item = object as THREE.Mesh;
      item.geometry?.dispose();
      if (Array.isArray(item.material))
        item.material.forEach((m) => m.dispose());
      else item.material?.dispose();
    });
    this.scene.clear();
    this.rings = [];
    this.papers = [];
    this.cubes = undefined;
    this.stars = undefined;
  }
  setTheme(theme: ThemeId) {
    this.stop();
    this.clearScene();
    this.theme = theme;
    this.host.dataset.theme = theme;
    this.host.classList.toggle(
      "light-stage",
      theme === "paper" || theme === "ink",
    );
    this.scene.background = new THREE.Color(
      theme === "paper" || theme === "ink" ? "#f2efe7" : "#080e16",
    );
    this.scene.fog = null;
    this.camera.position.set(0, 0, 10);
    this.camera.lookAt(0, 0, 0);
    if (theme === "aurora" || theme === "ink") {
      this.uniforms.uInk.value = theme === "ink" ? 1 : 0;
      const mat = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: this.uniforms,
        depthTest: false,
        depthWrite: false,
      });
      this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
    } else {
      this.scene.add(new THREE.AmbientLight("#c9e0ec", 1.6));
      const key = new THREE.DirectionalLight("#fff5e9", 4);
      key.position.set(-3, 5, 7);
      this.scene.add(key);
      const fill = new THREE.PointLight(
        theme === "portal" ? "#72dccc" : "#a3beff",
        160,
        70,
      );
      fill.position.set(4, -2, 5);
      this.scene.add(fill);
      if (theme === "portal") this.buildPortal();
      if (theme === "paper") this.buildPaper();
      if (theme === "pixel") this.buildPixels();
    }
    this.render(0.43);
  }
  private buildPortal() {
    this.scene.fog = new THREE.FogExp2("#080e16", 0.034);
    const shape = rounded(11.8, 7.3, 0.68);
    shape.holes.push(rounded(11.67, 7.17, 0.62));
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.06,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.024,
      bevelThickness: 0.024,
      curveSegments: 16,
    });
    for (let i = 0; i < 19; i++) {
      const material = new THREE.MeshStandardMaterial({
        color: i % 4 === 0 ? "#8bbfb8" : "#dce5e7",
        metalness: 0.7,
        roughness: 0.27,
        emissive: "#396b69",
        emissiveIntensity: 0.13,
      });
      const ring = new THREE.Mesh(geometry, material);
      this.rings.push(ring);
      this.scene.add(ring);
    }
    const positions = new Float32Array(240 * 3);
    for (let i = 0; i < 240; i++) {
      positions[i * 3] = (rand(i + 1) - 0.5) * 50;
      positions[i * 3 + 1] = (rand(i + 401) - 0.5) * 30;
      positions[i * 3 + 2] = -rand(i + 901) * 65;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.stars = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: 0.035,
        color: "#9bbdbb",
        transparent: true,
        opacity: 0.5,
      }),
    );
    this.scene.add(this.stars);
  }
  private buildPaper() {
    const colors = [
      "#7189e8",
      "#efd9ac",
      "#eb9f88",
      "#fff8ed",
      "#bfc9ec",
      "#f5e9cb",
    ];
    colors.forEach((color, index) => {
      const material = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.8,
        side: THREE.DoubleSide,
      });
      const paper = new THREE.Mesh(
        new THREE.BoxGeometry(3.8, 3.0, 0.035),
        material,
      );
      paper.userData.index = index;
      this.papers.push(paper);
      this.scene.add(paper);
    });
  }
  private buildPixels() {
    this.cubes = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.38, 0.38, 0.38),
      new THREE.MeshStandardMaterial({ roughness: 0.36, metalness: 0.12 }),
      88,
    );
    for (let i = 0; i < 88; i++)
      this.cubes.setColorAt(
        i,
        new THREE.Color(
          i % 5 === 0 ? "#ffb66b" : i % 3 === 0 ? "#c7d8ff" : "#6689ff",
        ),
      );
    this.scene.add(this.cubes);
  }
  render(progress: number) {
    this.progress = progress;
    this.uniforms.uProgress.value = progress;
    const p = progress;
    if (this.theme === "portal") {
      const travel = (p * p * 0.55 + p * 0.45) * 25;
      this.rings.forEach((ring, i) => {
        ring.position.z = ((i * 4.2 + travel) % 79.8) - 72;
        ring.rotation.z = Math.sin(p * 2.3) * 0.018;
      });
      if (this.stars) this.stars.position.z = travel * 0.45;
    }
    if (this.theme === "paper")
      this.papers.forEach((paper, i) => {
        const a = (i * Math.PI) / 3 + Math.PI / 6;
        const q = ease((p - i * 0.025) / 0.75);
        const radius = 1.45 + q * 3.5;
        paper.position.set(
          Math.cos(a) * radius,
          Math.sin(a) * radius * 0.66,
          -0.6 + i * 0.12,
        );
        paper.rotation.set(
          (1 - q) * 1.35 + 0.16,
          (1 - q) * (i % 2 ? -1.7 : 1.7),
          a + q * 0.16,
        );
      });
    if (this.theme === "pixel" && this.cubes) {
      const dummy = new THREE.Object3D();
      for (let i = 0; i < 88; i++) {
        const side = Math.floor(i / 22),
          u = (i % 22) / 21;
        const x =
          side === 0
            ? -4.4 + u * 8.8
            : side === 1
              ? 4.4
              : side === 2
                ? 4.4 - u * 8.8
                : -4.4;
        const y =
          side === 0
            ? 2.5
            : side === 1
              ? 2.5 - u * 5
              : side === 2
                ? -2.5
                : -2.5 + u * 5;
        const q = ease((p - rand(i) * 0.16) / 0.67);
        dummy.position.set(
          THREE.MathUtils.lerp((rand(i + 110) - 0.5) * 24, x, q),
          THREE.MathUtils.lerp((rand(i + 410) - 0.5) * 15, y, q),
          THREE.MathUtils.lerp(
            -rand(i + 210) * 20,
            -0.8 + Math.sin(i) * 0.15,
            q,
          ),
        );
        dummy.rotation.set((1 - q) * i, (1 - q) * i * 0.3, (1 - q) * 2.4);
        const scale = 0.6 + rand(i + 17) * 0.65;
        dummy.scale.setScalar(scale);
        dummy.updateMatrix();
        this.cubes.setMatrixAt(i, dummy.matrix);
      }
      this.cubes.instanceMatrix.needsUpdate = true;
    }
    this.renderer.render(this.scene, this.camera);
  }
  play(
    duration: number,
    reduced = false,
    onProgress?: (p: number) => void,
  ): Promise<void> {
    this.stop();
    const start = performance.now();
    return new Promise((resolve) => {
      this.resolvePlay = resolve;
      const tick = (now: number) => {
        const p = Math.min(
          1,
          (now - start) / (reduced ? Math.min(duration, 650) : duration),
        );
        this.render(reduced ? 0.7 : p);
        onProgress?.(p);
        if (p < 1) this.frame = requestAnimationFrame(tick);
        else {
          this.frame = 0;
          this.resolvePlay = undefined;
          resolve();
        }
      };
      this.frame = requestAnimationFrame(tick);
    });
  }
  stop() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.resolvePlay?.();
    this.resolvePlay = undefined;
  }
  dispose() {
    this.stop();
    this.observer.disconnect();
    this.clearScene();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

export function animateBrand(
  element: HTMLElement,
  p: number,
  reduced: boolean,
) {
  element.style.opacity = String(
    smooth(0.12, 0.42, p) * (1 - smooth(0.91, 1, p)),
  );
  element.style.transform = reduced
    ? "translate(-50%, -50%)"
    : `translate(-50%, -50%) translateY(${(1 - ease(p / 0.6)) * 22}px) scale(${0.86 + ease(p / 0.65) * 0.14})`;
  element.style.filter = `blur(${reduced ? 0 : (1 - smooth(0.1, 0.42, p)) * 6}px)`;
}
