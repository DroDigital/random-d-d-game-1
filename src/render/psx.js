// The "Ashcore" look: a PSX/PS2-era filter applied on top of the real assets.
//  - scene renders into a tiny render target (240p by default) and is upscaled
//    with nearest-neighbour filtering
//  - vertices snap to the low-res pixel grid (the PS1 "wobble")
//  - textures are partly affine-mapped (the PS1 texture warp)
//  - a post pass adds woodcut-style ink outlines from the depth buffer, a
//    per-biome tonal ramp that unifies every asset pack, 15-bit colour with
//    ordered dithering, ash grain, vignette and optional scanlines
import * as THREE from 'three';

export const psxUniforms = {
  uSnapRes: { value: new THREE.Vector2(320, 240) },
  uAffine: { value: 0.55 },
};

export const settings = {
  height: 240, jitter: true, affine: true, dither: true, outline: true, scanlines: false, grade: 1.0,
};

// Patch any built-in material so it wobbles and warps like a PS1.
export function psxify(material) {
  if (material.userData.psx) return material;
  material.userData.psx = true;
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, r) => {
    if (prev) prev(shader, r);
    shader.uniforms.uSnapRes = psxUniforms.uSnapRes;
    shader.uniforms.uAffine = psxUniforms.uAffine;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec2 uSnapRes;\nvarying vec3 vAffUv;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        {
          vec4 sp = gl_Position;
          if (uSnapRes.x > 0.0) {
            sp.xyz /= sp.w;
            sp.xy = floor(sp.xy * uSnapRes * 0.5 + 0.5) / (uSnapRes * 0.5);
            sp.xyz *= sp.w;
            gl_Position = sp;
          }
          #ifdef USE_MAP
            vAffUv = vec3(vMapUv * gl_Position.w, gl_Position.w);
          #else
            vAffUv = vec3(0.0, 0.0, 1.0);
          #endif
        }`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uAffine;\nvarying vec3 vAffUv;')
      .replace('#include <map_fragment>', `
        #ifdef USE_MAP
          vec2 affUv = mix(vMapUv, vAffUv.xy / vAffUv.z, uAffine);
          vec4 sampledDiffuseColor = texture2D( map, affUv );
          diffuseColor *= sampledDiffuseColor;
        #endif`);
  };
  material.customProgramCacheKey = () => 'psx' + (material.map ? 1 : 0);
  return material;
}

// Convert loaded PBR materials into cheap Gouraud-ish Lambert materials (PS2 feel).
export function toRetroMaterial(m) {
  const opts = {
    map: m.map || null, color: m.color ? m.color.clone() : new THREE.Color(1, 1, 1),
    transparent: m.transparent, opacity: m.opacity, alphaTest: m.alphaTest || 0, side: m.side,
    vertexColors: m.vertexColors,
  };
  if (m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > 0) {
    opts.emissive = m.emissive.clone(); opts.emissiveMap = m.emissiveMap || null;
    opts.emissiveIntensity = m.emissiveIntensity ?? 1;
  }
  if (opts.map) { opts.map.magFilter = THREE.NearestFilter; opts.map.minFilter = THREE.NearestFilter; opts.map.generateMipmaps = false; opts.map.needsUpdate = true; }
  const n = new THREE.MeshLambertMaterial(opts);
  n.name = m.name;
  return psxify(n);
}

export function retroify(root, { keepEmissive = true } = {}) {
  const cache = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = !o.isSkinnedMesh;
    const conv = (m) => {
      if (cache.has(m)) return cache.get(m);
      const n = m.userData.psx ? m : toRetroMaterial(m);
      cache.set(m, n);
      return n;
    };
    o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
  });
  return root;
}

const POST_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const POST_FS = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tColor; uniform sampler2D tDepth;
uniform vec2 uRes; uniform float uNear; uniform float uFar; uniform float uTime;
uniform vec3 uRamp0; uniform vec3 uRamp1; uniform vec3 uRamp2; uniform vec3 uRamp3; uniform vec3 uInk;
uniform float uGrade; uniform float uDither; uniform float uOutline; uniform float uScan;
uniform float uFlash; uniform vec3 uFlashColor; uniform float uDesat; uniform float uVignette;

float linDepth(vec2 uv){
  float z = texture2D(tDepth, uv).x;
  float ndc = z * 2.0 - 1.0;
  return (2.0 * uNear * uFar) / (uFar + uNear - ndc * (uFar - uNear));
}
float bayer4(vec2 p){
  int x = int(mod(p.x, 4.0)); int y = int(mod(p.y, 4.0));
  int i = x + y * 4;
  float m[16];
  m[0]=0.0; m[1]=8.0; m[2]=2.0; m[3]=10.0; m[4]=12.0; m[5]=4.0; m[6]=14.0; m[7]=6.0;
  m[8]=3.0; m[9]=11.0; m[10]=1.0; m[11]=9.0; m[12]=15.0; m[13]=7.0; m[14]=13.0; m[15]=5.0;
  float v = 0.0;
  for (int k = 0; k < 16; k++) { if (k == i) v = m[k]; }
  return v / 16.0 - 0.5;
}
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 ramp(float l){
  if (l < 0.33) return mix(uRamp0, uRamp1, l / 0.33);
  if (l < 0.72) return mix(uRamp1, uRamp2, (l - 0.33) / 0.39);
  return mix(uRamp2, uRamp3, (l - 0.72) / 0.28);
}
void main(){
  vec2 px = floor(vUv * uRes);
  vec2 uv = (px + 0.5) / uRes;
  vec3 c = texture2D(tColor, uv).rgb;

  // woodcut ink outline from depth discontinuities
  if (uOutline > 0.0) {
    vec2 t = 1.0 / uRes;
    float d = linDepth(uv);
    float dl = linDepth(uv - vec2(t.x, 0.0)); float dr = linDepth(uv + vec2(t.x, 0.0));
    float du = linDepth(uv + vec2(0.0, t.y)); float dd = linDepth(uv - vec2(0.0, t.y));
    float edge = max(max(dl - d, dr - d), max(du - d, dd - d));
    float e = smoothstep(0.07 * d, 0.13 * d, edge);
    if (d < uFar * 0.95) c = mix(c, uInk, e * uOutline * 0.85);
  }

  // tonal ramp grade: unifies every asset pack into one palette, but lets hot
  // saturated colours (fire, magic, blood) punch through
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  float mx = max(c.r, max(c.g, c.b)); float mn = min(c.r, min(c.g, c.b));
  float sat = mx > 0.0 ? (mx - mn) / mx : 0.0;
  vec3 graded = ramp(clamp(l * 1.08, 0.0, 1.0));
  float keep = smoothstep(0.45, 0.9, sat) * smoothstep(0.25, 0.7, mx);
  c = mix(c, graded, uGrade * (1.0 - keep * 0.75));
  c = mix(c, vec3(l), uDesat);

  // ash grain
  c += (hash(px + floor(uTime * 12.0)) - 0.5) * 0.035;

  // vignette
  vec2 q = vUv - 0.5;
  c *= 1.0 - dot(q, q) * uVignette;

  // damage / event flash
  c = mix(c, uFlashColor, uFlash);

  // 15-bit colour + ordered dither
  if (uDither > 0.0) {
    float levels = 31.0;
    c += bayer4(px) / levels * 1.15;
    c = floor(c * levels + 0.5) / levels;
  }
  if (uScan > 0.0) c *= 0.88 + 0.12 * mod(floor(vUv.y * uRes.y * 2.0), 2.0);
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

export class PSXRenderer {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.rt = null;
    this.postScene = new THREE.Scene();
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.post = new THREE.ShaderMaterial({
      vertexShader: POST_VS, fragmentShader: POST_FS, depthTest: false, depthWrite: false,
      uniforms: {
        tColor: { value: null }, tDepth: { value: null }, uRes: { value: new THREE.Vector2() },
        uNear: { value: 0.5 }, uFar: { value: 200 }, uTime: { value: 0 },
        uRamp0: { value: new THREE.Color() }, uRamp1: { value: new THREE.Color() },
        uRamp2: { value: new THREE.Color() }, uRamp3: { value: new THREE.Color() }, uInk: { value: new THREE.Color() },
        uGrade: { value: 0.5 }, uDither: { value: 1 }, uOutline: { value: 1 }, uScan: { value: 0 },
        uFlash: { value: 0 }, uFlashColor: { value: new THREE.Color(1, 0, 0) }, uDesat: { value: 0 }, uVignette: { value: 1.4 },
      },
    });
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.post));
    this.setPalette(PALETTES.crypt);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setPalette(p) {
    const u = this.post.uniforms;
    // palette colours are authored in sRGB and the post shader works in sRGB,
    // so store the raw values (no linear conversion)
    const L = THREE.LinearSRGBColorSpace;
    u.uRamp0.value.setStyle(p[0], L); u.uRamp1.value.setStyle(p[1], L); u.uRamp2.value.setStyle(p[2], L);
    u.uRamp3.value.setStyle(p[3], L); u.uInk.value.setStyle(p[4], L);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    const lh = settings.height;
    const lw = Math.round(lh * w / h);
    this.lowW = lw; this.lowH = lh;
    if (this.rt) { this.rt.dispose(); this.rt.depthTexture.dispose(); }
    const depth = new THREE.DepthTexture(lw, lh);
    depth.type = THREE.UnsignedIntType;
    this.rt = new THREE.WebGLRenderTarget(lw, lh, {
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthTexture: depth, colorSpace: THREE.SRGBColorSpace,
    });
    this.post.uniforms.tColor.value = this.rt.texture;
    this.post.uniforms.tDepth.value = depth;
    this.post.uniforms.uRes.value.set(lw, lh);
    psxUniforms.uSnapRes.value.set(settings.jitter ? lw * 0.5 : 0, settings.jitter ? lh * 0.5 : 0);
    psxUniforms.uAffine.value = settings.affine ? 0.55 : 0;
    if (this.onResize) this.onResize(lw, lh, w, h);
  }

  applySettings() {
    const u = this.post.uniforms;
    u.uDither.value = settings.dither ? 1 : 0;
    u.uOutline.value = settings.outline ? 1 : 0;
    u.uScan.value = settings.scanlines ? 1 : 0;
    this.resize();
  }

  render(scene, camera, time) {
    const u = this.post.uniforms;
    u.uNear.value = camera.near; u.uFar.value = camera.far; u.uTime.value = time;
    u.uGrade.value = 0.36 * settings.grade;
    this.renderer.setRenderTarget(this.rt);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.postScene, this.postCam);
  }
}

// [shadow, mid, light, highlight, ink] per biome. These ramps are the core of the
// art direction: each depth of the dungeon gets its own woodcut-print palette.
export const PALETTES = {
  title: ['#0b0a12', '#3a2f3d', '#b49a7c', '#f3e3c3', '#060508'],
  crypt: ['#0a0b12', '#3d4b57', '#b3b5a6', '#f4ecd6', '#04050a'],
  ossuary: ['#110906', '#5a3626', '#c49c72', '#f8e4bc', '#080303'],
  abyss: ['#0d0815', '#4a2a55', '#c87a48', '#ffdd94', '#050208'],
  shrine: ['#0a0805', '#3d2e1c', '#c79a5b', '#fff0c8', '#060402'],
};
