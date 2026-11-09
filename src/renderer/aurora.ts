import * as THREE from "three";
import { ArtworkPlane } from "./artwork";

const fragmentShader = `precision highp float;
varying vec2 vUv;uniform sampler2D artwork;uniform float progress,aspect;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
void main(){
  float t=progress;
  vec2 p=(vUv-.5)*vec2(aspect,1.);
  vec2 uv=(vUv-.5)*vec2(min(1.,aspect/(1672./941.)),min(1.,(1672./941.)/aspect));
  // Two scales of travelling deformation bend the actual folds, not only the camera.
  uv/=1.19+.035*sin(t*1.4);
  vec2 flow=vec2(sin(uv.y*6.4+t*3.3)+.35*sin(uv.x*8.-t*2.),
                 cos(uv.x*5.8-t*2.4)+.35*sin(uv.y*11.+t*3.1));
  uv+=flow*vec2(.046,.036)+vec2(.015*sin(t*1.2),.018*cos(t*.9))+.5;
  vec2 bend=vec2(sin(uv.y*13.+t*3.),cos(uv.x*11.-t*2.))*.0014;
  vec3 color=vec3(texture2D(artwork,uv+bend).r,texture2D(artwork,uv).g,texture2D(artwork,uv-bend).b);
  float luminance=dot(color,vec3(.21,.72,.07));
  // A broad specular sweep follows the moving fabric; dark valleys stay dark.
  float light=.5+.5*sin(uv.x*6.5-uv.y*4.2+t*4.8);
  float crest=pow(light,8.)*smoothstep(.30,.85,luminance);
  color*=.91+.12*light;
  color+=crest*vec3(.11,.105,.075);
  float fiber=pow(.5+.5*sin(uv.y*720.+sin(uv.x*9.+t)*19.-t*7.),22.);
  color+=fiber*crest*.045;
  // Sparse drifting glints carry an independent near/far parallax layer.
  for(int i=0;i<24;i++){
    float n=float(i),depth=hash(vec2(n,5.));
    vec2 center=vec2(mod(hash(vec2(n,3.))*(aspect+1.)+t*(.12+depth*.16),aspect+1.)-aspect*.5-.5,
      .48*sin(n*3.1+t*.5)+.11*sin(t*2.+n));
    vec2 q=p-center;float size=.0008+depth*.002;
    float pin=exp(-length(q)/size);
    float crossLight=exp(-abs(q.x)*900.)*exp(-abs(q.y)*160.)+exp(-abs(q.y)*900.)*exp(-abs(q.x)*160.);
    float twinkle=pow(.5+.5*sin(t*3.2+n*2.7),5.);
    color+=vec3(.62,.83,1.)*(pin*.55+crossLight*.045)*twinkle;
  }
  color*=1.-.10*smoothstep(.25,.85,length(vUv-.5));
  gl_FragColor=vec4(color,1.);
}`;

export class AuroraScene extends ArtworkPlane {
  constructor(scene: THREE.Scene, repaint: () => void) {
    super(scene, "./assets/themes/aurora-silk.png", fragmentShader, repaint);
  }
}
