import * as THREE from "three";

export function installRealismEnhancements() {
  if (typeof window === "undefined") return;
  const EngineCtor = (globalThis as any).EngineCtor ?? null;
  if (!EngineCtor) {
    const bridge = (window as any).__umbralModelBridge ?? {
      ready: false,
      fallback: "instanced",
      hasAssets: false,
    };
    (window as any).__umbralModelBridge = bridge;
    void fetch("/models/manifest.json", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((manifest) => {
        if (!manifest) return;
        bridge.ready = true;
        bridge.hasAssets = true;
        bridge.fallback = "mixed";
      })
      .catch(() => {
        bridge.ready = false;
        bridge.hasAssets = false;
        bridge.fallback = "instanced";
      });
    return;
  }

  const proto = EngineCtor.prototype as any;
  if (proto.__umbral7Realism) return;
  proto.__umbral7Realism = true;

  const bridge = (window as any).__umbralModelBridge ?? {
    ready: false,
    fallback: "instanced",
    hasAssets: false,
  };
  (window as any).__umbralModelBridge = bridge;

  const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
  const angNorm = (d: number) => Math.atan2(Math.sin(d), Math.cos(d));

  const originalPoseZeds = proto.poseZeds;
  proto.poseZeds = function (this: any) {
    const root = this.dummy;
    const part = this.part;
    const max = this.zeds.length;
    for (let i = 0; i < max; i++) {
      const z = this.zeds[i];
      const show = z.alive || z.deadT < 8;
      const lie = z.alive ? 0 : clamp(z.deadT / 0.28, 0, 1);
      const dx = this.x - z.x;
      const dz = this.z - z.z;
      const target = Math.atan2(dx, dz);
      const delta = angNorm(target - z.yaw);
      const headTurn = clamp(delta, -0.5, 0.5);
      z.__headTurn = (z.__headTurn ?? 0) * 0.8 + headTurn * 0.2;
      z.__torsoTwist = (z.__torsoTwist ?? 0) * 0.8 + headTurn * 0.12;
      root.position.set(z.x, (z.alive ? z.y : 0.15) + lie * 0.05, z.z);
      const lean = z.stumble > 0 ? Math.sin(z.phase * 6) * 0.9 * Math.min(1, z.stumble * 6) : 0;
      root.rotation.set(lie * 1.25, z.yaw + (z.alive ? 0 : z.deadT * 0.2), lean);
      root.scale.setScalar(show ? 1 : 0);
      root.updateMatrix();
      const sc = z.scale;
      const swing = Math.sin(z.phase) * (z.alive && Math.hypot(z.vx, z.vz) > 0.2 ? 0.7 : 0.05);
      const place = (mesh: any, lx: number, ly: number, lz: number, rx: number, sx = 1, sy = 1, sz = 1, extraRotY = 0) => {
        part.position.set(lx * sc, ly * sc, lz * sc);
        part.rotation.set(rx, (z.__torsoTwist ?? 0) + extraRotY, Math.sin(z.phase * 1.3) * 0.02);
        part.scale.set(sx * sc, sy * sc, sz * sc);
        part.updateMatrix();
        this.tmpM.multiplyMatrices(root.matrix, part.matrix);
        mesh.setMatrixAt(i, this.tmpM);
      };

      place(this.torsoM, 0, 1.02, 0, z.kind === "runner" ? 0.25 : 0, z.kind === "tank" ? 1.25 : 1, 1, z.kind === "stalker" ? 0.85 : 1);
      const headYaw = (z.__headTurn ?? 0) * 0.55;
      place(this.headM, 0, 1.48, z.kind === "runner" ? -0.06 : 0, headYaw);

      place(this.armM, -0.3, 1.28, 0, swing, 1, 1, 1);
      part.position.set(0.3 * sc, 1.28 * sc, 0);
      part.rotation.set(-swing, 0, 0);
      part.scale.set(sc, sc, sc);
      part.updateMatrix();
      this.tmpM.multiplyMatrices(root.matrix, part.matrix);
      this.armM.setMatrixAt(i + max, this.tmpM);

      const legSwing = Math.sin(z.phase * (z.alive ? (1.8 + Math.hypot(z.vx, z.vz)) : 1.0)) * (z.alive ? 0.55 : 0.02);
      place(this.legM, -0.12, 0.72, 0, -legSwing);
      part.position.set(0.12 * sc, 0.72 * sc, 0);
      part.rotation.set(legSwing, 0, 0);
      part.scale.set(sc, z.leg <= 0 ? sc * 0.7 : sc, sc);
      part.updateMatrix();
      this.tmpM.multiplyMatrices(root.matrix, part.matrix);
      this.legM.setMatrixAt(i + max, this.tmpM);

      place(this.eyeM, -0.06, 1.52, -0.12, 0, 1, 1, 1);
      part.position.set(0.06 * sc, 1.52 * sc, -0.12 * sc);
      part.rotation.set(0, 0, 0);
      part.scale.set(sc, sc, sc);
      part.updateMatrix();
      this.tmpM.multiplyMatrices(root.matrix, part.matrix);
      this.eyeM.setMatrixAt(i + max, this.tmpM);

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
      this.armM.setColorAt(i + max, this.tmpC);

      const legBleed = 1 - clamp(z.leg / (z.legMax || 1), 0, 1);
      this.tmpC.copy(z.skin).lerp(this.bloodC, Math.max(z.blood * 0.6, legBleed));
      this.legM.setColorAt(i, this.tmpC);
      this.legM.setColorAt(i + max, this.tmpC);
      this.eyeM.setColorAt(i, this.tmpC.set((this as any).EYE?.[z.kind] ?? "#ffffff"));
      this.eyeM.setColorAt(i + max, this.tmpC);
    }

    for (const m of [this.torsoM, this.headM, this.armM, this.legM, this.eyeM, this.blobM]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  };

  const originalFly = proto.fly;
  proto.fly = function (this: any, b: any, dt: number) {
    const s = Math.hypot(b.vx, b.vy, b.vz) || 1;
    b.vx *= 1 - 0.02 * dt;
    b.vy *= 1 - 0.015 * dt;
    b.vz *= 1 - 0.02 * dt;
    b.vy -= 11 * dt * 0.94;
    if (s > 0.1) {
      const drag = 0.03 + Math.min(0.04, s * 0.0025);
      b.vx -= (b.vx / s) * drag * dt;
      b.vy -= (b.vy / s) * drag * dt * 0.4;
      b.vz -= (b.vz / s) * drag * dt;
    }
    return originalFly.call(this, b, dt);
  };

  const originalHitCol = proto.hitCol;
  proto.hitCol = function (this: any, b: any, c: any) {
    const out = originalHitCol.call(this, b, c);
    if (b && out !== undefined) {
      b.vx *= 0.74;
      b.vz *= 0.74;
      b.vy *= 0.58;
      b.energy *= 0.9;
    }
    return out;
  };

  void fetch("/models/manifest.json", { cache: "no-store" })
    .then((res) => (res.ok ? res.json() : null))
    .then((manifest) => {
      if (!manifest) return;
      bridge.ready = true;
      bridge.hasAssets = true;
      bridge.fallback = "mixed";
    })
    .catch(() => {
      bridge.ready = false;
      bridge.hasAssets = false;
      bridge.fallback = "instanced";
    });
}

export function getModelBridge() {
  if (typeof window === "undefined") return { ready: false, fallback: "instanced", hasAssets: false };
  const bridge = (window as any).__umbralModelBridge ?? { ready: false, fallback: "instanced", hasAssets: false };
  (window as any).__umbralModelBridge = bridge;
  return bridge;
}

;(globalThis as any).EngineCtor = (globalThis as any).EngineCtor ?? (await import("@/game/engine").then((m) => m.Engine));

if (typeof window !== "undefined") {
  (window as any).__umbral7Realism = true;
  installRealismEnhancements();
}

export default installRealismEnhancements;
