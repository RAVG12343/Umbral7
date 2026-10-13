import * as THREE from "three";
import { GameAudio } from "@/game/audio";
import { createTextures } from "@/game/textures";
import { PRICES, type GameAPI, type Mods, type Phase, type Ranks, type Snapshot, type TouchPulse, type WeaponId } from "@/game/types";
import { BLOCKS, INTERIOR_LIGHTS, LAMPS, OPENINGS, buildWorld, type OpeningDef } from "@/game/world";

/**
 * FPS basis (three.js, +Y up). yaw 0 looks down -Z.
 * forward = (-sin(yaw), 0, -cos(yaw)); right = (cos(yaw), 0, -sin(yaw))
 * A strafes -right, D strafes +right. Mouse right decreases yaw.
 */

const STEP = 1 / 60;
const CELL = 1.5;
const OX = -28;
const OZ = -32;
const GW = 38;
const GH = 40;
const MAXZ = 28;
const MAXB = 48;
const MAXP = 220;

const HARD: Record<string, number> = {
  concrete: 1.45,
  brick: 1.2,
  plaster: 0.9,
  metal: 1.75,
  wood: 0.4,
  glass: 0.14,
  plank: 0.36,
};

type Kind = "walker" | "runner" | "tank" | "stalker";

type Col = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  active: boolean;
  mat: string;
  hard: number;
  dyn: boolean;
  gate?: boolean;
};

type Opening = OpeningDef & {
  hp: number;
  maxHp: number;
  glassHp: number;
  cells: number[];
  planks: THREE.Group;
  glassMesh: THREE.Mesh | null;
  plankCol: Col;
  glassCol: Col | null;
};

type Gun = {
  id: WeaponId;
  mag: number;
  reserve: number;
  heat: number;
  dirt: number;
  jammed: boolean;
  mods: Mods;
};

type Zed = {
  alive: boolean;
  kind: Kind;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  hp: number;
  maxHp: number;
  leg: number;
  legMax: number;
  scale: number;
  phase: number;
  aware: boolean;
  calm: number;
  atk: number;
  stumble: number;
  climb: number;
  flash: number;
  blood: number;
  deadT: number;
  groanT: number;
  stepT: number;
  seed: number;
  wanderX: number;
  wanderZ: number;
  wanderT: number;
  shirt: THREE.Color;
  skin: THREE.Color;
};

type Bullet = {
  on: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  energy: number;
  dmg: number;
  pen: number;
  life: number;
  pens: number;
  skipZ: number;
  skipC: number;
};

type Particle = {
  on: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  r: number;
  g: number;
  b: number;
};

type Pickup = {
  x: number;
  z: number;
  kind: "bandage" | "rifle" | "shot" | "wood" | "scrap";
  amount: number;
  on: boolean;
  needUnlock: boolean;
  mesh: THREE.Mesh;
};

const KIND = {
  walker: { hp: 74, speed: 1.62, dmg: 7, scale: 1, reach: 1.15 },
  runner: { hp: 48, speed: 3.4, dmg: 8, scale: 0.94, reach: 1.12 },
  tank: { hp: 250, speed: 1.18, dmg: 16, scale: 1.28, reach: 1.45 },
  stalker: { hp: 86, speed: 2.3, dmg: 11, scale: 1.06, reach: 1.2 },
} as const;

const SKIN: Record<Kind, string> = {
  walker: "#6d7a52",
  runner: "#8a9168",
  tank: "#4e453c",
  stalker: "#9aa096",
};
const SHIRT: Record<Kind, string> = {
  walker: "#3c4638",
  runner: "#2f3a30",
  tank: "#2a2624",
  stalker: "#3a3e3c",
};
const EYE: Record<Kind, string> = {
  walker: "#c6d26a",
  runner: "#e4ec9a",
  tank: "#ffb03a",
  stalker: "#ff3b2a",
};

function clamp(v: number, a: number, b: number) {
  return v < a ? a : v > b ? b : v;
}
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
function approach(cur: number, target: number, maxDelta: number) {
  const d = target - cur;
  if (Math.abs(d) <= maxDelta) return target;
  return cur + Math.sign(d) * maxDelta;
}
function smoothstep(a: number, b: number, x: number) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
function angNorm(d: number) {
  return Math.atan2(Math.sin(d), Math.cos(d));
}

declare global {
  interface Window {
    __controlsTest?: {
      getYaw: () => number;
      getSpeed: () => number;
      getPos: () => { x: number; y: number; z: number };
      setKeys: (codes: string[]) => void;
      setFire: (v: boolean) => void;
      getMag: () => number;
      getPhase: () => string;
    };
  }
}

export class Engine implements GameAPI {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(78, 1, 0.08, 200);
  private yawPivot = new THREE.Object3D();
  private viewScene = new THREE.Scene();
  private viewCam = new THREE.PerspectiveCamera(78, 1, 0.05, 8);
  private clockSky = new THREE.Color();
  private host: HTMLElement;
  private audio = new GameAudio();
  private offs: Array<() => void> = [];
  private keys = new Set<string>();
  private qaKeys = new Set<string>();
  private was = new Set<string>();
  private lastT = 0;
  private acc = 0;
  private reduce: boolean;

  phase: Phase = "menu";
  private returnPhase: Phase = "prep";
  private shop = false;
  private wave = 1;
  private x = 0;
  private y = 0;
  private z = 2;
  private vx = 0;
  private vz = 0;
  private vy = 0;
  private yaw = 0;
  private pitch = 0;
  private fx = 0;
  private fz = -1;
  private rx = 1;
  private rz = 0;
  private eye = 1.62;
  private grounded = true;
  private coyote = 0;
  private hp = 100;
  private stamina = 100;
  private iframe = 0;
  private crouch = false;
  private crouchToggle = false;
  private slideT = 0;
  private vaultT = 0;
  private vaultDur = 0.45;
  private vaultH = 1;
  private vaultDX = 0;
  private vaultDZ = 0;
  private sprinting = false;
  private bob = 0;
  private bobX = 0;
  private bobY = 0;
  private shake = 0;
  private recoilP = 0;
  private recoilY = 0;
  private kick = 0;
  private adsV = 0;
  private swapT = 0;
  private reloadT = 0;
  private reloadDurT = 1;
  private reloadEmpty = false;
  private rackT = 0;
  private checkT = 0;
  private showMagT = 0;
  private cleanT = 0;
  private gunI = 0;
  private guns: Gun[] = [];
  private scrap = 22;
  private wood = 6;
  private skills = 0;
  private ranks: Ranks = { lungs: 0, grip: 0, surgeon: 0 };
  private kills = 0;
  private best = 0;
  private sens = 0.00215;
  private volume = 0.85;
  private assist = false;
  private unlocked = false;
  private raining = false;
  private foggy = false;
  private night = false;
  private tod = 0.73;
  private windX = 0.4;
  private windZ = -0.2;
  private windAng = 0.4;
  private toast = "";
  private toastT = 0;
  private hurtFlash = 0;
  private hurtSide = 0;
  private hitMark = 0;
  private headHit = false;
  private diary = false;
  private diaryLatch = false;
  private noisePulse = 0;
  private alert = 0;
  private stepDist = 0;
  private heartT = 1;
  private breathT = 1;
  private menuAng = 0.4;
  private spawnQ: Kind[] = [];
  private spawned = 0;
  private quota = 0;
  private spawnT = 0;
  private flowT = 0;
  private blocksDirty = true;
  private mouseDX = 0;
  private mouseDY = 0;
  private fireHeld = false;
  private aimHeld = false;
  private qaFire = false;
  private touchX = 0;
  private touchY = 0;
  private touchFire = false;
  private touchAim = false;
  private touchSprint = false;
  private touchClean = false;
  private touchJump = false;
  private touchReload = false;
  private touchInteract = false;
  private touchCheck = false;
  private touchSwap = false;
  private padX = 0;
  private padY = 0;
  private padLookX = 0;
  private padLookY = 0;
  private padFire = false;
  private padSprint = false;
  private fireCd = 0;
  private hitstop = 0;

  private cols: Col[] = [];
  private openings: Opening[] = [];
  private gateCol: Col | null = null;
  private gateMeshes: THREE.Object3D[] = [];
  private zeds: Zed[] = [];
  private bullets: Bullet[] = [];
  private particles: Particle[] = [];
  private pCursor = 0;
  private pickups: Pickup[] = [];
  private blocked = new Uint8Array(GW * GH);
  private dist = new Int16Array(GW * GH);
  private flowX = new Int8Array(GW * GH);
  private flowZ = new Int8Array(GW * GH);
  private queue = new Int32Array(GW * GH);

  private hemi: THREE.HemisphereLight;
  private sun: THREE.DirectionalLight;
  private lamps: THREE.PointLight[] = [];
  private interiors: THREE.PointLight[] = [];
  private muzzle: THREE.PointLight;
  private flashT = 0;
  private fog: THREE.FogExp2;
  private groundMat: THREE.MeshStandardMaterial | null = null;
  private puddles: THREE.Mesh[] = [];
  private windsock: THREE.Object3D | null = null;
  private skyPos!: THREE.BufferAttribute;
  private skyCol!: THREE.BufferAttribute;
  private cTop = new THREE.Color();
  private cMid = new THREE.Color();
  private cBot = new THREE.Color();
  private cNight = new THREE.Color("#070b14");
  private cDuskTop = new THREE.Color("#1c3a68");
  private cDuskMid = new THREE.Color("#e08a4c");
  private cDuskBot = new THREE.Color("#2a2018");
  private cRain = new THREE.Color("#3e4852");
  private torsoM!: THREE.InstancedMesh;
  private headM!: THREE.InstancedMesh;
  private armM!: THREE.InstancedMesh;
  private legM!: THREE.InstancedMesh;
  private eyeM!: THREE.InstancedMesh;
  private blobM!: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();
  private part = new THREE.Object3D();
  private tmpM = new THREE.Matrix4();
  private tmpC = new THREE.Color();
  private bloodC = new THREE.Color("#4a1414");
  private whiteC = new THREE.Color("#ffffff");
  private rifleG!: { root: THREE.Group; mag: THREE.Object3D; bolt: THREE.Object3D };
  private shotG!: { root: THREE.Group; mag: THREE.Object3D; bolt: THREE.Object3D; pump: THREE.Object3D };
  private flashMesh!: THREE.Mesh;
  private viewKey!: THREE.DirectionalLight;
  private tracerPos = new Float32Array(MAXB * 6);
  private tracerGeo!: THREE.BufferGeometry;
  private partPos = new Float32Array(MAXP * 3);
  private partCol = new Float32Array(MAXP * 3);
  private partGeo!: THREE.BufferGeometry;
  private decals: THREE.Mesh[] = [];
  private decalI = 0;
  private ui: Snapshot;

  constructor(host: HTMLElement) {
    this.host = host;
    this.reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    if (!this.renderer.getContext()) throw new Error("WebGL no disponible");
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.2 : 1.5));
    this.renderer.setSize(host.clientWidth || 1, host.clientHeight || 1, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.autoClear = false;
    this.renderer.domElement.className = "block h-full w-full";
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.touchAction = "none";
    host.appendChild(this.renderer.domElement);

    this.scene.add(this.yawPivot);
    this.yawPivot.add(this.camera);
    this.fog = new THREE.FogExp2("#c48858", 0.016);
    this.scene.fog = this.fog;
    this.hemi = new THREE.HemisphereLight("#8eb0d4", "#3a3228", 0.55);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight("#ffc48a", 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.near = 2;
    this.sun.shadow.camera.far = 70;
    this.sun.shadow.camera.left = -22;
    this.sun.shadow.camera.right = 22;
    this.sun.shadow.camera.top = 22;
    this.sun.shadow.camera.bottom = -22;
    this.sun.shadow.bias = -0.0006;
    this.scene.add(this.sun, this.sun.target);
    this.muzzle = new THREE.PointLight("#fff1d2", 0, 11, 2);
    this.scene.add(this.muzzle);

    const tex = createTextures();
    const built = buildWorld(this.scene, tex);
    this.gateMeshes = built.gateMeshes;
    const ground = this.scene.getObjectByName("ground") as THREE.Mesh | null;
    if (ground) this.groundMat = ground.material as THREE.MeshStandardMaterial;
    this.windsock = this.scene.getObjectByName("windsock") ?? null;
    this.createSky();
    this.createLights();
    this.createPuddles();
    this.createCols();
    this.createOpenings();
    this.createZedMeshes();
    this.createBallistics();
    this.createPickups();
    this.buildView();
    this.load();
    this.audio.setVolume(this.volume);
    this.reset();
    this.phase = "menu";
    this.bind();
    this.mountProbe();
    this.ui = this.blankSnap();
    this.writeUi();
    this.lastT = performance.now();
    this.renderer.setAnimationLoop((t) => this.frame(t));
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    for (const off of this.offs) off();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    if (window.__controlsTest) delete window.__controlsTest;
  }

  unlock() {
    this.audio.unlock();
  }
  start() {
    this.unlock();
    this.reset();
    this.phase = "prep";
    this.say("La vivienda del norte está delante. Ciérrala con E. Intendencia al suroeste.", 6);
  }
  resume() {
    if (this.phase === "pause") this.phase = this.returnPhase;
    this.lock();
  }
  retry() {
    const best = this.best;
    this.reset();
    this.best = best;
    this.phase = "prep";
    this.say("Otra vez. El bloque no perdona.", 3);
  }
  abandon() {
    this.shop = false;
    this.phase = "menu";
    this.bullets.forEach((b) => (b.on = false));
    for (const z of this.zeds) {
      z.alive = false;
      z.deadT = 99;
    }
    if (document.exitPointerLock) document.exitPointerLock();
  }
  lock() {
    const el = this.renderer.domElement;
    try {
      const ret = el.requestPointerLock({ unadjustedMovement: true });
      void Promise.resolve(ret).catch(() => {
        try {
          el.requestPointerLock();
        } catch {
          /* desktop only */
        }
      });
    } catch {
      try {
        el.requestPointerLock();
      } catch {
        /* ignore */
      }
    }
  }
  closeShop() {
    this.shop = false;
  }
  openShop() {
    if (this.phase !== "prep") {
      this.say("Intendencia cerrada hasta que caiga la oleada.", 1.6);
      return;
    }
    this.shop = true;
    if (document.exitPointerLock) document.exitPointerLock();
  }
  callWave() {
    if (this.phase !== "prep") return;
    this.shop = false;
    this.applyClimate(this.wave);
    const plan = this.plan(this.wave);
    const q: Kind[] = [];
    const push = (k: Kind, n: number) => {
      for (let i = 0; i < n; i++) q.push(k);
    };
    push("walker", plan.walker);
    push("runner", plan.runner);
    push("tank", plan.tank);
    push("stalker", plan.stalker);
    this.spawnQ = q;
    this.quota = q.length;
    this.spawned = 0;
    this.spawnT = 0.35;
    this.phase = "wave";
    const line =
      this.wave === 1
        ? "Ahí vienen. Por la puerta, si la dejaste abierta."
        : this.raining
          ? "Llueve. Los pasos se ahogan y el viento empuja la bala."
          : this.foggy
            ? "Niebla cerrada. Los acechadores no necesitan verte."
            : this.night
              ? "De noche no caminan: corren."
              : `Oleada ${this.wave}.`;
    this.say(line, 3.2);
    this.rebuildBlocked();
  }
  buy(id: string) {
    if (this.phase !== "prep" || !this.shop) return;
    const g = this.guns[this.gunI];
    const pay = (cost: number) => {
      if (this.scrap < cost) {
        this.say("No alcanza la chatarra.", 1.4);
        return false;
      }
      this.scrap -= cost;
      return true;
    };
    if (id === "ammo-rifle" && pay(PRICES.ammoRifle)) {
      this.guns[0].reserve += 30;
      this.say("Treinta del fusil.", 1.2);
    } else if (id === "ammo-shot" && pay(PRICES.ammoShot)) {
      this.guns[1].reserve += 8;
      this.say("Ocho cartuchos.", 1.2);
    } else if (id === "bandage" && pay(PRICES.bandage)) {
      this.hp = Math.min(100, this.hp + 38);
      this.say("Venda puesta.", 1.2);
    } else if (id === "wood" && pay(PRICES.wood)) {
      this.wood += 2;
      this.say("Dos tablas.", 1.2);
    } else if (id === "clean" && pay(PRICES.clean)) {
      g.dirt = 0;
      g.heat = 0;
      g.jammed = false;
      this.say("Arma limpia.", 1.2);
    } else if (id.startsWith("mod-") && pay(PRICES.mod)) {
      const key = id.slice(4) as keyof Mods;
      if (g.mods[key] >= 2) {
        this.scrap += PRICES.mod;
        this.say("Esa pieza ya está al límite.", 1.4);
      } else {
        g.mods[key] += 1;
        g.mag = Math.min(g.mag, this.magMax(g));
        this.say("Pieza montada. Pesa más.", 1.4);
      }
    } else if (id.startsWith("skill-")) {
      const key = id.slice(6) as keyof Ranks;
      if (this.skills <= 0) this.say("Sin puntos de oficio.", 1.3);
      else if (this.ranks[key] >= 3) this.say("Oficio al máximo.", 1.3);
      else {
        this.skills -= 1;
        this.ranks[key] += 1;
        this.say("Oficio anotado.", 1.2);
      }
    } else if (id === "unlock") {
      if (this.unlocked) this.say("El almacén ya está abierto.", 1.2);
      else if (pay(PRICES.unlock)) {
        this.unlocked = true;
        if (this.gateCol) this.gateCol.active = false;
        const gate = this.openings.find((o) => o.id === "wh-gate");
        if (gate) gate.locked = false;
        for (const m of this.gateMeshes) m.visible = false;
        for (const p of this.pickups) if (p.needUnlock) p.on = true;
        this.blocksDirty = true;
        this.say("El portón cede. Dentro hay munición y tablas.", 2.4);
      }
    }
    this.audio.mech();
    this.writeUi();
  }
  setTouchMove(x: number, y: number) {
    this.touchX = clamp(x, -1, 1);
    this.touchY = clamp(y, -1, 1);
  }
  setTouchLook(dx: number, dy: number) {
    this.mouseDX += dx * 0.85;
    this.mouseDY += dy * 0.85;
  }
  setTouchFire(v: boolean) {
    this.touchFire = v;
  }
  setTouchAim(v: boolean) {
    this.touchAim = v;
  }
  setTouchSprint(v: boolean) {
    this.touchSprint = v;
  }
  setTouchClean(v: boolean) {
    this.touchClean = v;
  }
  pulse(action: TouchPulse) {
    if (action === "reload") this.touchReload = true;
    else if (action === "interact") this.touchInteract = true;
    else if (action === "jump") this.touchJump = true;
    else if (action === "crouch") this.crouchToggle = !this.crouchToggle;
    else if (action === "check") this.touchCheck = true;
    else if (action === "clean") this.touchClean = !this.touchClean;
    else if (action === "swap") this.touchSwap = true;
    else if (action === "diary") this.diaryLatch = !this.diaryLatch;
  }
  setSettings(patch: { sens?: number; volume?: number; assist?: boolean }) {
    if (patch.sens !== undefined) this.sens = clamp(patch.sens, 0.0006, 0.006);
    if (patch.volume !== undefined) {
      this.volume = clamp(patch.volume, 0, 1);
      this.audio.setVolume(this.volume);
    }
    if (patch.assist !== undefined) this.assist = patch.assist;
    this.save();
    this.writeUi();
  }
  snapshot() {
    return {
      ...this.ui,
      ranks: { ...this.ui.ranks },
      mods: { ...this.ui.mods },
    };
  }

  private frame(t: number) {
    const now = typeof t === "number" ? t : performance.now();
    const dt = Math.min(0.05, (now - this.lastT) / 1000 || 0);
    this.lastT = now;
    this.pollPad();
    if (this.phase !== "menu") this.applyLook(dt);
    if (this.hitstop > 0) this.hitstop -= dt;
    else {
      this.acc += dt;
      let n = 0;
      while (this.acc >= STEP && n < 5) {
        this.sim(STEP);
        this.acc -= STEP;
        n++;
      }
    }
    this.render(dt);
  }

  private applyLook(dt: number) {
    const ads = this.aimHeld || this.touchAim ? 0.62 : 1;
    this.yaw -= (this.mouseDX + this.padLookX * 780 * dt) * this.sens * ads;
    this.pitch -= (this.mouseDY + this.padLookY * 640 * dt) * this.sens * ads;
    this.pitch = clamp(this.pitch, -1.45, 1.45);
    this.mouseDX = 0;
    this.mouseDY = 0;
  }

  private pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads[0];
    if (!gp) {
      this.padX = this.padY = this.padLookX = this.padLookY = 0;
      this.padFire = false;
      this.padSprint = false;
      return;
    }
    const dead = (v: number) => (Math.abs(v) < 0.16 ? 0 : v);
    this.padX = dead(gp.axes[0] ?? 0);
    this.padY = -dead(gp.axes[1] ?? 0);
    this.padLookX = dead(gp.axes[2] ?? 0);
    this.padLookY = dead(gp.axes[3] ?? 0);
    this.padFire = !!(gp.buttons[7]?.pressed || gp.buttons[5]?.pressed);
    this.padSprint = !!(gp.buttons[6]?.pressed || gp.buttons[4]?.pressed);
    if (gp.buttons[0]?.pressed) this.touchJump = true;
  }

  private sim(dt: number) {
    this.windAng += dt * 0.07;
    const gust = (this.raining ? 3.1 : 0.55) + Math.sin(this.windAng * 1.7) * (this.raining ? 0.9 : 0.25);
    this.windX = Math.cos(this.windAng) * gust;
    this.windZ = Math.sin(this.windAng * 0.8) * gust * 0.65;
    this.toastT = Math.max(0, this.toastT - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 1.5);
    this.hitMark = Math.max(0, this.hitMark - dt * 2.6);
    this.iframe = Math.max(0, this.iframe - dt);
    this.checkT = Math.max(0, this.checkT - dt);
    this.showMagT = Math.max(0, this.showMagT - dt);
    this.noisePulse = Math.max(0, this.noisePulse - dt);
    this.alert = Math.max(0, this.alert - dt);
    this.recoilP *= Math.exp(-9 * dt);
    this.recoilY *= Math.exp(-8 * dt);
    this.kick *= Math.exp(-7 * dt);
    this.shake = Math.max(0, this.shake - dt * 2.2);
    if (this.phase === "menu" || this.phase === "pause" || this.phase === "dead" || this.shop) {
      this.writeUi();
      return;
    }
    this.tod += dt * 0.0012;
    this.basis();
    this.readActions(dt);
    this.movePlayer(dt);
    this.simGun(dt);
    for (const b of this.bullets) if (b.on) this.fly(b, dt);
    this.simZeds(dt);
    this.simPickups();
    this.simBody(dt);
    if (this.blocksDirty) {
      this.rebuildBlocked();
      this.blocksDirty = false;
      this.flowT = 0;
    }
    this.collectWave();
    this.writeUi();
  }

  private basis() {
    this.fx = -Math.sin(this.yaw);
    this.fz = -Math.cos(this.yaw);
    this.rx = Math.cos(this.yaw);
    this.rz = -Math.sin(this.yaw);
  }

  private down(code: string) {
    return this.keys.has(code) || this.qaKeys.has(code);
  }
  private edge(code: string) {
    const d = this.down(code);
    const e = d && !this.was.has(code);
    if (d) this.was.add(code);
    else this.was.delete(code);
    return e;
  }

  private readActions(dt: number) {
    if (this.edge("Digit1")) this.swapTo(0);
    if (this.edge("Digit2")) this.swapTo(1);
    if (this.touchSwap) {
      this.swapTo(this.gunI === 0 ? 1 : 0);
      this.touchSwap = false;
    }
    if (this.edge("KeyR") || this.touchReload) {
      this.touchReload = false;
      this.tryReload();
    }
    if (this.edge("KeyE") || this.touchInteract) {
      this.touchInteract = false;
      this.interact();
    }
    if (this.edge("KeyV") || this.touchCheck) {
      this.touchCheck = false;
      this.checkT = 1.35;
      this.showMagT = 1.35;
      this.audio.mech();
    }
    if (this.edge("Tab")) this.diaryLatch = !this.diaryLatch;
    this.diary = this.down("Tab") || this.diaryLatch;
    const cleaning = this.down("KeyG") || this.touchClean;
    if (cleaning && this.phase !== "menu") {
      this.cleanT += dt;
      if (this.cleanT >= 1.65) {
        const g = this.guns[this.gunI];
        g.dirt = 0;
        g.heat *= 0.4;
        this.cleanT = 0;
        this.say("Arma limpia.", 1.2);
        this.audio.mech();
      }
    } else this.cleanT = Math.max(0, this.cleanT - dt * 2);
    const crouchHeld = this.down("ControlLeft") || this.down("ControlRight") || this.down("KeyC");
    const crouchEdge = this.edge("ControlLeft") || this.edge("ControlRight") || this.edge("KeyC");
    this.crouch = crouchHeld || this.crouchToggle;
    const jumpEdge = this.edge("Space") || this.touchJump;
    this.touchJump = false;
    if (jumpEdge) this.tryJump();
    if (crouchEdge && this.grounded && Math.hypot(this.vx, this.vz) > 4.1 && this.stamina > 12 && this.vaultT <= 0) {
      this.slideT = 0.62;
      this.stamina -= 12;
      const s = Math.hypot(this.vx, this.vz) || 1;
      const boost = Math.max(6.4, s * 1.12);
      this.vx = (this.vx / s) * boost;
      this.vz = (this.vz / s) * boost;
    }
  }

  private tryJump() {
    if (this.vaultT > 0) return;
    if (!this.grounded && this.coyote <= 0) return;
    const obs = this.probeObstacle();
    if (obs && this.stamina >= 14) {
      this.vaultDX = this.fx;
      this.vaultDZ = this.fz;
      this.vaultH = obs.h;
      if (obs.h <= 1.2) {
        this.vaultT = 0.46;
        this.vaultDur = 0.46;
        this.stamina -= 14;
        return;
      }
      if (obs.h <= 2.15 && this.stamina >= 26) {
        this.vaultT = 0.78;
        this.vaultDur = 0.78;
        this.stamina -= 26;
        return;
      }
    }
    if (this.stamina < 8) return;
    this.vy = 6.3;
    this.grounded = false;
    this.stamina -= 6;
  }

  private probeObstacle() {
    let best: { h: number } | null = null;
    for (const c of this.cols) {
      if (!c.active || c.maxY < 0.4 || c.maxY > 2.2 || c.dyn) continue;
      const px = this.x + this.fx * 0.65;
      const pz = this.z + this.fz * 0.65;
      if (px < c.minX - 0.15 || px > c.maxX + 0.15 || pz < c.minZ - 0.15 || pz > c.maxZ + 0.15) continue;
      const cx = clamp(this.x, c.minX, c.maxX);
      const cz = clamp(this.z, c.minZ, c.maxZ);
      if (Math.hypot(this.x - cx, this.z - cz) > 1.05) continue;
      if (!best || c.maxY < best.h) best = { h: c.maxY };
    }
    return best;
  }

  private movePlayer(dt: number) {
    const kg = 12 + this.gunKg(this.guns[0]) + this.gunKg(this.guns[1]);
    const weightMul = clamp(1.08 - (kg - 15) / 28, 0.68, 1.06);
    let speed = 3.25 * weightMul;
    if (this.hp < 48) speed *= 0.8;
    if (this.hp < 28) speed *= 0.9;
    const aiming = this.aimHeld || this.touchAim;
    if (this.crouch) speed *= 0.55;
    if (aiming) speed *= 0.7;
    if (this.cleanT > 0.05) speed *= 0.48;
    const sprintHeld = (this.down("ShiftLeft") || this.down("ShiftRight") || this.touchSprint || this.padSprint) && !aiming;
    let mx = 0;
    let my = 0;
    if (this.down("KeyW") || this.down("ArrowUp")) my += 1;
    if (this.down("KeyS") || this.down("ArrowDown")) my -= 1;
    if (this.down("KeyD") || this.down("ArrowRight")) mx += 1;
    if (this.down("KeyA") || this.down("ArrowLeft")) mx -= 1;
    if (this.touchX !== 0 || this.touchY !== 0) {
      mx = this.touchX;
      my = this.touchY;
    }
    mx += this.padX;
    my += this.padY;
    const ml = Math.hypot(mx, my);
    if (ml > 1) {
      mx /= ml;
      my /= ml;
    }
    this.sprinting = sprintHeld && this.stamina > 1 && !this.crouch && ml > 0.2 && this.slideT <= 0 && this.vaultT <= 0;
    if (this.sprinting) speed *= 1.7;
    if (this.vaultT > 0) {
      this.vaultT -= dt;
      const u = 1 - Math.max(0, this.vaultT) / this.vaultDur;
      const spd = this.vaultDur > 0.6 ? 2.3 : 4.3;
      this.x += this.vaultDX * spd * dt;
      this.z += this.vaultDZ * spd * dt;
      this.y = Math.sin(Math.min(1, u) * Math.PI) * (this.vaultH + 0.25);
      this.vy = 0;
      this.vx = this.vaultDX * spd;
      this.vz = this.vaultDZ * spd;
      if (this.vaultT <= 0) {
        this.y = 0;
        this.grounded = true;
        const p = this.collide(this.x, this.z, 0.34);
        this.x = p.x;
        this.z = p.z;
      }
    } else if (this.slideT > 0) {
      this.slideT -= dt;
      this.vx *= Math.exp(-2.4 * dt);
      this.vz *= Math.exp(-2.4 * dt);
      this.x += this.vx * dt;
      this.z += this.vz * dt;
      const p = this.collide(this.x, this.z, 0.34);
      this.x = p.x;
      this.z = p.z;
      this.y = 0;
      this.grounded = true;
    } else {
      const wishX = (this.fx * my + this.rx * mx) * speed;
      const wishZ = (this.fz * my + this.rz * mx) * speed;
      let accel = (this.sprinting ? 8.5 : 14) / (0.72 + kg / 36);
      if (!this.grounded) accel *= 0.32;
      const turning = this.vx * wishX + this.vz * wishZ < 0 ? 1.85 : 1;
      const maxD = accel * turning * dt;
      this.vx = approach(this.vx, wishX, maxD);
      this.vz = approach(this.vz, wishZ, maxD);
      if (!this.grounded) this.vy -= 22 * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        if (this.vy < -7) this.shake += Math.min(0.5, (-this.vy - 7) / 16);
        this.y = 0;
        this.vy = 0;
        this.grounded = true;
        this.coyote = 0.1;
      } else {
        this.grounded = false;
        this.coyote -= dt;
      }
      this.x += this.vx * dt;
      this.z += this.vz * dt;
      const p = this.collide(this.x, this.z, 0.34);
      this.x = p.x;
      this.z = p.z;
    }
    this.x = clamp(this.x, -25.2, 25.2);
    this.z = clamp(this.z, -29.2, 21.2);
    const drain = 0.65 + kg / 22;
    if (this.sprinting) this.stamina -= 18 * drain * (this.hp < 50 ? 1.35 : 1) * dt;
    else if (this.slideT <= 0 && this.vaultT <= 0) {
      const regen = (this.hp < 45 ? 7 : 15) * (1 + this.ranks.lungs * 0.28);
      this.stamina += regen * dt;
    }
    this.stamina = clamp(this.stamina, 0, 100);
    const targetEye = this.slideT > 0 ? 0.72 : this.crouch ? 1.02 : 1.62;
    this.eye = approach(this.eye, targetEye, dt * 7);
    const sp = Math.hypot(this.vx, this.vz);
    if (this.grounded && this.slideT <= 0 && this.vaultT <= 0 && sp > 0.4) {
      this.stepDist += sp * dt;
      const stride = this.crouch ? 1.7 : this.sprinting ? 1.15 : 1.45;
      if (this.stepDist >= stride) {
        this.stepDist = 0;
        this.audio.localStep(this.sprinting ? 0.42 : this.crouch ? 0.16 : 0.28);
      }
    }
  }

  private collide(x: number, z: number, radius: number, feet = 0, height = 1.7) {
    for (let iter = 0; iter < 3; iter++) {
      for (const b of this.cols) {
        if (!b.active || b.maxY < feet + 0.42 || b.minY > feet + height * 0.9) continue;
        const cx = clamp(x, b.minX, b.maxX);
        const cz = clamp(z, b.minZ, b.maxZ);
        let dx = x - cx;
        let dz = z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= radius * radius) continue;
        if (d2 < 1e-6) {
          const left = x - b.minX;
          const right = b.maxX - x;
          const up = z - b.minZ;
          const down = b.maxZ - z;
          const m = Math.min(left, right, up, down);
          if (m === left) x = b.minX - radius;
          else if (m === right) x = b.maxX + radius;
          else if (m === up) z = b.minZ - radius;
          else z = b.maxZ + radius;
        } else {
          const d = Math.sqrt(d2);
          const push = radius - d + 0.001;
          x += (dx / d) * push;
          z += (dz / d) * push;
        }
      }
    }
    return { x, z };
  }

  private simGun(dt: number) {
    const g = this.guns[this.gunI];
    g.heat = Math.max(0, g.heat - 0.16 * dt);
    this.adsV = approach(this.adsV, this.aimHeld || this.touchAim ? 1 : 0, dt * 8);
    if (this.swapT > 0) this.swapT -= dt;
    if (this.rackT > 0) {
      this.rackT -= dt;
      if (this.rackT <= 0) this.audio.mech();
      this.fireCd = Math.max(this.fireCd, 0);
    }
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) this.finishReload(g);
    }
    this.fireCd = Math.max(0, this.fireCd - dt);
    const want = this.fireHeld || this.touchFire || this.qaFire || this.padFire;
    if (!want || this.cleanT > 0.05 || this.swapT > 0.05 || this.reloadT > 0 || this.rackT > 0) return;
    if (g.jammed) {
      if (this.fireCd <= 0) {
        this.fireCd = 0.28;
        this.audio.jam();
        this.say("Encasquillada. R para montar.", 1.1);
      }
      return;
    }
    const interval = g.id === "rifle" ? 0.098 : 0.78;
    if (this.fireCd > 0) return;
    if (g.mag <= 0) {
      this.fireCd = 0.28;
      this.audio.dry();
      this.say("Cargador vacío.", 0.8);
      return;
    }
    this.fireCd = interval;
    g.mag -= 1;
    g.heat = Math.min(1, g.heat + (g.id === "rifle" ? 0.055 : 0.04));
    g.dirt = Math.min(1, g.dirt + 0.0065);
    const jamP = g.dirt * 0.045 + Math.max(0, g.heat - 0.7) * 0.62;
    if (Math.random() < jamP) {
      g.jammed = true;
      this.audio.jam();
      this.say("Encasquillada.", 0.9);
    }
    this.shoot(g);
    if (g.id === "shotgun") this.kick = 1;
  }

  private shoot(g: Gun) {
    const aimYaw = this.yaw + this.recoilY;
    const aimPitch = this.pitch + this.recoilP;
    const cp = Math.cos(aimPitch);
    const sp = Math.sin(aimPitch);
    const fx = -Math.sin(aimYaw) * cp;
    const fy = sp;
    const fz = -Math.cos(aimYaw) * cp;
    const pellets = g.id === "shotgun" ? 8 : 1;
    const spread = this.spreadOf(g);
    const speed = this.muzzleOf(g);
    for (let i = 0; i < pellets; i++) {
      let dx = fx + (Math.random() - 0.5) * spread;
      let dy = fy + (Math.random() - 0.5) * spread;
      let dz = fz + (Math.random() - 0.5) * spread;
      const len = Math.hypot(dx, dy, dz) || 1;
      dx /= len;
      dy /= len;
      dz /= len;
      const b = this.allocBullet();
      b.on = true;
      b.x = this.x + dx * 0.4;
      b.y = this.y + this.eye + dy * 0.4;
      b.z = this.z + dz * 0.4;
      b.vx = dx * speed + this.windX;
      b.vy = dy * speed;
      b.vz = dz * speed + this.windZ;
      b.energy = 1;
      b.dmg = g.id === "rifle" ? 33 : 10;
      b.pen = g.id === "rifle" ? 1.12 : 0.36;
      b.life = 1.15;
      b.pens = 0;
      b.skipZ = -1;
      b.skipC = -1;
    }
    const kick = this.recoilOf(g);
    this.recoilP += kick;
    this.recoilY += kick * (Math.random() - 0.5) * 0.85;
    this.kick = Math.min(1.2, this.kick + (g.id === "rifle" ? 0.55 : 1));
    this.shake += g.id === "rifle" ? 0.12 : 0.28;
    if (!this.reduce) this.shake *= 1;
    this.flashT = 1;
    this.muzzle.position.set(this.x + fx * 0.8, this.y + this.eye + fy * 0.5, this.z + fz * 0.8);
    this.audio.gun(g.id);
    this.noisePulse = 0.45;
    this.alert = 0.55;
    this.burst(this.x + this.rx * 0.2, this.y + this.eye - 0.05, this.z + this.rz * 0.2, 0xd8c39a, 2, 2);
  }

  private spreadOf(g: Gun) {
    let s = g.id === "rifle" ? 0.011 : 0.07;
    s *= [1, 0.74, 0.5][g.mods.sight];
    s *= [1.16, 1, 0.88][g.mods.barrel];
    s *= 1 + g.dirt * 0.85 + g.heat * 0.28;
    s *= 1 - this.adsV * 0.58;
    if (this.crouch) s *= 0.82;
    if (!this.grounded) s *= 1.65;
    if (this.slideT > 0) s *= 1.7;
    s *= 1 + Math.hypot(this.vx, this.vz) * 0.032;
    return s;
  }
  private recoilOf(g: Gun) {
    let r = g.id === "rifle" ? 0.018 : 0.046;
    r *= [1.28, 1, 0.66][g.mods.stock];
    r *= [0.82, 1, 1.16][g.mods.barrel];
    r *= 1 - this.ranks.grip * 0.14;
    r *= 1 - this.adsV * 0.32;
    return r;
  }
  private muzzleOf(g: Gun) {
    return (g.id === "rifle" ? 78 : 60) * [0.84, 1, 1.18][g.mods.barrel];
  }
  private magMax(g: Gun) {
    return Math.max(1, Math.round((g.id === "rifle" ? 30 : 6) * [0.6, 1, 1.8][g.mods.mag]));
  }
  private gunKg(g: Gun) {
    let kg = g.id === "rifle" ? 3.4 : 3.75;
    kg += [0, 0.16, 0.4][g.mods.sight];
    kg += [-0.32, 0, 0.58][g.mods.barrel];
    kg += [-0.28, 0, 0.36][g.mods.stock];
    kg += [-0.2, 0, 0.82][g.mods.mag];
    return Math.max(1.6, kg);
  }

  private tryReload() {
    const g = this.guns[this.gunI];
    if (this.reloadT > 0 || this.swapT > 0) return;
    if (g.jammed && g.mag > 0) {
      this.rackT = 0.46;
      g.jammed = false;
      this.audio.mech();
      this.say("Cierre montado.", 0.8);
      return;
    }
    if (g.mag >= this.magMax(g)) return;
    if (g.reserve <= 0) {
      this.audio.dry();
      this.say("Sin reserva.", 1);
      return;
    }
    this.reloadEmpty = g.mag === 0;
    const base = g.id === "rifle" ? (this.reloadEmpty ? 2.05 : 1.28) : this.reloadEmpty ? 2.4 : 1.8;
    this.reloadDurT = base * [0.84, 1, 1.3][g.mods.mag];
    this.reloadT = this.reloadDurT;
    this.audio.mech();
  }
  private finishReload(g: Gun) {
    const need = this.magMax(g) - g.mag;
    const take = Math.min(need, g.reserve);
    g.reserve -= take;
    g.mag += take;
    g.jammed = false;
    this.showMagT = 0.9;
    this.audio.mech();
  }

  private allocBullet() {
    for (const b of this.bullets) if (!b.on) return b;
    return this.bullets[0];
  }

  private fly(b: Bullet, dt: number) {
    b.life -= dt;
    if (b.life <= 0) {
      b.on = false;
      return;
    }
    b.vy -= 11 * dt;
    let left = dt;
    for (let guard = 0; guard < 4 && b.on && left > 1e-4; guard++) {
      const nx = b.x + b.vx * left;
      const ny = b.y + b.vy * left;
      const nz = b.z + b.vz * left;
      let bestT = 1.01;
      let zi = -1;
      let ci = -1;
      let hitY = 0;
      for (let i = 0; i < this.zeds.length; i++) {
        const z = this.zeds[i];
        if (!z.alive || i === b.skipZ) continue;
        const h = 1.5 * z.scale;
        const r = (z.kind === "tank" ? 0.46 : 0.32) * z.scale;
        const hit = this.segSeg(b.x, b.y, b.z, nx, ny, nz, z.x, z.y + 0.25, z.z, z.x, z.y + h, z.z);
        if (hit.distSq <= r * r && hit.sc >= 0 && hit.sc < bestT) {
          bestT = hit.sc;
          zi = i;
          ci = -1;
          hitY = hit.hy;
        }
      }
      for (let i = 0; i < this.cols.length; i++) {
        const c = this.cols[i];
        if (!c.active || i === b.skipC) continue;
        const t = this.segBox(b.x, b.y, b.z, nx, ny, nz, c);
        if (t !== null && t >= 0 && t < bestT) {
          bestT = t;
          ci = i;
          zi = -1;
        }
      }
      if (zi < 0 && ci < 0) {
        b.x = nx;
        b.y = ny;
        b.z = nz;
        return;
      }
      b.x = b.x + (nx - b.x) * bestT;
      b.y = b.y + (ny - b.y) * bestT;
      b.z = b.z + (nz - b.z) * bestT;
      left *= 1 - bestT;
      const sp = Math.hypot(b.vx, b.vy, b.vz) || 1;
      if (zi >= 0) {
        this.hitZed(b, zi, hitY);
        b.skipZ = zi;
        b.x += (b.vx / sp) * 0.15;
        b.y += (b.vy / sp) * 0.15;
        b.z += (b.vz / sp) * 0.15;
      } else {
        const stopped = this.hitCol(b, this.cols[ci]);
        if (stopped) {
          b.on = false;
          return;
        }
        b.skipC = ci;
        b.x += (b.vx / sp) * 0.1;
        b.y += (b.vy / sp) * 0.1;
        b.z += (b.vz / sp) * 0.1;
      }
    }
  }

  private hitZed(b: Bullet, i: number, hy: number) {
    const z = this.zeds[i];
    const local = (hy - z.y) / z.scale;
    const zone = local > 1.42 ? "head" : local < 0.7 ? "leg" : "torso";
    let dmg = b.dmg * b.energy;
    if (zone === "head") dmg *= 2.15 + this.ranks.surgeon * 0.4;
    if (zone === "leg") {
      dmg *= 0.72;
      z.leg -= dmg;
    }
    z.hp -= dmg;
    z.blood = Math.min(1, z.blood + (zone === "head" ? 0.45 : 0.2));
    z.flash = 1;
    z.aware = true;
    z.calm = 0;
    const sp = Math.hypot(b.vx, b.vz) || 1;
    const kick = zone === "head" ? 3.4 : 1.5;
    z.vx += (b.vx / sp) * kick;
    z.vz += (b.vz / sp) * kick;
    if (zone === "head") z.stumble = Math.max(z.stumble, 0.32);
    this.hitMark = 1;
    this.headHit = zone === "head";
    if (zone === "head") this.hitstop = 0.028;
    this.audio.impact("flesh", z.x, hy, z.z);
    this.burst(z.x, hy, z.z, 0x6a1612, zone === "head" ? 10 : 6, 3.2);
    if (z.hp <= 0) this.killZed(z, zone);
    const flesh = 0.55;
    if (b.pen * b.energy > flesh && b.pens < 2) {
      b.energy *= 1 - flesh / (b.pen + 0.25);
      b.pens += 1;
      if (b.energy < 0.16) b.on = false;
    } else b.on = false;
  }

  private killZed(z: Zed, zone: string) {
    z.alive = false;
    z.deadT = 0;
    z.vx = 0;
    z.vz = 0;
    const pay = z.kind === "tank" ? 8 : z.kind === "stalker" ? 5 : 2;
    this.scrap += pay + (zone === "head" ? 2 : 0);
    this.kills += 1;
  }

  private hitCol(b: Bullet, c: Col) {
    const op = this.openingByCol(c);
    if (c.mat === "glass") this.burst(b.x, b.y, b.z, 0xd5eef2, 10, 4);
    else if (c.mat === "wood" || c.mat === "plank") this.burst(b.x, b.y, b.z, 0x8a5a32, 7, 3);
    else if (c.mat === "metal") this.burst(b.x, b.y, b.z, 0xffe1a8, 5, 3.5);
    else this.burst(b.x, b.y, b.z, 0xb0aa9e, 6, 2.4);
    this.audio.impact(c.mat, b.x, b.y, b.z);
    if (c.mat !== "glass") this.decal(b.x, b.y, b.z);
    if (op && c.mat === "glass") {
      op.glassHp = 0;
      this.syncOpening(op);
      this.say("El cristal cede.", 1.2);
    }
    if (op && c.mat === "plank") {
      op.hp -= b.dmg * 0.07 * b.energy;
      if (op.hp <= 0) {
        op.hp = 0;
        this.say("La barricada se astilla.", 1.3);
      }
      this.syncOpening(op);
    }
    if (b.pen * b.energy > c.hard && b.pens < 3 && c.mat !== "metal" && c.mat !== "concrete" && c.mat !== "brick") {
      b.energy *= Math.max(0.08, 1 - c.hard / (b.pen + 0.2));
      b.pens += 1;
      return b.energy < 0.15;
    }
    return true;
  }

  private openingByCol(c: Col) {
    for (const o of this.openings) if (o.plankCol === c || o.glassCol === c) return o;
    return null;
  }

  private simZeds(dt: number) {
    if (this.phase === "wave" && this.spawned < this.quota) {
      this.spawnT -= dt;
      if (this.spawnT <= 0 && this.aliveCount() < (this.night ? 18 : 14)) {
        this.spawnT = Math.max(0.4, 0.92 - this.wave * 0.05);
        this.spawnOne(this.spawnQ[this.spawned]);
        this.spawned += 1;
      }
    }
    this.flowT -= dt;
    if (this.flowT <= 0) {
      this.buildFlow();
      this.flowT = 0.32;
    }
    const hear = this.hearRadius();
    for (const z of this.zeds) {
      if (!z.alive) {
        z.deadT += dt;
        z.flash = Math.max(0, z.flash - dt * 3);
        continue;
      }
      z.flash = Math.max(0, z.flash - dt * 4);
      z.phase += Math.hypot(z.vx, z.vz) * dt * 2.4;
      const dx = this.x - z.x;
      const dz = this.z - z.z;
      const distP = Math.hypot(dx, dz) || 0.001;
      let sense = hear;
      if (z.kind === "stalker" && this.foggy) sense *= 1.55;
      else if (this.foggy) sense *= 0.72;
      if (this.alert > 0) sense = Math.max(sense, this.raining ? 36 : 64);
      if (distP < sense) {
        z.aware = true;
        z.calm = 0;
      } else z.calm += dt;
      const lose = this.night ? 12 : this.raining ? 3.2 : 6.5;
      if (z.calm > lose && distP > 7) z.aware = false;
      let dirx = 0;
      let dirz = 0;
      if (z.aware) {
        const id = this.idx(z.x, z.z);
        if (id >= 0) {
          dirx = this.flowX[id];
          dirz = this.flowZ[id];
        }
        if (dirx === 0 && dirz === 0) {
          dirx = dx;
          dirz = dz;
        }
        if (z.kind === "runner") {
          const side = z.seed % 2 === 0 ? 1 : -1;
          dirx += (-dz / distP) * side * 0.95;
          dirz += (dx / distP) * side * 0.95;
        } else if (z.kind === "stalker") {
          const behind = this.fx * (z.x - this.x) + this.fz * (z.z - this.z) < -0.8;
          if (!behind && distP > 3) {
            const side = z.seed % 2 === 0 ? 1 : -1;
            dirx += (-dz / distP) * side * 1.35;
            dirz += (dx / distP) * side * 1.35;
          }
        }
      } else {
        z.wanderT -= dt;
        if (z.wanderT <= 0) {
          z.wanderT = 2.5 + (z.seed % 5) * 0.4;
          z.wanderX = z.x + Math.sin(z.seed + z.phase) * 4;
          z.wanderZ = z.z + Math.cos(z.seed * 1.3 + z.phase) * 4;
        }
        dirx = z.wanderX - z.x;
        dirz = z.wanderZ - z.z;
      }
      let len = Math.hypot(dirx, dirz);
      if (len > 0.001) {
        dirx /= len;
        dirz /= len;
      }
      for (const o of this.zeds) {
        if (!o.alive || o === z) continue;
        const sx = z.x - o.x;
        const sz = z.z - o.z;
        const sd = Math.hypot(sx, sz);
        const min = z.kind === "tank" || o.kind === "tank" ? 0.85 : 0.62;
        if (sd > 0.001 && sd < min) {
          dirx += (sx / sd) * 0.9;
          dirz += (sz / sd) * 0.9;
        }
      }
      len = Math.hypot(dirx, dirz);
      if (len > 0.001) {
        dirx /= len;
        dirz /= len;
      }
      const op = this.shutOpeningNear(z.x, z.z, 1.45);
      const attacking = op && this.openingBetween(op, z.x, z.z);
      if (attacking && op) {
        z.atk -= dt;
        if (z.atk <= 0) {
          z.atk = z.kind === "tank" ? 0.82 : 1.15;
          if (op.hp > 0) op.hp -= z.kind === "tank" ? 16 : z.kind === "runner" ? 5 : 6;
          else if (op.glassHp > 0) op.glassHp = 0;
          if (op.hp < 0) op.hp = 0;
          this.syncOpening(op);
          this.audio.impact(op.hp > 0 ? "wood" : "glass", op.x, 1.2, op.z);
          if (op.hp === 0 && op.glassHp === 0) this.say("Entraron por una abertura.", 1.4);
        }
        const crowd = this.crowd(op);
        if (op.hp > 0 && op.hp < op.maxHp * 0.38 && (crowd >= 3 || z.kind === "tank") && z.climb >= 0) {
          z.climb += dt;
          z.y = Math.sin(Math.min(1, z.climb / 1.3) * Math.PI) * 1.15;
          if (z.climb >= 1.3) {
            const signZ = Math.sign(this.z - z.z) || 1;
            const signX = Math.sign(this.x - z.x) || 1;
            if (op.axis === "z") z.z = op.z + signZ * 1.2;
            else z.x = op.x + signX * 1.2;
            z.y = 0.2;
            z.climb = -3.5;
            z.stumble = 0.25;
          }
        }
        z.vx *= Math.exp(-6 * dt);
        z.vz *= Math.exp(-6 * dt);
      } else {
        if (z.climb < 0) z.climb = Math.min(0, z.climb + dt);
        else z.climb = 0;
        z.y = approach(z.y, 0, dt * 5);
        let sp = KIND[z.kind].speed * (z.aware ? 1 : 0.45);
        if (z.leg < z.legMax * 0.45) sp *= 0.62;
        if (this.night) sp *= z.kind === "stalker" ? 1.34 : 1.2;
        if (this.foggy && z.kind === "stalker") sp *= 1.12;
        if (z.stumble > 0) {
          z.stumble -= dt;
          sp *= 0.15;
        }
        for (const c of this.zeds) {
          if (c.alive || c.deadT > 7) continue;
          if (Math.hypot(c.x - z.x, c.z - z.z) < 0.7 && Math.random() < dt * 1.4) z.stumble = 0.42;
        }
        z.vx = approach(z.vx, dirx * sp, dt * (z.kind === "tank" ? 4 : 10));
        z.vz = approach(z.vz, dirz * sp, dt * (z.kind === "tank" ? 4 : 10));
        z.x += z.vx * dt;
        z.z += z.vz * dt;
        const rad = z.kind === "tank" ? 0.46 : 0.32;
        const p = this.collide(z.x, z.z, rad);
        z.x = p.x;
        z.z = p.z;
        z.x = clamp(z.x, -25, 25);
        z.z = clamp(z.z, -29, 21);
        if (distP < KIND[z.kind].reach && z.aware && this.lineClear(z.x, 1.2, z.z)) {
          z.atk -= dt;
          if (z.atk <= 0) {
            z.atk = 0.95;
            this.hurtPlayer(KIND[z.kind].dmg, z.x, z.z);
          }
        }
      }
      if (Math.hypot(z.vx, z.vz) > 0.3) {
        const target = Math.atan2(-z.vx, -z.vz);
        z.yaw += angNorm(target - z.yaw) * Math.min(1, dt * 8);
      }
      z.stepT -= dt;
      if (z.stepT <= 0 && Math.hypot(z.vx, z.vz) > 0.4) {
        z.stepT = z.kind === "runner" ? 0.28 : 0.48;
        if (distP < 22) this.audio.step(z.x, 0.1, z.z, this.occluded(z.x, 1, z.z), z.kind === "tank" ? 0.55 : 0.32);
      }
      z.groanT -= dt;
      if (z.groanT <= 0 && distP < 30) {
        z.groanT = (z.kind === "stalker" ? 3.4 : 1.8) + Math.random() * 2.2;
        this.audio.groan(z.kind, z.x, 1.4, z.z, this.occluded(z.x, 1.4, z.z));
      }
    }
  }

  private hearRadius() {
    let noise = 0.05;
    const sp = Math.hypot(this.vx, this.vz);
    if (this.slideT > 0) noise = 0.6;
    else if (this.sprinting) noise = 1;
    else if (sp > 0.35 && this.crouch) noise = 0.16;
    else if (sp > 0.35) noise = 0.42;
    else if (this.crouch) noise = 0.04;
    if (this.noisePulse > 0) noise = 1.6;
    let r = 4.5 + noise * 16;
    if (this.raining) r *= 0.58;
    if (this.night) r *= 1.28;
    return r;
  }

  private hurtPlayer(amount: number, fromX: number, fromZ: number) {
    if (this.iframe > 0 || this.phase !== "wave" || this.hp <= 0) return;
    this.hp -= amount;
    this.iframe = 0.42;
    this.hurtFlash = 1;
    this.hurtSide = (fromX - this.x) * this.rx + (fromZ - this.z) * this.rz;
    const len = Math.hypot(fromX - this.x, fromZ - this.z) || 1;
    this.vx -= ((fromX - this.x) / len) * 3;
    this.vz -= ((fromZ - this.z) / len) * 3;
    this.shake += 0.45;
    this.audio.impact("flesh", this.x, this.eye, this.z);
    if (this.hp <= 0) this.die();
  }

  private die() {
    this.hp = 0;
    this.phase = "dead";
    this.best = Math.max(this.best, this.wave);
    this.save();
    if (document.exitPointerLock) document.exitPointerLock();
    this.say("Te quedaste en el bloque.", 3);
  }

  private collectWave() {
    if (this.phase !== "wave") return;
    if (this.spawned < this.quota) return;
    if (this.aliveCount() > 0) return;
    this.best = Math.max(this.best, this.wave);
    this.scrap += 18 + this.wave * 10;
    this.wood += 2;
    this.skills += 1;
    this.say(`Oleada ${this.wave} cerrada. Intendencia abierta.`, 3);
    this.wave += 1;
    this.phase = "prep";
    this.quota = 0;
    this.spawned = 0;
    this.save();
  }

  private spawnOne(kind: Kind) {
    const spot = this.pickSpawn(kind);
    let slot = this.zeds.find((z) => !z.alive && z.deadT > 8);
    if (!slot) slot = this.zeds.find((z) => !z.alive);
    if (!slot) return;
    const s = KIND[kind];
    slot.alive = true;
    slot.kind = kind;
    slot.x = spot.x;
    slot.y = 0;
    slot.z = spot.z;
    slot.vx = 0;
    slot.vz = 0;
    slot.yaw = 0;
    slot.hp = s.hp;
    slot.maxHp = s.hp;
    slot.legMax = s.hp * 0.55;
    slot.leg = slot.legMax;
    slot.scale = s.scale;
    slot.phase = Math.random() * 6;
    slot.aware = kind !== "stalker";
    slot.calm = 0;
    slot.atk = 0.6;
    slot.stumble = 0;
    slot.climb = 0;
    slot.flash = 0;
    slot.blood = 0;
    slot.deadT = 0;
    slot.groanT = Math.random() * 1.5;
    slot.stepT = Math.random();
    slot.wanderT = 1;
    slot.shirt.set(SHIRT[kind]);
    slot.skin.set(SKIN[kind]);
  }

  private pickSpawn(kind: Kind) {
    const apt = [
      { x: 0, z: -15 },
      { x: -5, z: -16.5 },
      { x: 5.2, z: -14.5 },
      { x: -2, z: -19 },
      { x: 3, z: -18 },
      { x: 0, z: -12.2 },
    ];
    const edge = [
      { x: -20, z: 12 },
      { x: -21, z: -20 },
      { x: 20, z: 14 },
      { x: 21, z: -18 },
      { x: 0, z: -26 },
      { x: 18.5, z: 1 },
      { x: 19, z: -4 },
      { x: 8, z: 16 },
      { x: -8, z: 16 },
    ];
    const pool = this.wave === 1 || kind === "walker" && this.wave < 3 ? apt : edge;
    let best = pool[0];
    let bestD = -1;
    for (let n = 0; n < pool.length; n++) {
      const p = pool[(n + this.spawned) % pool.length];
      const d = Math.hypot(p.x - this.x, p.z - this.z);
      const id = this.idx(p.x, p.z);
      if (id >= 0 && this.blocked[id]) continue;
      if (d > bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  private aliveCount() {
    let n = 0;
    for (const z of this.zeds) if (z.alive) n++;
    return n;
  }

  private idx(x: number, z: number) {
    const i = Math.floor((x - OX) / CELL);
    const j = Math.floor((z - OZ) / CELL);
    if (i < 0 || j < 0 || i >= GW || j >= GH) return -1;
    return j * GW + i;
  }

  private rebuildBlocked() {
    this.blocked.fill(0);
    for (const c of this.cols) {
      if (!c.active || c.dyn) continue;
      if (c.maxY < 0.55 || c.minY > 1.2) continue;
      for (let x = c.minX; x <= c.maxX; x += 0.7) {
        for (let z = c.minZ; z <= c.maxZ; z += 0.7) {
          const id = this.idx(x, z);
          if (id >= 0) this.blocked[id] = 1;
        }
      }
      const id = this.idx(c.maxX, c.maxZ);
      if (id >= 0) this.blocked[id] = 1;
    }
    for (const o of this.openings) {
      const shut = o.hp > 0 || o.glassHp > 0 || (o.locked && !this.unlocked);
      if (!shut) continue;
      for (const id of o.cells) this.blocked[id] = 1;
    }
  }

  private buildFlow() {
    this.dist.fill(-1);
    this.flowX.fill(0);
    this.flowZ.fill(0);
    let ix = clamp(Math.floor((this.x - OX) / CELL), 0, GW - 1);
    let iz = clamp(Math.floor((this.z - OZ) / CELL), 0, GH - 1);
    let start = iz * GW + ix;
    if (this.blocked[start]) {
      let found = false;
      for (let r = 1; r < 8 && !found; r++) {
        for (let dz = -r; dz <= r && !found; dz++) {
          for (let dx = -r; dx <= r; dx++) {
            const a = ix + dx;
            const b = iz + dz;
            if (a < 0 || b < 0 || a >= GW || b >= GH) continue;
            if (!this.blocked[b * GW + a]) {
              start = b * GW + a;
              found = true;
              break;
            }
          }
        }
      }
    }
    const q = this.queue;
    let qh = 0;
    let qt = 0;
    q[qt++] = start;
    this.dist[start] = 0;
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    while (qh < qt) {
      const cur = q[qh++];
      const cx = cur % GW;
      const cz = (cur / GW) | 0;
      const cd = this.dist[cur];
      for (const [dx, dz] of dirs) {
        const nx = cx + dx;
        const nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= GW || nz >= GH) continue;
        const ni = nz * GW + nx;
        if (this.blocked[ni] || this.dist[ni] !== -1) continue;
        this.dist[ni] = cd + 1;
        this.flowX[ni] = -dx;
        this.flowZ[ni] = -dz;
        q[qt++] = ni;
      }
    }
  }

  private shutOpeningNear(x: number, z: number, reach: number) {
    let best: Opening | null = null;
    let bestD = reach;
    for (const o of this.openings) {
      const shut = o.hp > 0 || o.glassHp > 0 || (o.locked && !this.unlocked);
      if (!shut) continue;
      const d = Math.hypot(o.x - x, o.z - z);
      if (d < bestD) {
        best = o;
        bestD = d;
      }
    }
    return best;
  }

  private openingBetween(o: Opening, zx: number, zz: number) {
    if (o.axis === "z") {
      return Math.sign(zz - o.z) !== Math.sign(this.z - o.z) && Math.abs(zx - o.x) < o.halfW + 1;
    }
    return Math.sign(zx - o.x) !== Math.sign(this.x - o.x) && Math.abs(zz - o.z) < o.halfW + 1;
  }

  private crowd(o: Opening) {
    let n = 0;
    for (const z of this.zeds) if (z.alive && Math.hypot(z.x - o.x, z.z - o.z) < 2.3) n++;
    return n;
  }

  private lineClear(x: number, y: number, z: number) {
    const ax = x;
    const ay = y;
    const az = z;
    const bx = this.x;
    const by = this.y + this.eye * 0.85;
    const bz = this.z;
    for (const c of this.cols) {
      if (!c.active) continue;
      const t = this.segBox(ax, ay, az, bx, by, bz, c);
      if (t !== null && t > 0.05 && t < 0.95) return false;
    }
    return true;
  }

  private occluded(x: number, y: number, z: number) {
    return !this.lineClear(x, y, z);
  }

  private segBox(ax: number, ay: number, az: number, bx: number, by: number, bz: number, c: Col) {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    let tmin = 0;
    let tmax = 1;
    const o = [ax, ay, az];
    const d = [dx, dy, dz];
    const mn = [c.minX, c.minY, c.minZ];
    const mx = [c.maxX, c.maxY, c.maxZ];
    for (let i = 0; i < 3; i++) {
      if (Math.abs(d[i]) < 1e-8) {
        if (o[i] < mn[i] || o[i] > mx[i]) return null;
      } else {
        let t1 = (mn[i] - o[i]) / d[i];
        let t2 = (mx[i] - o[i]) / d[i];
        if (t1 > t2) {
          const s = t1;
          t1 = t2;
          t2 = s;
        }
        if (t1 > tmin) tmin = t1;
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) return null;
      }
    }
    if (tmin >= 0 && tmin <= 1) return tmin;
    return null;
  }

  private segSeg(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    cx: number,
    cy: number,
    cz: number,
    dx: number,
    dy: number,
    dz: number,
  ) {
    const ux = bx - ax;
    const uy = by - ay;
    const uz = bz - az;
    const vx = dx - cx;
    const vy = dy - cy;
    const vz = dz - cz;
    const wx = ax - cx;
    const wy = ay - cy;
    const wz = az - cz;
    const a = ux * ux + uy * uy + uz * uz;
    const b = ux * vx + uy * vy + uz * vz;
    const c = vx * vx + vy * vy + vz * vz;
    const d = ux * wx + uy * wy + uz * wz;
    const e = vx * wx + vy * wy + vz * wz;
    const D = a * c - b * b;
    let sn: number;
    let sd: number;
    let tn: number;
    let td: number;
    if (D < 1e-6) {
      sn = 0;
      sd = 1;
      tn = e;
      td = c;
    } else {
      sn = b * e - c * d;
      tn = a * e - b * d;
      sd = D;
      td = D;
      if (sn < 0) {
        sn = 0;
        tn = e;
        td = c;
      } else if (sn > sd) {
        sn = sd;
        tn = e + b;
        td = c;
      }
    }
    if (tn < 0) {
      tn = 0;
      if (-d < 0) sn = 0;
      else if (-d > a) sn = sd;
      else {
        sn = -d;
        sd = a;
      }
    } else if (tn > td) {
      tn = td;
      if (-d + b < 0) sn = 0;
      else if (-d + b > a) sn = sd;
      else {
        sn = -d + b;
        sd = a;
      }
    }
    const sc = Math.abs(sd) < 1e-8 ? 0 : sn / sd;
    const tc = Math.abs(td) < 1e-8 ? 0 : tn / td;
    const px = ax + sc * ux;
    const py = ay + sc * uy;
    const pz = az + sc * uz;
    const qx = cx + tc * vx;
    const qy = cy + tc * vy;
    const qz = cz + tc * vz;
    const ex = px - qx;
    const ey = py - qy;
    const ez = pz - qz;
    return { distSq: ex * ex + ey * ey + ez * ez, sc, hy: qy };
  }

  private simPickups() {
    for (const p of this.pickups) {
      if (!p.on) continue;
      if (p.needUnlock && !this.unlocked) continue;
      if (Math.hypot(p.x - this.x, p.z - this.z) > 1.15) continue;
      p.on = false;
      if (p.kind === "bandage") {
        this.hp = Math.min(100, this.hp + p.amount);
        this.say("Venda del botiquín.", 1.3);
      } else if (p.kind === "rifle") {
        this.guns[0].reserve += p.amount;
        this.say("Munición de fusil.", 1.3);
      } else if (p.kind === "shot") {
        this.guns[1].reserve += p.amount;
        this.say("Cartuchos.", 1.3);
      } else if (p.kind === "wood") {
        this.wood += p.amount;
        this.say("Tablas.", 1.2);
      } else {
        this.scrap += p.amount;
        this.say("Chatarra.", 1.2);
      }
      this.audio.mech();
    }
  }

  private simBody(dt: number) {
    if (this.hp < 28 && this.hp > 0 && this.phase === "wave") {
      this.hp -= 1.05 * dt;
      if (this.hp <= 0) this.die();
    }
    const indoor = this.isIndoor();
    let freq = 17000;
    if (this.raining) freq = 2100;
    if (indoor && this.raining) freq = 880;
    else if (indoor) freq = 6400;
    if (this.foggy) freq = Math.min(freq, 4800);
    this.audio.setMuffle(freq);
    this.audio.setRain(this.raining ? (indoor ? 0.07 : 0.2) : 0);
    this.heartT -= dt;
    if (this.hp < 58 && this.heartT <= 0) {
      this.audio.heart();
      this.heartT = 0.38 + this.hp / 90;
    }
    this.breathT -= dt;
    if ((this.stamina < 32 || this.sprinting) && this.breathT <= 0) {
      this.audio.breath();
      this.breathT = this.sprinting ? 0.55 : 0.85;
    }
  }

  private isIndoor() {
    const apt = this.x > -11.7 && this.x < 11.7 && this.z < -8.35 && this.z > -21.7;
    const cli = this.x > 14.35 && this.x < 22.7 && this.z > -7.7 && this.z < 5.7;
    const wh = this.unlocked && this.x < -14.35 && this.x > -23.7 && this.z > -11.7 && this.z < 3.7;
    return apt || cli || wh;
  }

  private interact() {
    const tx = -5;
    const tz = 5.2;
    const td = Math.hypot(this.x - tx, this.z - tz);
    const faceT = this.fx * (tx - this.x) + this.fz * (tz - this.z);
    if (td < 2.4 && faceT > 0) {
      if (this.phase === "prep") {
        this.shop = true;
        if (document.exitPointerLock) document.exitPointerLock();
      } else this.say("Intendencia cerrada hasta que caiga la oleada.", 1.6);
      return;
    }
    let best: Opening | null = null;
    let bestD = 2.5;
    for (const o of this.openings) {
      const d = Math.hypot(this.x - o.x, this.z - o.z);
      if (d >= bestD) continue;
      const f = this.fx * (o.x - this.x) + this.fz * (o.z - this.z);
      if (f > 0.15) {
        best = o;
        bestD = d;
      }
    }
    if (!best) {
      this.say("Nada que fortificar delante.", 1);
      return;
    }
    if (best.locked && !this.unlocked) {
      this.say("El portón del almacén sigue cerrado.", 1.4);
      return;
    }
    if (best.hp >= best.maxHp) {
      this.say("Ya no admite más tablas.", 1.1);
      return;
    }
    if (this.wood <= 0) {
      this.say("Sin madera.", 1);
      return;
    }
    this.wood -= 1;
    best.hp = Math.min(best.maxHp, best.hp + 60);
    this.syncOpening(best);
    this.say("Barricada reforzada.", 1);
    this.audio.mech();
  }

  private syncOpening(o: Opening) {
    o.hp = Math.max(0, Math.min(o.maxHp, o.hp));
    o.planks.children.forEach((child, i) => {
      child.visible = o.hp > i * 60;
    });
    if (o.glassMesh) o.glassMesh.visible = o.glassHp > 0;
    o.plankCol.active = o.hp > 0;
    if (o.glassCol) o.glassCol.active = o.glassHp > 0;
    this.blocksDirty = true;
  }

  private swapTo(i: number) {
    if (this.gunI === i || this.swapT > 0) return;
    this.gunI = i;
    this.swapT = 0.32;
    this.reloadT = 0;
    this.audio.mech();
  }

  private plan(n: number) {
    return {
      walker: 4 + n * 3,
      runner: n >= 2 ? n : 0,
      tank: n >= 4 ? 1 + Math.floor((n - 4) / 2) : 0,
      stalker: n >= 3 ? 1 + Math.floor((n - 3) / 2) : 0,
    };
  }

  private applyClimate(wave: number) {
    this.raining = wave === 2 || wave >= 4;
    this.foggy = wave === 3 || wave >= 5;
    this.night = wave >= 4;
    this.tod = wave <= 1 ? 0.73 : wave === 2 ? 0.81 : wave === 3 ? 0.9 : 0.98;
  }

  private forecast(n: number) {
    if (n <= 1) return "Anochece. Cierra la vivienda antes de llamarlos.";
    if (n === 2) return "Va a llover. El oído se acorta y el viento miente.";
    if (n === 3) return "Niebla. Un acechador no hace ruido hasta que está detrás.";
    return "Noche cerrada. Corren, trepan y no sueltan el rastro.";
  }

  private say(text: string, time: number) {
    this.toast = text;
    this.toastT = time;
  }

  private reset() {
    this.shop = false;
    this.wave = 1;
    this.x = 0;
    this.y = 0;
    this.z = 2;
    this.vx = 0;
    this.vz = 0;
    this.vy = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.eye = 1.62;
    this.grounded = true;
    this.hp = 100;
    this.stamina = 100;
    this.iframe = 0;
    this.crouch = false;
    this.crouchToggle = false;
    this.slideT = 0;
    this.vaultT = 0;
    this.scrap = 22;
    this.wood = 6;
    this.skills = 0;
    this.ranks = { lungs: 0, grip: 0, surgeon: 0 };
    this.kills = 0;
    this.gunI = 0;
    this.guns = [
      { id: "rifle", mag: 30, reserve: 90, heat: 0, dirt: 0.04, jammed: false, mods: { sight: 0, barrel: 1, stock: 1, mag: 1 } },
      { id: "shotgun", mag: 6, reserve: 16, heat: 0, dirt: 0.02, jammed: false, mods: { sight: 0, barrel: 1, stock: 1, mag: 1 } },
    ];
    this.unlocked = false;
    this.raining = false;
    this.foggy = false;
    this.night = false;
    this.tod = 0.73;
    this.spawnQ = [];
    this.spawned = 0;
    this.quota = 0;
    this.recoilP = 0;
    this.recoilY = 0;
    this.kick = 0;
    this.adsV = 0;
    this.swapT = 0;
    this.reloadT = 0;
    this.hurtFlash = 0;
    this.hitMark = 0;
    this.cleanT = 0;
    this.diaryLatch = false;
    for (const b of this.bullets) b.on = false;
    for (const z of this.zeds) {
      z.alive = false;
      z.deadT = 99;
    }
    for (const o of this.openings) {
      o.hp = 0;
      o.glassHp = o.glass ? 1 : 0;
      o.locked = o.id === "wh-gate";
      this.syncOpening(o);
    }
    if (this.gateCol) this.gateCol.active = true;
    for (const m of this.gateMeshes) m.visible = true;
    for (const p of this.pickups) p.on = !p.needUnlock;
    this.blocksDirty = true;
    this.rebuildBlocked();
  }

  private render(dt: number) {
    this.paintSky();
    const night = smoothstep(0.84, 0.98, this.tod);
    const rainDim = this.raining ? 0.72 : 1;
    this.renderer.toneMappingExposure = lerp(1.05, 0.58, night) * (this.raining ? 0.86 : 1);
    this.sun.intensity = lerp(2.5, 0.08, night) * (this.raining ? 0.45 : 1);
    this.sun.color.copy(this.cMid);
    this.hemi.color.copy(this.cTop);
    this.hemi.groundColor.copy(this.cBot);
    this.hemi.intensity = lerp(0.5, 0.16, night);
    const lampI = lerp(3.2, 14, Math.max(night, 0.25)) * rainDim;
    for (const l of this.lamps) l.intensity = lampI;
    this.interiors[0].intensity = 5.5;
    this.interiors[1].intensity = 4;
    this.interiors[2].intensity = this.unlocked ? 7 : 1.4;
    this.fog.color.copy(this.cMid).lerp(this.cBot, 0.55);
    let density = 0.012 + night * 0.01;
    if (this.foggy) density = 0.04;
    if (this.raining) density += 0.008;
    if (this.isIndoor() && this.phase !== "menu") density *= 0.45;
    if (this.phase === "menu") density = 0.018;
    this.fog.density = density;
    if (this.groundMat) {
      this.groundMat.roughness = this.raining ? 0.28 : 0.94;
      this.groundMat.color.set(this.raining ? "#3a3c3a" : "#ffffff");
    }
    for (const p of this.puddles) {
      const mat = p.material as THREE.MeshBasicMaterial;
      mat.opacity = this.raining ? 0.45 : 0.05;
    }
    if (this.windsock) {
      this.windsock.rotation.y = Math.atan2(this.windX, this.windZ);
      this.windsock.rotation.z = Math.sin(performance.now() * 0.004) * 0.2 * (this.raining ? 1 : 0.3);
    }
    this.flashT = Math.max(0, this.flashT - dt * 14);
    this.muzzle.intensity = this.flashT * 28;

    if (this.phase === "menu") {
      this.menuAng += this.reduce ? 0 : dt * 0.07;
      const rad = 15;
      this.yawPivot.position.set(Math.sin(this.menuAng) * rad, 6.2, 6 + Math.cos(this.menuAng) * 7);
      this.yawPivot.lookAt(0, 1.6, -12);
      this.camera.position.set(0, 0, 0);
      this.camera.rotation.set(0, 0, 0);
      this.camera.fov = 68;
    } else {
      const shake = this.reduce ? 0 : this.shake;
      const sx = (Math.random() - 0.5) * shake * 0.07;
      const sy = (Math.random() - 0.5) * shake * 0.07;
      this.yawPivot.position.set(this.x, this.y + this.eye, this.z);
      this.yawPivot.rotation.set(0, this.yaw + this.recoilY, 0);
      const strafe = this.vx * this.rx + this.vz * this.rz;
      const sp = Math.hypot(this.vx, this.vz);
      if (this.grounded && this.slideT <= 0 && !this.reduce) {
        this.bob += sp * dt * 1.7;
        const amp = (this.crouch ? 0.012 : 0.03) * Math.min(1, sp / 2.2) * (1 - this.adsV * 0.7);
        this.bobX = Math.cos(this.bob) * amp * 0.6;
        this.bobY = Math.sin(this.bob * 2) * amp;
      }
      const deadTilt = this.phase === "dead" ? 0.55 : 0;
      this.camera.position.set(this.bobX + sx, this.bobY + sy, 0);
      this.camera.rotation.set(this.pitch + this.recoilP + deadTilt, 0, -strafe * 0.015 + deadTilt);
      const fov = lerp(78, 56, this.adsV);
      if (Math.abs(this.camera.fov - fov) > 0.2) {
        this.camera.fov = fov;
        this.camera.updateProjectionMatrix();
      }
    }
    this.poseGun(dt);
    this.poseZeds();
    this.poseParticles(dt);
    this.posePickups();
    this.poseTracers();
    const earY = this.phase === "menu" ? this.yawPivot.position.y : this.y + this.eye;
    const earX = this.phase === "menu" ? this.yawPivot.position.x : this.x;
    const earZ = this.phase === "menu" ? this.yawPivot.position.z : this.z;
    const cp = Math.cos(this.pitch);
    let lfx = -Math.sin(this.yaw) * cp;
    let lfy = Math.sin(this.pitch);
    let lfz = -Math.cos(this.yaw) * cp;
    if (this.phase === "menu") {
      lfx = 0 - earX;
      lfy = 1.6 - earY;
      lfz = -12 - earZ;
    }
    const fl = Math.hypot(lfx, lfy, lfz) || 1;
    lfx /= fl;
    lfy /= fl;
    lfz /= fl;
    const ux = -lfy * lfx;
    const uy = 1 - lfy * lfy;
    const uz = -lfy * lfz;
    const ul = Math.hypot(ux, uy, uz) || 1;
    this.audio.setListener(earX, earY, earZ, lfx, lfy, lfz, ux / ul, uy / ul, uz / ul);

    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    if (this.phase !== "menu") {
      this.renderer.clearDepth();
      this.viewCam.fov = this.camera.fov;
      this.viewCam.aspect = this.camera.aspect;
      this.viewCam.updateProjectionMatrix();
      this.renderer.render(this.viewScene, this.viewCam);
    }
  }

  private paintSky() {
    const night = smoothstep(0.84, 0.98, this.tod);
    this.cTop.copy(this.cDuskTop).lerp(this.cNight, night);
    this.cMid.copy(this.cDuskMid).lerp(this.cRain, Math.max(this.raining ? 1 : 0, night * 0.85));
    this.cBot.copy(this.cDuskBot).lerp(this.cNight, night);
    if (this.foggy) this.cMid.lerp(this.cRain, 0.45);
    const pos = this.skyPos;
    const col = this.skyCol;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 150;
      if (y < 0.02) this.clockSky.copy(this.cBot).lerp(this.cMid, clamp((y + 0.25) / 0.27, 0, 1));
      else this.clockSky.copy(this.cMid).lerp(this.cTop, clamp(y / 0.62, 0, 1));
      col.setXYZ(i, this.clockSky.r, this.clockSky.g, this.clockSky.b);
    }
    col.needsUpdate = true;
  }

  private poseGun(_dt: number) {
    const rifleOn = this.gunI === 0;
    this.rifleG.root.visible = rifleOn;
    this.shotG.root.visible = !rifleOn;
    const rig = rifleOn ? this.rifleG : this.shotG;
    const ads = this.adsV;
    const swap = Math.sin(clamp(this.swapT / 0.32, 0, 1) * Math.PI);
    let reloadDip = 0;
    let magDrop = 0;
    let bolt = 0;
    if (this.reloadT > 0) {
      const u = 1 - this.reloadT / this.reloadDurT;
      magDrop = Math.sin(clamp(u, 0, 1) * Math.PI);
      reloadDip = magDrop * 0.16;
      if (this.reloadEmpty && u > 0.72) bolt = (u - 0.72) / 0.28;
    }
    if (this.rackT > 0) bolt = Math.sin((1 - this.rackT / 0.46) * Math.PI);
    const heavy = this.gunKg(this.guns[this.gunI]) / 4.2;
    rig.root.position.set(
      lerp(0.24, 0.0, ads) + this.bobX * 0.4,
      lerp(-0.24, -0.2, ads) + this.bobY * 0.5 - swap * 0.22 - reloadDip - heavy * 0.02,
      lerp(-0.48, -0.36, ads) + this.kick * 0.06,
    );
    rig.root.rotation.set(this.kick * 0.05, this.recoilY * 0.4, -this.kick * 0.04);
    rig.mag.position.y = -0.08 - magDrop * 0.22;
    rig.bolt.position.z = 0.02 + bolt * 0.06;
    if (!rifleOn) this.shotG.pump.position.z = -0.12 - magDrop * 0.1;
    this.flashMesh.visible = this.flashT > 0.05 && this.phase !== "menu";
    this.flashMesh.position.set(0, 0.02, rifleOn ? -0.62 : -0.5);
    const parent = rifleOn ? this.rifleG.root : this.shotG.root;
    if (this.flashMesh.parent !== parent) parent.add(this.flashMesh);
    const heat = this.guns[this.gunI].heat;
    this.viewKey.color.set(heat > 0.7 ? "#ffb089" : "#fff0dd");
    this.viewKey.intensity = 1.2 + this.flashT * 2;
  }

  private poseZeds() {
    const root = this.dummy;
    const part = this.part;
    for (let i = 0; i < MAXZ; i++) {
      const z = this.zeds[i];
      const show = z.alive || z.deadT < 8;
      const lie = z.alive ? 0 : clamp(z.deadT / 0.28, 0, 1);
      root.position.set(z.x, (z.alive ? z.y : 0.15) + lie * 0.05, z.z);
      root.rotation.set(lie * 1.25, z.yaw, 0);
      root.scale.setScalar(show ? 1 : 0);
      root.updateMatrix();
      const sc = z.scale;
      const swing = Math.sin(z.phase) * (z.alive && Math.hypot(z.vx, z.vz) > 0.2 ? 0.7 : 0.05);
      const place = (mesh: THREE.InstancedMesh, lx: number, ly: number, lz: number, rx: number, sx = 1, sy = 1, sz = 1) => {
        part.position.set(lx * sc, ly * sc, lz * sc);
        part.rotation.set(rx, 0, 0);
        part.scale.set(sx * sc, sy * sc, sz * sc);
        part.updateMatrix();
        this.tmpM.multiplyMatrices(root.matrix, part.matrix);
        mesh.setMatrixAt(i, this.tmpM);
      };
      place(this.torsoM, 0, 1.02, 0, z.kind === "runner" ? 0.25 : 0, z.kind === "tank" ? 1.25 : 1, 1, z.kind === "stalker" ? 0.85 : 1);
      place(this.headM, 0, 1.48, z.kind === "runner" ? -0.06 : 0, 0);
      place(this.armM, -0.3, 1.28, 0, swing, 1, 1, 1);
      // second arm stored at i+MAXZ
      part.position.set(0.3 * sc, 1.28 * sc, 0);
      part.rotation.set(-swing, 0, 0);
      part.scale.set(sc, sc, sc);
      part.updateMatrix();
      this.tmpM.multiplyMatrices(root.matrix, part.matrix);
      this.armM.setMatrixAt(i + MAXZ, this.tmpM);
      place(this.legM, -0.12, 0.72, 0, -swing);
      part.position.set(0.12 * sc, 0.72 * sc, 0);
      part.rotation.set(swing, 0, 0);
      part.scale.set(sc, z.leg <= 0 ? sc * 0.7 : sc, sc);
      part.updateMatrix();
      this.tmpM.multiplyMatrices(root.matrix, part.matrix);
      this.legM.setMatrixAt(i + MAXZ, this.tmpM);
      place(this.eyeM, -0.06, 1.52, -0.12, 0, 1, 1, 1);
      part.position.set(0.06 * sc, 1.52 * sc, -0.12 * sc);
      part.rotation.set(0, 0, 0);
      part.scale.set(sc, sc, sc);
      part.updateMatrix();
      this.tmpM.multiplyMatrices(root.matrix, part.matrix);
      this.eyeM.setMatrixAt(i + MAXZ, this.tmpM);
      part.position.set(z.x, 0.045, z.z);
      part.rotation.set(-Math.PI / 2, 0, 0);
      const bs = show ? 0.55 * sc : 0;
      part.scale.set(bs, bs, 1);
      part.updateMatrix();
      this.blobM.setMatrixAt(i, part.matrix);
      this.tmpC.copy(z.shirt).lerp(this.bloodC, z.blood);
      if (z.flash > 0) this.tmpC.lerp(this.whiteC, z.flash);
      this.torsoM.setColorAt(i, this.tmpC);
      this.tmpC.copy(z.skin).lerp(this.bloodC, z.blood * 0.8);
      if (z.flash > 0) this.tmpC.lerp(this.whiteC, z.flash * 0.7);
      this.headM.setColorAt(i, this.tmpC);
      this.armM.setColorAt(i, this.tmpC);
      this.armM.setColorAt(i + MAXZ, this.tmpC);
      const legBleed = 1 - clamp(z.leg / (z.legMax || 1), 0, 1);
      this.tmpC.copy(z.skin).lerp(this.bloodC, Math.max(z.blood * 0.6, legBleed));
      this.legM.setColorAt(i, this.tmpC);
      this.legM.setColorAt(i + MAXZ, this.tmpC);
      this.eyeM.setColorAt(i, this.tmpC.set(EYE[z.kind]));
      this.eyeM.setColorAt(i + MAXZ, this.tmpC);
    }
    for (const m of [this.torsoM, this.headM, this.armM, this.legM, this.eyeM, this.blobM]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  private poseParticles(dt: number) {
    let n = 0;
    for (const p of this.particles) {
      if (!p.on) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.on = false;
        continue;
      }
      p.vy -= 9 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.02) {
        p.y = 0.02;
        p.vy *= -0.2;
        p.vx *= 0.6;
        p.vz *= 0.6;
      }
      const k = p.life / p.max;
      this.partPos[n * 3] = p.x;
      this.partPos[n * 3 + 1] = p.y;
      this.partPos[n * 3 + 2] = p.z;
      this.partCol[n * 3] = (p.r / 255) * k;
      this.partCol[n * 3 + 1] = (p.g / 255) * k;
      this.partCol[n * 3 + 2] = (p.b / 255) * k;
      n++;
    }
    this.partGeo.setDrawRange(0, n);
    this.partGeo.attributes.position.needsUpdate = true;
    this.partGeo.attributes.color.needsUpdate = true;
    this.stepRain();
  }

  private rainXY = new Float32Array(900 * 3);
  private rainMesh: THREE.Points | null = null;
  private stepRain() {
    if (!this.rainMesh) return;
    this.rainMesh.visible = this.raining;
    if (!this.raining) return;
    const arr = this.rainXY;
    const ox = this.phase === "menu" ? 0 : this.x;
    const oz = this.phase === "menu" ? 0 : this.z;
    for (let i = 0; i < 900; i++) {
      arr[i * 3 + 1] -= 0.55;
      if (arr[i * 3 + 1] < 0) {
        arr[i * 3] = ox + (Math.random() - 0.5) * 28 + this.windX * 0.4;
        arr[i * 3 + 1] = 6 + Math.random() * 6;
        arr[i * 3 + 2] = oz + (Math.random() - 0.5) * 28;
      }
    }
    (this.rainMesh.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  private posePickups() {
    const t = performance.now() * 0.003;
    for (const p of this.pickups) {
      const show = p.on && (!p.needUnlock || this.unlocked);
      p.mesh.visible = show;
      if (show) p.mesh.position.y = 0.35 + Math.sin(t + p.x) * 0.06;
    }
  }

  private poseTracers() {
    let n = 0;
    for (const b of this.bullets) {
      if (!b.on) continue;
      const sp = Math.hypot(b.vx, b.vy, b.vz) || 1;
      this.tracerPos[n * 6] = b.x;
      this.tracerPos[n * 6 + 1] = b.y;
      this.tracerPos[n * 6 + 2] = b.z;
      this.tracerPos[n * 6 + 3] = b.x - (b.vx / sp) * 0.7;
      this.tracerPos[n * 6 + 4] = b.y - (b.vy / sp) * 0.7;
      this.tracerPos[n * 6 + 5] = b.z - (b.vz / sp) * 0.7;
      n++;
    }
    this.tracerGeo.setDrawRange(0, n * 2);
    this.tracerGeo.attributes.position.needsUpdate = true;
  }

  private burst(x: number, y: number, z: number, color: number, count: number, speed: number) {
    const r = (color >> 16) & 255;
    const g = (color >> 8) & 255;
    const b = color & 255;
    for (let i = 0; i < count; i++) {
      const p = this.particles[this.pCursor];
      this.pCursor = (this.pCursor + 1) % MAXP;
      p.on = true;
      p.x = x;
      p.y = y;
      p.z = z;
      p.vx = (Math.random() - 0.5) * speed;
      p.vy = Math.random() * speed;
      p.vz = (Math.random() - 0.5) * speed;
      p.life = 0.25 + Math.random() * 0.35;
      p.max = p.life;
      p.r = r;
      p.g = g;
      p.b = b;
    }
  }

  private decal(x: number, y: number, z: number) {
    const d = this.decals[this.decalI];
    this.decalI = (this.decalI + 1) % this.decals.length;
    const dx = this.x - x;
    const dy = this.y + this.eye - y;
    const dz = this.z - z;
    const l = Math.hypot(dx, dy, dz) || 1;
    d.position.set(x + (dx / l) * 0.04, y + (dy / l) * 0.04, z + (dz / l) * 0.04);
    d.lookAt(this.x, this.y + this.eye, this.z);
    d.visible = true;
  }

  private createSky() {
    const geo = new THREE.SphereGeometry(150, 18, 10);
    const count = geo.attributes.position.count;
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    this.skyPos = geo.attributes.position as THREE.BufferAttribute;
    this.skyCol = geo.attributes.color as THREE.BufferAttribute;
  }

  private createLights() {
    for (const lamp of LAMPS) {
      const l = new THREE.PointLight("#ffb15e", 6, 14, 2);
      l.position.set(lamp.x, 3.15, lamp.z);
      this.scene.add(l);
      this.lamps.push(l);
    }
    for (const lamp of INTERIOR_LIGHTS) {
      const l = new THREE.PointLight(lamp.color, lamp.intensity, 9, 2);
      l.position.set(lamp.x, lamp.y, lamp.z);
      this.scene.add(l);
      this.interiors.push(l);
    }
  }

  private createPuddles() {
    const mat = new THREE.MeshBasicMaterial({ color: "#1a1e22", transparent: true, opacity: 0.05 });
    const spots = [
      [2, -2],
      [-6, 1],
      [8, 4],
      [-2, -7],
      [14, -2],
      [0, 8],
    ];
    for (const [x, z] of spots) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(1.1, 10), mat.clone());
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.03, z);
      this.scene.add(m);
      this.puddles.push(m);
    }
  }

  private createCols() {
    for (const b of BLOCKS) {
      const col: Col = {
        minX: b.x - b.w / 2,
        maxX: b.x + b.w / 2,
        minY: b.y - b.h / 2,
        maxY: b.y + b.h / 2,
        minZ: b.z - b.d / 2,
        maxZ: b.z + b.d / 2,
        active: true,
        mat: b.mat,
        hard: HARD[b.mat] ?? 1,
        dyn: false,
        gate: b.gate,
      };
      this.cols.push(col);
      if (b.gate) this.gateCol = col;
    }
  }

  private createOpenings() {
    const wood = new THREE.MeshStandardMaterial({ color: "#6b4428", roughness: 0.8 });
    const glassMat = new THREE.MeshStandardMaterial({
      color: "#b7d4dc",
      transparent: true,
      opacity: 0.28,
      roughness: 0.05,
      metalness: 0.15,
      emissive: "#143038",
      emissiveIntensity: 0.25,
    });
    for (const def of OPENINGS) {
      const cells: number[] = [];
      for (let s = 0; s <= 6; s++) {
        const t = -def.halfW + (2 * def.halfW * s) / 6;
        const x = def.axis === "z" ? def.x + t : def.x;
        const z = def.axis === "z" ? def.z : def.z + t;
        const id = this.idx(x, z);
        if (id >= 0 && !cells.includes(id)) cells.push(id);
      }
      const nudge = 0.24 * def.out;
      const plankCol: Col = {
        minX: def.axis === "z" ? def.x - def.halfW : def.x + nudge - 0.12,
        maxX: def.axis === "z" ? def.x + def.halfW : def.x + nudge + 0.12,
        minY: def.sill,
        maxY: def.top,
        minZ: def.axis === "z" ? def.z + nudge - 0.12 : def.z - def.halfW,
        maxZ: def.axis === "z" ? def.z + nudge + 0.12 : def.z + def.halfW,
        active: false,
        mat: "plank",
        hard: HARD.plank,
        dyn: true,
      };
      this.cols.push(plankCol);
      let glassCol: Col | null = null;
      let glassMesh: THREE.Mesh | null = null;
      if (def.glass) {
        glassCol = {
          minX: def.axis === "z" ? def.x - def.halfW : def.x - 0.08,
          maxX: def.axis === "z" ? def.x + def.halfW : def.x + 0.08,
          minY: def.sill,
          maxY: def.top,
          minZ: def.axis === "z" ? def.z - 0.08 : def.z - def.halfW,
          maxZ: def.axis === "z" ? def.z + 0.08 : def.z + def.halfW,
          active: true,
          mat: "glass",
          hard: HARD.glass,
          dyn: true,
        };
        this.cols.push(glassCol);
        glassMesh = new THREE.Mesh(new THREE.PlaneGeometry(def.halfW * 2, def.top - def.sill), glassMat);
        glassMesh.position.set(def.x, (def.sill + def.top) / 2, def.z);
        if (def.axis === "x") glassMesh.rotation.y = Math.PI / 2;
        this.scene.add(glassMesh);
      }
      const group = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const plank = new THREE.Mesh(new THREE.BoxGeometry(def.halfW * 1.9, 0.12, 0.08), wood);
        const span = def.top - def.sill;
        plank.position.y = def.sill + span * (0.22 + i * 0.28);
        plank.castShadow = true;
        plank.visible = false;
        group.add(plank);
      }
      if (def.axis === "z") group.position.set(def.x, 0, def.z + nudge);
      else {
        group.position.set(def.x + nudge, 0, def.z);
        group.rotation.y = Math.PI / 2;
      }
      this.scene.add(group);
      this.openings.push({
        ...def,
        hp: 0,
        maxHp: 180,
        glassHp: def.glass ? 1 : 0,
        cells,
        planks: group,
        glassMesh,
        plankCol,
        glassCol,
      });
    }
  }

  private createZedMeshes() {
    const shirt = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.82 });
    const skin = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.7 });
    const eye = new THREE.MeshBasicMaterial({ color: "#ffffff" });
    const blob = new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.28 });
    const torso = new THREE.BoxGeometry(0.42, 0.55, 0.22);
    const head = new THREE.BoxGeometry(0.24, 0.26, 0.24);
    const arm = new THREE.BoxGeometry(0.1, 0.46, 0.1);
    arm.translate(0, -0.18, 0);
    const leg = new THREE.BoxGeometry(0.12, 0.52, 0.12);
    leg.translate(0, -0.26, 0);
    const eyeG = new THREE.BoxGeometry(0.045, 0.03, 0.04);
    this.torsoM = new THREE.InstancedMesh(torso, shirt, MAXZ);
    this.headM = new THREE.InstancedMesh(head, skin, MAXZ);
    this.armM = new THREE.InstancedMesh(arm, skin, MAXZ * 2);
    this.legM = new THREE.InstancedMesh(leg, skin, MAXZ * 2);
    this.eyeM = new THREE.InstancedMesh(eyeG, eye, MAXZ * 2);
    this.blobM = new THREE.InstancedMesh(new THREE.CircleGeometry(0.46, 8), blob, MAXZ);
    for (const m of [this.torsoM, this.headM, this.armM, this.legM, this.eyeM, this.blobM]) {
      m.castShadow = false;
      m.receiveShadow = true;
      m.frustumCulled = false;
      this.scene.add(m);
    }
    for (let i = 0; i < MAXZ; i++) {
      const z = this.blankZed(i);
      this.zeds.push(z);
    }
  }

  private blankZed(i: number): Zed {
    return {
      alive: false,
      kind: "walker",
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vz: 0,
      yaw: 0,
      hp: 0,
      maxHp: 1,
      leg: 1,
      legMax: 1,
      scale: 1,
      phase: 0,
      aware: false,
      calm: 0,
      atk: 1,
      stumble: 0,
      climb: 0,
      flash: 0,
      blood: 0,
      deadT: 99,
      groanT: 2,
      stepT: 1,
      seed: i * 17 + 3,
      wanderX: 0,
      wanderZ: 0,
      wanderT: 1,
      shirt: new THREE.Color(SHIRT.walker),
      skin: new THREE.Color(SKIN.walker),
    };
  }

  private createBallistics() {
    for (let i = 0; i < MAXB; i++) {
      this.bullets.push({
        on: false,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        energy: 1,
        dmg: 1,
        pen: 1,
        life: 0,
        pens: 0,
        skipZ: -1,
        skipC: -1,
      });
    }
    for (let i = 0; i < MAXP; i++) {
      this.particles.push({
        on: false,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        max: 1,
        r: 255,
        g: 255,
        b: 255,
      });
    }
    this.tracerGeo = new THREE.BufferGeometry();
    this.tracerGeo.setAttribute("position", new THREE.BufferAttribute(this.tracerPos, 3));
    this.tracerGeo.setDrawRange(0, 0);
    const lines = new THREE.LineSegments(
      this.tracerGeo,
      new THREE.LineBasicMaterial({ color: "#ffe2b0", transparent: true, opacity: 0.85 }),
    );
    lines.frustumCulled = false;
    this.scene.add(lines);
    this.partGeo = new THREE.BufferGeometry();
    this.partGeo.setAttribute("position", new THREE.BufferAttribute(this.partPos, 3));
    this.partGeo.setAttribute("color", new THREE.BufferAttribute(this.partCol, 3));
    this.partGeo.setDrawRange(0, 0);
    const pts = new THREE.Points(
      this.partGeo,
      new THREE.PointsMaterial({ size: 0.16, vertexColors: true, transparent: true, depthWrite: false }),
    );
    pts.frustumCulled = false;
    this.scene.add(pts);
    const rainGeo = new THREE.BufferGeometry();
    for (let i = 0; i < 900; i++) {
      this.rainXY[i * 3] = (Math.random() - 0.5) * 28;
      this.rainXY[i * 3 + 1] = Math.random() * 8;
      this.rainXY[i * 3 + 2] = (Math.random() - 0.5) * 28;
    }
    rainGeo.setAttribute("position", new THREE.BufferAttribute(this.rainXY, 3));
    this.rainMesh = new THREE.Points(
      rainGeo,
      new THREE.PointsMaterial({ color: "#c5d0dc", size: 0.07, transparent: true, opacity: 0.5, depthWrite: false }),
    );
    this.rainMesh.frustumCulled = false;
    this.rainMesh.visible = false;
    this.scene.add(this.rainMesh);
    const decalMat = new THREE.MeshBasicMaterial({ color: "#1a120e", side: THREE.DoubleSide });
    for (let i = 0; i < 24; i++) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.12), decalMat);
      d.visible = false;
      this.scene.add(d);
      this.decals.push(d);
    }
  }

  private createPickups() {
    const geo = new THREE.BoxGeometry(0.28, 0.18, 0.22);
    const mat = new THREE.MeshStandardMaterial({ color: "#d7b06a", emissive: "#e2a04a", emissiveIntensity: 0.35, roughness: 0.45 });
    const add = (x: number, z: number, kind: Pickup["kind"], amount: number, needUnlock = false) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, 0.35, z);
      mesh.castShadow = true;
      this.scene.add(mesh);
      this.pickups.push({ x, z, kind, amount, on: !needUnlock, needUnlock, mesh });
    };
    add(2.2, 6.4, "rifle", 24);
    add(18.4, -2.2, "bandage", 36);
    add(20.2, 3.2, "shot", 8);
    add(-19, -4, "rifle", 40, true);
    add(-18, -1, "wood", 4, true);
    add(-20, -6, "scrap", 25, true);
  }

  private buildView() {
    const amb = new THREE.AmbientLight("#ffffff", 0.5);
    this.viewKey = new THREE.DirectionalLight("#fff0dd", 1.3);
    this.viewKey.position.set(0.5, 1.1, 0.4);
    this.viewScene.add(amb, this.viewKey);
    const metal = new THREE.MeshStandardMaterial({ color: "#2a2e2c", roughness: 0.42, metalness: 0.72 });
    const dark = new THREE.MeshStandardMaterial({ color: "#151716", roughness: 0.5, metalness: 0.4 });
    const wood = new THREE.MeshStandardMaterial({ color: "#6a4328", roughness: 0.72, metalness: 0.05 });
    const glove = new THREE.MeshStandardMaterial({ color: "#2c332c", roughness: 0.85 });
    const box = (parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      parent.add(m);
      return m;
    };
    const barrel = (parent: THREE.Object3D, r: number, len: number, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.05, len, 8), metal);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, y, z);
      parent.add(m);
      return m;
    };
    const rifle = new THREE.Group();
    box(rifle, 0.07, 0.09, 0.32, 0, 0, -0.02, metal);
    barrel(rifle, 0.013, 0.5, 0, 0.02, -0.32);
    box(rifle, 0.05, 0.07, 0.22, 0, -0.01, 0.2, wood);
    const rMag = box(rifle, 0.04, 0.14, 0.07, 0, -0.08, 0.02, dark);
    const rBolt = box(rifle, 0.02, 0.025, 0.08, 0.03, 0.04, 0.02, dark);
    box(rifle, 0.045, 0.09, 0.05, 0, -0.06, 0.08, dark);
    box(rifle, 0.05, 0.06, 0.08, 0.04, -0.05, 0.05, glove);
    box(rifle, 0.02, 0.045, 0.03, 0, 0.07, -0.02, dark);
    const flashMat = new THREE.MeshBasicMaterial({ color: "#fff4d2" });
    this.flashMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), flashMat);
    this.flashMesh.visible = false;
    rifle.add(this.flashMesh);
    this.rifleG = { root: rifle, mag: rMag, bolt: rBolt };

    const shot = new THREE.Group();
    box(shot, 0.08, 0.09, 0.28, 0, 0, 0.02, metal);
    barrel(shot, 0.02, 0.42, 0, 0.02, -0.24);
    const pump = box(shot, 0.055, 0.055, 0.16, 0, 0.01, -0.12, wood);
    box(shot, 0.055, 0.08, 0.2, 0, -0.01, 0.22, wood);
    const sMag = box(shot, 0.04, 0.08, 0.06, 0, -0.06, 0.04, dark);
    const sBolt = box(shot, 0.02, 0.02, 0.06, 0.035, 0.045, 0.04, dark);
    box(shot, 0.05, 0.07, 0.07, 0.05, -0.04, 0.08, glove);
    this.shotG = { root: shot, mag: sMag, bolt: sBolt, pump };
    this.viewScene.add(rifle, shot);
  }

  private bind() {
    const el = this.renderer.domElement;
    const add = (t: EventTarget, type: string, fn: EventListener, opts?: AddEventListenerOptions) => {
      t.addEventListener(type, fn, opts);
      this.offs.push(() => t.removeEventListener(type, fn, opts));
    };
    add(window, "keydown", (ev) => {
      const e = ev as KeyboardEvent;
      if (e.repeat) return;
      if (["Space", "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
      if (e.code === "Escape") {
        if (this.shop) this.shop = false;
        else if (this.phase === "pause") this.resume();
        else if (this.phase === "wave" || this.phase === "prep") {
          this.returnPhase = this.phase;
          this.phase = "pause";
          if (document.exitPointerLock) document.exitPointerLock();
        }
      }
      this.audio.unlock();
    });
    add(window, "keyup", (ev) => {
      this.keys.delete((ev as KeyboardEvent).code);
    });
    add(window, "blur", () => this.keys.clear());
    add(document, "visibilitychange", () => {
      if (document.visibilityState === "visible") this.audio.resume();
    });
    add(window, "mousemove", (ev) => {
      if (document.pointerLockElement !== el) return;
      const e = ev as MouseEvent;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    add(el, "mousedown", (ev) => {
      const e = ev as MouseEvent;
      if (e.button === 0) this.fireHeld = true;
      if (e.button === 2) this.aimHeld = true;
      if (this.phase === "wave" || this.phase === "prep") this.lock();
    });
    add(window, "mouseup", (ev) => {
      const e = ev as MouseEvent;
      if (e.button === 0) this.fireHeld = false;
      if (e.button === 2) this.aimHeld = false;
    });
    add(el, "contextmenu", (ev) => ev.preventDefault());
    add(window, "pointerdown", () => this.audio.unlock());
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(this.host);
    this.offs.push(() => ro.disconnect());
    this.resize();
  }

  private resize() {
    const w = this.host.clientWidth || 1;
    const h = this.host.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.viewCam.aspect = this.camera.aspect;
    this.viewCam.updateProjectionMatrix();
  }

  private mountProbe() {
    const self = this;
    window.__controlsTest = {
      getYaw: () => self.yaw,
      getSpeed: () => Math.hypot(self.vx, self.vz),
      getPos: () => ({ x: self.x, y: self.y, z: self.z }),
      setKeys: (codes: string[]) => {
        self.qaKeys = new Set(codes);
      },
      setFire: (v: boolean) => {
        self.qaFire = v;
      },
      getMag: () => self.guns[self.gunI]?.mag ?? 0,
      getPhase: () => self.phase,
    };
  }

  private load() {
    try {
      const raw = localStorage.getItem("umbral7");
      if (!raw) return;
      const data = JSON.parse(raw) as { best?: number; sens?: number; volume?: number; assist?: boolean };
      if (typeof data.best === "number") this.best = data.best;
      if (typeof data.sens === "number") this.sens = data.sens;
      if (typeof data.volume === "number") this.volume = data.volume;
      if (typeof data.assist === "boolean") this.assist = data.assist;
    } catch {
      /* ignore */
    }
  }
  private save() {
    try {
      localStorage.setItem(
        "umbral7",
        JSON.stringify({ best: this.best, sens: this.sens, volume: this.volume, assist: this.assist }),
      );
    } catch {
      /* ignore */
    }
  }

  private blankSnap(): Snapshot {
    return {
      phase: "menu",
      shop: false,
      wave: 1,
      hp: 100,
      hpMax: 100,
      stamina: 100,
      bleeding: false,
      limping: false,
      mag: 30,
      reserve: 90,
      magSize: 30,
      weapon: "rifle",
      weaponName: "AR-17",
      jammed: false,
      reloading: false,
      heat: 0,
      dirt: 0,
      scrap: 22,
      wood: 6,
      skills: 0,
      ranks: { lungs: 0, grip: 0, surgeon: 0 },
      mods: { sight: 0, barrel: 1, stock: 1, mag: 1 },
      weight: 19,
      kills: 0,
      best: this.best,
      alive: 0,
      pending: 0,
      weather: "Anochecer",
      wind: "Calma",
      clock: "19:10",
      caption: "",
      hurt: 0,
      hurtSide: 0,
      hit: 0,
      headHit: false,
      assist: this.assist,
      sens: this.sens,
      volume: this.volume,
      unlocked: false,
      indoor: false,
      showMag: false,
      clean: 0,
      status: "Estable",
      banner: "",
      ads: 0,
      locked: false,
      diary: false,
    };
  }

  private writeUi() {
    const g = this.guns[this.gunI] ?? this.guns[0];
    const kg = g ? 12 + this.gunKg(this.guns[0]) + this.gunKg(this.guns[1]) : 19;
    let status = "Estable";
    if (this.hp < 30) status = "Crítico";
    else if (this.hp < 48) status = "Herido";
    else if (this.stamina < 22) status = "Sin aire";
    const sp = Math.hypot(this.windX, this.windZ);
    let wind = "Calma";
    if (sp >= 0.4) {
      const a = Math.atan2(this.windX, -this.windZ);
      const names = ["norte", "noreste", "este", "sureste", "sur", "suroeste", "oeste", "noroeste"];
      const idx = ((Math.round(((a % (Math.PI * 2)) + Math.PI * 2) / (Math.PI / 4)) % 8) + 8) % 8;
      wind = `${sp.toFixed(0)} m/s al ${names[idx]}`;
    }
    const hours = 18 + (this.tod - 0.68) * 26;
    const h = ((Math.floor(hours) % 24) + 24) % 24;
    const m = Math.floor((hours - Math.floor(hours)) * 60 + 60) % 60;
    const weather = this.raining && this.foggy ? "Lluvia y niebla" : this.raining ? "Lluvia" : this.foggy ? "Niebla" : this.night ? "Noche" : "Anochecer";
    if (!this.ui) this.ui = this.blankSnap();
    const snap = this.ui;
    snap.phase = this.phase;
    snap.shop = this.shop;
    snap.wave = this.wave;
    snap.hp = this.hp;
    snap.hpMax = 100;
    snap.stamina = this.stamina;
    snap.bleeding = this.hp < 28 && this.hp > 0;
    snap.limping = this.hp < 48;
    snap.mag = g ? g.mag : 0;
    snap.reserve = g ? g.reserve : 0;
    snap.magSize = g ? this.magMax(g) : 30;
    snap.weapon = g ? g.id : "rifle";
    snap.weaponName = g?.id === "shotgun" ? "SP-12" : "AR-17";
    snap.jammed = !!g?.jammed;
    snap.reloading = this.reloadT > 0;
    snap.heat = g?.heat ?? 0;
    snap.dirt = g?.dirt ?? 0;
    snap.scrap = this.scrap;
    snap.wood = this.wood;
    snap.skills = this.skills;
    snap.ranks = { ...this.ranks };
    snap.mods = g ? { ...g.mods } : { sight: 0, barrel: 1, stock: 1, mag: 1 };
    snap.weight = Math.round(kg * 10) / 10;
    snap.kills = this.kills;
    snap.best = this.best;
    snap.alive = this.aliveCount();
    snap.pending = Math.max(0, this.quota - this.spawned);
    snap.weather = weather;
    snap.wind = wind;
    snap.clock = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    snap.caption = this.toastT > 0 ? this.toast : "";
    snap.hurt = this.hurtFlash;
    snap.hurtSide = this.hurtSide;
    snap.hit = this.hitMark;
    snap.headHit = this.headHit && this.hitMark > 0.2;
    snap.assist = this.assist;
    snap.sens = this.sens;
    snap.volume = this.volume;
    snap.unlocked = this.unlocked;
    snap.indoor = this.phase !== "menu" && this.isIndoor();
    snap.showMag = this.showMagT > 0 || this.checkT > 0;
    snap.clean = clamp(this.cleanT / 1.65, 0, 1);
    snap.status = status;
    snap.banner = this.phase === "prep" ? this.forecast(this.wave) : "";
    snap.ads = this.adsV;
    snap.locked = document.pointerLockElement === this.renderer.domElement;
    snap.diary = this.diary;
  }
}
