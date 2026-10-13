import * as THREE from "three";

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clampByte(n: number) {
  return n < 0 ? 0 : n > 255 ? 255 : n;
}

function makeTex(
  seed: number,
  base: [number, number, number],
  variance: number,
  paint: (ctx: CanvasRenderingContext2D, rand: () => number, size: number) => void,
) {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d no disponible");
  const rand = mulberry32(seed);
  ctx.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
  ctx.fillRect(0, 0, size, size);
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * variance;
    d[i] = clampByte(d[i] + n);
    d[i + 1] = clampByte(d[i + 1] + n);
    d[i + 2] = clampByte(d[i + 2] + n);
  }
  ctx.putImageData(img, 0, 0);
  paint(ctx, rand, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

export type TexSet = {
  concrete: THREE.CanvasTexture;
  brick: THREE.CanvasTexture;
  wood: THREE.CanvasTexture;
  plaster: THREE.CanvasTexture;
  asphalt: THREE.CanvasTexture;
  metal: THREE.CanvasTexture;
};

export function createTextures(): TexSet {
  const concrete = makeTex(3, [112, 108, 100], 28, (ctx, rand, s) => {
    ctx.strokeStyle = "rgba(40,38,34,0.35)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 14; i++) {
      ctx.beginPath();
      ctx.moveTo(rand() * s, rand() * s);
      ctx.lineTo(rand() * s, rand() * s);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(70,68,62,0.25)";
    for (let i = 0; i < 30; i++) ctx.fillRect(rand() * s, rand() * s, 8 + rand() * 20, 2);
  });

  const brick = makeTex(9, [122, 72, 58], 18, (ctx, rand, s) => {
    const bw = 42;
    const bh = 18;
    ctx.strokeStyle = "rgba(60,32,26,0.85)";
    ctx.lineWidth = 3;
    for (let row = 0; row < s / bh + 1; row++) {
      const off = row % 2 ? bw / 2 : 0;
      for (let col = -1; col < s / bw + 1; col++) {
        ctx.strokeRect(col * bw + off, row * bh, bw, bh);
        ctx.fillStyle = `rgba(${90 + rand() * 50},${40 + rand() * 30},${30 + rand() * 20},0.18)`;
        ctx.fillRect(col * bw + off + 2, row * bh + 2, bw - 4, bh - 4);
      }
    }
  });

  const wood = makeTex(21, [112, 78, 48], 22, (ctx, rand, s) => {
    for (let x = 0; x < s; x += 3) {
      ctx.strokeStyle = `rgba(60,36,18,${0.15 + rand() * 0.35})`;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + rand() * 6, s * 0.3, x - rand() * 6, s * 0.7, x + (rand() - 0.5) * 8, s);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(40,24,12,0.25)";
    for (let i = 0; i < 8; i++) ctx.fillRect(rand() * s, rand() * s, 18, 3);
  });

  const plaster = makeTex(4, [168, 160, 146], 16, (ctx, rand, s) => {
    ctx.fillStyle = "rgba(90,84,74,0.18)";
    for (let i = 0; i < 40; i++) ctx.fillRect(rand() * s, rand() * s, 2 + rand() * 10, 1 + rand() * 3);
  });

  const asphalt = makeTex(11, [58, 58, 56], 20, (ctx, rand, s) => {
    ctx.strokeStyle = "rgba(20,20,18,0.65)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, s * 0.45);
    ctx.lineTo(s, s * 0.62);
    ctx.stroke();
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    for (let i = 0; i < 50; i++) ctx.fillRect(rand() * s, rand() * s, 2 + rand() * 6, 2);
    ctx.fillStyle = "rgba(180,170,150,0.08)";
    for (let i = 0; i < 20; i++) ctx.fillRect(rand() * s, rand() * s, 10, 2);
  });

  const metal = makeTex(17, [58, 64, 66], 14, (ctx, rand, s) => {
    ctx.strokeStyle = "rgba(180,190,190,0.15)";
    for (let y = 8; y < s; y += 14) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(s, y + (rand() - 0.5) * 4);
      ctx.stroke();
    }
  });

  return { concrete, brick, wood, plaster, asphalt, metal };
}

export function scaleBoxUvs(geo: THREE.BoxGeometry, w: number, h: number, d: number) {
  const uv = geo.attributes.uv;
  const sets: Array<[number, number]> = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f++) {
    const su = sets[f][0] * 0.45;
    const sv = sets[f][1] * 0.45;
    for (let i = 0; i < 4; i++) {
      const idx = f * 4 + i;
      uv.setXY(idx, uv.getX(idx) * su, uv.getY(idx) * sv);
    }
  }
  uv.needsUpdate = true;
}
