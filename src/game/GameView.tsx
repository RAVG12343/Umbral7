import { useEffect, useRef, useState, type PointerEvent, type ReactNode, type RefObject } from "react";
import { Boxes, CloudRain, Crosshair, Ear, Footprints, Shield } from "lucide-react";
import { BARRELS, MAGS, PRICES, SIGHTS, STOCKS, type GameAPI, type Snapshot } from "@/game/types";

const emptyMods = { sight: 0, barrel: 1, stock: 1, mag: 1 };

export function GameView() {
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<GameAPI | null>(null);
  const lookRef = useRef<{ x: number; y: number; id: number | null }>({ x: 0, y: 0, id: null });
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [touch, setTouch] = useState(false);

  useEffect(() => {
    let dead = false;
    let api: GameAPI | null = null;
    let timer = 0;
    void import("@/game/engine").then(({ Engine }) => {
      if (dead || !hostRef.current) return;
      try {
        api = new Engine(hostRef.current);
        apiRef.current = api;
        timer = window.setInterval(() => {
          if (api) setSnap(api.snapshot());
        }, 80);
      } catch (error) {
        setFailed(error instanceof Error ? error.message : "WebGL no disponible");
      }
    });
    return () => {
      dead = true;
      window.clearInterval(timer);
      api?.dispose();
      apiRef.current = null;
    };
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse), (max-width: 820px)");
    const apply = () => setTouch(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const api = apiRef.current;
  const phase = snap?.phase ?? "menu";
  const playing = phase === "prep" || phase === "wave";
  const hurt = snap?.hurt ?? 0;
  const side = Math.sign(snap?.hurtSide ?? 0);

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-bg text-fg">
      <div ref={hostRef} className="absolute inset-0 touch-none" />

      <div
        className="pointer-events-none absolute inset-0"
        style={{
          boxShadow: "inset 0 0 140px rgb(0 0 0 / 0.55)",
          background:
            hurt > 0.02
              ? `radial-gradient(circle at center, transparent 42%, color-mix(in srgb, var(--color-blood) ${Math.round(hurt * 72)}%, transparent) 100%)`
              : undefined,
        }}
      />
      {hurt > 0.05 && side !== 0 ? (
        <div
          className="pointer-events-none absolute inset-y-0 w-1/3"
          style={{
            [side > 0 ? "right" : "left"]: 0,
            background: `linear-gradient(${side > 0 ? "to left" : "to right"}, color-mix(in srgb, var(--color-blood) ${Math.round(hurt * 80)}%, transparent), transparent)`,
          }}
        />
      ) : null}

      {phase === "menu" ? (
        <Menu
          failed={failed}
          best={snap?.best ?? 0}
          sens={snap?.sens ?? 0.00215}
          volume={snap?.volume ?? 0.85}
          assist={snap?.assist ?? false}
          onPlay={() => {
            apiRef.current?.unlock();
            apiRef.current?.start();
            apiRef.current?.lock();
          }}
          onSettings={(patch) => apiRef.current?.setSettings(patch)}
        />
      ) : null}

      {playing && snap ? (
        <Hud snap={snap} touch={touch} api={api} lookRef={lookRef} />
      ) : null}

      {snap?.shop ? <Shop snap={snap} api={api} /> : null}

      {phase === "pause" && snap ? (
        <Overlay
          kicker="Pausa"
          title="El bloque espera"
          text="La horda no se mueve mientras decides."
        >
          <button type="button" className={primaryBtn} onClick={() => api?.resume()}>
            Volver
          </button>
          <button type="button" className={ghostBtn} onClick={() => api?.abandon()}>
            Abandonar
          </button>
        </Overlay>
      ) : null}

      {phase === "dead" && snap ? (
        <Overlay
          kicker="KIA"
          title="Caíste en el bloque"
          text={`Oleada ${snap.wave}. ${snap.kills} infectados. Mejor marca: ${snap.best}.`}
        >
          <button type="button" className={primaryBtn} onClick={() => api?.retry()}>
            Reintentar
          </button>
          <button type="button" className={ghostBtn} onClick={() => api?.abandon()}>
            Salir
          </button>
        </Overlay>
      ) : null}
    </div>
  );
}

const primaryBtn =
  "min-h-11 rounded-lg bg-sodium px-5 py-3 font-display text-lg tracking-wider text-bg uppercase";
const ghostBtn =
  "min-h-11 rounded-lg border border-line bg-surface px-5 py-3 font-display text-lg tracking-wider text-fg uppercase";

function Menu({
  failed,
  best,
  sens,
  volume,
  assist,
  onPlay,
  onSettings,
}: {
  failed: string | null;
  best: number;
  sens: number;
  volume: number;
  assist: boolean;
  onPlay: () => void;
  onSettings: (patch: { sens?: number; volume?: number; assist?: boolean }) => void;
}) {
  return (
    <div className="pointer-events-auto absolute inset-0 flex items-end md:items-stretch">
      <section className="flex h-5/6 w-full flex-col gap-5 overflow-y-auto border-t border-line bg-surface p-5 md:h-full md:w-1/2 md:max-w-xl md:border-t-0 md:border-r md:p-8">
        <p className="font-display text-sm tracking-widest text-sodium uppercase">Cuarentena · Bloque residencial</p>
        <h1 className="font-display text-5xl leading-none font-semibold tracking-wide text-fg md:text-7xl">UMBRAL 7</h1>
        <p className="max-w-md text-sm leading-relaxed text-muted">
          Un bloque al anochecer. La luz cambia, la bala cae, la lluvia te deja sordo y la horda aprende el camino.
        </p>
        {failed ? <p className="text-sm text-blood">{failed}</p> : null}
        {best > 0 ? <p className="font-display tracking-wider text-fog uppercase">Mejor oleada {best}</p> : null}
        <button type="button" className={primaryBtn} onClick={onPlay}>
          Entrar al bloque
        </button>
        <ul className="grid gap-2">
          <Dossier icon={<CloudRain className="size-4" />} title="Clima" text="La lluvia acorta el oído. La niebla esconde acechadores. De noche corren." />
          <Dossier icon={<Footprints className="size-4" />} title="Peso" text="El kit frena el sprint. Herido, cojeas. Ctrl desliza. Espacio trepa lo bajo." />
          <Dossier icon={<Crosshair className="size-4" />} title="Fuego" text="La bala cae y el viento la empuja. La madera se astilla. El arma se ensucia." />
          <Dossier icon={<Ear className="size-4" />} title="Oído" text="Pasos y gemidos rebotan. Un muro los ahoga. No mires: escucha." />
          <Dossier icon={<Shield className="size-4" />} title="Tablas" text="E en puertas y ventanas. Tres tablas cierran un hueco. Ellos las rompen y trepan." />
        </ul>
        <div className="grid gap-3 border-t border-line pt-4">
          <Label name="Sensibilidad">
            <input type="range" min={0.0008} max={0.0045} step={0.00005} value={sens} onChange={(e) => onSettings({ sens: Number(e.target.value) })} />
          </Label>
          <Label name="Volumen">
            <input type="range" min={0} max={1} step={0.01} value={volume} onChange={(e) => onSettings({ volume: Number(e.target.value) })} />
          </Label>
          <label className="flex min-h-11 items-center justify-between gap-3 text-sm text-muted">
            Asistencia de cifras
            <input type="checkbox" checked={assist} onChange={(e) => onSettings({ assist: e.target.checked })} />
          </label>
        </div>
        <p className="text-xs leading-relaxed text-muted">
          WASD mover · Shift correr · Ctrl deslizar · Espacio saltar o trepar · clic disparar · botón derecho apuntar · R recargar · V revisar cargador · E barricada o intendencia · G limpiar · 1 y 2 armas · Tab bitácora
        </p>
      </section>
    </div>
  );
}

function Dossier({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <li className="flex gap-3 rounded-lg border border-line bg-surface-2 px-3 py-2">
      <span className="mt-0.5 text-sodium">{icon}</span>
      <span>
        <span className="font-display tracking-wider text-fg uppercase">{title}</span>
        <span className="mt-0.5 block text-sm leading-snug text-muted">{text}</span>
      </span>
    </li>
  );
}

function Label({ name, children }: { name: string; children: ReactNode }) {
  return (
    <label className="grid gap-1 text-xs tracking-wider text-muted uppercase">
      {name}
      {children}
    </label>
  );
}

function Hud({
  snap,
  touch,
  api,
  lookRef,
}: {
  snap: Snapshot;
  touch: boolean;
  api: GameAPI | null;
  lookRef: RefObject<{ x: number; y: number; id: number | null }>;
}) {
  const gap = snap.ads > 0.4 ? "gap-1" : "gap-2";
  return (
    <>
      <div className="pointer-events-none absolute top-4 left-4">
        <p className="font-display text-sm tracking-widest text-sodium uppercase">Oleada {snap.wave}</p>
        <p className="text-xs text-fog">
          {snap.weather} · {snap.clock}
          {snap.indoor ? " · interior" : ""}
        </p>
      </div>
      {snap.assist ? (
        <p className="pointer-events-none absolute top-4 right-4 text-right font-display text-sm tracking-wider text-fg">
          {snap.weaponName} {snap.mag}/{snap.reserve}
          <span className="block text-xs text-muted">
            Salud {Math.round(snap.hp)} · Aire {Math.round(snap.stamina)}
          </span>
        </p>
      ) : null}
      <div className={`pointer-events-none absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center ${gap}`}>
        <i className={`block h-px w-3 ${snap.headHit ? "bg-blood" : snap.hit > 0.15 ? "bg-sodium" : "bg-fg"}`} />
        <i className={`block size-1 rounded-full ${snap.headHit ? "bg-blood" : "bg-fg"}`} />
        <i className={`block h-px w-3 ${snap.headHit ? "bg-blood" : snap.hit > 0.15 ? "bg-sodium" : "bg-fg"}`} />
      </div>
      {snap.showMag ? (
        <p className="pointer-events-none absolute bottom-28 left-1/2 -translate-x-1/2 font-display text-4xl tracking-widest text-fg">
          {snap.mag}
        </p>
      ) : null}
      {snap.caption ? (
        <p className="pointer-events-none absolute bottom-16 left-1/2 w-full max-w-lg -translate-x-1/2 px-6 text-center text-sm text-fg">
          {snap.caption}
        </p>
      ) : null}
      {snap.clean > 0 ? (
        <p className="pointer-events-none absolute bottom-36 left-1/2 -translate-x-1/2 font-display tracking-widest text-sodium uppercase">
          Limpiando
        </p>
      ) : null}
      {snap.phase === "prep" && !snap.shop ? (
        <div className={`pointer-events-auto absolute left-1/2 flex w-full max-w-md -translate-x-1/2 flex-col gap-2 px-4 ${touch ? "bottom-44" : "bottom-6 md:bottom-8"}`}>
          <p className="text-center text-sm text-fog">{snap.banner}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" className={primaryBtn} onClick={() => api?.callWave()}>
              Llamar a la horda
            </button>
            <button type="button" className={ghostBtn} onClick={() => api?.openShop()}>
              Intendencia
            </button>
          </div>
        </div>
      ) : null}
      {snap.diary ? <Diary snap={snap} touch={touch} /> : null}
      {!snap.locked && snap.phase === "wave" && !touch ? (
        <p className="pointer-events-none absolute top-16 left-1/2 -translate-x-1/2 text-xs tracking-wider text-muted uppercase">
          Clic para apuntar
        </p>
      ) : null}
      {touch ? <Touch api={api} lookRef={lookRef} /> : null}
    </>
  );
}

function Diary({ snap, touch }: { snap: Snapshot; touch: boolean }) {
  const heat = snap.heat > 0.72 ? "Al rojo" : snap.heat > 0.35 ? "Tibia" : "Fría";
  const dirt = snap.jammed ? "Encasquillada" : snap.dirt > 0.45 ? "Sucia" : "Limpia";
  return (
    <aside className={`pointer-events-none absolute w-64 rounded-lg border border-line bg-surface/95 p-4 ${touch ? "top-16 right-3" : "bottom-6 left-4"}`}>
      <p className="font-display tracking-widest text-sodium uppercase">Bitácora</p>
      <dl className="mt-2 grid grid-cols-2 gap-y-1 text-sm">
        <dt className="text-muted">Estado</dt>
        <dd>{snap.status}</dd>
        <dt className="text-muted">Arma</dt>
        <dd>
          {snap.weaponName} {snap.showMag || snap.assist ? `${snap.mag}/${snap.reserve}` : ""}
        </dd>
        <dt className="text-muted">Cañón</dt>
        <dd>
          {heat} · {dirt}
        </dd>
        <dt className="text-muted">Kit</dt>
        <dd>{snap.weight} kg</dd>
        <dt className="text-muted">Chatarra</dt>
        <dd>{snap.scrap}</dd>
        <dt className="text-muted">Madera</dt>
        <dd>{snap.wood}</dd>
        <dt className="text-muted">Viento</dt>
        <dd>{snap.wind}</dd>
        <dt className="text-muted">Bajas</dt>
        <dd>{snap.kills}</dd>
      </dl>
    </aside>
  );
}

function Shop({ snap, api }: { snap: Snapshot; api: GameAPI | null }) {
  const mods = snap.mods ?? emptyMods;
  const item = (id: string, title: string, detail: string, disabled = false) => (
    <button key={id} type="button" disabled={disabled} className={`${ghostBtn} text-left text-base disabled:opacity-40`} onClick={() => api?.buy(id)}>
      <span className="block font-display tracking-wider uppercase">{title}</span>
      <span className="block text-xs text-muted normal-case">{detail}</span>
    </button>
  );
  return (
    <div className="pointer-events-auto absolute inset-0 flex items-end justify-center bg-bg/70 p-4 md:items-center">
      <section className="grid max-h-full w-full max-w-xl gap-3 overflow-y-auto rounded-lg border border-line bg-surface p-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="font-display text-sm tracking-widest text-sodium uppercase">Intendencia</p>
            <h2 className="font-display text-3xl tracking-wide">Mostrador</h2>
          </div>
          <p className="text-right text-sm text-fog">
            {snap.scrap} chatarra
            <span className="block">{snap.wood} madera · {snap.skills} oficios</span>
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {item("ammo-rifle", `Munición AR-17 · ${PRICES.ammoRifle}`, "+30 cartuchos")}
          {item("ammo-shot", `Cartuchos SP-12 · ${PRICES.ammoShot}`, "+8")}
          {item("bandage", `Venda · ${PRICES.bandage}`, "Cierra la herida")}
          {item("wood", `Tablas · ${PRICES.wood}`, "+2")}
          {item("clean", `Limpieza · ${PRICES.clean}`, snap.weaponName)}
          {item(
            "mod-sight",
            `Mira · ${PRICES.mod}`,
            mods.sight >= 2 ? SIGHTS[2] : `Ahora ${SIGHTS[mods.sight]}`,
            mods.sight >= 2,
          )}
          {item(
            "mod-barrel",
            `Cañón · ${PRICES.mod}`,
            mods.barrel >= 2 ? BARRELS[2] : `Ahora ${BARRELS[mods.barrel]}`,
            mods.barrel >= 2,
          )}
          {item(
            "mod-stock",
            `Culata · ${PRICES.mod}`,
            mods.stock >= 2 ? STOCKS[2] : `Ahora ${STOCKS[mods.stock]}`,
            mods.stock >= 2,
          )}
          {item("mod-mag", `Cargador · ${PRICES.mod}`, mods.mag >= 2 ? MAGS[2] : `Ahora ${MAGS[mods.mag]}`, mods.mag >= 2)}
          {item("skill-lungs", "Pulmones", `Rango ${snap.ranks.lungs}/3 · 1 oficio`, snap.skills <= 0 || snap.ranks.lungs >= 3)}
          {item("skill-grip", "Firmeza", `Rango ${snap.ranks.grip}/3 · 1 oficio`, snap.skills <= 0 || snap.ranks.grip >= 3)}
          {item("skill-surgeon", "Precisión", `Rango ${snap.ranks.surgeon}/3 · 1 oficio`, snap.skills <= 0 || snap.ranks.surgeon >= 3)}
          {item("unlock", snap.unlocked ? "Almacén abierto" : `Abrir almacén · ${PRICES.unlock}`, "Munición y tablas", snap.unlocked)}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={primaryBtn} onClick={() => api?.callWave()}>
            Llamar a la horda
          </button>
          <button type="button" className={ghostBtn} onClick={() => api?.closeShop()}>
            Cerrar
          </button>
        </div>
        <p className="flex items-center gap-2 text-xs text-muted">
          <Boxes className="size-4 text-sodium" />
          Las piezas cambian peso, retroceso y caída. El tambor no perdona el sprint.
        </p>
      </section>
    </div>
  );
}

function Overlay({
  kicker,
  title,
  text,
  children,
}: {
  kicker: string;
  title: string;
  text: string;
  children: ReactNode;
}) {
  return (
    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-bg/75 p-5">
      <section className="grid w-full max-w-md gap-3 rounded-lg border border-line bg-surface p-6">
        <p className="font-display tracking-widest text-blood uppercase">{kicker}</p>
        <h2 className="font-display text-4xl leading-none tracking-wide">{title}</h2>
        <p className="text-sm text-muted">{text}</p>
        <div className="flex flex-wrap gap-2">{children}</div>
      </section>
    </div>
  );
}

function Touch({
  api,
  lookRef,
}: {
  api: GameAPI | null;
  lookRef: RefObject<{ x: number; y: number; id: number | null }>;
}) {
  return (
    <>
      <div
        className="absolute inset-x-0 top-0 h-1/2 touch-none"
        onPointerDown={(e) => {
          lookRef.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const look = lookRef.current;
          if (!look || look.id !== e.pointerId) return;
          api?.setTouchLook(e.clientX - look.x, e.clientY - look.y);
          lookRef.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
        }}
        onPointerUp={() => {
          if (lookRef.current) lookRef.current.id = null;
        }}
      />
      <Stick onChange={(x, y) => api?.setTouchMove(x, y)} />
      <div className="absolute right-3 bottom-4 grid grid-cols-3 gap-2">
        <TouchBtn label="Correr" onDown={() => api?.setTouchSprint(true)} onUp={() => api?.setTouchSprint(false)} />
        <TouchBtn label="Saltar" onDown={() => api?.pulse("jump")} />
        <TouchBtn label="Agachar" onDown={() => api?.pulse("crouch")} />
        <TouchBtn label="Recargar" onDown={() => api?.pulse("reload")} />
        <TouchBtn label="Usar" onDown={() => api?.pulse("interact")} />
        <TouchBtn label="Arma" onDown={() => api?.pulse("swap")} />
        <TouchBtn label="Mirar" onDown={() => api?.setTouchAim(true)} onUp={() => api?.setTouchAim(false)} />
        <TouchBtn label="Revisar" onDown={() => api?.pulse("check")} />
        <button
          type="button"
          className="col-span-1 min-h-14 rounded-full bg-blood px-2 font-display text-sm tracking-wider text-fg uppercase"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            api?.setTouchFire(true);
          }}
          onPointerUp={() => api?.setTouchFire(false)}
          onPointerCancel={() => api?.setTouchFire(false)}
        >
          Fuego
        </button>
      </div>
    </>
  );
}

function TouchBtn({ label, onDown, onUp }: { label: string; onDown: () => void; onUp?: () => void }) {
  return (
    <button
      type="button"
      className="min-h-12 min-w-12 rounded-lg border border-line bg-surface px-2 font-display text-xs tracking-wider text-fg uppercase"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        onDown();
      }}
      onPointerUp={() => onUp?.()}
      onPointerCancel={() => onUp?.()}
    >
      {label}
    </button>
  );
}

function Stick({ onChange }: { onChange: (x: number, y: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useRef<number | null>(null);
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const len = Math.hypot(dx, dy) || 1;
    const k = len > 1 ? 1 / len : 1;
    onChange(dx * k, -dy * k);
  };
  return (
    <div
      ref={ref}
      className="absolute bottom-4 left-4 h-36 w-36 touch-none rounded-full border border-line bg-surface/80"
      onPointerDown={(e) => {
        id.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        move(e);
      }}
      onPointerMove={(e) => {
        if (id.current === e.pointerId) move(e);
      }}
      onPointerUp={(e) => {
        if (id.current === e.pointerId) {
          id.current = null;
          onChange(0, 0);
        }
      }}
    />
  );
}
