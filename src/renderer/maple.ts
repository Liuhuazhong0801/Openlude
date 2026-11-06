import * as THREE from "three";

const random = (n: number) => {
  const value = Math.sin(n * 127.1 + 31.7) * 43758.5453;
  return value - Math.floor(value);
};

/** Preserve the supplied 4K painting; animate a camera move and separate leaf layers. */
export class MapleScene {
  private disposed = false;
  private error?: Error;
  private ready: Promise<void>;
  private leaves: THREE.Mesh[] = [];
  private uniforms = {
    image: { value: new THREE.Texture() },
    aspect: { value: 16 / 9 },
    progress: { value: 0 },
  };

  constructor(scene: THREE.Scene, repaint: () => void) {
    const background = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      vertexShader: `varying vec2 uvImage;
        void main(){ uvImage=uv; gl_Position=vec4(position.xy,0.,1.); }`,
      fragmentShader: `precision highp float;
        varying vec2 uvImage;
        uniform sampler2D image;
        uniform float aspect, progress;
        void main(){
          vec2 uv=uvImage-.5;
          uv*=vec2(min(1.,aspect/(16./9.)),min(1.,(16./9.)/aspect));
          float p=max(progress,0.);
          float travel=1.-exp(-p*1.6);
          uv/=1.018+.10*travel;
          uv+=vec2(.5+.008*travel,.5+.006*travel);
          // A small, smooth depth displacement keeps the painted figure intact.
          float subject=exp(-pow((uv.x-.48)/.22,2.)-pow((uv.y-.45)/.57,2.));
          uv.x+=sin(p*.65)*.006*(1.-subject);
          vec3 color=texture2D(image,uv).rgb;
          float edge=dot(uvImage-.5,uvImage-.5);
          color*=1.-edge*.12;
          gl_FragColor=vec4(color,1.);
        }`,
    });
    const painting = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), background);
    painting.renderOrder = -1;
    scene.add(painting);
    this.ready = new THREE.TextureLoader().loadAsync("./assets/themes/maple.jpg").then(texture => {
      if (this.disposed) { texture.dispose(); return; }
      this.uniforms.image.value.dispose();
      // This unlit shader displays the original encoded colors directly.
      texture.colorSpace = THREE.NoColorSpace;
      this.uniforms.image.value = texture;
      repaint();
    }).catch(() => { this.error = new Error("赤枫剑影素材加载失败，请重新打开应用。"); });

    const geometry = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < 36; i++) {
      const foreground = i % 5 === 0;
      const material = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide,
        toneMapped: false,
        uniforms: {
          tint: { value: new THREE.Color(["#cd4922", "#e77828", "#b94c28", "#e9aa48"][i % 4]) },
          softness: { value: foreground ? 0.13 : 0.025 },
          alpha: { value: foreground ? 0.4 : 0.7 },
        },
        vertexShader: `varying vec2 leafUV;
          void main(){ leafUV=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
        fragmentShader: `precision highp float; varying vec2 leafUV;
          uniform vec3 tint; uniform float softness,alpha;
          void main(){
            vec2 p=(leafUV-.5)*2.;
            vec2 v[18];
            v[0]=vec2(0.,.94); v[1]=vec2(.18,.49); v[2]=vec2(.30,.67);
            v[3]=vec2(.34,.28); v[4]=vec2(.72,.47); v[5]=vec2(.58,.10);
            v[6]=vec2(.84,-.04); v[7]=vec2(.34,-.23); v[8]=vec2(.42,-.44);
            v[9]=vec2(0.,-.32); v[10]=vec2(-.36,-.43); v[11]=vec2(-.30,-.22);
            v[12]=vec2(-.76,-.04); v[13]=vec2(-.48,.10); v[14]=vec2(-.66,.48);
            v[15]=vec2(-.29,.35); v[16]=vec2(-.22,.65); v[17]=vec2(-.12,.47);
            float distance=4., sign=1.;
            for(int i=0;i<18;i++){
              vec2 a=v[i], b=v[0];
              if(i<17) b=v[i+1];
              vec2 e=b-a, q=p-a;
              vec2 closest=q-e*clamp(dot(q,e)/dot(e,e),0.,1.);
              distance=min(distance,dot(closest,closest));
              if((a.y>p.y)!=(b.y>p.y)){
                if(p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) sign=-sign;
              }
            }
            float leaf=1.-smoothstep(-softness,softness,sqrt(distance)*sign);
            float stem=(1.-smoothstep(.018,.04,abs(p.x)))*step(p.y,0.)*smoothstep(-.95,-.65,p.y);
            float vein=1.-.16*exp(-abs(p.x)*32.)-.08*exp(-abs(abs(p.x)*.65-p.y+.04)*50.);
            gl_FragColor=vec4(tint*vein,max(leaf,stem)*alpha);
          }`,
      });
      const leaf = new THREE.Mesh(geometry, material);
      leaf.renderOrder = foreground ? 2 : 1;
      leaf.userData.foreground = foreground;
      this.leaves.push(leaf);
      scene.add(leaf);
    }
  }

  async prepare() {
    await this.ready;
    if (this.error && !this.disposed) throw this.error;
  }

  render(progress: number, aspect: number) {
    this.uniforms.aspect.value = aspect;
    this.uniforms.progress.value = progress;
    this.leaves.forEach((leaf, i) => {
      const t = progress * (1 + random(i + 8));
      leaf.position.set(
        (random(i + 19) - .5) * 19 + Math.sin(t * 1.7 + i) * .6 + t * .7,
        ((random(i + 71) * 12 - t * 2.4 + 24) % 12) - 6,
        leaf.userData.foreground ? 4.5 : -1 + random(i + 23) * 3,
      );
      leaf.rotation.set(Math.sin(t * 3 + i) * .65, Math.cos(t * 2 + i) * .7, i + t * 2.8);
      leaf.scale.setScalar(leaf.userData.foreground ? .55 : .14 + random(i + 101) * .23);
    });
  }

  dispose() {
    this.disposed = true;
    this.uniforms.image.value.dispose();
  }
}
