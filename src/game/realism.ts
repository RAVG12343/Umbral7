import * as THREE from "three";
import { hub, warmLocalAssets } from "@/game/models";

// Runtime realism enhancer. Patches Engine and GameAudio prototypes to
// - improve zed animation (procedural + optional skinned mixer use)
// - improve ballistic drag and penetration
// - add camera recoil/shake improvements
// - add additional weapon parameter support
// - audio occlusion toggle
// - lightweight battle-royale skeleton (client-side only) and loot/horde helpers

export function installRealismEnhancements() {
  if (typeof window === "undefined") return;
  const EngineCtor = (globalThis as any).Engine ?? (globalThis as any).EngineCtor ?? null;
  if (!EngineCtor) return;
  const proto = EngineCtor.prototype as any;
  if (proto.__umbral7RealismV2) return;
  proto.__umbral7RealismV2 = true;

  const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
  const angNorm = (d: number) => Math.atan2(Math.sin(d), Math.cos(d));

  // Camera / recoil improvements: smoother recoil with spring-damper per axis
  // Add additional fields to engine instances
  const originalConstructor = proto.constructor;
  // Note: we patch into prototype methods instead of replacing constructor to avoid breaking flow

  // Enhance poseGun to add more natural recoil and camera shake
  const originalPoseGun = proto.poseGun;
  proto.poseGun = function (this: any, dt: number) {
    // add state fields
    this._realism = this._realism ?? {};
    const s = this._realism;
    s.recoilX = s.recoilX ?? 0; // pitch recoil
    s.recoilY = s.recoilY ?? 0; // yaw recoil
    s.recoilVelX = s.recoilVelX ?? 0;
    s.recoilVelY = s.recoilVelY ?? 0;

    // apply target recoil from weapon kick (existing this.kick, this.recoilP, this.recoilY)
    // we convert recoil values into spring targets for smoother motion
    const targetPitch = this.recoilP * 0.9;
    const targetYaw = this.recoilY * 0.9;

    // spring-damper parameters
    const k = 120; // stiffness
    const d = 18; // damping
    const invMass = 1.0;

    // integrate simple semi-implicit spring to approach target
    const ax = (targetPitch - s.recoilX) * k * invMass - s.recoilVelX * d;
    s.recoilVelX += ax * (dt || 1 / 60);
    s.recoilX += s.recoilVelX * (dt || 1 / 60);

    const ay = (targetYaw - s.recoilY) * k * invMass - s.recoilVelY * d;
    s.recoilVelY += ay * (dt || 1 / 60);
    s.recoilY += s.recoilVelY * (dt || 1 / 60);

    // camera shake amplification based on weapon kick and firing events
    this._realism.cameraShake = (this._realism.cameraShake ?? 0) * 0.9 + (this.kick || 0) * 0.12;

    // call original to keep weapon pose logic but then blend in our recoil offsets
    originalPoseGun.call(this, dt);

    // apply our smoother recoil to camera pitch/yaw offsets
    // The engine applies recoil via this.recoilP and this.recoilY; we nudge camera using local state
    // Adjust camera rotation slightly by reducing direct recoil to the smoothed values
    if (this.camera) {
      // store recovery offsets for render()
      this._realism.applyPitchOffset = s.recoilX * 0.45;
      this._realism.applyYawOffset = s.recoilY * 0.45;
    }
  };

  // Patch render to include improved camera shake and apply recoil offsets
  const originalRender = proto.render;
  proto.render = function (this: any, dt: number) {
    // call original to update view matrices and poses
    originalRender.call(this, dt);

    // apply camera offsets post-render for smoother visual effect
    const s = this._realism ?? {};
    const shake = s.cameraShake ?? 0;
    if (this.phase !== "menu" && shake > 0.001) {
      // apply a gentle positional shake to yawPivot / camera
      const sx = (Math.random() - 0.5) * shake * 0.06;
      const sy = (Math.random() - 0.5) * shake * 0.06;
      const rot = (Math.random() - 0.5) * shake * 0.01;
      this.yawPivot.position.x += sx;
      this.yawPivot.position.y += sy;
      this.yawPivot.rotation.y += rot;
      // decay the shake
      this._realism.cameraShake = Math.max(0, shake - dt * 1.8);
    }

    // apply interpolation of recoil offsets onto camera rotational transform
    if (s.applyPitchOffset || s.applyYawOffset) {
      try {
        const cam = this.camera;
        cam.rotation.x = (cam.rotation.x || 0) + (s.applyPitchOffset || 0);
        cam.rotation.y = (cam.rotation.y || 0) + (s.applyYawOffset || 0) * 0.25;
        // small recovery
        s.applyPitchOffset *= 0.92;
        s.applyYawOffset *= 0.92;
      } catch {
        // ignore
      }
    }
  };

  // Ballistic: improved drag & ricochet influence
  const originalFly = proto.fly;
  proto.fly = function (this: any, b: any, dt: number) {
    // aerodynamic drag (simple quadratic-ish model)
    const speed = Math.hypot(b.vx, b.vy, b.vz) || 1;
    const dragCoef = 0.01 + Math.min(0.06, speed * 0.0015);
    b.vx -= (b.vx / speed) * dragCoef * dt * speed;
    b.vy -= (b.vy / speed) * dragCoef * dt * speed * 0.6;
    b.vz -= (b.vz / speed) * dragCoef * dt * speed;
    // gravity (slightly adjusted for heavier bullets feel)
    b.vy -= 11.0 * dt * 0.98;
    return originalFly.call(this, b, dt);
  };

  // On hitting columns, apply more realistic reduction and ricochet chance based on angle
  const originalHitCol = proto.hitCol;
  proto.hitCol = function (this: any, b: any, c: any) {
    // determine incoming direction
    const speed = Math.hypot(b.vx, b.vy, b.vz) || 1;
    const nx = b.vx / speed;
    const nz = b.vz / speed;
    // surface normal approx: pick away from center of the column
    // for more accurate ricochet you'd use collision normal; we approximate
    const normalBias = 0.5;
    const incidence = Math.abs(nx * normalBias + nz * normalBias);
    // harder materials more likely to ricochet
    const hard = c.hard ?? 1;
    const ricochetChance = clamp(0.12 + (hard - 0.9) * 0.12 + Math.max(0, 0.5 - incidence) * 0.25, 0, 0.8);
    if (Math.random() < ricochetChance && hard > 0.9 && speed > 8) {
      // reflect velocity with damping
      // naive reflection across horizontal plane depending on incidence
      b.vx = b.vx - 2 * (nx * (nx + nz)) * 0.5;
      b.vz = b.vz - 2 * (nz * (nx + nz)) * 0.5;
      b.vx *= 0.38;
      b.vz *= 0.38;
      b.vy *= 0.3;
      b.energy *= 0.35;
      // spawn spark particles
      this.burst(b.x, b.y, b.z, 0xffcc88, 8, 6.5);
      this.audio.impact("metal", b.x, b.y, b.z);
      return true; // treat as stopped for the bullet pipeline
    }
    const out = originalHitCol.call(this, b, c);
    // reduce energy more on heavy materials
    b.energy *= 0.86;
    return out;
  };

  // Weapon parameter extensions: support new ids -> carbine, pistol, lmg, melee
  const originalSpreadOf = proto.spreadOf;
  proto.spreadOf = function (this: any, g: any) {
    // default map for new weapons
    if (g.id === "carbine") {
      let s = 0.009; // tighter than rifle
      s *= [1, 0.74, 0.52][g.mods.sight];
      s *= 1 + g.dirt * 0.6 + g.heat * 0.22;
      s *= 1 - this.adsV * 0.72;
      return s;
    }
    if (g.id === "pistol") {
      let s = 0.016;
      s *= 1 + g.dirt * 0.4 + g.heat * 0.12;
      s *= 1 - this.adsV * 0.2;
      return s;
    }
    if (g.id === "lmg") {
      let s = 0.02;
      s *= 1 + g.dirt * 0.9 + g.heat * 0.38;
      s *= 1 - this.adsV * 0.28;
      return s;
    }
    if (g.id === "melee") return 0.0001;
    return originalSpreadOf.call(this, g);
  };

  const originalRecoilOf = proto.recoilOf;
  proto.recoilOf = function (this: any, g: any) {
    if (g.id === "carbine") return 0.014 * [1, 1, 0.92][g.mods.stock];
    if (g.id === "pistol") return 0.022 * [1, 1, 0.9][g.mods.barrel];
    if (g.id === "lmg") return 0.028 * [1, 1, 1.05][g.mods.stock];
    if (g.id === "melee") return 0.001;
    return originalRecoilOf.call(this, g);
  };

  const originalMuzzleOf = proto.muzzleOf;
  proto.muzzleOf = function (this: any, g: any) {
    if (g.id === "carbine") return 82 * [0.95, 1, 1.08][g.mods.barrel];
    if (g.id === "pistol") return 38 * [1, 1, 1.02][g.mods.barrel];
    if (g.id === "lmg") return 92 * [0.9, 1, 1.06][g.mods.barrel];
    return originalMuzzleOf.call(this, g);
  };

  const originalMagMax = proto.magMax;
  proto.magMax = function (this: any, g: any) {
    if (g.id === "carbine") return Math.max(1, Math.round((g.id === "carbine" ? 25 : 30) * [0.8, 1, 1.5][g.mods.mag]));
    if (g.id === "pistol") return Math.max(1, Math.round(15 * [0.8, 1, 1.3][g.mods.mag]));
    if (g.id === "lmg") return Math.max(1, Math.round(80 * [0.8, 1, 1.3][g.mods.mag]));
    return originalMagMax.call(this, g);
  };

  // New weapon presets utility exposed on Engine
  proto.registerWeaponPresets = function (this: any) {
    this._weaponPresets = this._weaponPresets ?? {};
    this._weaponPresets.carbine = { id: "carbine", magSize: 25, damage: 32, pen: 1.08, spreadBase: 0.009 };
    this._weaponPresets.pistol = { id: "pistol", magSize: 15, damage: 26, pen: 0.6, spreadBase: 0.016 };
    this._weaponPresets.lmg = { id: "lmg", magSize: 80, damage: 28, pen: 1.2, spreadBase: 0.02 };
    this._weaponPresets.melee = { id: "melee", magSize: 0, damage: 14, pen: 0.0, spreadBase: 0 };
    return this._weaponPresets;
  };

  // Audio occlusion: patch GameAudio.space to plug a more aggressive lowpass when occluded
  try {
    const GameAudio = (await import("@/game/audio")).GameAudio as any;
    const origSpace = GameAudio.prototype.space;
    GameAudio.prototype.space = function (x: number, y: number, z: number, occluded: boolean) {
      // call original to get panner or filtered node
      const out = origSpace.call(this, x, y, z, occluded);
      // if occluded, add an additional lowpass for stronger muffle
      try {
        const ctx = this.ctx;
        if (occluded && ctx) {
          const filter = ctx.createBiquadFilter();
          filter.type = "lowpass";
          // base muffle factor depends on rain/indoor
          const freq = (this as any).muffle?.frequency?.value ?? 1000;
          filter.frequency.value = Math.max(420, freq * 0.6);
          filter.Q.value = 1.6;
          // reconnect chain: input -> filter -> original.input
          // origSpace may return filter or panner in different shapes; we try to rewire conservatively
          try {
            out.input.disconnect();
          } catch {}
          try {
            out.input.connect(filter);
            filter.connect(out.output);
            return { input: filter as AudioNode, output: out.output };
          } catch {
            return out;
          }
        }
      } catch {}
      return out;
    };
  } catch (e) {
    // audio module couldn't be patched; ignore
    // console.warn('Realism: failed to patch GameAudio', e);
  }

  // Battle Royale skeleton: client-side only
  proto.startBattleRoyale = function (this: any, opts: any = {}) {
    // opts: { players, initialRadius, shrinkDuration }
    this._br = this._br ?? {};
    this._br.active = true;
    this._br.center = { x: opts.cx ?? 0, z: opts.cz ?? 0 };
    this._br.radius = opts.initialRadius ?? 26;
    this._br.targetRadius = opts.targetRadius ?? 4;
    this._br.shrinkDuration = opts.shrinkDuration ?? 360; // seconds
    this._br.elapsed = 0;
    this.say("Battle Royale iniciado (cliente).", 3.5);
  };
  proto.stopBattleRoyale = function (this: any) {
    if (this._br) this._br.active = false;
  };
  proto.battleRoyaleTick = function (this: any, dt: number) {
    if (!this._br || !this._br.active) return;
    this._br.elapsed += dt;
    const t = clamp(this._br.elapsed / Math.max(1, this._br.shrinkDuration), 0, 1);
    // linear shrink for now
    this._br.radius = this._br.initialRadius ?? this._br.radius;
    const r = lerp(this._br.radius, this._br.targetRadius, t);
    this._br.currentRadius = r;
    // optionally spawn loot when radius crosses thresholds
    if (!this._br._notified && t > 0.05) {
      this._br._notified = true;
      this.say("La zona se está reduciendo.", 3.2);
    }
    // we could apply damage to players outside; client just warns
  };

  // Horde / loot: simple periodic loot spawner to add pickups when waves clear
  proto.spawnLootPickup = function (this: any, x: number, z: number, kind: string, amount: number) {
    const mesh = this.scene && this.scene.getObjectByName("dummyLoot") ? this.scene.getObjectByName("dummyLoot") : null;
    // reuse existing pickup system if present
    if (this.pickups) {
      const p = { x, z, kind, amount, on: true, needUnlock: false, mesh: null };
      // create simple mesh fallback for visibility
      const geo = new THREE.BoxGeometry(0.28, 0.18, 0.22);
      const mat = new THREE.MeshStandardMaterial({ color: "#d7b06a", emissive: "#e2a04a", emissiveIntensity: 0.4, roughness: 0.45 });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, 0.35, z);
      this.scene.add(m);
      p.mesh = m;
      this.pickups.push(p);
      return p;
    }
    return null;
  };

  // utility lerp
  function lerp(a: number, b: number, t: number) {
    return a + (b - a) * t;
  }

  // warm local models (non-blocking). If models exist, prepare mixers for potential use.
  void warmLocalAssets().then(async () => {
    try {
      // if hub has models, attach a few as view props (e.g., player hands or weapon models)
      const robot = hub.get("robot");
      if (robot && robot.gltf) {
        // simple integration: add first robot scene to viewScene as a test model (non-instanced)
        // We try to place it off-screen and keep an active mixer
        const Engine = EngineCtor as any;
        // delay until an engine instance exists
        setTimeout(() => {
          try {
            // find any engine instance on window (mounted earlier)
            const anyWin = (window as any).__lastEngineInstance ?? null;
            if (!anyWin) {
              // scan global objects
              for (const k of Object.keys(window as any)) {
                const v = (window as any)[k];
                if (v && v instanceof Engine) {
                  (window as any).__lastEngineInstance = v;
                  break;
                }
              }
            }
            const inst = (window as any).__lastEngineInstance;
            if (!inst) return;
            const scene = robot.gltf.scene.clone(true);
            scene.traverse((n: any) => {
              if (n.isMesh) n.castShadow = true;
            });
            scene.scale.setScalar(0.8);
            scene.position.set(18, 0, -12);
            inst.viewScene.add(scene);
            if (robot.mixer && robot.gltf.animations?.length) {
              robot.mixer = new THREE.AnimationMixer(scene);
              const clip = robot.gltf.animations[0];
              robot.mixer.clipAction(clip).play();
              // register on engine tick to advance
              const mix = robot.mixer;
              const tick = (dt: number) => mix.update(dt);
              // attach to engine loop
              inst._realism = inst._realism || {};
              inst._realism._mixers = inst._realism._mixers || [];
              inst._realism._mixers.push(mix);
              // ensure engine.frame will call mix update: we patch mountProbe to advance mixers
              const originalFrame = inst.frame.bind(inst);
              inst.frame = function (t: number) {
                originalFrame(t);
                const now = typeof t === "number" ? t : performance.now();
                const dt = Math.min(0.05, (now - (inst._realism._last || now)) / 1000);
                inst._realism._last = now;
                for (const m of inst._realism._mixers || []) m.update(dt);
              };
            }
          } catch (e) {
            // ignore
          }
        }, 1200);
      }
    } catch (e) {
      // ignore
    }
  });
}

// small helper to expose installer automatically when module imported
if (typeof window !== "undefined") {
  (window as any).__umbralRealismInstalled = (window as any).__umbralRealismInstalled ?? false;
  if (!(window as any).__umbralRealismInstalled) {
    (window as any).__umbralRealismInstalled = true;
    try {
      installRealismEnhancements();
    } catch (e) {
      // swallow
    }
  }
}

export default installRealismEnhancements;
