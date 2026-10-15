import { useEffect, useRef, useState, type PointerEvent, type ReactNode, type RefObject } from "react";
import { Boxes, CloudRain, Crosshair, Ear, Footprints, Shield } from "lucide-react";
import { BARRELS, MAGS, PRICES, SIGHTS, STOCKS, type GameAPI, type Snapshot } from "@/game/types";
import { getModelBridge } from "@/game/realism";

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
        // expose for realism bridge
        (window as any).__lastEngineInstance = api;
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
          audioOcclusion={snap?.audioOcclusion ?? false}
          onPlay={() => {
            apiRef.current?.unlock();
            apiRef.current?.start();
            apiRef.current?.lock();
          }}
          onSettings={(patch) => apiRef.current?.setSettings(patch)}
          onStartBR={() => apiRef.current?.startBattleRoyale && apiRef.current?.startBattleRoyale({ initialRadius: 28 })}
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
  audioOcclusion,
  onPlay,
  onSettings,
  onStartBR,
}: {
  failed: string | null;
  best: number;
  sens: number;
  volume: number;
  assist: boolean;
  audioOcclusion: boolean;
  onPlay: () => void;
  onSettings: (patch: { sens?: number; volume?: number; assist?: boolean; audioOcclusion?: boolean }) => void;
  onStartBR: () => void;
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
        <div className="flex gap-2">
          <button type="button" className={primaryBtn} onClick={onPlay}>
            Entrar al bloque
          </button>
          <button type="button" className={ghostBtn} onClick={onStartBR}>
            Battle Royale
          </button>
        </div>
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
          <label className="flex min-h-11 items-center justify-between gap-3 text-sm text-muted">
            Occlusión de audio
            <input type="checkbox" checked={audioOcclusion} onChange={(e) => onSettings({ audioOcclusion: e.target.checked })} />
          </label>
        </div>
        <p className="text-xs leading-relaxed text-muted">
          WASD mover · Shift correr · Ctrl deslizar · Espacio saltar o trepar · clic disparar · botón derecho apuntar · R recargar · V revisar cargador · E barricada o intendencia · G l[...]
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

// ... rest of GameView unchanged (omitted for brevity)
export default GameView;
