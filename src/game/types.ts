export type Phase = "menu" | "prep" | "wave" | "pause" | "dead";

export type WeaponId = "rifle" | "shotgun" | "pistol" | "smg" | "grenade";

export type Mods = {
  sight: number;
  barrel: number;
  stock: number;
  mag: number;
};

export type Ranks = {
  lungs: number;
  grip: number;
  surgeon: number;
  scavenger: number;
};

export type InvItem = {
  id: string;
  name: string;
  count: number;
  type: "ammo" | "med" | "material" | "weapon" | "throwable" | "mod";
};

export type Snapshot = {
  phase: Phase;
  shop: boolean;
  wave: number;
  hp: number;
  hpMax: number;
  stamina: number;
  bleeding: boolean;
  limping: boolean;
  mag: number;
  reserve: number;
  magSize: number;
  weapon: WeaponId;
  weaponName: string;
  jammed: boolean;
  reloading: boolean;
  heat: number;
  dirt: number;
  scrap: number;
  wood: number;
  skills: number;
  ranks: Ranks;
  mods: Mods;
  weight: number;
  kills: number;
  best: number;
  alive: number;
  pending: number;
  weather: string;
  wind: string;
  clock: string;
  caption: string;
  hurt: number;
  hurtSide: number;
  hit: number;
  headHit: boolean;
  assist: boolean;
  sens: number;
  volume: number;
  unlocked: boolean;
  indoor: boolean;
  showMag: boolean;
  clean: number;
  status: string;
  banner: string;
  ads: number;
  locked: boolean;
  diary: boolean;
  flashlight: boolean;
  inventoryOpen: boolean;
  autoWave: number;
  grenades: number;
  inv: InvItem[];
  minimap: { px: number; pz: number; yaw: number; zeds: { x: number; z: number }[]; buildings: { x: number; z: number; w: number; d: number }[] };
};

export type GameAPI = {
  snapshot: () => Snapshot;
  unlock: () => void;
  start: () => void;
  resume: () => void;
  retry: () => void;
  abandon: () => void;
  lock: () => void;
  buy: (id: string) => void;
  closeShop: () => void;
  openShop: () => void;
  callWave: () => void;
  setTouchMove: (x: number, y: number) => void;
  setTouchLook: (dx: number, dy: number) => void;
  setTouchFire: (v: boolean) => void;
  setTouchAim: (v: boolean) => void;
  setTouchSprint: (v: boolean) => void;
  setTouchClean: (v: boolean) => void;
  pulse: (action: TouchPulse) => void;
  setSettings: (patch: { sens?: number; volume?: number; assist?: boolean }) => void;
  useItem: (id: string) => void;
  craft: (recipe: string) => void;
  dispose: () => void;
};

export type TouchPulse =
  | "reload"
  | "interact"
  | "jump"
  | "crouch"
  | "check"
  | "clean"
  | "swap"
  | "diary"
  | "grenade";

export const PRICES = {
  ammoRifle: 12,
  ammoShot: 14,
  ammoPistol: 8,
  ammoSmg: 16,
  bandage: 16,
  medkit: 35,
  wood: 8,
  clean: 8,
  mod: 18,
  unlock: 60,
  grenade: 22,
  pistol: 45,
  smg: 80,
} as const;

export const SIGHTS = ["Iron", "Reflex", "Scope"] as const;
export const BARRELS = ["Short", "Standard", "Heavy"] as const;
export const STOCKS = ["No stock", "Light", "Fixed"] as const;
export const MAGS = ["Short", "Standard", "Drum"] as const;

export const RECIPES: Record<string, { needs: { id: string; n: number }[]; gives: { id: string; n: number }; name: string }> = {
  bandage: { needs: [{ id: "scrap", n: 2 }, { id: "wood", n: 1 }], gives: { id: "bandage", n: 1 }, name: "Bandage" },
  medkit: { needs: [{ id: "bandage", n: 2 }, { id: "scrap", n: 4 }], gives: { id: "medkit", n: 1 }, name: "Medkit" },
  grenade: { needs: [{ id: "scrap", n: 6 }, { id: "wood", n: 1 }], gives: { id: "grenade", n: 1 }, name: "Grenade" },
  ammoRifle: { needs: [{ id: "scrap", n: 3 }], gives: { id: "ammoRifle", n: 15 }, name: "Rifle ammo (15)" },
  ammoShot: { needs: [{ id: "scrap", n: 3 }], gives: { id: "ammoShot", n: 6 }, name: "Shells (6)" },
  plank: { needs: [{ id: "wood", n: 2 }], gives: { id: "wood", n: 3 }, name: "Reinforce planks" },
};
