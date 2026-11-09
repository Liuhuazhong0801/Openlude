import * as THREE from "three";

const vertex = `varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
const shared = `precision highp float; varying vec2 vUv;
uniform sampler2D artwork; uniform float progress,aspect;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float ease(float t){t=clamp(t,0.,1.);return t*t*(3.-2.*t);}
float segment(vec2 p,vec2 a,vec2 b){vec2 e=b-a;return length(p-a-e*clamp(dot(p-a,e)/dot(e,e),0.,1.));}
mat2 rotate(float a){return mat2(cos(a),-sin(a),sin(a),cos(a));}
`;

const comic = `${shared}
vec3 panel(vec2 uv,float index,float zoom,vec2 pan,float ratio){
  uv=(uv-.5)*vec2(min(1.,ratio/(16./9.)),min(1.,(16./9.)/ratio))/zoom+.5+pan;
  uv=clamp(uv,.007,.993)*.5;
  uv+=vec2(mod(index,2.)*.5,index<2.?.5:0.);
  return texture2D(artwork,uv).rgb;
}
void frame(inout vec3 color,vec2 p,vec2 center,vec2 size,float angle,float index,float zoom,vec2 pan){
  vec2 q=rotate(angle)*(p-center);
  vec2 edge=abs(q)-size*.5;
  float d=max(edge.x,edge.y);
  float shadow=1.-smoothstep(.012,.055,max(abs(q-vec2(.014,-.018)).x-size.x*.5,abs(q-vec2(.014,-.018)).y-size.y*.5));
  color=mix(color,vec3(.06,.07,.09),shadow*.5);
  if(d<.012){color=vec3(.06,.07,.08);}
  if(d<.004){color=vec3(.99,.95,.82);}
  if(d<-.008){color=panel(q/size+.5,index,zoom,pan,size.x/size.y);}
}
void main(){
  float t=max(progress,0.);
  vec2 p=(vUv-.5)*vec2(aspect,1.);
  float texture=hash(floor(vUv*vec2(1600.,900.)));
  vec3 color=vec3(.97,.91,.75)+(texture-.5)*.035;
  // Printed speed lines sweep underneath three independently moving panels.
  float ray=atan(p.y+.12,p.x+.8),r=length(p+vec2(.8,.12));
  float stripe=step(.965,fract(ray*31.+t*1.1))*smoothstep(.15,.7,r);
  color=mix(color,vec3(.14,.17,.19),stripe*.22);
  float intro=ease(t/.16),second=ease((t-.10)/.18),third=ease((t-.23)/.17);
  float hero=ease((t-.40)/.22),exitPhase=ease((t-.75)/.20);
  float shake=sin(t*62.)*exp(-pow((t-.44)/.055,2.))*.008;
  p+=vec2(shake,-shake*.4);
  // Eye close-up, landing detail and leap form a moving comic page.
  frame(color,p,vec2(-aspect*.27-(1.-intro)*aspect,-.01)+vec2(-hero*aspect,0.),vec2(aspect*.44,.86),-.035,0.,1.03+t*.06,vec2(t*.015,0.));
  frame(color,p,vec2(aspect*.23+(1.-second)*aspect,.245+hero),vec2(aspect*.49,.39),.025,1.,1.05+t*.1,vec2(0.,-.02));
  vec2 size=mix(vec2(aspect*.49,.42),vec2(aspect*1.035,1.035),hero);
  vec2 center=mix(vec2(aspect*.23,-.24-(1.-third)),vec2(0.),hero);
  center.x-=exitPhase*aspect*1.12;
  frame(color,p,center,size,mix(-.025,0.,hero),2.,1.02+hero*.035,vec2(-.015*t,0.));
  // The final skyline arrives as a wide panel, with a gentle continuing camera move.
  frame(color,p,vec2(aspect*(1.14-exitPhase*1.14),0.),vec2(aspect*1.04,1.04),0.,3.,1.025+max(t-.75,0.)*.08,vec2(.01*sin(t),0.));
  float lines=step(.986,fract(vUv.y*107.+t*2.))*smoothstep(.45,.9,abs(vUv.x-.5)*2.);
  color=mix(color,vec3(.08,.12,.16),lines*.30*sin(clamp(t,0.,1.)*3.14159));
  gl_FragColor=vec4(color,1.);
}`;

const anime = `${shared}
void main(){
  float t=max(progress,0.);
  vec2 uv=vUv-.5;
  uv*=vec2(min(1.,aspect/(1672./941.)),min(1.,(1672./941.)/aspect));
  float travel=1.-exp(-t*1.15);
  uv/=1.045+.065*travel;
  uv+=vec2(.5+.015*travel,.5+.012*travel);
  // Sky moves more slowly than the coastal foreground; water catches moving light.
  uv.x+=smoothstep(.32,.7,uv.y)*sin(t*.9)*.005;
  vec3 color=texture2D(artwork,uv).rgb;
  float sea=(1.-smoothstep(.245,.32,uv.y))*smoothstep(.10,.18,uv.y)*smoothstep(.34,.55,uv.x);
  float glint=pow(max(0.,sin(uv.x*380.+sin(uv.y*540.)*8.+t*14.)),18.);
  color+=sea*glint*.07;
  vec2 p=(vUv-.5)*vec2(aspect,1.);
  // Soft sun shafts drift through the sky rather than flashing the whole screen.
  float a=atan(p.y-.7,p.x-aspect*.6);
  float shaft=pow(max(0.,sin(a*23.+t*.3)),14.)*.06*smoothstep(-.35,.5,p.y);
  color=mix(color,vec3(1.,.96,.87),shaft);
  // A small flock with articulated wings crosses the cloud layer.
  for(int i=0;i<7;i++){
    float n=float(i);
    vec2 center=vec2(-aspect*.65+t*(.65+n*.018)+n*.055,.12+sin(n*1.9)*.07+sin(t*1.4+n)*.02);
    vec2 q=(p-center)/(0.009+mod(n,3.)*.002);
    float flap=sin(t*21.+n*1.7)*.48;
    float bird=min(segment(q,vec2(-1.,flap),vec2(0.,-.22)),segment(q,vec2(0.,-.22),vec2(1.,flap)));
    color=mix(color,vec3(.14,.27,.36),(1.-smoothstep(.06,.16,bird))*.78);
  }
  // Sakura petals have independent depth, flutter and a gust that develops over time.
  for(int i=0;i<28;i++){
    float n=float(i),seed=hash(vec2(n,17.));
    float speed=.45+hash(vec2(n,8.));
    float z=hash(vec2(n,42.));
    vec2 center=vec2(mod(seed*(aspect+1.2)+t*speed*.55,aspect+1.2)-aspect*.5-.6,
      mod(hash(vec2(n,6.))*1.8-t*speed*.28+3.6,1.8)-.8);
    center+=vec2(sin(t*6.+n)*.05,cos(t*4.+n)*.025);
    float size=mix(.008,.037,pow(z,3.));
    vec2 q=rotate(n+t*(2.+z*4.))*(p-center)/size;
    q.x/=max(.22,abs(cos(t*7.+n)));
    float petal=length(q*vec2(.78,1.))-1.;
    petal=max(petal,-length(q-vec2(0.,.97))+.30);
    float alpha=(1.-smoothstep(-.08,.08+z*.15,petal))*(.55+z*.35);
    vec3 pink=mix(vec3(.99,.69,.79),vec3(1.,.94,.91),smoothstep(-.9,.8,q.y));
    color=mix(color,pink,alpha);
  }
  color*=1.-dot(vUv-.5,vUv-.5)*.08;
  gl_FragColor=vec4(color,1.);
}`;

/** Painted assets plus separately timed layers; no video or runtime network request. */
export class IllustrationScene {
  private disposed = false;
  private error?: Error;
  private ready: Promise<void>;
  private uniforms = { artwork: { value: new THREE.Texture() }, progress: { value: 0 }, aspect: { value: 16 / 9 } };
  constructor(scene: THREE.Scene, theme: "comic" | "anime", repaint: () => void) {
    const material = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: vertex,
      fragmentShader: theme === "comic" ? comic : anime, depthTest: false, depthWrite: false, toneMapped: false });
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
    const source = theme === "comic" ? "./assets/themes/comic.png" : "./assets/themes/anime.png";
    this.ready = new THREE.TextureLoader().loadAsync(source).then(texture => {
      if (this.disposed) { texture.dispose(); return; }
      this.uniforms.artwork.value.dispose();
      texture.colorSpace = THREE.NoColorSpace;
      this.uniforms.artwork.value = texture;
      repaint();
    }).catch(() => { this.error = new Error("主题插画加载失败，请重新打开应用。"); });
  }
  async prepare() { await this.ready; if (this.error && !this.disposed) throw this.error; }
  render(progress: number, aspect: number) { this.uniforms.progress.value = progress; this.uniforms.aspect.value = aspect; }
  dispose() { this.disposed = true; this.uniforms.artwork.value.dispose(); }
}
