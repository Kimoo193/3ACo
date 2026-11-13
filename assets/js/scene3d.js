// 3A — cinematic hero: a night fly-through where power and data lines race down the avenue,
// sweep around the corner and climb the 3A tower, lighting it floor by floor. Real-time, loops.
// Loaded only after first paint on capable devices; the poster image stays as the fallback.
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const LOOP = 24;                       // seconds per cycle
const TOWER = { x0: 100, x1: 112, z0: -7, z1: 7, floors: 15, fh: 3.2 };
const TOWER_H = TOWER.floors * TOWER.fh;
const BG = 0x090c11;
// brand blue, brand cyan, white light and the swoosh grey lead; yellow (power) and red (fire) are accents
const PALETTE = [0x1a92cb, 0x1a92cb, 0x1a92cb, 0x34c6f0, 0x34c6f0, 0x34c6f0, 0xdfefff, 0xdfefff, 0xb8bcc2, 0xf5c518, 0xe5483a];

// camera keyframes: [time, position, look-at]
const KEYS = [
  [0.0, [3, 1.5, 158], [0, 3.2, 96]],
  [4.0, [1.5, 4.5, 74], [0, 2.4, 4]],
  [7.0, [9, 44, 16], [16, 0, -2]],
  [10.5, [16, 5, 2], [100, 12, 0]],
  [14.5, [10, 11, 4], [100, 22, -10]],
  [18.0, [34, 30, 6], [100, 40, -14]],
  [21.5, [70, 50, 4], [100, 51, -8]],
  [24.0, [74, 51, 3.5], [100, 51.2, -7.5]],
];

function seeded(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; }
const rnd = seeded(31);

function route(pts, radius) {
  const path = new THREE.CurvePath();
  let prev = pts[0].clone();
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    if (i < pts.length - 1) {
      const r = typeof radius === "function" ? radius(i) : radius;
      const a = prev.clone().sub(p), b = pts[i + 1].clone().sub(p);
      const ra = Math.min(r, a.length() / 2), rb = Math.min(r, b.length() / 2);
      const s = p.clone().add(a.normalize().multiplyScalar(ra));
      const e = p.clone().add(b.normalize().multiplyScalar(rb));
      if (s.distanceTo(prev) > 1e-4) path.add(new THREE.LineCurve3(prev, s));
      path.add(new THREE.QuadraticBezierCurve3(s, p.clone(), e));
      prev = e;
    } else path.add(new THREE.LineCurve3(prev, p.clone()));
  }
  return path;
}

function windowTexture(warm) {
  const c = document.createElement("canvas"); c.width = 128; c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "#000"; g.fillRect(0, 0, 128, 256);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 8; x++) {
    const r = rnd();
    g.fillStyle = r > 0.93 ? (warm && r > 0.965 ? "#e8b878" : "#8ea6d4") : r > 0.55 ? "#121823" : "#0a0e15";
    g.fillRect(x * 16 + 5, y * 8 + 3, 6, 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function signTexture(mirror) {
  // dark backlit panel with a cyan frame: the logo reads light-on-dark, so bloom outlines it instead of washing it out
  const W = 1024, H = 384;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d");
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const rr = (x, y, w, h, r) => { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); };
  const paint = (img) => {
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H);
    if (mirror) { g.translate(W, 0); g.scale(-1, 1); }
    const grd = g.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, "#101a28"); grd.addColorStop(1, "#070b12");
    g.fillStyle = grd; rr(8, 8, W - 16, H - 16, 26); g.fill();
    g.lineWidth = 6; g.strokeStyle = "#34c6f0"; rr(11, 11, W - 22, H - 22, 24); g.stroke();
    if (img) { const h = 270, w = (img.width / img.height) * h; g.drawImage(img, W / 2 - w / 2, H / 2 - h / 2, w, h); }
    else { g.fillStyle = "#34c6f0"; g.font = "900 220px Alexandria, Arial Black, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("3A", W / 2, H / 2 + 8); }
    t.needsUpdate = true;
  };
  paint(null);
  const img = new Image();
  img.onload = () => paint(img);
  img.src = new URL("../img/logo-sign.png", import.meta.url).href;
  return t;
}

const trailVert = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const trailFrag = /* glsl */`
  uniform vec3 uColor; uniform float uHead; uniform float uTail; uniform float uTime; uniform float uLen; uniform float uOff; uniform float uFade;
  varying vec2 vUv;
  void main(){
    float x = vUv.x;
    if (x > uHead) discard;
    float tail = smoothstep(uHead - uTail, uHead, x);
    float d = fract(x * uLen / 22.0 - uTime * 1.6 + uOff);
    float packet = smoothstep(0.92, 1.0, d) * 0.55;
    float a = (0.09 + packet + tail * tail * 2.2) * uFade;
    gl_FragColor = vec4(uColor * a, 1.0);
  }`;

export function mount(host, opts = {}) {
  const rtl = document.documentElement.dir === "rtl";
  const small = window.innerWidth < 760;
  const poster = host.querySelector(".cine-poster");
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  host.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance", preserveDrawingBuffer: !!opts.capture });
  renderer.setPixelRatio(opts.capture ? 1 : Math.min(window.devicePixelRatio || 1, small ? 1 : 1.25));
  renderer.setClearColor(BG, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  scene.fog = new THREE.FogExp2(BG, small ? 0.009 : 0.0072);
  const camera = new THREE.PerspectiveCamera(46, 1, 0.5, 600);

  scene.add(new THREE.HemisphereLight(0x8aa6d6, 0x05070a, 0.9));
  const moon = new THREE.DirectionalLight(0xb8ccff, 0.8); moon.position.set(-40, 80, 60); scene.add(moon);

  // ---------- ground + roads
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), new THREE.MeshStandardMaterial({ color: 0x0b0e13, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; scene.add(ground);
  const roadM = new THREE.MeshStandardMaterial({ color: 0x10141b, roughness: 0.85, metalness: 0.1 });
  const roadA = new THREE.Mesh(new THREE.PlaneGeometry(14, 260), roadM); roadA.rotation.x = -Math.PI / 2; roadA.position.set(0, 0.02, 90); scene.add(roadA);
  const roadB = new THREE.Mesh(new THREE.PlaneGeometry(116, 14), roadM); roadB.rotation.x = -Math.PI / 2; roadB.position.set(51, 0.021, 0); scene.add(roadB);
  const dashes = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.25, 3), new THREE.MeshBasicMaterial({ color: 0x2a3342 }), 80);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1);
  let di = 0;
  for (let z = 12; z < 220 && di < 60; z += 7) { q.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)); m4.compose(new THREE.Vector3(-7.4, 0.03, z), q, sc); dashes.setMatrixAt(di++, m4); }
  for (let x = 10; x < 96 && di < 80; x += 7) { q.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, Math.PI / 2)); m4.compose(new THREE.Vector3(x, 0.03, 7.4), q, sc); dashes.setMatrixAt(di++, m4); }
  dashes.count = di; scene.add(dashes);

  // ---------- city blocks
  const texCool = windowTexture(false), texWarm = windowTexture(true);
  const edgeM = new THREE.LineBasicMaterial({ color: 0x3b4d6d, transparent: true, opacity: 0.7 });
  const addBlock = (x, z, w, d, h) => {
    const tex = (rnd() > 0.5 ? texWarm : texCool).clone();
    tex.repeat.set(Math.max(1, Math.round(w / 6)), Math.max(1, Math.round(h / 12)));
    tex.needsUpdate = true;
    const mat = new THREE.MeshStandardMaterial({ color: 0x243047, roughness: 0.85, metalness: 0.15, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.55 });
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    b.position.set(x, h / 2, z); scene.add(b);
    if (!small || h > 20) { const e = new THREE.LineSegments(new THREE.EdgesGeometry(b.geometry), edgeM); e.position.copy(b.position); scene.add(e); }
  };
  const step = small ? 13 : 10;
  for (let z = 14; z < 230; z += step) {           // avenue, both sides
    for (const side of [-1, 1]) {
      const w = 8 + rnd() * 6, d = step - 2 - rnd() * 2, h = 10 + rnd() * (z < 80 ? 34 : 22);
      addBlock(side * (9.5 + w / 2), z + d / 2, w, d, h);
      if (!small && rnd() > 0.3) addBlock(side * (24 + w / 2 + rnd() * 6), z + d / 2, w, d, 14 + rnd() * 40);
    }
  }
  for (let x = 12; x < 92; x += step) {            // cross street, both sides
    for (const side of [-1, 1]) {
      const w = step - 2 - rnd() * 2, d = 8 + rnd() * 6, h = 9 + rnd() * 24;
      addBlock(x + w / 2, side * (9.5 + d / 2), w, d, h);
      if (!small && rnd() > 0.4) addBlock(x + w / 2, side * (24 + d / 2 + rnd() * 5), w, d, 16 + rnd() * 30);
    }
  }
  for (let i = 0; i < (small ? 6 : 16); i++) addBlock(122 + rnd() * 50, -50 + rnd() * 100, 10 + rnd() * 8, 10 + rnd() * 8, 20 + rnd() * 50); // skyline behind the tower
  for (const [x, z] of [[-14, -14], [-14, -30], [14, -26], [30, -24], [-30, -12]]) addBlock(x, z, 10, 10, 12 + rnd() * 20);

  // ---------- the 3A tower
  const { x0, x1, z0, z1, floors, fh } = TOWER;
  const tw = x1 - x0, td = z1 - z0, tcx = (x0 + x1) / 2;
  const slabM = new THREE.MeshStandardMaterial({ color: 0x2b3443, roughness: 0.6, metalness: 0.4 });
  const glassM = new THREE.MeshStandardMaterial({ color: 0x0d1420, roughness: 0.2, metalness: 0.7, transparent: true, opacity: 0.85 });
  const core = new THREE.Mesh(new THREE.BoxGeometry(tw - 0.6, TOWER_H, td - 0.6), glassM); core.position.set(tcx, TOWER_H / 2, 0); scene.add(core);
  const bands = [];
  for (let k = 0; k < floors; k++) {
    const y = k * fh;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(tw + 0.5, 0.35, td + 0.5), slabM); slab.position.set(tcx, y + 0.17, 0); scene.add(slab);
    const bm = new THREE.MeshBasicMaterial({ color: k % 4 === 2 ? 0xd9b47a : 0x8fb0e8, transparent: true, opacity: 0, toneMapped: false });
    const band = new THREE.Mesh(new THREE.BoxGeometry(tw - 0.4, fh - 0.9, td - 0.4), bm); band.position.set(tcx, y + fh / 2 + 0.15, 0); scene.add(band);
    bands.push({ m: bm, y: y + 0.5 });
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(tw + 0.5, 0.5, td + 0.5), slabM); roof.position.set(tcx, TOWER_H + 0.25, 0); scene.add(roof);
  const crown = new THREE.Mesh(new THREE.BoxGeometry(tw * 0.6, 3.2, td * 0.6), slabM); crown.position.set(tcx, TOWER_H + 2.1, 0); scene.add(crown);
  const mull = [];
  for (let z = z0; z <= z1 + 1e-3; z += td / 12) mull.push(x0 - 0.05, 0, z, x0 - 0.05, TOWER_H, z);
  for (let x = x0; x <= x1 + 1e-3; x += tw / 5) mull.push(x, 0, z0 - 0.05, x, TOWER_H, z0 - 0.05, x, 0, z1 + 0.05, x, TOWER_H, z1 + 0.05);
  const mg = new THREE.BufferGeometry(); mg.setAttribute("position", new THREE.Float32BufferAttribute(mull, 3));
  scene.add(new THREE.LineSegments(mg, new THREE.LineBasicMaterial({ color: 0x4a5a76, transparent: true, opacity: 0.7 })));
  const signM = new THREE.MeshBasicMaterial({ map: signTexture(rtl), color: 0xb4bcc6, transparent: true, opacity: 0, toneMapped: false });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(13, 4.875), signM);
  sign.rotation.y = -Math.PI / 2; sign.position.set(x0 - 0.2, TOWER_H + 3.2, 0); scene.add(sign);
  const mast = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.2, 9), new THREE.MeshStandardMaterial({ color: 0x1a2230, roughness: 0.6 }));
  mast.position.set(x0 + 0.1, TOWER_H + 0.6, 0); scene.add(mast);
  const plaza = new THREE.Mesh(new THREE.PlaneGeometry(10, 22), new THREE.MeshStandardMaterial({ color: 0x151a22, roughness: 0.8 }));
  plaza.rotation.x = -Math.PI / 2; plaza.position.set(x0 - 5, 0.025, 0); scene.add(plaza);

  // ---------- light trails: street -> corner -> tower facade -> up
  const trails = [];
  const N = small ? 12 : 18;
  for (let i = 0; i < N; i++) {
    const o = -5 + (10 * i) / (N - 1) + (rnd() - 0.5) * 0.4;
    const y = 0.22 + (i % 3) * 0.14;
    const zf = THREE.MathUtils.clamp(o * 1.25, -6.3, 6.3);
    const top = rnd() > 0.35 ? TOWER_H - 0.5 : 8 + rnd() * (TOWER_H - 14);
    const pts = [
      new THREE.Vector3(o, y, 175), new THREE.Vector3(o, y, o), new THREE.Vector3(93, y, o),
      new THREE.Vector3(x0 - 0.35, y, zf), new THREE.Vector3(x0 - 0.35, top, zf),
    ];
    const curve = route(pts, (k) => (k === 1 ? 11 + o * 0.9 : k === 3 ? 0.8 : 3.5));
    const len = curve.getLength();
    const mat = new THREE.ShaderMaterial({
      vertexShader: trailVert, fragmentShader: trailFrag,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: {
        uColor: { value: new THREE.Color(PALETTE[Math.floor(rnd() * PALETTE.length)]) },
        uHead: { value: 0 }, uTail: { value: 38 / len }, uTime: { value: 0 }, uLen: { value: len }, uOff: { value: rnd() }, uFade: { value: 1 },
      },
    });
    scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, Math.round(len * 1.6), 0.075, 5), mat));
    trails.push({ mat, curve, len, start: 0.5 + rnd() * 1.4 + (i % 4) * 0.12, speed: 46 + rnd() * 12 });
  }

  // ---------- camera path
  const posCurve = new THREE.CatmullRomCurve3(KEYS.map((k) => new THREE.Vector3(...k[1])), false, "centripetal");
  const lookCurve = new THREE.CatmullRomCurve3(KEYS.map((k) => new THREE.Vector3(...k[2])), false, "centripetal");
  const camAt = (t) => {
    let i = 0; while (i < KEYS.length - 2 && t > KEYS[i + 1][0]) i++;
    const f = THREE.MathUtils.clamp((t - KEYS[i][0]) / (KEYS[i + 1][0] - KEYS[i][0]), 0, 1);
    const u = (i + f) / (KEYS.length - 1);
    return [posCurve.getPoint(u), lookCurve.getPoint(u)];
  };

  // ---------- post
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), small ? 0.85 : 0.95, 0.5, 0.42));
  composer.addPass(new OutputPass());

  const fit = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.fov = w / h < 0.8 ? 64 : 46;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(fit).observe(canvas);
  fit();

  let mx = 0, my = 0;
  window.addEventListener("pointermove", (e) => { mx = e.clientX / innerWidth - 0.5; my = e.clientY / innerHeight - 0.5; }, { passive: true });

  const wipe = host.parentElement.querySelector(".cine-wipe");
  const frozen = typeof opts.freeze === "number" ? opts.freeze : null;
  let visible = true, raf = 0, t0 = performance.now(), shown = false, wiped = false, lastCycle = -1;
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible && !raf) raf = requestAnimationFrame(loop); }, { threshold: 0.01 }).observe(host);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && visible && !raf) raf = requestAnimationFrame(loop); });

  const tmp = new THREE.Vector3(), off = new THREE.Vector3();
  function frame(T, settle) {
    const t = T % LOOP;
    const cycle = Math.floor(T / LOOP);
    if (cycle !== lastCycle) { lastCycle = cycle; wiped = false; }
    let maxH = 0;
    for (const tr of trails) {
      const head = Math.max(0, ((t - tr.start) * tr.speed) / tr.len);
      tr.mat.uniforms.uHead.value = Math.min(head, 1.0 + tr.mat.uniforms.uTail.value);
      tr.mat.uniforms.uTime.value = T;
      tr.mat.uniforms.uFade.value = t > LOOP - 0.8 ? Math.max(0, (LOOP - t) / 0.8) : 1;
      if (head > 0) { tr.curve.getPointAt(Math.min(head, 1), tmp); if (tmp.x > x0 - 1) maxH = Math.max(maxH, tmp.y); }
    }
    const k = settle ? 1 : null;
    for (const b of bands) {
      const target = maxH > b.y ? 0.16 : 0;
      b.m.opacity = k ? target : b.m.opacity + (target - b.m.opacity) * (target ? 0.12 : 0.3);
    }
    const st = maxH > TOWER_H - 1 ? 1 : 0;
    signM.opacity = k ? st : signM.opacity + (st - signM.opacity) * 0.06;
    const [p, l] = camAt(t);
    if (camera.aspect < 0.8) {                      // portrait: centre the tower and drop it below the copy
      const f = THREE.MathUtils.smoothstep(t, 10, 14);
      const near = THREE.MathUtils.smoothstep(t, 17, 21.5);   // close-up on the sign: smaller drop so it stays in frame
      l.z *= 1 - 0.9 * f; l.y += 26 * f * (1 + 0.06 * near);
      p.x -= 30 * near; p.z *= 1 - 0.9 * near;     // stay further back so the sign sits under the copy, centred
    }
    camera.position.copy(p).add(off.set(mx * 2.5, -my * 1.5, 0));
    camera.lookAt(l);
    if (!wiped && t > LOOP - 0.55 && wipe && frozen === null) { wiped = true; wipe.classList.remove("go"); void wipe.offsetWidth; wipe.classList.add("go"); }
    composer.render();
  }

  function loop(now) {
    raf = 0;
    if (!visible || document.hidden) return;
    frame(frozen !== null ? frozen : (now - t0) / 1000, frozen !== null);
    if (!shown) { shown = true; host.classList.add("is-3d"); if (poster) poster.setAttribute("aria-hidden", "true"); }
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);
  return { frame };
}
