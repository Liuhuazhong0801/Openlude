import * as THREE from "three";

const fragment = `precision highp float;
varying vec2 vUv;
uniform sampler2D artwork;
uniform float progress, aspect;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float square(float x){return x*x;}
float roundedBox(vec2 p,vec2 halfSize,float radius){vec2 q=abs(p)-halfSize+radius;return length(max(q,0.))+min(max(q.x,q.y),0.)-radius;}

vec3 outsideWindow(vec2 p,vec2 uv,float windowAspect,float t){
  // The distant skyline travels slowly; the bridge and waterside move faster.
  vec2 crop=vec2(min(1.,windowAspect/(1672./941.)),min(1.,(1672./941.)/windowAspect));
  float nearScene=1.-smoothstep(.23,.73,uv.y);
  vec2 city=(uv-.5)*crop/1.20+.5;
  city.x+=(1.-exp(-t*.8))*(.045+nearScene*.055);
  city.y+=sin(t*8.)*.0008;
  vec3 color=texture2D(artwork,city).rgb;
  float water=(1.-smoothstep(.12,.43,city.y))*smoothstep(.22,.41,city.x)*(1.-smoothstep(.64,.82,city.x));
  color+=water*pow(.5+.5*sin(city.x*280.+sin(city.y*600.)*4.-t*18.),18.)*vec3(.035,.07,.08);

  // A few fine trackside lights pass behind the glass, without dividing the view.
  float lightX=mod(t*2.7+.4,aspect+1.)-aspect*.5-.5;
  float pole=exp(-square((p.x-lightX)/.004))*(1.-smoothstep(-.1,.18,p.y));
  color=mix(color,vec3(.035,.06,.095),pole*.48);
  color+=vec3(.31,.20,.09)*exp(-square((p.x-lightX)/.025)-square((p.y+.12)/.009))*.35;

  // The glass stays in the carriage coordinate system, independently of the city.
  color=mix(color,vec3(.12,.23,.29),.045);
  for(int i=0;i<32;i++){
    float n=float(i),z=hash(vec2(n,17.));
    vec2 c=vec2(hash(vec2(n,6.))*aspect-aspect*.5,mod(hash(vec2(n,9.))*1.4-t*(.08+z*.24)+4.2,1.4)-.7);
    vec2 q=p-c;q.x+=q.y*.11;
    float streak=exp(-abs(q.x)*1500.)*exp(-abs(q.y)/(.008+z*.032));
    float rim=exp(-abs(length(q*vec2(1.,.63))-(.0015+z*.0012))*1100.);
    color+=vec3(.35,.48,.56)*(streak*.18+rim*.06);
  }
  vec2 reflected=vec2(p.x+p.y*.17,p.y);
  float lamp=exp(-square(roundedBox(reflected-vec2(-aspect*.16,.245),vec2(aspect*.21,.012),.01)/.018));
  color+=vec3(.90,.65,.34)*lamp*.065;
  float edge=pow(1.-clamp(min(min(uv.x,1.-uv.x),min(uv.y,1.-uv.y))*6.,0.,1.),3.);
  return color*(1.-edge*.14);
}

void main(){
  float t=max(progress,0.);
  vec2 p=(vUv-.5)*vec2(aspect,1.);
  vec2 center=vec2(0.,.035),halfSize=vec2(aspect*.425,.337);
  vec2 q=p-center;
  float radius=.065;
  float glassDistance=roundedBox(q,halfSize,radius);
  float grain=hash(floor(vUv*vec2(1700.,1000.)))-.5;

  // Dark teal carriage wall, lit by a warm overhead strip.
  vec3 wall=mix(vec3(.073,.101,.121),vec3(.16,.184,.185),smoothstep(-.45,.45,p.y));
  wall+=vec3(.060,.037,.015)*exp(-square((p.y-.46)/.085));
  wall+=grain*.007;
  wall*=1.-.28*exp(-max(glassDistance-.038,0.)*45.);
  float ceiling=exp(-square((p.y-.468)/.003));
  wall+=vec3(.52,.34,.17)*ceiling;
  float seam=exp(-abs(p.y+.40)*900.);
  wall*=1.-seam*.30;

  // A broad, rounded metal surround, bevel, dark rubber seal and inner highlight.
  float metalMask=1.-smoothstep(.048,.050,glassDistance);
  float across=clamp((q.y+halfSize.y)/(2.*halfSize.y),0.,1.);
  vec3 metal=mix(vec3(.10,.13,.15),vec3(.34,.38,.37),across);
  metal+=vec3(.12,.12,.10)*sin(clamp(glassDistance/.05,0.,1.)*3.14159);
  metal+=vec3(.16,.12,.065)*exp(-square((glassDistance-.041)/.003));
  metal+=grain*.008;
  vec3 color=mix(wall,metal,metalMask);
  float seal=1.-smoothstep(.008,.010,glassDistance);
  color=mix(color,vec3(.018,.027,.032),seal);

  vec2 windowUv=q/(halfSize*2.)+.5;
  vec3 view=outsideWindow(q,windowUv,halfSize.x/halfSize.y,t);
  float glassMask=1.-smoothstep(-.002,.0,glassDistance);
  color=mix(color,view,glassMask);
  float innerLip=exp(-abs(glassDistance+.001)*900.);
  color+=vec3(.22,.29,.29)*innerLip*.48;

  // A projecting wooden sill makes the lower edge read as a physical train window.
  float sillTop=center.y-halfSize.y-.027;
  float sillDepth=sillTop-p.y;
  float sill=step(0.,sillDepth)*(1.-smoothstep(.054,.057,sillDepth));
  sill*=1.-smoothstep(halfSize.x+.057+sillDepth*.8,halfSize.x+.060+sillDepth*.8,abs(p.x));
  vec3 wood=mix(vec3(.29,.205,.125),vec3(.12,.085,.065),smoothstep(0.,.055,sillDepth));
  wood+=sin(p.y*1600.+sin(p.x*8.)*2.)*.006+grain*.005;
  wood+=vec3(.20,.15,.085)*exp(-max(sillDepth,0.)*480.);
  color=mix(color,wood,sill);
  color*=1.-.10*pow(length(vUv-.5),2.);
  gl_FragColor=vec4(color,1.);
}`;

/** One fixed carriage window; only the view, reflections and rain move. */
export class TrainScene {
  private disposed = false;
  private error?: Error;
  private ready: Promise<void>;
  private uniforms = { artwork: { value: new THREE.Texture() }, progress: { value: 0 }, aspect: { value: 16 / 9 } };
  constructor(scene: THREE.Scene, repaint: () => void) {
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: "varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}",
      fragmentShader: fragment, depthTest: false, depthWrite: false, toneMapped: false,
    })));
    this.ready = new THREE.TextureLoader().loadAsync("./assets/themes/night-train.png").then(texture => {
      if (this.disposed) { texture.dispose(); return; }
      texture.colorSpace = THREE.NoColorSpace;
      texture.generateMipmaps = false;
      texture.minFilter = THREE.LinearFilter;
      this.uniforms.artwork.value.dispose();
      this.uniforms.artwork.value = texture;
      repaint();
    }).catch(() => { this.error = new Error("列车窗外素材加载失败，请重新打开应用。"); });
  }
  async prepare() { await this.ready; if (this.error && !this.disposed) throw this.error; }
  render(progress: number, aspect: number) { this.uniforms.progress.value = progress; this.uniforms.aspect.value = aspect; }
  dispose() { this.disposed = true; this.uniforms.artwork.value.dispose(); }
}
