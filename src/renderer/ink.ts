import * as THREE from "three";

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


// Preserve the original ink shader and timing unchanged.
export class InkScene {
  private uniforms = {uProgress:{value:.4},uInk:{value:1},uAspect:{value:1}};
  constructor(scene:THREE.Scene){
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.ShaderMaterial({vertexShader,fragmentShader,uniforms:this.uniforms,depthTest:false,depthWrite:false})));
  }
  render(progress:number,aspect:number){this.uniforms.uProgress.value=progress;this.uniforms.uAspect.value=aspect;}
}
