// Asset access. In the packed build every file lives in window.__AO_PACK as a
// data: URI (so the game runs from file://). Without a pack we fall back to
// plain relative URLs (useful when serving the repo root with any web server).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const PACK = () => window.__AO_PACK || {};

export function url(path) {
  return PACK()[path] || ('../' + path);
}

function normalize(p) {
  const parts = [];
  for (const s of p.split('/')) {
    if (s === '..') parts.pop(); else if (s !== '.' && s !== '') parts.push(s);
  }
  return parts.join('/');
}

const manager = new THREE.LoadingManager();
manager.setURLModifier((u) => {
  if (u.startsWith('data:') || u.startsWith('blob:')) return u;
  const key = normalize(decodeURI(u).replace(/^\.\.\//, ''));
  return PACK()[key] || u;
});

const gltfLoader = new GLTFLoader(manager);
gltfLoader.setMeshoptDecoder(MeshoptDecoder); // the pixel-art prop atlas is meshopt-compressed
const texLoader = new THREE.TextureLoader(manager);

function dataURIToArrayBuffer(uri) {
  const b64 = uri.slice(uri.indexOf(',') + 1);
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

const gltfCache = new Map();
export function loadGLTF(path) {
  if (gltfCache.has(path)) return gltfCache.get(path);
  const base = path.slice(0, path.lastIndexOf('/') + 1);
  const p = new Promise((resolve, reject) => {
    const packed = PACK()[path];
    if (packed) {
      const data = path.endsWith('.glb') ? dataURIToArrayBuffer(packed) : atob(packed.slice(packed.indexOf(',') + 1));
      gltfLoader.parse(data, base, resolve, (e) => reject(new Error(path + ': ' + e)));
    } else {
      gltfLoader.load('../' + path, resolve, undefined, (e) => reject(new Error(path + ': ' + e)));
    }
  });
  gltfCache.set(path, p);
  return p;
}

const texCache = new Map();
export function loadTexture(path, { pixel = true, srgb = true } = {}) {
  const k = path + pixel + srgb;
  if (texCache.has(k)) return texCache.get(k);
  const p = new Promise((resolve, reject) => {
    texLoader.load(url(path), (t) => {
      if (pixel) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; }
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      resolve(t);
    }, undefined, reject);
  });
  texCache.set(k, p);
  return p;
}

export function loadImage(path) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url(path);
  });
}

export async function loadFonts() {
  const fonts = [
    ['Fell SC', 'fonts/fell-sc.woff2', {}],
    ['Fell', 'fonts/fell.woff2', {}],
    ['Fell', 'fonts/fell-italic.woff2', { style: 'italic' }],
    ['VT323', 'fonts/vt323.woff2', {}],
    // subsets of Noto Serif SC / JP containing only the glyphs our translations use
    ['Ashen SC', 'assets/fonts/ashen-sc.woff2', {}],
    ['Ashen JP', 'assets/fonts/ashen-jp.woff2', {}],
  ];
  await Promise.all(fonts.map(async ([fam, p, desc]) => {
    try {
      const f = new FontFace(fam, `url(${url(p)})`, desc);
      await f.load();
      document.fonts.add(f);
    } catch (e) { console.warn('font', p, e); }
  }));
}

export function cloneSkinned(scene) { return SkeletonUtils.clone(scene); }
