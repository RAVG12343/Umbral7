import * as THREE from "three";
import { scaleBoxUvs, type TexSet } from "@/game/textures";

export type MatKind = "concrete" | "brick" | "wood" | "metal" | "plaster";

export type Block = {
  id: string;
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  mat: MatKind;
  gate?: boolean;
};

export type OpeningDef = {
  id: string;
  x: number;
  z: number;
  axis: "x" | "z";
  halfW: number;
  kind: "door" | "window" | "gate";
  glass: boolean;
  out: 1 | -1;
  sill: number;
  top: number;
  locked?: boolean;
};

const H = (h: number) => h / 2;

/** Expanded realistic city block — ~2x original size with more buildings */
export const BLOCKS: Block[] = [
  { id: "wall-n", x: 0, y: H(5.2), z: -42, w: 78, h: 5.2, d: 0.9, mat: "concrete" },
  { id: "wall-s", x: 0, y: H(5.2), z: 34, w: 78, h: 5.2, d: 0.9, mat: "concrete" },
  { id: "wall-w", x: -39, y: H(5.2), z: -4, w: 0.9, h: 5.2, d: 76, mat: "concrete" },
  { id: "wall-e", x: 39, y: H(5.2), z: -4, w: 0.9, h: 5.2, d: 76, mat: "concrete" },

  { id: "apt-w", x: -14, y: H(3.6), z: -22, w: 0.55, h: 3.6, d: 18, mat: "brick" },
  { id: "apt-e", x: 14, y: H(3.6), z: -22, w: 0.55, h: 3.6, d: 18, mat: "brick" },
  { id: "apt-n", x: 0, y: H(3.6), z: -31, w: 28.5, h: 3.6, d: 0.55, mat: "brick" },
  { id: "apt-fl", x: -11.5, y: H(3.6), z: -13, w: 4.5, h: 3.6, d: 0.55, mat: "brick" },
  { id: "apt-fml", x: -4.2, y: H(3.6), z: -13, w: 5, h: 3.6, d: 0.55, mat: "brick" },
  { id: "apt-fmr", x: 4.2, y: H(3.6), z: -13, w: 5, h: 3.6, d: 0.55, mat: "brick" },
  { id: "apt-fr", x: 11.5, y: H(3.6), z: -13, w: 4.5, h: 3.6, d: 0.55, mat: "brick" },
  { id: "apt-lintel-d", x: 0, y: 3.05, z: -13, w: 3.4, h: 1.1, d: 0.55, mat: "brick" },
  { id: "apt-lintel-w", x: -8, y: 3.05, z: -13, w: 3, h: 1.1, d: 0.55, mat: "brick" },
  { id: "apt-lintel-e", x: 8, y: 3.05, z: -13, w: 3, h: 1.1, d: 0.55, mat: "brick" },
  { id: "apt-sill-w", x: -8, y: 0.15, z: -13, w: 2.9, h: 0.3, d: 0.58, mat: "brick" },
  { id: "apt-sill-e", x: 8, y: 0.15, z: -13, w: 2.9, h: 0.3, d: 0.58, mat: "brick" },
  { id: "apt-mid", x: 0, y: H(3.2), z: -22, w: 0.4, h: 3.2, d: 10, mat: "plaster" },

  { id: "cli-e", x: 28, y: H(3.4), z: -2, w: 0.55, h: 3.4, d: 16, mat: "plaster" },
  { id: "cli-n", x: 22, y: H(3.4), z: -10, w: 12, h: 3.4, d: 0.55, mat: "plaster" },
  { id: "cli-s", x: 22, y: H(3.4), z: 6, w: 12, h: 3.4, d: 0.55, mat: "plaster" },
  { id: "cli-wn", x: 16, y: H(3.4), z: -7.5, w: 0.55, h: 3.4, d: 4.5, mat: "plaster" },
  { id: "cli-wm", x: 16, y: H(3.4), z: -1, w: 0.55, h: 3.4, d: 3, mat: "plaster" },
  { id: "cli-ws", x: 16, y: H(3.4), z: 4.2, w: 0.55, h: 3.4, d: 3.5, mat: "plaster" },
  { id: "cli-lintel-d", x: 16, y: 2.9, z: 1.5, w: 0.55, h: 1, d: 2.2, mat: "plaster" },
  { id: "cli-lintel-w", x: 16, y: 2.9, z: -4, w: 0.55, h: 1, d: 2.5, mat: "plaster" },
  { id: "cli-sill", x: 16, y: 0.15, z: -4, w: 0.58, h: 0.3, d: 2.4, mat: "plaster" },

  { id: "wh-w", x: -32, y: H(4), z: -4, w: 0.55, h: 4, d: 20, mat: "concrete" },
  { id: "wh-n", x: -25, y: H(4), z: -14, w: 14, h: 4, d: 0.55, mat: "concrete" },
  { id: "wh-s", x: -25, y: H(4), z: 6, w: 14, h: 4, d: 0.55, mat: "concrete" },
  { id: "wh-a", x: -18, y: H(4), z: -10, w: 0.55, h: 4, d: 8, mat: "concrete" },
  { id: "wh-b", x: -18, y: H(4), z: -2.5, w: 0.55, h: 4, d: 3.5, mat: "concrete" },
  { id: "wh-c", x: -18, y: H(4), z: 3.5, w: 0.55, h: 4, d: 3, mat: "concrete" },
  { id: "gate", x: -18, y: H(3.4), z: 0.5, w: 0.3, h: 3.4, d: 3.5, mat: "metal", gate: true },

  { id: "gas-n", x: 22, y: H(2.8), z: 18, w: 14, h: 2.8, d: 0.5, mat: "metal" },
  { id: "gas-s", x: 22, y: H(2.8), z: 28, w: 14, h: 2.8, d: 0.5, mat: "metal" },
  { id: "gas-e", x: 29, y: H(2.8), z: 23, w: 0.5, h: 2.8, d: 10, mat: "metal" },
  { id: "gas-w", x: 15, y: H(2.8), z: 23, w: 0.5, h: 2.8, d: 10, mat: "metal" },
  { id: "pump-a", x: 20, y: H(1.4), z: 22, w: 0.8, h: 1.4, d: 0.6, mat: "metal" },
  { id: "pump-b", x: 24, y: H(1.4), z: 22, w: 0.8, h: 1.4, d: 0.6, mat: "metal" },

  { id: "off-n", x: -22, y: H(3.2), z: 16, w: 16, h: 3.2, d: 0.5, mat: "concrete" },
  { id: "off-s", x: -22, y: H(3.2), z: 26, w: 16, h: 3.2, d: 0.5, mat: "concrete" },
  { id: "off-w", x: -30, y: H(3.2), z: 21, w: 0.5, h: 3.2, d: 10, mat: "concrete" },
  { id: "off-e", x: -14, y: H(3.2), z: 21, w: 0.5, h: 3.2, d: 10, mat: "concrete" },
  { id: "off-desk", x: -24, y: H(0.9), z: 20, w: 2.2, h: 0.9, d: 1.1, mat: "wood" },

  { id: "crate-a", x: -3, y: H(1.1), z: -2, w: 1.6, h: 1.1, d: 1.5, mat: "wood" },
  { id: "crate-b", x: 5, y: H(1.15), z: -5, w: 1.8, h: 1.15, d: 1.2, mat: "wood" },
  { id: "crate-c", x: -5, y: H(1), z: 10, w: 2.2, h: 1, d: 1.2, mat: "wood" },
  { id: "crate-d", x: 8, y: H(1.2), z: 12, w: 1.5, h: 1.2, d: 1.5, mat: "wood" },
  { id: "lowwall", x: 8, y: H(1.1), z: 0, w: 0.45, h: 1.1, d: 3.2, mat: "concrete" },
  { id: "lowwall2", x: -8, y: H(1.05), z: 4, w: 3, h: 1.05, d: 0.45, mat: "concrete" },
  { id: "car-w", x: -24, y: H(1.4), z: 10, w: 1.9, h: 1.4, d: 4.3, mat: "metal" },
  { id: "car-e", x: 20, y: H(1.2), z: -16, w: 1.8, h: 1.2, d: 3.8, mat: "metal" },
  { id: "car-s", x: 4, y: H(1.3), z: 20, w: 1.85, h: 1.3, d: 4, mat: "metal" },
  { id: "terminal", x: -6, y: H(1.1), z: 6, w: 1.4, h: 1.1, d: 0.75, mat: "metal" },
  { id: "wardrobe", x: -11, y: H(2.1), z: -26, w: 1.4, h: 2.1, d: 2.8, mat: "wood" },
  { id: "counter", x: 24, y: H(1.05), z: -6, w: 1.6, h: 1.05, d: 3.5, mat: "wood" },
  { id: "dumpster", x: 12, y: H(1.3), z: 8, w: 2.4, h: 1.3, d: 1.4, mat: "metal" },
  { id: "bench", x: -2, y: H(0.55), z: 14, w: 2.5, h: 0.55, d: 0.7, mat: "wood" },
  { id: "fence-a", x: 0, y: H(1.6), z: 30, w: 12, h: 1.6, d: 0.2, mat: "metal" },
  { id: "barrel-a", x: -10, y: H(1.1), z: 18, w: 0.7, h: 1.1, d: 0.7, mat: "metal" },
  { id: "barrel-b", x: 30, y: H(1.1), z: 12, w: 0.7, h: 1.1, d: 0.7, mat: "metal" },
];

export const OPENINGS: OpeningDef[] = [
  { id: "apt-door", x: 0, z: -13, axis: "z", halfW: 1.6, kind: "door", glass: false, out: 1, sill: 0, top: 2.4 },
  { id: "apt-win-w", x: -8, z: -13, axis: "z", halfW: 1.4, kind: "window", glass: true, out: 1, sill: 0.9, top: 2.4 },
  { id: "apt-win-e", x: 8, z: -13, axis: "z", halfW: 1.4, kind: "window", glass: true, out: 1, sill: 0.9, top: 2.4 },
  { id: "cli-door", x: 16, z: 1.5, axis: "x", halfW: 1.05, kind: "door", glass: false, out: -1, sill: 0, top: 2.3 },
  { id: "cli-win", x: 16, z: -4, axis: "x", halfW: 1.2, kind: "window", glass: true, out: -1, sill: 0.95, top: 2.3 },
  { id: "wh-gate", x: -18, z: 0.5, axis: "x", halfW: 1.7, kind: "gate", glass: false, out: 1, sill: 0, top: 3.2, locked: true },
  { id: "gas-door", x: 15, z: 23, axis: "x", halfW: 1.2, kind: "door", glass: false, out: 1, sill: 0, top: 2.2 },
  { id: "off-door", x: -14, z: 21, axis: "x", halfW: 1.1, kind: "door", glass: false, out: -1, sill: 0, top: 2.2 },
  { id: "off-win", x: -22, z: 16, axis: "z", halfW: 1.5, kind: "window", glass: true, out: -1, sill: 0.9, top: 2.3 },
];

export const LAMPS = [
  { x: -10, z: -6 }, { x: 10, z: -6 }, { x: -6, z: 12 }, { x: 14, z: 8 },
  { x: -20, z: 8 }, { x: 26, z: -14 }, { x: -28, z: -8 }, { x: 6, z: 24 }, { x: -16, z: 22 },
];

export const INTERIOR_LIGHTS = [
  { x: 0, y: 2.8, z: -22, color: "#ffd9a8", intensity: 1.4, dist: 9 },
  { x: -8, y: 2.8, z: -20, color: "#ffd9a8", intensity: 0.9, dist: 6 },
  { x: 8, y: 2.8, z: -20, color: "#ffd9a8", intensity: 0.9, dist: 6 },
  { x: 22, y: 2.7, z: -2, color: "#c8e0ff", intensity: 1.2, dist: 8 },
  { x: -25, y: 3.2, z: -4, color: "#ffe0b0", intensity: 1.1, dist: 10 },
  { x: 22, y: 2.4, z: 23, color: "#ffcc88", intensity: 0.9, dist: 7 },
  { x: -22, y: 2.6, z: 21, color: "#dde8f0", intensity: 0.8, dist: 7 },
];

export function buildWorld(scene: THREE.Scene, tex: TexSet) {
  const mats: Record<MatKind, THREE.MeshStandardMaterial> = {
    concrete: new THREE.MeshStandardMaterial({ map: tex.concrete, roughness: 0.92, metalness: 0.05 }),
    brick: new THREE.MeshStandardMaterial({ map: tex.brick, roughness: 0.88, metalness: 0.02 }),
    wood: new THREE.MeshStandardMaterial({ map: tex.wood, roughness: 0.78, metalness: 0.01 }),
    metal: new THREE.MeshStandardMaterial({ map: tex.metal, roughness: 0.45, metalness: 0.75 }),
    plaster: new THREE.MeshStandardMaterial({ map: tex.plaster, roughness: 0.9, metalness: 0.01 }),
  };

  const gateMeshes: THREE.Mesh[] = [];

  for (const b of BLOCKS) {
    const geo = new THREE.BoxGeometry(b.w, b.h, b.d);
    scaleBoxUvs(geo, b.w, b.h, b.d);
    const mesh = new THREE.Mesh(geo, mats[b.mat]);
    mesh.position.set(b.x, b.y, b.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = b.id;
    scene.add(mesh);
    if (b.gate) gateMeshes.push(mesh);
  }

  const groundGeo = new THREE.PlaneGeometry(90, 90);
  const ground = new THREE.Mesh(
    groundGeo,
    new THREE.MeshStandardMaterial({ map: tex.ground, roughness: 0.95, metalness: 0.02 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  ground.receiveShadow = true;
  ground.name = "ground";
  scene.add(ground);

  const lineMat = new THREE.MeshStandardMaterial({ color: "#c8c4b8", roughness: 0.85 });
  for (let i = -3; i <= 3; i++) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 4), lineMat);
    line.position.set(i * 3.5, 0.015, 2);
    scene.add(line);
  }

  const poleMat = new THREE.MeshStandardMaterial({ color: "#3a3a38", roughness: 0.7, metalness: 0.4 });
  const headMat = new THREE.MeshStandardMaterial({ color: "#2a2a28", roughness: 0.5, metalness: 0.6 });
  for (const lamp of LAMPS) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.5, 6), poleMat);
    pole.position.set(lamp.x, 1.75, lamp.z);
    pole.castShadow = true;
    scene.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.14, 0.24), headMat);
    head.position.set(lamp.x, 3.4, lamp.z);
    scene.add(head);
  }

  const sock = new THREE.Mesh(
    new THREE.PlaneGeometry(0.7, 0.28),
    new THREE.MeshStandardMaterial({ color: "#e2a04a", side: THREE.DoubleSide, roughness: 0.55 }),
  );
  sock.position.set(-8, 3.3, -4);
  sock.name = "windsock";
  scene.add(sock);

  const debrisGeo = new THREE.BoxGeometry(1, 1, 1);
  const debris = new THREE.InstancedMesh(debrisGeo, mats.concrete, 220);
  debris.castShadow = false;
  debris.receiveShadow = true;
  const dummy = new THREE.Object3D();
  let n = 0;
  const rand = (s: number) => {
    const x = Math.sin(s * 127.1) * 43758.5453;
    return x - Math.floor(x);
  };
  for (let i = 0; i < 600 && n < 220; i++) {
    const x = -36 + rand(i + 1) * 72;
    const z = -38 + rand(i + 9) * 72;
    if (Math.abs(x) < 4 && Math.abs(z - 2) < 3) continue;
    dummy.position.set(x, 0.04, z);
    dummy.rotation.set(0, rand(i) * 6, 0);
    const s = 0.06 + rand(i + 3) * 0.18;
    dummy.scale.set(s, 0.04 + rand(i + 4) * 0.09, s);
    dummy.updateMatrix();
    debris.setMatrixAt(n, dummy.matrix);
    n++;
  }
  debris.count = n;
  scene.add(debris);

  return { mats, gateMeshes };
}
