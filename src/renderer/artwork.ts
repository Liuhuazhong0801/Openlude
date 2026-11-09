import * as THREE from "three";

/** Texture-backed scene with the same readiness/disposal contract as native overlays. */
export class ArtworkPlane {
  protected uniforms = {
    artwork: { value: new THREE.Texture() }, progress: { value: 0 }, aspect: { value: 16 / 9 },
  };
  private ready: Promise<void>;
  private disposed = false;
  private error?: Error;
  constructor(scene: THREE.Scene, source: string, fragmentShader: string, repaint: () => void) {
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,
      fragmentShader, depthTest: false, depthWrite: false, toneMapped: false,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    plane.renderOrder = -1;
    scene.add(plane);
    this.ready = new THREE.TextureLoader().loadAsync(source).then(texture => {
      if (this.disposed) { texture.dispose(); return; }
      texture.colorSpace = THREE.NoColorSpace;
      texture.generateMipmaps = false;
      texture.minFilter = THREE.LinearFilter;
      this.uniforms.artwork.value.dispose();
      this.uniforms.artwork.value = texture;
      repaint();
    }).catch(() => { this.error = new Error("主题素材加载失败，请重新打开应用。"); });
  }
  async prepare() { await this.ready; if (this.error && !this.disposed) throw this.error; }
  render(progress: number, aspect: number) {
    this.uniforms.progress.value = progress;
    this.uniforms.aspect.value = aspect;
  }
  dispose() { this.disposed = true; this.uniforms.artwork.value.dispose(); }
}
