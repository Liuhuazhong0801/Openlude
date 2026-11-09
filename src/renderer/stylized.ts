import * as THREE from "three";

const vertexShader = `varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
const common = `precision highp float;varying vec2 vUv;uniform float progress,aspect;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){return noise(p)*.55+noise(p*2.03+7.)*.27+noise(p*4.07)*.13;}
float line(vec2 p,vec2 a,vec2 b){vec2 e=b-a;return length(p-a-e*clamp(dot(p-a,e)/dot(e,e),0.,1.));}
mat2 rot(float a){return mat2(cos(a),-sin(a),sin(a),cos(a));}
`;
const pixel = `${common}
float box(vec2 p,vec2 b){vec2 q=abs(p)-b;return max(q.x,q.y);}
void main(){
  float t=progress;
  vec2 resolution=vec2(floor(216.*aspect),216.);
  vec2 uv=(floor(vUv*resolution)+.5)/resolution;
  vec2 p=(uv-.5)*vec2(aspect,1.);
  vec3 color=mix(vec3(.035,.035,.14),vec3(.20,.12,.32),uv.y);
  // Three parallax star layers and a band of pixel nebulae.
  float mist=fbm(p*4.+vec2(-t*.09,0.));
  color+=vec3(.24,.06,.24)*smoothstep(.42,.82,mist)*smoothstep(.1,.7,uv.y);
  for(int layer=0;layer<3;layer++){
    float k=float(layer),scale=47.+k*31.;
    vec2 q=p*scale+vec2(t*(3.+k*3.),0.);
    vec2 cell=floor(q);float star=step(.985,hash(cell+k*27.));
    float shape=step(abs(fract(q).x-.5),.11)*step(abs(fract(q).y-.5),.11);
    color+=mix(vec3(.36,.45,.79),vec3(1.,.81,.48),hash(cell+14.))*star*shape*(.55+k*.2);
  }
  // A warm ringed planet passes behind distant mountain silhouettes.
  vec2 planet=p-vec2(aspect*.28-t*.025,.20);
  float r=length(planet),disc=1.-step(.155,r);
  float bands=floor((planet.y+.2)*110.)/110.;
  vec3 planetColor=mix(vec3(.97,.42,.26),vec3(1.,.76,.43),.5+.5*sin(bands*61.));
  planetColor*=.65+.35*clamp((planet.x+.17)/.32,0.,1.);
  vec2 ringP=rot(-.35)*planet;
  float ring=length(ringP*vec2(.67,3.2));
  color=mix(color,vec3(.65,.37,.53),step(.18,ring)*(1.-step(.205,ring)));
  color=mix(color,planetColor,disc);
  float frontRing=step(.18,ring)*(1.-step(.205,ring))*(1.-step(0.,ringP.y));
  color=mix(color,vec3(.83,.56,.63),frontRing);
  for(int layer=0;layer<3;layer++){
    float n=float(layer),x=p.x+t*(.06+n*.08);
    float ridge=-.32+n*.012+noise(vec2(x*(4.+n*2.),n*13.))*(.12+n*.04);
    if(p.y<ridge)color=mix(vec3(.13,.12,.29),vec3(.04,.06,.15),n/2.);
    float tower=floor(x*(35.+n*12.));
    float height=hash(vec2(tower,n+27.))*.085;
    if(p.y<ridge+height&&p.y>ridge&&fract(x*(35.+n*12.))<.68){
      color=vec3(.10,.12,.24)*(1.-n*.18);
      if(mod(floor(p.y*216.),4.)==0.&&hash(vec2(tower,floor(p.y*70.)))>.48)color=vec3(.94,.63,.30)*.7;
    }
  }
  // A tiny pixel spacecraft glides across the scene; the exhaust is independently animated.
  vec2 ship=p-vec2(-aspect*.36+t*aspect*.60,.015+sin(t*3.)*.055);
  if(ship.x<-.07&&ship.x>-.23-.035*sin(t*37.)&&abs(ship.y)<.022+(-ship.x-.07)*.08)
    color=mix(vec3(.95,.30,.26),vec3(1.,.83,.52),step(-.16,ship.x));
  bool outline=abs(ship.y)<.033&&ship.x>-.092&&ship.x<.102-abs(ship.y)*1.6;
  if(outline)color=vec3(.16,.24,.39);
  bool hull=abs(ship.y)<.027&&ship.x>-.085&&ship.x<.09-abs(ship.y)*1.6;
  bool wing=ship.x>-.06&&ship.x<-.01&&abs(ship.y)<.064-abs(ship.x+.015)*.7;
  if(hull||wing)color=ship.y>.003?vec3(.91,.92,.88):vec3(.47,.59,.75);
  if(box(ship-vec2(.035,.008),vec2(.023,.012))<0.)color=vec3(.22,.81,.88);
  if(box(ship-vec2(-.05,.045),vec2(.014,.015))<0.)color=vec3(.94,.38,.27);
  if(box(ship-vec2(-.06,-.015),vec2(.017,.005))<0.)color=vec3(.19,.29,.43);
  if(box(ship-vec2(-.057,.020),vec2(.015,.003))<0.)color=vec3(1.,.84,.55);
  float trail=step(.995,hash(vec2(floor(uv.y*130.),9.)))*(1.-step(.25,fract(uv.x+t*.7)));
  color+=vec3(.15,.28,.42)*trail;
  gl_FragColor=vec4(color,1.);
}`;

export class StylizedScene {
  private uniforms = { progress: { value: 0 }, aspect: { value: 16 / 9 } };
  constructor(scene: THREE.Scene) {
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader, fragmentShader: pixel,
      depthTest: false, depthWrite: false, toneMapped: false,
    })));
  }
  render(progress: number, aspect: number) { this.uniforms.progress.value = progress; this.uniforms.aspect.value = aspect; }
}
