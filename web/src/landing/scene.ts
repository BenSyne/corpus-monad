import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

/**
 * The particle field behind the landing page. A single cloud of points is
 * reshaped into six formations, one per section of the story, and the scroll
 * position drives a continuous morph between them:
 *
 *   0 chaos        data everywhere, no market
 *   1 corpus       the same points snap into an ordered lattice
 *   2 shield       a core holds while attackers are flung out in red
 *   3 proof        a flat ledger grid — verified, not asserted
 *   4 corpora      the field splits into parallel columns (why Monad)
 *   5 warp         everything streams toward the camera, into the live app
 *
 * Positions and colours for all six formations are computed once; every frame
 * interpolates between the two the scroll is currently between. Everything is
 * bundled locally, so it runs with the network off.
 */

const PURPLE = new THREE.Color("#836ef9");
const PURPLE_DEEP = new THREE.Color("#5b4bc4");
const TEAL = new THREE.Color("#3ddc97");
const BLUE = new THREE.Color("#4aa8ff");
const PINK = new THREE.Color("#ff5c7c");
const AMBER = new THREE.Color("#ffb454");
const DIM = new THREE.Color("#2a2540");
const WHITE = new THREE.Color("#ffffff");

const STAGES = 6;

const VERT = /* glsl */ `
  attribute float aScale;
  attribute vec3 aColor;
  varying vec3 vColor;
  uniform float uSize;
  uniform float uPixel;
  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uSize * aScale * uPixel * (300.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vColor, a * a);
  }
`;

type Cam = { pos: [number, number, number]; look: [number, number, number] };

const CAMERAS: Cam[] = [
  { pos: [0, 0, 34], look: [0, 0, 0] }, // scattered data
  { pos: [1, 5, 24], look: [0, 0, 0] }, // the loop (torus, tilted so it reads as a ring)
  { pos: [0, 0, 31], look: [0, 0, 0] }, // corpus cube + shield
  { pos: [1, 3, 34], look: [0, 0, 0] }, // the chain
  { pos: [2, 1, 39], look: [0, 0, 0] }, // parallel chains
  { pos: [0, 0, 29], look: [0, 0, 0] }, // agent network
];

function smoother(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export class ParticleScene {
  private renderer: THREE.WebGLRenderer;
  private composer!: EffectComposer;
  private bloom!: UnrealBloomPass;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private points!: THREE.Points;
  private group = new THREE.Group();
  private forms: Float32Array[] = [];
  private colors: Float32Array[] = [];
  private scales: Float32Array;
  private seeds: Float32Array;
  private posAttr!: THREE.BufferAttribute;
  private colAttr!: THREE.BufferAttribute;
  private count: number;
  private progress = 0;
  private rendered = 0;
  private mouse = new THREE.Vector2(0, 0);
  private clock = new THREE.Clock();
  private raf = 0;
  private camPos = new THREE.Vector3(0, 0, 30);
  private camLook = new THREE.Vector3(0, 0, 0);

  constructor(private canvas: HTMLCanvasElement) {
    const mobile = window.innerWidth < 760;
    this.count = mobile ? 1800 : 4200;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    // Opaque dark background so the bloom pass has clean blacks to glow against.
    this.scene.background = new THREE.Color(0x07060d);

    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
    this.camera.position.copy(this.camPos);

    this.scales = new Float32Array(this.count);
    this.seeds = new Float32Array(this.count);
    for (let i = 0; i < this.count; i++) {
      this.scales[i] = 0.7 + Math.pow(this.hash(i * 2.7), 2) * 3.2;
      this.seeds[i] = this.hash(i * 9.13) * Math.PI * 2;
    }

    this.buildFormations();
    this.buildPoints();
    this.addAtmosphere();
    this.buildComposer();

    window.addEventListener("resize", this.onResize);
    window.addEventListener("pointermove", this.onPointerMove, { passive: true });
    this.loop();
  }

  setProgress(p: number) {
    this.progress = Math.max(0, Math.min(1, p));
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("pointermove", this.onPointerMove);
    this.renderer.dispose();
  }

  // ---- deterministic pseudo-random so the field looks identical every load ----
  private hash(n: number): number {
    const s = Math.sin(n * 127.1) * 43758.5453;
    return s - Math.floor(s);
  }
  private rand(i: number, salt: number): number {
    return this.hash(i * 0.7351 + salt * 19.19);
  }
  private sphere(i: number, radius: number, out: THREE.Vector3) {
    const n = this.count;
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = 2.399963229728653 * i;
    out.set(Math.cos(theta) * r * radius, y * radius, Math.sin(theta) * r * radius);
  }

  private buildFormations() {
    const n = this.count;
    for (let s = 0; s < STAGES; s++) {
      this.forms[s] = new Float32Array(n * 3);
      this.colors[s] = new Float32Array(n * 3);
    }
    const v = new THREE.Vector3();
    const c = new THREE.Color();

    for (let i = 0; i < n; i++) {
      const j = i * 3;

      // 0 — chaos
      v.set((this.rand(i, 1) - 0.5) * 52, (this.rand(i, 2) - 0.5) * 34, (this.rand(i, 3) - 0.5) * 42);
      this.write(0, j, v);
      c.copy(DIM).lerp(PURPLE, 0.4 + this.rand(i, 4) * 0.6);
      if (this.rand(i, 20) < 0.18) c.lerp(TEAL, this.rand(i, 21) * 0.7);
      this.writeCol(0, j, c);

      // 1 — the loop: a torus, the contribute → score → mint → earn cycle that
      //     the whole market turns on
      {
        const R = 10.5;
        const vv = this.rand(i, 31) * Math.PI * 2;
        const rr = 2.7 * (0.55 + this.rand(i, 32) * 0.45);
        const u = (i / n) * Math.PI * 2 + (this.rand(i, 30) - 0.5) * 0.06;
        const ring = R + rr * Math.cos(vv);
        v.set(ring * Math.cos(u), ring * Math.sin(u), rr * Math.sin(vv));
        this.write(1, j, v);
        // colour flows around the ring so the cycle reads as motion
        c.copy(PURPLE).lerp(TEAL, 1 - Math.abs(0.5 - i / n) * 2);
        this.writeCol(1, j, c);
      }

      // 2 — the corpus, structured and defended: a crystalline cube of accepted
      //     data, with rejected attackers flung out to a shell around it
      {
        if (this.rand(i, 7) < 0.28) {
          this.sphere(i, 15 + this.rand(i, 8) * 3.5, v);
          c.copy(PINK).lerp(AMBER, this.rand(i, 9) * 0.4);
        } else {
          const G = 9;
          const sp = 11 / (G - 1);
          const ix = Math.floor(this.rand(i, 41) * G);
          const iy = Math.floor(this.rand(i, 42) * G);
          const iz = Math.floor(this.rand(i, 43) * G);
          v.set(
            (ix - (G - 1) / 2) * sp + (this.rand(i, 44) - 0.5) * sp * 0.35,
            (iy - (G - 1) / 2) * sp + (this.rand(i, 45) - 0.5) * sp * 0.35,
            (iz - (G - 1) / 2) * sp + (this.rand(i, 46) - 0.5) * sp * 0.35,
          );
          c.copy(TEAL).lerp(PURPLE, iy / (G - 1));
        }
        this.write(2, j, v);
        this.writeCol(2, j, c);
      }

      // 3 — the chain: accepted records settle into blocks, linked in a line —
      //     the on-chain ledger the proof rests on
      {
        const B = 7;
        const gap = 4.6;
        if (this.rand(i, 50) < 0.12) {
          const b = Math.floor(this.rand(i, 51) * (B - 1));
          const x0 = (b - (B - 1) / 2) * gap + 1.2;
          const x1 = (b + 1 - (B - 1) / 2) * gap - 1.2;
          const tt = this.rand(i, 52);
          v.set(x0 + (x1 - x0) * tt, (this.rand(i, 54) - 0.5) * 0.5, (this.rand(i, 55) - 0.5) * 0.5);
          c.copy(AMBER); // the links between blocks
        } else {
          const b = Math.floor(this.rand(i, 53) * B);
          const bx = (b - (B - 1) / 2) * gap;
          v.set(
            bx + (this.rand(i, 56) - 0.5) * 2.3,
            (this.rand(i, 57) - 0.5) * 2.3,
            (this.rand(i, 58) - 0.5) * 2.3,
          );
          c.copy(b % 2 === 0 ? TEAL : PURPLE).lerp(WHITE, 0.1);
        }
        this.write(3, j, v);
        this.writeCol(3, j, c);
      }

      // 4 — parallel corpora: several chains running side by side at once, the
      //     thing Monad's parallel execution is for
      {
        const L = 4;
        const Bp = 5;
        const gap = 4.8;
        const lane = i % L;
        const hues = [PURPLE, TEAL, BLUE, PINK];
        const laneY = (lane - (L - 1) / 2) * 5.4;
        const laneZ = (lane - (L - 1) / 2) * 1.6;
        const b = Math.floor(this.rand(i, 60) * Bp);
        const bx = (b - (Bp - 1) / 2) * gap;
        v.set(
          bx + (this.rand(i, 61) - 0.5) * 2,
          laneY + (this.rand(i, 62) - 0.5) * 2,
          laneZ + (this.rand(i, 63) - 0.5) * 2,
        );
        this.write(4, j, v);
        c.copy(hues[lane]!).lerp(WHITE, this.rand(i, 64) * 0.15);
        this.writeCol(4, j, c);
      }

      // 5 — the network: a corpus hub with agents connecting in along spokes,
      //     the way any agent joins over MCP
      {
        const K = 12;
        if (this.rand(i, 70) < 0.34) {
          // the hub — the corpus itself
          const rr = 3.3 * Math.cbrt(this.rand(i, 71));
          const th = this.rand(i, 72) * Math.PI * 2;
          const ph = Math.acos(2 * this.rand(i, 73) - 1);
          v.set(rr * Math.sin(ph) * Math.cos(th), rr * Math.sin(ph) * Math.sin(th), rr * Math.cos(ph));
          c.copy(PURPLE).lerp(WHITE, 0.4);
        } else {
          // a spoke out to a connected agent
          const spoke = i % K;
          const sy = 1 - (spoke / (K - 1)) * 2;
          const sr = Math.sqrt(Math.max(0, 1 - sy * sy));
          const sth = 2.399963229728653 * spoke;
          const tt = this.rand(i, 74);
          const dist = 4 + tt * 11;
          const node = tt > 0.82;
          const jit = node ? 1.1 : 0.25;
          v.set(
            Math.cos(sth) * sr * dist + (this.rand(i, 75) - 0.5) * jit,
            sy * dist + (this.rand(i, 76) - 0.5) * jit,
            Math.sin(sth) * sr * dist + (this.rand(i, 77) - 0.5) * jit,
          );
          c.copy(PURPLE).lerp(TEAL, tt);
          if (node) c.lerp(WHITE, 0.3);
        }
        this.write(5, j, v);
        this.writeCol(5, j, c);
      }
    }
  }

  private write(stage: number, j: number, v: THREE.Vector3) {
    this.forms[stage]![j] = v.x;
    this.forms[stage]![j + 1] = v.y;
    this.forms[stage]![j + 2] = v.z;
  }
  private writeCol(stage: number, j: number, c: THREE.Color) {
    this.colors[stage]![j] = c.r;
    this.colors[stage]![j + 1] = c.g;
    this.colors[stage]![j + 2] = c.b;
  }

  private buildPoints() {
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(new Float32Array(this.forms[0]!), 3);
    this.colAttr = new THREE.BufferAttribute(new Float32Array(this.colors[0]!), 3);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.colAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("position", this.posAttr);
    geo.setAttribute("aColor", this.colAttr);
    geo.setAttribute("aScale", new THREE.BufferAttribute(this.scales, 1));

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uSize: { value: 0.135 },
        uPixel: { value: Math.min(window.devicePixelRatio, 2) },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geo, mat);
    this.group.add(this.points);
    this.scene.add(this.group);
  }

  private addAtmosphere() {
    // A faint static starfield for depth, and a soft central glow.
    const n = 700;
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      p[i * 3] = (this.hash(i * 3.1) - 0.5) * 120;
      p[i * 3 + 1] = (this.hash(i * 5.7) - 0.5) * 80;
      p[i * 3 + 2] = -30 - this.hash(i * 8.3) * 60;
    }
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    const m = new THREE.PointsMaterial({ color: 0x4a4470, size: 0.14, transparent: true, opacity: 0.5, depthWrite: false });
    this.scene.add(new THREE.Points(g, m));

    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uColor: { value: new THREE.Color("#836ef9") } },
        vertexShader: "varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} ",
        fragmentShader:
          "varying vec2 vUv; uniform vec3 uColor; void main(){ float d=length(vUv-0.5); float a=smoothstep(0.5,0.0,d); gl_FragColor=vec4(uColor,a*0.16);} ",
      }),
    );
    glow.position.z = -12;
    this.scene.add(glow);
  }

  private buildComposer() {
    // Bloom is what turns the points from "dots" into glowing light. Strength is
    // modulated per-stage in the loop so quiet moments stay readable and the
    // energetic ones (attacks, warp) blaze.
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      1.1, // strength
      0.7, // radius
      0.02, // threshold — bloom almost everything, since the points are the light
    );
    this.composer.addPass(this.bloom);
    this.composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }

  private onResize = () => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setSize(window.innerWidth, window.innerHeight);
    this.bloom.setSize(window.innerWidth, window.innerHeight);
  };

  private onPointerMove = (e: PointerEvent) => {
    this.mouse.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
  };

  private spin = 0;

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const prev = this.rendered;
    // Ease the rendered progress toward the scroll target for buttery morphs.
    this.rendered += (this.progress - this.rendered) * 0.075;
    // How fast the field is currently reshaping — drives the energy spikes below.
    const velocity = Math.min(1, Math.abs(this.rendered - prev) * 90);
    const t = this.clock.getElapsedTime();

    const seg = this.rendered * (STAGES - 1);
    const a = Math.max(0, Math.min(STAGES - 2, Math.floor(seg)));
    const b = a + 1;
    const mix = smoother(Math.max(0, Math.min(1, seg - a)));

    const fa = this.forms[a]!;
    const fb = this.forms[b]!;
    const ca = this.colors[a]!;
    const cb = this.colors[b]!;
    const pos = this.posAttr.array as Float32Array;
    const col = this.colAttr.array as Float32Array;

    // Idle drift eases off on the structured shapes (the cube, the chain, the
    // parallel chains — stages 2-4) so they stay legible, while the torus and the
    // network keep breathing. A burst of turbulence kicks in whenever the field
    // is mid-morph.
    const dominant = mix > 0.5 ? b : a;
    const crisp = dominant >= 2 && dominant <= 4 ? 1 : 0;
    const idle = 0.28 * (1 - 0.7 * crisp);
    const churn = velocity * 2.6;

    for (let i = 0; i < this.count; i++) {
      const j = i * 3;
      const seed = this.seeds[i]!;
      const wob = idle + churn * (0.4 + this.scales[i]! * 0.2);
      pos[j] = fa[j]! + (fb[j]! - fa[j]!) * mix + Math.sin(t * 0.8 + seed) * wob;
      pos[j + 1] = fa[j + 1]! + (fb[j + 1]! - fa[j + 1]!) * mix + Math.cos(t * 0.65 + seed) * wob;
      pos[j + 2] = fa[j + 2]! + (fb[j + 2]! - fa[j + 2]!) * mix + Math.sin(t * 0.5 + seed * 1.3) * wob;
      col[j] = ca[j]! + (cb[j]! - ca[j]!) * mix;
      col[j + 1] = ca[j + 1]! + (cb[j + 1]! - ca[j + 1]!) * mix;
      col[j + 2] = ca[j + 2]! + (cb[j + 2]! - ca[j + 2]!) * mix;
    }
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;

    // Particles swell and the bloom flares during a morph, then settle.
    const mat = this.points.material as THREE.ShaderMaterial;
    mat.uniforms.uSize!.value = 0.17 + velocity * 0.16 + Math.sin(t * 1.6) * 0.006;
    this.bloom.strength = 1.0 + velocity * 0.9;

    // Camera glides along its keyframes; the whole field keeps turning so it is
    // never static, breathes gently, and leans toward the pointer.
    this.lerpCamera(seg, a, b, mix);
    this.spin += 0.0016 + velocity * 0.01;
    this.group.rotation.y = this.spin + (this.mouse.x * 0.3 - this.group.rotation.y) * 0.04;
    this.group.rotation.x += (this.mouse.y * 0.16 - this.group.rotation.x) * 0.04;
    this.group.rotation.z = Math.sin(t * 0.08) * 0.05;
    const breathe = 1 + Math.sin(t * 0.5) * 0.03;
    this.group.scale.setScalar(breathe);

    this.composer.render();
  };

  private lerpCamera(seg: number, a: number, b: number, mix: number) {
    const ca = CAMERAS[a]!;
    const cb = CAMERAS[b]!;
    const px = ca.pos[0] + (cb.pos[0] - ca.pos[0]) * mix;
    const py = ca.pos[1] + (cb.pos[1] - ca.pos[1]) * mix;
    const pz = ca.pos[2] + (cb.pos[2] - ca.pos[2]) * mix;
    this.camPos.set(px, py, pz);
    this.camera.position.lerp(this.camPos, 0.06);
    this.camLook.set(
      ca.look[0] + (cb.look[0] - ca.look[0]) * mix,
      ca.look[1] + (cb.look[1] - ca.look[1]) * mix,
      ca.look[2] + (cb.look[2] - ca.look[2]) * mix,
    );
    this.camera.lookAt(this.camLook);
  }
}
