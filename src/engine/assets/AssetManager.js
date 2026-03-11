import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

// Centralized asset manager provides lazy loading, region streaming hooks, and unloading.
export class AssetManager {
  constructor(renderer) {
    this.renderer = renderer;
    this.gltfLoader = new GLTFLoader();

    this.ktx2Loader = new KTX2Loader();
    this.ktx2Loader.setTranscoderPath('https://unpkg.com/three@0.177.0/examples/jsm/libs/basis/');
    this.ktx2Loader.detectSupport(this.renderer);
    this.gltfLoader.setKTX2Loader(this.ktx2Loader);

    this.modelCache = new Map();
    this.loadingPromises = new Map();
    this.regionAssets = new Map();
  }

  loadModel(url) {
    if (this.modelCache.has(url)) {
      const entry = this.modelCache.get(url);
      entry.refs += 1;
      return Promise.resolve(entry.gltf);
    }

    if (this.loadingPromises.has(url)) return this.loadingPromises.get(url);

    const p = new Promise((resolve, reject) => {
      this.gltfLoader.load(
        url,
        (gltf) => {
          this.modelCache.set(url, { gltf, refs: 1 });
          this.loadingPromises.delete(url);
          resolve(gltf);
        },
        undefined,
        (err) => {
          this.loadingPromises.delete(url);
          reject(err);
        }
      );
    });

    this.loadingPromises.set(url, p);
    return p;
  }

  releaseModel(url) {
    const entry = this.modelCache.get(url);
    if (!entry) return;
    entry.refs -= 1;
    if (entry.refs > 0) return;

    entry.gltf.scene?.traverse((o) => {
      if (o.geometry) o.geometry.dispose?.();
      if (Array.isArray(o.material)) {
        for (const m of o.material) m.dispose?.();
      } else {
        o.material?.dispose?.();
      }
    });

    this.modelCache.delete(url);
  }

  async preloadRegion(regionId, assets) {
    this.regionAssets.set(regionId, assets);
    await Promise.all(assets.models?.map((m) => this.loadModel(m)) ?? []);
  }

  unloadRegion(regionId) {
    const assets = this.regionAssets.get(regionId);
    if (!assets) return;
    for (const modelUrl of assets.models ?? []) {
      this.releaseModel(modelUrl);
    }
    this.regionAssets.delete(regionId);
  }
}
