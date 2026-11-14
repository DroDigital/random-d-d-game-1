// Room atmosphere: drifting motes (dust / spores / embers), light shafts from
// cracks in the ceiling, a low layer of ground haze, torch halos and floor
// grime. Everything here is cheap (one Points draw, a handful of quads) and is
// rebuilt per room from the depth's `look`.
import * as THREE from 'three';
import { frand } from '../core/rules.js';

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const MOTES = {
  dust: { count: 200, size: 2.8, rise: -0.05, sway: 0.5, speed: 0.25, twinkle: 0.4, alpha: 0.5 },
  spores: { count: 170, size: 3.2, rise: 0.25, sway: 0.9, speed: 0.35, twinkle: 1.0, alpha: 0.75 },
  embers: { count: 220, size: 2.8, rise: 0.9, sway: 0.7, speed: 0.6, twinkle: 1.6, alpha: 0.9 },
};

export class Atmos {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.halos = [];
    this.shafts = [];
    this.time = 0;
    this.shaftTex = canvasTex(64, 256, (g, w, h) => {
      const v = g.createLinearGradient(0, 0, 0, h);
      v.addColorStop(0, 'rgba(255,255,255,0.0)'); v.addColorStop(0.15, 'rgba(255,255,255,0.75)');
      v.addColorStop(0.75, 'rgba(255,255,255,0.35)'); v.addColorStop(1, 'rgba(255,255,255,0.0)');
      g.fillStyle = v; g.fillRect(0, 0, w, h);
      // soft horizontal falloff
      const im = g.getImageData(0, 0, w, h);
      for (let x = 0; x < w; x++) {
        const k = Math.pow(Math.sin(Math.PI * x / (w - 1)), 1.6);
        for (let y = 0; y < h; y++) im.data[(y * w + x) * 4 + 3] *= k;
      }
      g.putImageData(im, 0, 0);
    });
    this.hazeTex = canvasTex(128, 128, (g, w, h) => {
      // tileable blotchy noise from overlapping soft blobs
      g.fillStyle = 'rgba(0,0,0,0)'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 70; i++) {
        const x = Math.random() * w, y = Math.random() * h, r = 10 + Math.random() * 30;
        for (const [ox, oy] of [[0, 0], [w, 0], [-w, 0], [0, h], [0, -h], [w, h], [-w, -h], [w, -h], [-w, h]]) {
          const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
          gr.addColorStop(0, 'rgba(255,255,255,0.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = gr; g.beginPath(); g.arc(x + ox, y + oy, r, 0, Math.PI * 2); g.fill();
        }
      }
    });
    this.hazeTex.wrapS = this.hazeTex.wrapT = THREE.RepeatWrapping;
    this.hazeTex2 = this.hazeTex.clone();
    this.hazeTex2.wrapS = this.hazeTex2.wrapT = THREE.RepeatWrapping;
  }

  clear() {
    for (const o of [...this.group.children]) {
      this.group.remove(o);
      o.traverse((c) => { if (c.geometry) c.geometry.dispose(); if (c.material && c.material.dispose) c.material.dispose(); });
    }
    this.halos = []; this.shafts = []; this.haze = null; this.motes = null; this.look = null;
  }

  build(room, depth, { calm = false } = {}) {
    this.clear();
    const L = depth.look || {};
    this.look = L;
    const W = room.w * 4, H = room.h * 4;
    this.bounds = { w: W, h: H };
    this.buildMotes(L, W, H);
    this.buildShafts(room, L, calm);
    this.buildHaze(L, W, H);
    this.buildGrime(room, L);
  }

  buildMotes(L, W, H) {
    const kind = MOTES[L.motes || 'dust'];
    const n = kind.count;
    const pos = new Float32Array(n * 3), seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = frand(-W / 2 - 2, W / 2 + 2); pos[i * 3 + 1] = frand(0.2, 9); pos[i * 3 + 2] = frand(-H / 2 - 2, H / 2 + 4);
      seed[i] = Math.random() * 100;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 200);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(L.moteColor ?? 0xd8c0a0) }, uSize: { value: kind.size }, uRise: { value: kind.rise },
        uSway: { value: kind.sway }, uSpeed: { value: kind.speed }, uTw: { value: kind.twinkle }, uAlpha: { value: kind.alpha }, uScale: { value: 1 } },
      vertexShader: `attribute float aSeed; uniform float uTime; uniform float uSize; uniform float uRise; uniform float uSway; uniform float uSpeed; uniform float uTw; uniform float uScale;
        varying float vA;
        void main(){
          vec3 p = position;
          float t = uTime * uSpeed + aSeed;
          p.x += sin(t * 0.7 + aSeed) * uSway;
          p.z += cos(t * 0.5 + aSeed * 1.3) * uSway;
          p.y = mod(p.y + uTime * uRise + 9.0, 9.0) + 0.2;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float fadeEdge = smoothstep(0.2, 1.2, p.y) * smoothstep(9.2, 7.5, p.y);
          vA = fadeEdge * (0.55 + 0.45 * sin(uTime * uTw * 2.0 + aSeed * 7.0));
          gl_PointSize = uSize * uScale * (0.6 + 0.4 * fract(aSeed * 3.7)) * (30.0 / -mv.z);
        }`,
      fragmentShader: `uniform vec3 uColor; uniform float uAlpha; varying float vA;
        void main(){
          vec2 d = gl_PointCoord - 0.5;
          float r = dot(d, d);
          if (r > 0.25) discard;
          gl_FragColor = vec4(uColor * vA * uAlpha * (1.0 - r * 3.0), 1.0);
        }`,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.group.add(pts);
    this.motes = pts;
  }

  buildShafts(room, L, calm) {
    const cells = room.floorCells();
    const n = calm ? 2 : Math.min(4, 1 + Math.floor(cells.length / 30));
    for (let k = 0; k < n && cells.length; k++) {
      const c = cells.splice(Math.floor(Math.random() * cells.length), 1)[0];
      const p = room.toWorld(c[0], c[1]);
      const w = frand(2.2, 3.6), h = 15;
      const mat = new THREE.MeshBasicMaterial({ map: this.shaftTex, color: L.shaft ?? 0xb0c0ff, transparent: true, opacity: 0.11, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
      const g = new THREE.Group();
      // two crossed quads so the shaft reads from any camera sway
      for (const ry of [0, Math.PI / 2]) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
        m.rotation.y = ry; g.add(m);
      }
      g.position.set(p.x, h / 2 - 0.5, p.z);
      g.rotation.z = frand(-0.22, 0.22); g.rotation.x = frand(-0.15, 0.1);
      this.group.add(g);
      // a pale pool of light where it lands
      const pool = new THREE.Mesh(new THREE.CircleGeometry(w * 0.7, 20), new THREE.MeshBasicMaterial({ color: L.shaft ?? 0xb0c0ff, transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending }));
      pool.rotation.x = -Math.PI / 2; pool.position.set(p.x + Math.sin(g.rotation.z) * -h * 0.5, 0.07, p.z);
      this.group.add(pool);
      this.shafts.push({ g, mat, pool, ph: Math.random() * 10 });
    }
  }

  buildHaze(L, W, H) {
    const mat = new THREE.MeshBasicMaterial({ map: this.hazeTex, color: L.fogY ?? 0x303040, transparent: true, opacity: 0.42, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const geo = new THREE.PlaneGeometry(W + 16, H + 16);
    geo.rotateX(-Math.PI / 2);
    const a = new THREE.Mesh(geo, mat);
    a.position.y = 0.35;
    this.hazeTex.repeat.set((W + 16) / 22, (H + 16) / 22);
    const mat2 = mat.clone(); mat2.map = this.hazeTex2; this.hazeTex2.repeat.set((W + 16) / 15, (H + 16) / 15); mat2.opacity = 0.28;
    const b = new THREE.Mesh(geo.clone(), mat2);
    b.position.y = 0.9;
    a.renderOrder = 2; b.renderOrder = 2;
    this.group.add(a, b);
    this.haze = [a, b];
  }

  buildGrime(room, L) {
    const fx = this.game.fx;
    const list = (L.decals || ['dirt_02', 'scratch_01']).filter((n) => fx.tex[n] && !n.startsWith('dngn'));
    if (!list.length) return;
    const cells = room.floorCells();
    const n = Math.floor(cells.length * 0.22);
    for (let k = 0; k < n; k++) {
      const c = cells[Math.floor(Math.random() * cells.length)];
      const p = room.toWorld(c[0], c[1]);
      const tex = list[Math.floor(Math.random() * list.length)];
      const size = frand(1.6, 3.6);
      const mat = new THREE.MeshBasicMaterial({ map: fx.tex[tex], color: 0x000000, transparent: true, opacity: frand(0.25, 0.5), depthWrite: false });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
      m.rotation.x = -Math.PI / 2; m.rotation.z = Math.random() * 6.28;
      m.position.set(p.x + frand(-1.4, 1.4), 0.055 + k * 0.0004, p.z + frand(-1.4, 1.4));
      this.group.add(m);
    }
  }

  // soft glow + rising sparks around a wall torch flame
  addHalo(x, y, z, color) {
    const fx = this.game.fx;
    const mat = new THREE.SpriteMaterial({ map: fx.tex.light_02 || fx.tex.circle_05, color, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending });
    const s = new THREE.Sprite(mat);
    s.position.set(x, y, z); s.scale.set(3.4, 3.4, 1);
    this.group.add(s);
    this.halos.push({ s, x, y, z, ph: Math.random() * 10, color });
  }

  update(dt) {
    this.time += dt;
    if (this.motes) {
      this.motes.material.uniforms.uTime.value = this.time;
      this.motes.material.uniforms.uScale.value = (this.game.psx.lowH || 240) / 240;
    }
    for (const s of this.shafts) {
      const k = 0.11 + Math.sin(this.time * 0.6 + s.ph) * 0.025 + Math.sin(this.time * 1.7 + s.ph * 2) * 0.012;
      s.mat.opacity = k; s.pool.material.opacity = k * 0.6;
    }
    if (this.haze) {
      this.haze[0].material.map.offset.set(this.time * 0.012, this.time * 0.006);
      this.haze[1].material.map.offset.set(-this.time * 0.009, this.time * 0.011);
    }
    const fx = this.game.fx;
    for (const h of this.halos) {
      h.s.material.opacity = 0.3 + Math.sin(this.time * 9 + h.ph) * 0.04 + Math.random() * 0.05;
      if (Math.random() < dt * 1.6) fx.spawn('spark_06', { x: h.x + frand(-0.15, 0.15), y: h.y + 0.3, z: h.z, vy: frand(1.2, 2.4), vx: frand(-0.3, 0.3), life: frand(0.6, 1.1), size: 0.16, color: 0xffb060 });
    }
  }
}
