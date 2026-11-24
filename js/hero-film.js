/* Hero, scroll film. An original WebGL scene: pattern pieces of one jacket fly in, line up as a tech pack,
   separate into shell, insulation and lining, close into a sample, then hover over a production floor.
   Scroll position is the timeline. Styles in css/hero-film.css, three.js self hosted in public/vendor/three. */
import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { RGBShiftShader } from 'three/addons/shaders/RGBShiftShader.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = t => t * t * (3 - 2 * t);
const BG = 0xa3a8b4;

const ACTS = [
  { name: 'Design', title: '', text: '' },
  { name: 'Tech pack', title: 'Tech pack', text: 'Every measurement, callout and construction note in one versioned spec.' },
  { name: 'Materials', title: 'Materials', text: 'Shell, insulation and lining costed next to the spec, layer by layer.' },
  { name: 'Sample', title: 'Sample', text: 'Fit comments sit on the garment, each with an owner and a decision.' },
  { name: 'Production', title: 'Production', text: 'Every order tracked from fabric to stitching to QA, with delays visible early.' },
  { name: 'Dispatch', title: 'Dispatch', text: 'Quality results and shipment status close the loop on the same record.' },
];

function main() {
  const track = $('#hfTrack'), pin = $('#hfPin'), host = $('#hfCanvas'), root = $('.hf');
  if (!track || !host) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const small = () => innerWidth < 900;

  // no WebGL: leave the text hero in place
  let gl = false;
  try { const c = document.createElement('canvas'); gl = !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { /* none */ }
  if (!gl) { root.classList.add('no-gl'); return; }
  if (reduced) root.classList.add('is-static');

  /* ───── renderer, scene, camera ───── */
  const renderer = new THREE.WebGLRenderer({ antialias: !small(), alpha: false, powerPreference: 'high-performance' });
  renderer.setClearColor(BG, 1);
  host.append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  scene.fog = new THREE.Fog(BG, 16, 48);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 140);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x8e94a3, 2.7));
  const key = new THREE.DirectionalLight(0xffffff, 3.2); key.position.set(-6, 10, 7); scene.add(key);
  const rim = new THREE.DirectionalLight(0xdfe8ff, 1.6); rim.position.set(8, 3, -6); scene.add(rim);

  /* ───── the jacket, cut from the same pattern pieces as the tech pack flat ───── */
  const S = 0.012;
  const PATHS = {
    body: 'M200 66V396H113C106 330 107 236 113 160 104 132 97 102 96 74L162 46C172 56 188 64 200 66Z',
    sleeve: 'M96 74C74 98 52 206 33 338L88 350C93 284 101 212 113 160Z',
    hood: 'M162 46 146 40C140 44 134 50 132 58l40 60 28 12V66C188 64 172 56 162 46Z',
    pocket: 'm124 296 44-8 2 34-43 8z',
  };
  const Z_OF = { body: 0, sleeve: 0, hood: 1.8, pocket: 3.4 };
  const svgLoader = new SVGLoader();
  const geos = {};
  for (const [k, d] of Object.entries(PATHS)) {
    const data = svgLoader.parse('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 440"><path d="' + d + '"/></svg>');
    const g = new THREE.ExtrudeGeometry(SVGLoader.createShapes(data.paths[0]), { depth: 3, bevelEnabled: true, bevelThickness: 0.8, bevelSize: 0.9, bevelSegments: 2, curveSegments: 14 });
    g.translate(-200, -220, -1.5);
    geos[k] = { mesh: g, edges: new THREE.EdgesGeometry(g, 28) };
  }

  // a light ripple so the cloth never looks rigid; the same offset runs through fill and outline
  const wave = { uTime: { value: 0 }, uWave: { value: 0 } };
  const patch = mat => {
    mat.onBeforeCompile = sh => {
      sh.uniforms.uTime = wave.uTime; sh.uniforms.uWave = wave.uWave;
      sh.vertexShader = 'uniform float uTime;\nuniform float uWave;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\n transformed.z += uWave * (sin(transformed.x * 0.045 + uTime * 0.9) + sin(transformed.y * 0.036 + uTime * 0.7)) * 3.2;');
    };
    return mat;
  };
  const LAYERS = [
    { color: 0xeceef3, rough: 0.9 },   // shell
    { color: 0xd3d7e0, rough: 1.0 },   // insulation
    { color: 0xb7c4d8, rough: 0.9 },   // lining
  ];
  const meshMats = LAYERS.map(l => patch(new THREE.MeshStandardMaterial({ color: l.color, roughness: l.rough, metalness: 0, side: THREE.DoubleSide, transparent: true, opacity: 0 })));
  const edgeMats = LAYERS.map(() => patch(new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 })));

  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const garment = new THREE.Group();
  scene.add(garment);
  const ID = new THREE.Quaternion();
  const pieces = [];
  LAYERS.forEach((_, li) => {
    for (const kind of ['body', 'sleeve', 'hood', 'pocket']) {
      if (kind === 'pocket' && li !== 0) continue;
      for (const side of [1, -1]) {
        const inner = new THREE.Group();
        inner.scale.set(side * S, -S, S);
        inner.add(new THREE.Mesh(geos[kind].mesh, meshMats[li]), new THREE.LineSegments(geos[kind].edges, edgeMats[li]));
        const piece = new THREE.Group();
        piece.add(inner);
        garment.add(piece);
        const a = rnd() * Math.PI * 2, r = 2.4 + rnd() * 5;
        pieces.push({
          g: piece, li, zk: Z_OF[kind] * S,
          sp: new THREE.Vector3(Math.cos(a) * r, -3 + rnd() * 8, -6 + rnd() * 8),
          sq: new THREE.Quaternion().setFromEuler(new THREE.Euler((rnd() - 0.5) * 3, (rnd() - 0.5) * 3, (rnd() - 0.5) * 3)),
          ph: rnd() * 6.28,
        });
      }
    }
  });

  // tech pack callouts A to E, drawn in the garment's own space
  const W = (x, y, z = 0.3) => new THREE.Vector3((x - 200) * S, -(y - 220) * S, z);
  const dimsPts = [
    [113, 208, 287, 208], [113, 200, 113, 216], [287, 200, 287, 216],
    [384, 46, 384, 396], [378, 46, 390, 46], [378, 396, 390, 396],
    [96, 24, 304, 24], [96, 18, 96, 30], [304, 18, 304, 30],
    [82, 70, 20, 334],
    [113, 414, 287, 414], [113, 408, 113, 420], [287, 408, 287, 420],
  ];
  const dimGeo = new THREE.BufferGeometry().setFromPoints(dimsPts.flatMap(([a, b, c, d]) => [W(a, b), W(c, d)]));
  const dimMat = new THREE.LineBasicMaterial({ color: 0x347bbb, transparent: true, opacity: 0 });
  const dimLines = new THREE.LineSegments(dimGeo, dimMat);
  garment.add(dimLines);
  const dimAnchors = [W(200, 208), W(384, 221), W(200, 24), W(51, 202), W(200, 414)];
  const bomAnchors = [110, 200, 290].map((y, i) => ({ i, x: 332, y }));

  /* ───── scattered wires and drifting dust ───── */
  const lite = small();
  const wirePts = [];
  const nWires = lite ? 90 : 170;
  for (let i = 0; i < nWires; i++) {
    const a = new THREE.Vector3((rnd() - 0.5) * 34, (rnd() - 0.5) * 18, (rnd() - 0.5) * 26);
    const d = new THREE.Vector3(rnd() - 0.5, (rnd() - 0.5) * 0.4, rnd() - 0.5).normalize().multiplyScalar(1.4 + rnd() * 3.2);
    wirePts.push(a, a.clone().add(d));
  }
  const wireMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 });
  const wires = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(wirePts), wireMat);
  const nodeMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.09, transparent: true, opacity: 0.8, sizeAttenuation: true });
  const nodes = new THREE.Points(new THREE.BufferGeometry().setFromPoints(wirePts.filter((_, i) => i % 2 === 0)), nodeMat);
  const net = new THREE.Group(); net.add(wires, nodes); scene.add(net);

  const nDust = lite ? 220 : 520;
  const dustPos = new Float32Array(nDust * 3);
  for (let i = 0; i < nDust; i++) { dustPos[i * 3] = (rnd() - 0.5) * 40; dustPos[i * 3 + 1] = (rnd() - 0.5) * 20; dustPos[i * 3 + 2] = (rnd() - 0.5) * 30; }
  const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.06, transparent: true, opacity: 0.6, sizeAttenuation: true, depthWrite: false }));
  scene.add(dust);

  /* ───── production floor: rolling ground, rows of workstations, status lights ───── */
  const FLOOR_Y = -3.7;
  const tg = new THREE.PlaneGeometry(96, 96, lite ? 70 : 130, lite ? 70 : 130);
  tg.rotateX(-Math.PI / 2);
  const tp = tg.attributes.position;
  for (let i = 0; i < tp.count; i++) {
    const x = tp.getX(i), z = tp.getZ(i), r = Math.hypot(x, z);
    const m = smooth(clamp((r - 12) / 14, 0, 1));
    tp.setY(i, m * (1.8 * Math.sin(x * 0.11) * Math.cos(z * 0.09) + 1.0 * Math.sin(x * 0.29 + z * 0.17) + 0.45 * Math.sin(z * 0.53 + x * 0.21)));
  }
  tg.computeVertexNormals();
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x9ea4b1, roughness: 1, flatShading: true, transparent: true, opacity: 0 });
  const floor = new THREE.Mesh(tg, floorMat); floor.position.y = FLOOR_Y; scene.add(floor);
  const gridMat = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0 });
  const grid = new THREE.Mesh(tg, gridMat); grid.position.y = FLOOR_Y + 0.01; scene.add(grid);

  const stationMat = new THREE.MeshStandardMaterial({ color: 0xe6e9ef, roughness: 0.95, transparent: true, opacity: 0 });
  const rows = [-3.2, -0.4, 2.4], perRow = 14, stations = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.5, 0.9), stationMat, rows.length * perRow);
  const lights = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.12, 0.05, 14), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }), 9);
  const dm = new THREE.Object3D(); let si = 0, li2 = 0;
  const statusCols = [0x347bbb, 0x347bbb, 0x347bbb, 0xfdd14a, 0x347bbb, 0xdd2e1d, 0x347bbb, 0xfdd14a, 0x347bbb];
  rows.forEach((z, ri) => {
    for (let k = 0; k < perRow; k++) {
      const x = (k - (perRow - 1) / 2) * 1.35, h = 0.8 + rnd() * 0.5;
      dm.position.set(x, FLOOR_Y + 0.25 * h, z); dm.scale.set(1, h, 1); dm.updateMatrix(); stations.setMatrixAt(si++, dm.matrix);
      if (li2 < 9 && (k * 3 + ri) % 5 === 0) {
        dm.position.set(x, FLOOR_Y + 0.5 * h + 0.03, z); dm.scale.set(1, 1, 1); dm.updateMatrix();
        lights.setMatrixAt(li2, dm.matrix); lights.setColorAt(li2, new THREE.Color(statusCols[li2])); li2++;
      }
    }
  });
  lights.count = li2;
  const floorGroup = new THREE.Group(); floorGroup.add(stations, lights); scene.add(floorGroup);

  /* ───── timeline: one value per act, blended with a smooth step ───── */
  const lerp = (a, b, t) => a + (b - a) * t;
  const seg = p => { const s = clamp(p, 0, 1) * 5, i = Math.min(4, Math.floor(s)); return [i, smooth(s - i)]; };
  const K = (arr, p) => { const [i, f] = seg(p); return lerp(arr[i], arr[i + 1], f); };
  const KV = (arr, p, out) => { const [i, f] = seg(p); return out.copy(arr[i]).lerp(arr[i + 1], f); };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const T = {
    scatter: [1, 0, 0, 0, 0, 0],
    sep: [0.14, 0.14, 1.9, 0.075, 0.075, 0.075],
    fill: [0.04, 0.3, 1, 1, 1, 1],
    ripple: [0.4, 0, 0.35, 1, 1, 0.8],
    net: [1, 0.75, 0.2, 0, 0, 0],
    floor: [0, 0, 0, 0.2, 1, 1],
    dims: [0, 1, 0, 0, 0, 0],
    bom: [0, 0, 1, 0, 0, 0],
    gScale: [1, 1, 1, 1, 0.8, 0.5],
    gPos: [V(0, 0.2, 0), V(0, 0, 0), V(0, 0, 0), V(0, 0, 0), V(0, 0.9, 0), V(0, 1.6, 0)],
    gRot: [V(0.3, -0.6, 0), V(0, 0, 0), V(0.1, -0.5, 0), V(0.04, 0.38, 0), V(-0.03, 0.3, 0), V(-0.05, -0.35, 0)],
    cam: [V(0, 7.5, 17), V(0, 0.2, 13.2), V(5.4, 1.4, 13), V(-4.2, 0.8, 12.2), V(0, -1.4, 10.5), V(0, 4.2, 22)],
    tar: [V(0, 0, 0), V(0, -0.1, 0), V(0, 0, 0), V(0, 0, 0), V(0, 0.4, 0), V(0, -0.3, 0)],
  };
  const tmpA = V(0, 0, 0), tmpB = V(0, 0, 0), tmpC = V(0, 0, 0);

  /* ───── labels that follow 3D points ───── */
  const dimEls = $$('.hf-dim'), bomEls = $$('.hf-bom');
  const proj = (v, el, w, h, show) => {
    el.style.opacity = show;
    if (show < 0.02) { el.style.visibility = 'hidden'; return; }
    el.style.visibility = 'visible';
    v.project(camera);
    // keep the whole label inside the screen, including the offset a bom label carries
    const mw = el.offsetWidth, ml = parseFloat(getComputedStyle(el).marginLeft) || 0;
    const x = clamp((v.x * 0.5 + 0.5) * w, mw / 2 + 12 - ml, w - mw / 2 - 12 - ml);
    el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + ((-v.y * 0.5 + 0.5) * h).toFixed(1) + 'px) translate(-50%,-50%)';
  };

  /* ───── post: a faint colour split that follows scroll speed (desktop only) ───── */
  let composer = null, rgb = null;
  const size = () => {
    const w = host.clientWidth || innerWidth, h = host.clientHeight || innerHeight;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, small() ? 1.5 : 2));
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%';
    camera.aspect = w / h; camera.updateProjectionMatrix();
    if (composer) composer.setSize(w, h);
    return [w, h];
  };
  if (!small() && !reduced) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    rgb = new ShaderPass(RGBShiftShader); rgb.uniforms.amount.value = 0;
    composer.addPass(rgb);
    composer.addPass(new OutputPass());
  }
  let [W_, H_] = size();
  new ResizeObserver(() => { [W_, H_] = size(); }).observe(host);

  /* ───── interface ───── */
  const introEl = $('#hfIntro'), actEl = $('#hfAct'), titleEl = $('#hfTitle'), textEl = $('#hfText');
  const countEl = $('#hfCount'), stageEl = $('#hfStage'), ticks = $$('.hf-ticks button'), cue = $('.hf-cue');
  let shown = -1;
  const showAct = i => {
    if (i === shown) return; shown = i;
    countEl.textContent = '0' + (i + 1) + ' / 06'; stageEl.textContent = ACTS[i].name;
    ticks.forEach((t, k) => { if (k === i) t.setAttribute('aria-current', 'step'); else t.removeAttribute('aria-current'); t.classList.toggle('done', k < i); });
    if (i > 0) { actEl.classList.remove('swap'); void actEl.offsetWidth; titleEl.textContent = ACTS[i].title; textEl.textContent = ACTS[i].text; actEl.classList.add('swap'); }
  };
  const range = () => track.offsetHeight - pin.offsetHeight;
  ticks.forEach((t, i) => t.addEventListener('click', () => {
    if (root.classList.contains('is-static')) return;
    scrollTo({ top: scrollY + track.getBoundingClientRect().top + (i / 5) * range(), behavior: reduced ? 'auto' : 'smooth' });
  }));

  /* ───── frame ───── */
  const progress = () => reduced ? 0.6 : clamp(-track.getBoundingClientRect().top / Math.max(1, range()), 0, 1);
  let cur = progress(), last = performance.now(), raf = 0, running = false, first = true, vel = 0;
  const E = new THREE.Euler();
  const apply = (p, t) => {
    const sc = smooth(K(T.scatter, p)), sep = K(T.sep, p), fill = K(T.fill, p);
    wave.uTime.value = t; wave.uWave.value = K(T.ripple, p);
    meshMats.forEach((m, i) => { m.opacity = fill; m.transparent = fill < 0.985; m.depthWrite = fill > 0.5; m.visible = fill > 0.01; });
    edgeMats.forEach(m => { m.opacity = lerp(0.95, 0.7, clamp(fill, 0, 1)); });
    for (const q of pieces) {
      const z = (1 - q.li) * sep + q.zk;
      q.g.position.set(q.sp.x * sc, q.sp.y * sc + Math.sin(t * 0.6 + q.ph) * 0.18 * sc, lerp(z, q.sp.z, sc));
      q.g.quaternion.slerpQuaternions(ID, q.sq, sc);
    }
    garment.position.copy(KV(T.gPos, p, tmpA));
    const r = KV(T.gRot, p, tmpB); E.set(r.x, r.y + (reduced ? 0 : Math.sin(t * 0.25) * 0.09 * (1 - sc)), r.z); garment.rotation.copy(E);
    garment.scale.setScalar(K(T.gScale, p));
    dimMat.opacity = K(T.dims, p);

    const fit = camera.aspect < 1 ? Math.min(2.1, 0.8 / camera.aspect) : 1;
    KV(T.tar, p, tmpC); KV(T.cam, p, tmpA);
    camera.position.copy(tmpC).add(tmpA.sub(tmpC).multiplyScalar(fit));
    camera.lookAt(tmpC);
    if (camera.aspect < 1) camera.position.y += 0.9;

    const n = K(T.net, p); net.visible = n > 0.01; wireMat.opacity = 0.55 * n; nodeMat.opacity = 0.8 * n; net.rotation.y = t * 0.012;
    dust.position.y = (t * 0.08) % 2 - 1;
    const f = K(T.floor, p); floor.visible = grid.visible = floorGroup.visible = f > 0.01;
    floorMat.opacity = f; gridMat.opacity = 0.12 * f; stationMat.opacity = f; lights.material.opacity = f;

    garment.updateMatrixWorld(true); camera.updateMatrixWorld(true);
    const dv = K(T.dims, p), bv = K(T.bom, p);
    dimEls.forEach((el, i) => proj(dimAnchors[i].clone().applyMatrix4(garment.matrixWorld), el, W_, H_, dv));
    bomEls.forEach((el, i) => { const a = bomAnchors[i]; proj(W(a.x, a.y, (1 - i) * sep + 0.1).applyMatrix4(garment.matrixWorld), el, W_, H_, bv); });

    // interface
    const intro = 1 - smooth(clamp(p / 0.09, 0, 1));
    introEl.style.opacity = intro.toFixed(3);
    introEl.style.transform = 'translateY(' + ((1 - intro) * -24).toFixed(1) + 'px)';
    introEl.classList.toggle('is-off', intro < 0.4);
    if (cue) cue.style.opacity = intro.toFixed(3);
    showAct(Math.round(clamp(p, 0, 1) * 5));
    actEl.classList.toggle('is-on', p > 0.09);
  };
  const frame = now => {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.2, (now - last) / 1000); last = now;
    const target = progress(), prev = cur;
    cur += (target - cur) * (reduced ? 1 : 1 - Math.exp(-dt * 4.5));
    vel += (Math.abs(cur - prev) / Math.max(dt, 0.001) - vel) * 0.1;
    apply(cur, now / 1000);
    if (rgb) rgb.uniforms.amount.value = clamp(vel * 0.0022, 0, 0.0045);
    if (composer) composer.render(); else renderer.render(scene, camera);
    if (first) { first = false; setTimeout(() => root.classList.add('is-ready'), 700); }
  };
  const start = () => { if (running) return; running = true; last = performance.now(); raf = requestAnimationFrame(frame); };
  const stop = () => { running = false; cancelAnimationFrame(raf); };
  if (reduced) { running = true; frame(performance.now()); running = false; }
  else {
    new IntersectionObserver(([e]) => { if (e.isIntersecting && !document.hidden) start(); else stop(); }, { rootMargin: '80px' }).observe(track);
    document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else if (track.getBoundingClientRect().bottom > 0 && track.getBoundingClientRect().top < innerHeight) start(); });
  }
  root.classList.add('is-live');

  // ascii loader, in the spirit of a terminal boot line
  const ld = $('#hfLoader span');
  if (ld) { const ch = '-=+'; const id = setInterval(() => { ld.textContent = Array.from({ length: 10 }, () => ch[(Math.random() * 3) | 0]).join(''); if (root.classList.contains('is-ready')) clearInterval(id); }, 90); }
}

main();
