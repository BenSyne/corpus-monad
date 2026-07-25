import * as THREE from "three";

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
  { pos: [0, 0, 30], look: [0, 0, 0] },
  { pos: [2, 1, 23], look: [0, 0, 0] },
  { pos: [0, 0, 26], look: [0, 0, 0] },
  { pos: [0, 9, 18], look: [0, -1, 0] },
  { pos: [0, 0, 32], look: [0, 0, 0] },
  { pos: [0, 0, 7], look: [0, 0, -40] },
];

function smoother(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export class ParticleScene {
  private renderer: THREE.WebGLRenderer;
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

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 200);
    this.camera.position.copy(this.camPos);

    this.scales = new Float32Array(this.count);
    this.seeds = new Float32Array(this.count);
    for (let i = 0; i < this.count; i++) {
      this.scales[i] = 0.6 + Math.pow(this.hash(i * 2.7), 2) * 2.4;
      this.seeds[i] = this.hash(i * 9.13) * Math.PI * 2;
    }

    this.buildFormations();
    this.buildPoints();
    this.addAtmosphere();

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
      v.set((this.rand(i, 1) - 0.5) * 42, (this.rand(i, 2) - 0.5) * 28, (this.rand(i, 3) - 0.5) * 36);
      this.write(0, j, v);
      c.copy(DIM).lerp(PURPLE, 0.35 + this.rand(i, 4) * 0.65);
      if (this.rand(i, 20) < 0.15) c.lerp(TEAL, this.rand(i, 21) * 0.6);
      this.writeCol(0, j, c);

      // 1 — corpus lattice (fibonacci sphere, purple→teal by latitude)
      this.sphere(i, 9.2, v);
      v.x += (this.rand(i, 5) - 0.5) * 0.5;
      v.y += (this.rand(i, 6) - 0.5) * 0.5;
      this.write(1, j, v);
      c.copy(PURPLE).lerp(TEAL, (v.y / 9.2 + 1) / 2);
      this.writeCol(1, j, c);

      // 2 — shield: ~28% flung out as red attackers, the rest a teal core
      const attacker = this.rand(i, 7) < 0.28;
      if (attacker) {
        this.sphere(i, 15 + this.rand(i, 8) * 3, v);
        this.write(2, j, v);
        c.copy(PINK).lerp(AMBER, this.rand(i, 9) * 0.4);
      } else {
        this.sphere(i, 5.4 + this.rand(i, 10) * 0.6, v);
        this.write(2, j, v);
        c.copy(TEAL).lerp(PURPLE, this.rand(i, 11) * 0.5);
      }
      this.writeCol(2, j, c);

      // 3 — proof grid (a ledger plane with a gentle wave)
      const cols = Math.ceil(Math.sqrt(n * 1.6));
      const rows = Math.ceil(n / cols);
      const gx = (i % cols) / (cols - 1) - 0.5;
      const gy = Math.floor(i / cols) / (rows - 1) - 0.5;
      const px = gx * 30;
      const py = gy * 17;
      v.set(px, py, Math.sin(px * 0.35) * Math.cos(py * 0.4) * 1.6);
      this.write(3, j, v);
      c.copy(TEAL).lerp(PURPLE, (Math.sin(px * 0.4 + py * 0.3) + 1) / 2);
      this.writeCol(3, j, c);

      // 4 — parallel corpora (five distinct columns)
      const colHues = [PURPLE, TEAL, BLUE, PINK, AMBER];
      const col = i % 5;
      const cx = (col - 2) * 6.6;
      const ang = this.rand(i, 12) * Math.PI * 2;
      const rad = 0.6 + this.rand(i, 13) * 1.7;
      v.set(cx + Math.cos(ang) * rad, (this.rand(i, 14) - 0.5) * 17, Math.sin(ang) * rad);
      this.write(4, j, v);
      c.copy(colHues[col]!).lerp(new THREE.Color("#ffffff"), this.rand(i, 15) * 0.15);
      this.writeCol(4, j, c);

      // 5 — warp tunnel streaming toward the camera
      const wAng = this.rand(i, 16) * Math.PI * 2;
      const wRad = 1.5 + this.rand(i, 17) * 5;
      v.set(Math.cos(wAng) * wRad, Math.sin(wAng) * wRad, 8 - this.rand(i, 18) * 70);
      this.write(5, j, v);
      c.copy(PURPLE).lerp(new THREE.Color("#ffffff"), this.rand(i, 19) * 0.5);
      this.writeCol(5, j, c);
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

  private onResize = () => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  private onPointerMove = (e: PointerEvent) => {
    this.mouse.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
  };

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    // Ease the rendered progress toward the scroll target for buttery morphs.
    this.rendered += (this.progress - this.rendered) * 0.08;
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

    // Idle motion fades out on the crisp formations (proof grid, columns).
    const crisp = Math.max(mix > 0.5 ? b : a >= 3 ? 1 : 0, 0);
    const idle = 0.18 * (1 - 0.7 * crisp);

    for (let i = 0; i < this.count; i++) {
      const j = i * 3;
      const seed = this.seeds[i]!;
      const wob = idle;
      pos[j] = fa[j]! + (fb[j]! - fa[j]!) * mix + Math.sin(t * 0.6 + seed) * wob;
      pos[j + 1] = fa[j + 1]! + (fb[j + 1]! - fa[j + 1]!) * mix + Math.cos(t * 0.5 + seed) * wob;
      pos[j + 2] = fa[j + 2]! + (fb[j + 2]! - fa[j + 2]!) * mix + Math.sin(t * 0.4 + seed * 1.3) * wob;
      col[j] = ca[j]! + (cb[j]! - ca[j]!) * mix;
      col[j + 1] = ca[j + 1]! + (cb[j + 1]! - ca[j + 1]!) * mix;
      col[j + 2] = ca[j + 2]! + (cb[j + 2]! - ca[j + 2]!) * mix;
    }
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;

    // Camera glides along its keyframes; the field drifts and answers the mouse.
    this.lerpCamera(seg, a, b, mix);
    this.group.rotation.y += ((this.mouse.x * 0.25 - this.group.rotation.y) * 0.04);
    this.group.rotation.x += ((this.mouse.y * 0.12 - this.group.rotation.x) * 0.04);
    this.group.rotation.z = Math.sin(t * 0.05) * 0.03;

    this.renderer.render(this.scene, this.camera);
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
