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
  /** Thin axis of the wall. */
  axis: "x" | "z";
  halfW: number;
  kind: "door" | "window" | "gate";
  glass: boolean;
  /** +1 pushes barricade planks toward courtyard along the thin axis. */
  out: 1 | -1;
  sill: number;
  top: number;
  locked?: boolean;
};

const H = (h: number) => h / 2;

export const BLOCKS: Block[] = [
  { id: "wall-n", x: 0, y: H(4.8), z: -30, w: 52.6, h: 4.8, d: 0.8, mat: "concrete" },
  { id: "wall-s", x: 0, y: H(4.8), z: 22, w: 52.6, h: 4.8, d: 0.8, mat: "concrete" },
  { id: "wall-w", x: -26, y: H(4.8), z: -4, w: 0.8, h: 4.8, d: 52.6, mat: "concrete" },
  { id: "wall-e", x: 26, y: H(4.8), z: -4, w: 0.8, h: 4.8, d: 52.6, mat: "concrete" },

  { id: "apt-w", x: -12, y: H(3.3), z: -15, w: 0.5, h: 3.3, d: 14.2, mat: "brick" },
  { id: "apt-e", x: 12, y: H(3.3), z: -15, w: 0.5, h: 3.3, d: 14.2, mat: "brick" },
  { id: "apt-n", x: 0, y: H(3.3), z: -22, w: 24.6, h: 3.3, d: 0.5, mat: "brick" },
  { id: "apt-fl", x: -10.15, y: H(3.3), z: -8, w: 3.7, h: 3.3, d: 0.5, mat: "brick" },
  { id: "apt-fml", x: -3.6, y: H(3.3), z: -8, w: 4.2, h: 3.3, d: 0.5, mat: "brick" },
  { id: "apt-fmr", x: 3.6, y: H(3.3), z: -8, w: 4.2, h: 3.3, d: 0.5, mat: "brick" },
  { id: "apt-fr", x: 10.15, y: H(3.3), z: -8, w: 3.7, h: 3.3, d: 0.5, mat: "brick" },
  { id: "apt-lintel-d", x: 0, y: 2.8, z: -8, w: 3.1, h: 1.05, d: 0.5, mat: "brick" },
  { id: "apt-lintel-w", x: -7, y: 2.8, z: -8, w: 2.7, h: 1.05, d: 0.5, mat: "brick" },
  { id: "apt-lintel-e", x: 7, y: 2.8, z: -8, w: 2.7, h: 1.05, d: 0.5, mat: "brick" },
  { id: "apt-sill-w", x: -7, y: 0.14, z: -8, w: 2.6, h: 0.28, d: 0.52, mat: "brick" },
  { id: "apt-sill-e", x: 7, y: 0.14, z: -8, w: 2.6, h: 0.28, d: 0.52, mat: "brick" },

  { id: "cli-e", x: 23, y: H(3.2), z: -1, w: 0.5, h: 3.2, d: 14.2, mat: "plaster" },
  { id: "cli-n", x: 18.5, y: H(3.2), z: -8, w: 9.2, h: 3.2, d: 0.5, mat: "plaster" },
  { id: "cli-s", x: 18.5, y: H(3.2), z: 6, w: 9.2, h: 3.2, d: 0.5, mat: "plaster" },
  { id: "cli-wn", x: 14, y: H(3.2), z: -6.15, w: 0.5, h: 3.2, d: 3.7, mat: "plaster" },
  { id: "cli-wm", x: 14, y: H(3.2), z: -0.85, w: 0.5, h: 3.2, d: 2.5, mat: "plaster" },
  { id: "cli-ws", x: 14, y: H(3.2), z: 4.2, w: 0.5, h: 3.2, d: 3.6, mat: "plaster" },
  { id: "cli-lintel-d", x: 14, y: 2.72, z: 1.4, w: 0.5, h: 0.95, d: 2.1, mat: "plaster" },
  { id: "cli-lintel-w", x: 14, y: 2.72, z: -3.2, w: 0.5, h: 0.95, d: 2.3, mat: "plaster" },
  { id: "cli-sill", x: 14, y: 0.14, z: -3.2, w: 0.52, h: 0.28, d: 2.2, mat: "plaster" },

  { id: "wh-w", x: -24, y: H(3.6), z: -4, w: 0.5, h: 3.6, d: 16.2, mat: "concrete" },
  { id: "wh-n", x: -19, y: H(3.6), z: -12, w: 10.2, h: 3.6, d: 0.5, mat: "concrete" },
  { id: "wh-s", x: -19, y: H(3.6), z: 4, w: 10.2, h: 3.6, d: 0.5, mat: "concrete" },
  { id: "wh-a", x: -14, y: H(3.6), z: -8.25, w: 0.5, h: 3.6, d: 7.5, mat: "concrete" },
  { id: "wh-b", x: -14, y: H(3.6), z: -3.05, w: 0.5, h: 3.6, d: 2.9, mat: "concrete" },
  { id: "wh-c", x: -14, y: H(3.6), z: 2.8, w: 0.5, h: 3.6, d: 2.4, mat: "concrete" },
  { id: "gate", x: -14, y: H(3.2), z: 0, w: 0.28, h: 3.2, d: 3.2, mat: "metal", gate: true },

  { id: "crate-a", x: -2.4, y: H(1.05), z: -3.4, w: 1.5, h: 1.05, d: 1.5, mat: "wood" },
  { id: "crate-b", x: 3.4, y: H(1.1), z: -4.6, w: 1.7, h: 1.1, d: 1.15, mat: "wood" },
  { id: "crate-c", x: -3.6, y: H(1), z: 7.2, w: 2.1, h: 1, d: 1.15, mat: "wood" },
  { id: "lowwall", x: 6.2, y: H(1.05), z: -0.6, w: 0.42, h: 1.05, d: 2.8, mat: "concrete" },
  { id: "car-w", x: -18, y: H(1.35), z: 8.5, w: 1.85, h: 1.35, d: 4.1, mat: "metal" },
  { id: "car-e", x: 16.5, y: H(1.15), z: -12, w: 1.75, h: 1.15, d: 3.6, mat: "metal" },
  { id: "terminal", x: -5, y: H(1.05), z: 5.2, w: 1.35, h: 1.05, d: 0.72, mat: "metal" },
  { id: "wardrobe", x: -9.2, y: H(2), z: -18.4, w: 1.3, h: 2, d: 2.6, mat: "wood" },
  { id: "counter", x: 19.4, y: H(1), z: -5.2, w: 1.5, h: 1, d: 3.2, mat: "wood" },
];

export const OPENINGS: OpeningDef[] = [
  { id: "apt-door", x: 0, z: -8, axis: "z", halfW: 1.5, kind: "door", glass: false, out: 1, sill: 0, top: 2.25 },
  { id: "apt-win-w", x: -7, z: -8, axis: "z", halfW: 1.3, kind: "window", glass: true, out: 1, sill: 0.85, top: 2.25 },
  { id: "apt-win-e", x: 7, z: -8, axis: "z", halfW: 1.3, kind: "window", glass: true, out: 1, sill: 0.85, top: 2.25 },
  { id: "cli-door", x: 14, z: 1.4, axis: "x", halfW: 1, kind: "door", glass: false, out: -1, sill: 0, top: 2.2 },
  { id: "cli-win", x: 14, z: -3.2, axis: "x", halfW: 1.1, kind: "window", glass: true, out: -1, sill: 0.9, top: 2.2 },
  { id: "wh-gate", x: -14, z: 0, axis: "x", halfW: 1.6, kind: "gate", glass: false, out: 1, sill: 0, top: 2.4, locked: true },
];

export const LAMPS = [
  { x: -8, z: -5.2 },
  { x: 8, z: -5.2 },
  { x: -8, z: 9 },
  { x: 11, z: 11 },
  { x: 0, z: -5.6 },
];

export const INTERIOR_LIGHTS = [
  { x: 0, y: 2.4, z: -15, color: "#ffb27a", intensity: 6 },
  { x: 18.2, y: 2.3, z: -1, color: "#d5e2ff", intensity: 4.5 },
  { x: -19, y: 2.6, z: -4, color: "#ffb27a", intensity: 2.2 },
];

function matFor(kind: MatKind, tex: TexSet, rough: number, metalness = 0) {
  const map = tex[kind];
  return new THREE.MeshStandardMaterial({ map, roughness: rough, metalness });
}

function addBox(scene: THREE.Scene, b: Block, material: THREE.Material) {
  const geo = new THREE.BoxGeometry(b.w, b.h, b.d);
  scaleBoxUvs(geo, b.w, b.h, b.d);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(b.x, b.y, b.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function signTexture(label: string) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 128;
  const g = c.getContext("2d");
  if (!g) throw new Error("2d");
  g.fillStyle = "#141612";
  g.fillRect(0, 0, 512, 128);
  g.strokeStyle = "#e2a04a";
  g.lineWidth = 8;
  g.strokeRect(10, 10, 492, 108);
  g.fillStyle = "#e7e2d6";
  g.font = "700 68px 'Barlow Condensed', sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(label, 256, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildWorld(scene: THREE.Scene, tex: TexSet) {
  const groundGeo = new THREE.PlaneGeometry(90, 90);
  const uv = groundGeo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 18, uv.getY(i) * 18);
  const ground = new THREE.Mesh(
    groundGeo,
    new THREE.MeshStandardMaterial({ map: tex.asphalt, roughness: 0.94, metalness: 0.02 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.name = "ground";
  scene.add(ground);

  const mats: Record<MatKind, THREE.MeshStandardMaterial> = {
    concrete: matFor("concrete", tex, 0.92),
    brick: matFor("brick", tex, 0.88),
    wood: matFor("wood", tex, 0.78),
    metal: matFor("metal", tex, 0.42, 0.72),
    plaster: matFor("plaster", tex, 0.94),
  };

  const gateMeshes: THREE.Mesh[] = [];
  for (const b of BLOCKS) {
    const mesh = addBox(scene, b, mats[b.mat]);
    mesh.name = b.id;
    if (b.gate) gateMeshes.push(mesh);
  }

  const roofMat = mats.concrete;
  const roofs: Array<[number, number, number, number, number]> = [
    [0, -15, 24.4, 14.4, 3.42],
    [18.5, -1, 9.4, 14.4, 3.32],
    [-19, -4, 10.4, 16.4, 3.72],
  ];
  for (const [x, z, w, d, y] of roofs) {
    const geo = new THREE.BoxGeometry(w, 0.16, d);
    scaleBoxUvs(geo, w, 0.16, d);
    const m = new THREE.Mesh(geo, roofMat);
    m.position.set(x, y, z);
    m.receiveShadow = true;
    m.castShadow = true;
    scene.add(m);
  }

  const signMat = (label: string) =>
    new THREE.MeshStandardMaterial({
      map: signTexture(label),
      roughness: 0.6,
      metalness: 0.05,
      emissive: new THREE.Color("#3a2a14"),
      emissiveIntensity: 0.35,
    });

  const s1 = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), signMat("VIVIENDA"));
  s1.position.set(0, 2.65, -7.68);
  scene.add(s1);
  const s2 = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.55), signMat("CLÍNICA"));
  s2.position.set(13.68, 2.5, 1.4);
  s2.rotation.y = -Math.PI / 2;
  scene.add(s2);
  const s3 = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.55), signMat("ALMACÉN"));
  s3.position.set(-13.68, 2.7, 0);
  s3.rotation.y = Math.PI / 2;
  scene.add(s3);

  const poleMat = new THREE.MeshStandardMaterial({ color: "#2a2c2a", roughness: 0.7, metalness: 0.4 });
  const headMat = new THREE.MeshStandardMaterial({
    color: "#ffd7a2",
    emissive: "#e2a04a",
    emissiveIntensity: 0.8,
    roughness: 0.35,
  });
  for (const lamp of LAMPS) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.3, 6), poleMat);
    pole.position.set(lamp.x, 1.65, lamp.z);
    pole.castShadow = true;
    scene.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.12, 0.22), headMat);
    head.position.set(lamp.x, 3.25, lamp.z);
    scene.add(head);
  }

  const sock = new THREE.Mesh(
    new THREE.PlaneGeometry(0.7, 0.28),
    new THREE.MeshStandardMaterial({ color: "#e2a04a", side: THREE.DoubleSide, roughness: 0.55 }),
  );
  sock.position.set(-6.2, 3.15, -5.2);
  sock.name = "windsock";
  scene.add(sock);

  const debrisGeo = new THREE.BoxGeometry(1, 1, 1);
  const debris = new THREE.InstancedMesh(debrisGeo, mats.concrete, 160);
  debris.castShadow = false;
  debris.receiveShadow = true;
  const dummy = new THREE.Object3D();
  let n = 0;
  const rand = (s: number) => {
    const x = Math.sin(s * 127.1) * 43758.5453;
    return x - Math.floor(x);
  };
  for (let i = 0; i < 400 && n < 160; i++) {
    const x = -24 + rand(i + 1) * 48;
    const z = -28 + rand(i + 9) * 48;
    const insideApt = x > -12 && x < 12 && z > -22 && z < -8;
    const insideCli = x > 14 && x < 23 && z > -8 && z < 6;
    const insideWh = x > -24 && x < -14 && z > -12 && z < 4;
    if (insideApt || insideCli || insideWh) continue;
    if (Math.hypot(x, z - 2) < 2.2) continue;
    dummy.position.set(x, 0.04, z);
    dummy.rotation.set(0, rand(i) * 6, 0);
    const s = 0.06 + rand(i + 3) * 0.16;
    dummy.scale.set(s, 0.04 + rand(i + 4) * 0.08, s);
    dummy.updateMatrix();
    debris.setMatrixAt(n, dummy.matrix);
    n++;
  }
  debris.count = n;
  scene.add(debris);

  return { mats, gateMeshes };
}
