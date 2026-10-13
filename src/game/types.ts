export type Phase = "menu" | "prep" | "wave" | "pause" | "dead";

export type WeaponId = "rifle" | "shotgun";

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
  | "diary";

export const PRICES = {
  ammoRifle: 12,
  ammoShot: 14,
  bandage: 16,
  wood: 8,
  clean: 8,
  mod: 18,
  unlock: 60,
} as const;

export const SIGHTS = ["Hierro", "Réflex", "Óptica"] as const;
export const BARRELS = ["Corto", "Estándar", "Pesado"] as const;
export const STOCKS = ["Sin culata", "Ligera", "Fija"] as const;
export const MAGS = ["Corto", "Estándar", "Tambor"] as const;
