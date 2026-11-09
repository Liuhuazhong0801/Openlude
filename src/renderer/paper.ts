import * as THREE from "three";
import { ArtworkPlane } from "./artwork";

const landscape = `precision highp float;varying vec2 vUv;
uniform sampler2D artwork;uniform float progress,aspect;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
mat2 rotate(float a){return mat2(cos(a),-sin(a),sin(a),cos(a));}
void main(){
  float t=progress,travel=1.-exp(-t*.8);
  vec2 uv=(vUv-.5)*vec2(min(1.,aspect/(1672./941.)),min(1.,(1672./941.)/aspect));
  uv/=1.065+travel*.07;
  float foreground=pow(1.-vUv.y,2.)+pow(abs(vUv.x-.5)*2.,4.)*.45;
  uv+=vec2(sin(t*.9)*.015,-travel*.016)*(.3+foreground)+.5;
  vec3 color=texture2D(artwork,uv).rgb;
  // Winding water catches a travelling, narrow sheen in the foreground.
  float river=(1.-smoothstep(.22,.42,uv.y))*exp(-pow((uv.x-.5)/.18,2.));
  float turquoise=smoothstep(.025,.09,color.g-color.r)*(1.-smoothstep(.07,.2,color.b-color.g));
  color+=river*turquoise*pow(.5+.5*sin(uv.y*160.+uv.x*28.-t*10.),12.)*vec3(.06,.07,.06);
  vec2 p=(vUv-.5)*vec2(aspect,1.);
  // Small folded blossoms and gold flecks drift past at separate depths.
  for(int i=0;i<32;i++){
    float n=float(i),z=hash(vec2(n,47.)),speed=.15+z*.34;
    vec2 center=vec2(mod(hash(vec2(n,4.))*(aspect+.6)+t*speed,aspect+.6)-aspect*.5-.3,
      mod(hash(vec2(n,17.))*1.5-t*speed*.65+3.,1.5)-.7);
    center+=vec2(sin(t*3.+n)*.035,cos(t*2.+n)*.016);
    vec2 q=rotate(n+t*(1.5+z*2.))*(p-center)/(.003+z*z*.012);
    q.x/=max(.2,abs(cos(n+t*4.)));
    float shape=max(abs(q.x)*.8+abs(q.y)*.48-1.,length(q*vec2(.7,1.))-1.);
    float alpha=(1.-smoothstep(-.08,.16,shape))*(.5+z*.35);
    vec3 tint=mix(vec3(.86,.59,.28),vec3(1.,.8,.72),step(.35,z));
    tint*=.82+.18*smoothstep(-.7,.8,q.x);
    color=mix(color,tint,alpha);
  }
  gl_FragColor=vec4(color,1.);
}`;

function facet(points: number[], material: THREE.Material) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}
function crease(points: number[], material: THREE.LineBasicMaterial) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  return new THREE.Line(geometry, material);
}
function paperTexture() {
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 128;
  const context = canvas.getContext("2d")!;
  const pixels = context.createImageData(128, 128);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const grain = Math.sin(i * 91.73) * 43758.54;
    const value = 229 + Math.floor((grain - Math.floor(grain)) * 26);
    pixels.data.set([value, value, value, 255], i);
  }
  context.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(canvas); texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 4); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
function withPaperUV(mesh: THREE.Mesh) {
  const position = mesh.geometry.getAttribute("position"), uv: number[] = [];
  for (let i = 0; i < position.count; i++) uv.push(position.getX(i) * .5, (position.getY(i) + position.getZ(i)) * .5);
  mesh.geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return mesh;
}

export class PaperScene {
  private backdrop: ArtworkPlane;
  private grain = paperTexture();
  private birds: { group: THREE.Group; wings: THREE.Group[] }[] = [];
  constructor(scene: THREE.Scene, repaint: () => void) {
    this.backdrop = new ArtworkPlane(scene, "./assets/themes/paper-world.png", landscape, repaint);
    scene.add(new THREE.AmbientLight("#fff3e5", .9));
    scene.add(new THREE.HemisphereLight("#fff5dc", "#bbaa8b", 1.5));
    const key = new THREE.DirectionalLight("#fff3d2", 2.0); key.position.set(-3, 7, 8); scene.add(key);
    const fill = new THREE.DirectionalLight("#e7c591", .8); fill.position.set(5, -1, -2); scene.add(fill);
    for (let i = 0; i < 7; i++) {
      const group = new THREE.Group(), lead = i === 0;
      const material = (color: string) => new THREE.MeshStandardMaterial({ color, map: this.grain, emissive: color, emissiveIntensity: .12, roughness: .9, side: THREE.DoubleSide, flatShading: true });
      const face = material(lead ? "#db715b" : "#fff1ce"), fold = material(lead ? "#c7654b" : "#c7b68c");
      const edge = new THREE.LineBasicMaterial({ color: lead ? "#efc07d" : "#f7e2aa", transparent: true, opacity: .6 });
      // A closed folded body and long pointed neck/tail, viewed from above the right wing.
      group.add(withPaperUV(facet([-.85,0,0, .60,0,0, -.05,.22,.22, -.85,0,0, -.05,.22,.22, -.12,-.20,.10,
        -.85,0,0, -.05,.22,-.22, .60,0,0, -.85,0,0, -.12,-.20,-.10, -.05,.22,-.22], face)));
      group.add(withPaperUV(facet([.36,.02,0, .94,1.02,0, .59,.10,.15, .36,.02,0, .59,.10,-.15, .94,1.02,0,
        .94,1.02,0, 1.27,.96,0, 1.06,.79,.065, 1.27,.96,0, 1.43,.77,0, 1.06,.79,.065], face)));
      group.add(withPaperUV(facet([-.66,0,0, -1.48,.83,0, -.84,.10,.13, -.66,0,0, -.84,.10,-.13, -1.48,.83,0], fold)));
      group.add(crease([-.8,.01,.01, -.05,.23,.23, .6,.01,.01, .94,1.025,.01, 1.27,.965,.01], edge));
      const wings: THREE.Group[] = [];
      for (const side of [-1, 1]) {
        const wing = new THREE.Group();
        wing.add(withPaperUV(facet([-.76,.03,0, .48,.03,0, -.13,.32,side*.57, .48,.03,0, -.44,.24,side*1.75, -.13,.32,side*.57], face)));
        wing.add(withPaperUV(facet([-.76,.035,0, -.13,.32,side*.57, -.44,.245,side*1.75], fold)));
        wing.add(crease([.48,.04,0, -.13,.33,side*.57, -.44,.25,side*1.75], edge));
        group.add(wing); wings.push(wing);
      }
      scene.add(group); this.birds.push({ group, wings });
    }
  }
  render(progress: number, aspect: number) {
    this.backdrop.render(progress, aspect);
    this.birds.forEach(({ group, wings }, i) => {
      const lead = i === 0;
      // Crossing the lens, not a tiny silhouette sliding across a flat horizon.
      group.position.set((lead ? -5.4 : -6.2-i*.8)+progress*(lead ? 10.4 : 8.4),
        (lead ? .35 : .9+(i%2)*.5+i*.10)+Math.sin(progress*3.+i)*.32, lead ? 2.4 : -2.5-i*.7);
      group.scale.setScalar(lead ? .73 : .36+i*.015);
      group.rotation.set(-.64+Math.sin(progress*2.+i)*.1, -.32, .09+Math.sin(progress*3.+i)*.07);
      wings.forEach((wing, j) => { wing.rotation.x = (j ? -1 : 1) * (.19+Math.sin(progress*11.+i)*.38); });
    });
  }
  prepare() { return this.backdrop.prepare(); }
  dispose() { this.backdrop.dispose(); this.grain.dispose(); }
}
