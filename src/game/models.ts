import * as THREE from 'three';

export type LoadedModel = {
  id: string;
  gltf: any;
  mixer?: THREE.AnimationMixer;
};

export class ModelHub {
  private cache = new Map<string, LoadedModel>();
  async loadFromUrl(id: string, url: string) {
    if (this.cache.has(id)) return this.cache.get(id)!;
    // dynamic import of GLTFLoader
    const [{ GLTFLoader }, { DRACOLoader }] = await Promise.all([
      import('three/examples/jsm/loaders/GLTFLoader'),
      import('three/examples/jsm/loaders/DRACOLoader').catch(() => ({ DRACOLoader: null })),
    ] as any);
    const loader = new GLTFLoader();
    try {
      if (DRACOLoader) {
        const draco = new DRACOLoader();
        draco.setDecoderPath('/draco/');
        loader.setDRACOLoader(draco);
      }
    } catch {
      // ignore
    }
    return new Promise<LoadedModel>((resolve, reject) => {
      loader.load(
        url,
        (gltf: any) => {
          const lm: LoadedModel = { id, gltf };
          if (gltf.animations && gltf.animations.length > 0) {
            lm.mixer = new THREE.AnimationMixer(gltf.scene);
          }
          this.cache.set(id, lm);
          resolve(lm);
        },
        undefined,
        (err: any) => reject(err),
      );
    });
  }
  get(id: string) {
    return this.cache.get(id) ?? null;
  }
}

export const hub = new ModelHub();

// convenience: try to auto-load any downloaded local assets (public/models/local)
export async function warmLocalAssets() {
  try {
    const res = await fetch('/models/manifest.json');
    if (!res.ok) return;
    const m = await res.json();
    const items = [...(m.models || [])];
    for (const it of items) {
      const url = '/models/local/' + it.url.split('/').slice(-1)[0];
      // probe existence
      try {
        const r = await fetch(url, { method: 'HEAD' });
        if (r.ok) await hub.loadFromUrl(it.id, url);
      } catch {
        // ignore
      }
    }
  } catch {
    /* ignore */
  }
}
