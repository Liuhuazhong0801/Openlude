import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const random = (n: number) => { const x = Math.sin(n * 91.731 + 7.12) * 43758.5453; return x - Math.floor(x); };
function rounded(width: number, height: number, radius: number) {
  const s = new THREE.Shape(), x = -width / 2, y = -height / 2;
  s.moveTo(x + radius, y); s.lineTo(x + width - radius, y); s.quadraticCurveTo(x + width, y, x + width, y + radius);
  s.lineTo(x + width, y + height - radius); s.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  s.lineTo(x + radius, y + height); s.quadraticCurveTo(x, y + height, x, y + height - radius);
  s.lineTo(x, y + radius); s.quadraticCurveTo(x, y, x + radius, y);
  return s;
}
function frame(width: number, height: number, thickness: number, depth: number) {
  const shape = rounded(width, height, .8);
  shape.holes.push(rounded(width - thickness * 2, height - thickness * 2, .8 - thickness));
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: .025, bevelThickness: .025, bevelSegments: 2, curveSegments: 18, steps: 1 });
}

/** A real 3D corridor: thick structural frames, inset lighting, dust and optical bloom. */
export class PortalScene {
  private frames: THREE.Group[] = [];
  private streaks: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private output: OutputPass;
  private environment: THREE.WebGLRenderTarget;
  private size = new THREE.Vector2();
  private renderedSize = new THREE.Vector2();
  private atmosphere = { progress: { value: 0 }, aspect: { value: 16 / 9 } };
  constructor(scene: THREE.Scene, private renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera) {
    scene.fog = new THREE.FogExp2("#03141e", .026);
    const room = new RoomEnvironment(), pmrem = new THREE.PMREMGenerator(renderer);
    this.environment = pmrem.fromScene(room, .04);
    scene.environment = this.environment.texture; scene.environmentIntensity = .65;
    room.dispose(); pmrem.dispose();
    scene.add(new THREE.HemisphereLight("#8dc5d6", "#050813", 2.3));
    const key = new THREE.DirectionalLight("#d7efff", 5); key.position.set(-4, 6, 10); scene.add(key);
    const rim = new THREE.DirectionalLight("#edb176", 2.2); rim.position.set(5, -3, 4); scene.add(rim);
    const blue = new THREE.PointLight("#28d4ff", 220, 90); blue.position.set(-4, 1, 2); scene.add(blue);
    const gold = new THREE.PointLight("#ffae58", 150, 80); gold.position.set(4, -2, -7); scene.add(gold);
    const steel = new THREE.MeshStandardMaterial({ color: "#203848", metalness: .72, roughness: .27 });
    const silver = new THREE.MeshStandardMaterial({ color: "#8097a4", metalness: .75, roughness: .21 });
    const cyan = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(.04, 1.3, 2.0) });
    const amber = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(2.0, .65, .08) });
    const hull = frame(12.3, 7.9, .25, .55), trim = frame(11.78, 7.38, .035, .045);
    const outer = frame(12.45, 8.05, .026, .035);
    const panel = new THREE.BoxGeometry(.25, .64, .08), bar = new THREE.BoxGeometry(.027, .34, .025);
    for (let i = 0; i < 17; i++) {
      const group = new THREE.Group();
      group.add(new THREE.Mesh(hull, steel));
      const inner = new THREE.Mesh(trim, i % 4 === 0 ? amber : cyan); inner.position.z = .58; group.add(inner);
      const outside = new THREE.Mesh(outer, silver); outside.position.z = .30; group.add(outside);
      // Machined panels and tiny segmented indicators make each gate read as an object.
      for (const side of [-1, 1]) for (const y of [-2.35, 0, 2.35]) {
        const plate = new THREE.Mesh(panel, steel); plate.position.set(side * 6.03, y, .58); group.add(plate);
        for (let j = 0; j < 3; j++) {
          const indicator = new THREE.Mesh(bar, side < 0 ? cyan : amber);
          indicator.position.set(side * 6.03 + (j - 1) * .073, y, .67); group.add(indicator);
        }
      }
      scene.add(group); this.frames.push(group);
    }
    const beamGeometry = new THREE.BoxGeometry(.085, .085, 104);
    for (const x of [-5.65, -4.95, 4.95, 5.65]) for (const y of [-3.75, 3.75]) {
      const beam = new THREE.Mesh(beamGeometry, x < 0 ? cyan : amber);
      beam.position.set(x, y, -42); scene.add(beam);
    }
    // Reflective deck strips and floor joints reinforce the depth and forward travel.
    const deck = new THREE.Mesh(new THREE.PlaneGeometry(11.8, 106), new THREE.MeshStandardMaterial({ color: "#0a2432", metalness: .7, roughness: .32 }));
    deck.rotation.x = -Math.PI / 2; deck.position.set(0, -4.03, -42); scene.add(deck);
    for (let i = 0; i < 32; i++) {
      const joint = new THREE.Mesh(new THREE.BoxGeometry(11.8, .012, .025), silver);
      joint.position.set(0, -4.01, 9 - i * 3.3); scene.add(joint);
    }
    this.streaks = new THREE.InstancedMesh(new THREE.BoxGeometry(.012, .012, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(.7, 1.1, 1.5), transparent: true, opacity: .58 }), 360);
    this.streaks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.streaks);
    const haze = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: this.atmosphere, depthTest: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending,
      vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,
      fragmentShader: `varying vec2 vUv;uniform float progress,aspect;
      void main(){vec2 p=(vUv-.5)*vec2(aspect,1.);float r=length(p),a=atan(p.y,p.x);
        float shaft=pow(.5+.5*sin(a*9.+progress*.6),18.)*exp(-r*3.);
        vec3 c=vec3(.018,.12,.16)*(exp(-r*5.)+.19*shaft);
        c+=vec3(.08,.03,.008)*exp(-length(p-vec2(.55,-.3))*5.);
        gl_FragColor=vec4(c*.055,.5);}`,
    })); haze.renderOrder = 2; scene.add(haze);
    this.composer = new EffectComposer(renderer);
    this.composer.renderTarget1.samples = 4; this.composer.renderTarget2.samples = 4;
    this.composer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(640, 360), .23, .20, .95);
    this.output = new OutputPass(); this.composer.addPass(this.bloom); this.composer.addPass(this.output);
  }
  render(progress: number, camera: THREE.PerspectiveCamera) {
    const travel = progress * 30 + progress * progress * 13;
    this.frames.forEach((group, i) => {
      const z = ((i * 5.8 + travel) % 98.6) - 89;
      group.position.set(Math.sin(z * .038 + progress * .7) * .36, Math.sin(z * .025) * .12, z);
      group.rotation.z = Math.sin(z * .025 + progress * .6) * .045;
    });
    for (let i = 0; i < 360; i++) {
      const a = random(i + 5) * Math.PI * 2, r = 1.5 + random(i + 28) * 7;
      this.dummy.position.set(Math.cos(a) * r, Math.sin(a) * r * .65, ((random(i + 82) * 96 + travel * 1.55) % 98) - 88);
      this.dummy.scale.set(1, 1, .08 + random(i + 44) * (.8 + Math.min(progress, 1) * 1.7));
      this.dummy.updateMatrix(); this.streaks.setMatrixAt(i, this.dummy.matrix);
    }
    this.streaks.instanceMatrix.needsUpdate = true;
    camera.position.set(Math.sin(progress * 1.6) * .22, Math.sin(progress * 1.8) * .10, 10);
    camera.lookAt(Math.sin(progress * .8) * .5, 0, -40);
    camera.fov = 48 + Math.sin(Math.min(progress, 1) * Math.PI) * 6; camera.updateProjectionMatrix();
    this.atmosphere.progress.value = progress; this.atmosphere.aspect.value = camera.aspect;
  }
  draw() {
    this.renderer.getSize(this.size);
    if (!this.size.equals(this.renderedSize)) { this.composer.setSize(this.size.x, this.size.y); this.renderedSize.copy(this.size); }
    this.composer.render();
  }
  dispose() { this.bloom.dispose(); this.output.dispose(); this.composer.dispose(); this.environment.dispose(); }
}
