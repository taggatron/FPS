import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

function noise(x, z) {
  return Math.sin(x * 0.09) * 1.6 + Math.cos(z * 0.07) * 1.2 + Math.sin((x + z) * 0.04) * 2.3;
}

function hashString(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export class CityBuilder {
  constructor(scene) {
    this.scene = scene;
    this.generatedObjects = [];
    this.pickups = [];
    this.staticMeshes = [];
    this.terrain = null;
    this.fires = [];
    this.smokeColumns = [];
    this.dustParticles = null;
    this.dustData = [];
    this.dustPhaseOffset = 0;
    this.layoutCacheVersion = 4;
    this.layoutMemo = null;
    this.bakedLayouts = null;
    this.bakedShell = null;
    this.lightCullTimer = 0;
    this.performanceStats = {
      buildMs: 0,
      buildMode: 'procedural',
      drawables: 0,
      activeDynamicLights: 0,
      totalDynamicLights: 0,
      totalPointLights: 0
    };
    this.profile = null;
    this.configureQuality('balanced');

    this.materials = {
      rubble: new THREE.MeshStandardMaterial({ color: 0x3f4348, roughness: 0.95 }),
      concrete: new THREE.MeshStandardMaterial({ color: 0x50565f, roughness: 0.9 }),
      metal: new THREE.MeshStandardMaterial({ color: 0x646b73, roughness: 0.65, metalness: 0.25 }),
      neon: new THREE.MeshStandardMaterial({ color: 0x42f5b0, emissive: 0x0a3022, roughness: 0.4 }),
      plant: new THREE.MeshStandardMaterial({ color: 0x2e5932, roughness: 0.9 })
    };
  }

  configureQuality(preset = 'balanced') {
    this.profile =
      preset === 'high'
        ? {
            skylineCount: 220,
            propCount: 420,
            streetLightCount: 120,
            smokeCount: 52,
            dustCount: 980,
            pickupCount: 26,
            fireChance: 0.11,
            dynamicLightDistance: 150,
            dynamicLightCap: 28
          }
        : preset === 'performance'
          ? {
              skylineCount: 120,
              propCount: 170,
              streetLightCount: 48,
              smokeCount: 18,
              dustCount: 280,
              pickupCount: 18,
              fireChance: 0.045,
              dynamicLightDistance: 95,
              dynamicLightCap: 12
            }
          : {
              skylineCount: 180,
              propCount: 280,
              streetLightCount: 85,
              smokeCount: 36,
              dustCount: 680,
              pickupCount: 24,
              fireChance: 0.08,
              dynamicLightDistance: 125,
              dynamicLightCap: 20
            };
  }

  setBakedLayouts(layouts = {}) {
    this.bakedLayouts = layouts;
  }

  setBakedShell(shell) {
    this.bakedShell = shell || null;
  }

  hasBakedShell() {
    return !!this.bakedShell;
  }

  cloneBakedShell() {
    if (!this.bakedShell) return null;

    const root = this.bakedShell.clone(true);
    root.traverse((node) => {
      if (!node.isMesh) return;
      node.geometry = node.geometry?.clone?.() ?? node.geometry;
      if (Array.isArray(node.material)) {
        node.material = node.material.map((material) => material?.clone?.() ?? material);
      } else {
        node.material = node.material?.clone?.() ?? node.material;
      }
      node.castShadow = true;
      node.receiveShadow = true;
      node.frustumCulled = true;
    });

    return root;
  }

  getBakedLayout(key) {
    const fromGlobal = window.__RUINFALL_BAKED_LAYOUTS__;
    const source = this.bakedLayouts || fromGlobal;
    return source?.[key] ?? null;
  }

  getLayoutCacheKey() {
    return `ruinfall-city-layout-v${this.layoutCacheVersion}-${JSON.stringify(this.profile)}`;
  }

  loadCachedLayout(key) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.skyline) || !Array.isArray(parsed.streetLights)) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  saveCachedLayout(key, layout) {
    try {
      window.localStorage.setItem(key, JSON.stringify(layout));
    } catch {
      // Ignore storage quota/privacy mode failures.
    }
  }

  generateLayoutData(key) {
    const rng = mulberry32(hashString(key));
    const skyline = [];
    const streetLights = [];

    const targetSkyline = this.profile.skylineCount;
    for (let i = 0; i < targetSkyline * 2 && skyline.length < targetSkyline; i += 1) {
      const x = (rng() - 0.5) * 760;
      const z = (rng() - 0.5) * 760;
      if (Math.abs(x) < 70 && Math.abs(z) < 70) continue;

      skyline.push({
        x,
        z,
        w: 10 + rng() * 26,
        d: 10 + rng() * 26,
        h: 18 + rng() * 110,
        rotY: rng() * Math.PI * 2,
        tiltZ: rng() < 0.28 ? (rng() - 0.5) * 0.25 : 0,
        dark: rng() < 0.2,
        neon: rng() < 0.15
      });
    }

    const litBudget = Math.min(26, Math.floor(this.profile.streetLightCount * 0.35));
    let litCount = 0;
    for (let i = 0; i < this.profile.streetLightCount; i += 1) {
      const alongX = rng() > 0.5;
      const lane = (Math.floor(rng() * 9) - 4) * 80;
      const offset = (rng() - 0.5) * 700;
      const x = alongX ? offset : lane + (rng() > 0.5 ? 10 : -10);
      const z = alongX ? lane + (rng() > 0.5 ? 10 : -10) : offset;
      const hasLight = litCount < litBudget && rng() < 0.72;
      if (hasLight) litCount += 1;
      streetLights.push({ x, z, hasLight, phase: rng() * Math.PI * 2, base: 0.55 + rng() * 0.4 });
    }

    return { skyline, streetLights };
  }

  getOrCreateLayoutData() {
    const key = this.getLayoutCacheKey();
    if (this.layoutMemo?.key === key) return this.layoutMemo.data;

    const baked = this.getBakedLayout(key);
    if (baked) {
      this.layoutMemo = { key, data: baked, mode: 'baked' };
      return baked;
    }

    let data = this.loadCachedLayout(key);
    let mode = 'local-cache';
    if (!data) {
      data = this.generateLayoutData(key);
      this.saveCachedLayout(key, data);
      mode = 'procedural';
    }

    this.layoutMemo = { key, data, mode };
    return data;
  }

  trackAdd(obj) {
    this.scene.add(obj);
    this.generatedObjects.push(obj);
  }

  clearGenerated() {
    const sharedMaterials = new Set(Object.values(this.materials));
    for (const obj of this.generatedObjects) {
      this.scene.remove(obj);
      if (obj.traverse) {
        obj.traverse((node) => {
          if (node.geometry) node.geometry.dispose?.();
          if (Array.isArray(node.material)) {
            for (const material of node.material) {
              if (!sharedMaterials.has(material)) material.dispose?.();
            }
          } else {
            if (node.material && !sharedMaterials.has(node.material)) node.material.dispose?.();
          }
        });
      }
    }
    this.generatedObjects.length = 0;
    this.pickups.length = 0;
    this.staticMeshes.length = 0;
    this.fires.length = 0;
    this.smokeColumns.length = 0;
    this.dustData.length = 0;
    this.terrain = null;
    this.dustParticles = null;
  }

  build() {
    const buildStart = performance.now();
    this.clearGenerated();
    this.addSkyDome();
    this.addGround();
    this.addRoadGrid();

    if (this.hasBakedShell()) {
      const shell = this.cloneBakedShell();
      if (shell) {
        this.layoutMemo = { key: 'glb-shell', data: null, mode: 'glb-shell' };
        this.trackAdd(shell);
      }
    } else {
      this.addSkylineRuins();
      this.addStreetLights();
      this.addProps();
    }

    this.addAtmosphericVolumes();
    this.addDustParticles();
    this.addDistantGiants();
    this.addPickups();

    this.performanceStats.buildMs = performance.now() - buildStart;
    this.performanceStats.buildMode = this.layoutMemo?.mode ?? 'procedural';
    this.performanceStats.drawables = this.generatedObjects.length;
    this.performanceStats.totalDynamicLights = this.fires.length;
    this.performanceStats.activeDynamicLights = this.fires.filter((f) => f.light.visible !== false).length;
    this.performanceStats.totalPointLights = this.countPointLights();
  }

  countPointLights() {
    let count = 0;
    for (const obj of this.generatedObjects) {
      if (obj.isPointLight) count += 1;
      if (obj.traverse) {
        obj.traverse((node) => {
          if (node !== obj && node.isPointLight) count += 1;
        });
      }
    }
    return count;
  }

  addSkyDome() {
    const skyGeo = new THREE.SphereGeometry(1200, 24, 20);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        topColor: { value: new THREE.Color(0x4f6f85) },
        horizonColor: { value: new THREE.Color(0x98a67a) },
        bottomColor: { value: new THREE.Color(0x2f3943) }
      },
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPos = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vWorldPos;
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 bottomColor;

        void main() {
          float h = normalize(vWorldPos).y * 0.5 + 0.5;
          vec3 c1 = mix(bottomColor, horizonColor, smoothstep(0.05, 0.45, h));
          vec3 c2 = mix(c1, topColor, smoothstep(0.45, 1.0, h));
          gl_FragColor = vec4(c2, 1.0);
        }
      `
    });

    const sky = new THREE.Mesh(skyGeo, skyMat);
    this.trackAdd(sky);
  }

  getTerrainHeight(x, z) {
    return noise(x, z) * 0.28;
  }

  addGround() {
    const geo = new THREE.PlaneGeometry(900, 900, 120, 120);
    const pos = geo.attributes.position;

    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const z = pos.getY(i);
      const y = this.getTerrainHeight(x, z);
      pos.setZ(i, y);
    }
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      color: 0x2f3338,
      roughness: 0.95,
      metalness: 0.05
    });

    this.terrain = new THREE.Mesh(geo, mat);
    this.terrain.rotation.x = -Math.PI / 2;
    this.terrain.receiveShadow = true;
    this.trackAdd(this.terrain);
  }

  addRoadGrid() {
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x26292e, roughness: 0.98 });
    const parts = [];

    for (let i = -4; i <= 4; i += 1) {
      const g1 = new THREE.BoxGeometry(700, 0.2, 16);
      g1.translate(0, this.getTerrainHeight(0, i * 80) + 0.05, i * 80);
      parts.push(g1);

      const g2 = new THREE.BoxGeometry(16, 0.2, 700);
      g2.translate(i * 80, this.getTerrainHeight(i * 80, 0) + 0.05, 0);
      parts.push(g2);
    }

    const mergedRoads = BufferGeometryUtils.mergeGeometries(parts);
    const roadsMesh = new THREE.Mesh(mergedRoads, roadMat);
    roadsMesh.receiveShadow = true;
    roadsMesh.frustumCulled = true;
    this.trackAdd(roadsMesh);
    this.staticMeshes.push(roadsMesh);

    const highwayParts = [];
    const brokenG = new THREE.BoxGeometry(240, 8, 24);
    brokenG.rotateZ(-0.12);
    brokenG.translate(120, 18, -120);
    highwayParts.push(brokenG);

    const collapsedG = new THREE.BoxGeometry(140, 7, 24);
    collapsedG.rotateY(0.45);
    collapsedG.rotateX(0.2);
    collapsedG.translate(210, 4, -90);
    highwayParts.push(collapsedG);

    const mergedHighway = BufferGeometryUtils.mergeGeometries(highwayParts);
    const highwayMesh = new THREE.Mesh(mergedHighway, this.materials.concrete.clone());
    highwayMesh.castShadow = true;
    highwayMesh.receiveShadow = true;
    highwayMesh.frustumCulled = true;
    this.trackAdd(highwayMesh);
    this.staticMeshes.push(highwayMesh);
  }

  addSkylineRuins() {
    const layout = this.getOrCreateLayoutData();
    const buildingMat = new THREE.MeshStandardMaterial({
      color: 0x50565f,
      roughness: 0.9,
      metalness: 0.08,
      vertexColors: true
    });

    const buildings = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      buildingMat,
      layout.skyline.length
    );
    buildings.castShadow = true;
    buildings.receiveShadow = true;
    buildings.frustumCulled = true;

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const neonEntries = [];

    for (let i = 0; i < layout.skyline.length; i += 1) {
      const b = layout.skyline[i];
      const base = this.getTerrainHeight(b.x, b.z);

      dummy.position.set(b.x, base + b.h * 0.5, b.z);
      dummy.rotation.set(0, b.rotY, b.tiltZ);
      dummy.scale.set(b.w, b.h, b.d);
      dummy.updateMatrix();
      buildings.setMatrixAt(i, dummy.matrix);

      color.setHex(b.dark ? 0x3f4955 : 0x50565f);
      buildings.setColorAt(i, color);

      if (b.neon) neonEntries.push({ ...b, base });
    }

    buildings.instanceMatrix.needsUpdate = true;
    if (buildings.instanceColor) buildings.instanceColor.needsUpdate = true;
    this.trackAdd(buildings);

    if (neonEntries.length > 0) {
      const signMesh = new THREE.InstancedMesh(
        new THREE.PlaneGeometry(1, 1),
        this.materials.neon,
        neonEntries.length
      );
      signMesh.frustumCulled = true;

      for (let i = 0; i < neonEntries.length; i += 1) {
        const b = neonEntries[i];
        const ox = Math.sin(b.rotY) * (b.d * 0.5 + 0.04);
        const oz = Math.cos(b.rotY) * (b.d * 0.5 + 0.04);
        dummy.position.set(b.x + ox, b.base + b.h * 0.7, b.z + oz);
        dummy.rotation.set(0, b.rotY, 0);
        dummy.scale.set(b.w * 0.7, b.h * 0.12, 1);
        dummy.updateMatrix();
        signMesh.setMatrixAt(i, dummy.matrix);
      }

      signMesh.instanceMatrix.needsUpdate = true;
      this.trackAdd(signMesh);
    }
  }

  addProps() {
    const rubbleCount = Math.floor(this.profile.propCount * 0.45);
    const metalCount = Math.floor(this.profile.propCount * 0.25);
    const plantCount = this.profile.propCount - rubbleCount - metalCount;

    const rubbleMesh = new THREE.InstancedMesh(
      new THREE.DodecahedronGeometry(1.2, 0),
      this.materials.rubble,
      rubbleCount
    );
    const metalMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1.2, 0.8, 2.8),
      this.materials.metal,
      metalCount
    );
    const plantMesh = new THREE.InstancedMesh(
      new THREE.ConeGeometry(1, 2.4, 6),
      this.materials.plant,
      plantCount
    );

    rubbleMesh.castShadow = true;
    rubbleMesh.receiveShadow = true;
    rubbleMesh.frustumCulled = true;
    metalMesh.castShadow = true;
    metalMesh.receiveShadow = true;
    metalMesh.frustumCulled = true;
    plantMesh.castShadow = true;
    plantMesh.receiveShadow = true;
    plantMesh.frustumCulled = true;

    const dummy = new THREE.Object3D();
    let r = 0;
    let m = 0;
    let p = 0;

    for (let i = 0; i < this.profile.propCount; i += 1) {
      const type = Math.random();
      const x = (Math.random() - 0.5) * 760;
      const z = (Math.random() - 0.5) * 760;
      const y = this.getTerrainHeight(x, z);

      if (Math.abs(x) < 50 && Math.abs(z) < 50) continue;

      dummy.position.set(x, y + 0.4, z);
      dummy.rotation.set(0, Math.random() * Math.PI, 0);

      if (type < 0.45 && r < rubbleCount) {
        const scale = 0.5 + Math.random() * 2.2;
        dummy.scale.set(scale, scale, scale);
        dummy.updateMatrix();
        rubbleMesh.setMatrixAt(r, dummy.matrix);
        r += 1;
      } else if (type < 0.7 && m < metalCount) {
        const sx = 0.9 + Math.random() * 0.5;
        const sz = 0.9 + Math.random() * 1.4;
        dummy.scale.set(sx, 0.75 + Math.random() * 0.45, sz);
        dummy.updateMatrix();
        metalMesh.setMatrixAt(m, dummy.matrix);
        m += 1;
      } else if (p < plantCount) {
        const scale = 0.5 + Math.random() * 1.4;
        dummy.scale.set(scale, scale, scale);
        dummy.updateMatrix();
        plantMesh.setMatrixAt(p, dummy.matrix);
        p += 1;
      }

      if (Math.random() < this.profile.fireChance) {
        this.addFireCluster(x + Math.random() * 4, z + Math.random() * 4);
      }
    }

    rubbleMesh.count = r;
    metalMesh.count = m;
    plantMesh.count = p;
    rubbleMesh.instanceMatrix.needsUpdate = true;
    metalMesh.instanceMatrix.needsUpdate = true;
    plantMesh.instanceMatrix.needsUpdate = true;

    this.trackAdd(rubbleMesh);
    this.trackAdd(metalMesh);
    this.trackAdd(plantMesh);
  }

  addStreetLights() {
    const layout = this.getOrCreateLayoutData();
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x454f57, roughness: 0.65, metalness: 0.72 });
    const lampMat = new THREE.MeshStandardMaterial({ color: 0x94d7ff, emissive: 0x2a7fb0, emissiveIntensity: 0.8 });
    const count = layout.streetLights.length;

    const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.2, 8.5, 8), poleMat, count);
    const lamps = new THREE.InstancedMesh(new THREE.BoxGeometry(0.55, 0.22, 0.35), lampMat, count);
    poles.castShadow = true;
    poles.receiveShadow = true;
    poles.frustumCulled = true;
    lamps.frustumCulled = true;

    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i += 1) {
      const s = layout.streetLights[i];
      const y = this.getTerrainHeight(s.x, s.z);

      dummy.position.set(s.x, y + 4.2, s.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      poles.setMatrixAt(i, dummy.matrix);

      dummy.position.set(s.x, y + 8.2, s.z);
      dummy.updateMatrix();
      lamps.setMatrixAt(i, dummy.matrix);

      if (s.hasLight) {
        const light = new THREE.PointLight(0x79c9ff, 0.75, 20, 2);
        light.position.set(s.x, y + 8, s.z);
        light.visible = false;
        this.trackAdd(light);
        this.fires.push({ light, base: s.base, phase: s.phase });
      }
    }

    poles.instanceMatrix.needsUpdate = true;
    lamps.instanceMatrix.needsUpdate = true;
    this.trackAdd(poles);
    this.trackAdd(lamps);
  }

  addFireCluster(x, z) {
    const y = this.getTerrainHeight(x, z);

    const fire = new THREE.PointLight(0xff6a33, 3.2, 24, 2);
    fire.position.set(x, y + 2, z);
    fire.visible = false;
    this.trackAdd(fire);
    this.fires.push({ light: fire, base: 2.4 + Math.random() * 1.4, phase: Math.random() * Math.PI * 2 });

    const ember = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xff7341 })
    );
    ember.position.set(x, y + 0.3, z);
    this.trackAdd(ember);

    this.staticMeshes.push(ember);
  }

  addAtmosphericVolumes() {
    for (let i = 0; i < this.profile.smokeCount; i += 1) {
      const x = (Math.random() - 0.5) * 720;
      const z = (Math.random() - 0.5) * 720;
      const y = this.getTerrainHeight(x, z);
      const cloud = new THREE.Mesh(
        new THREE.PlaneGeometry(14 + Math.random() * 12, 24 + Math.random() * 28),
        new THREE.MeshBasicMaterial({ color: 0x5d6978, transparent: true, opacity: 0.14, depthWrite: false })
      );
      cloud.position.set(x, y + 8 + Math.random() * 16, z);
      cloud.rotation.y = Math.random() * Math.PI * 2;
      this.trackAdd(cloud);
      this.smokeColumns.push({ mesh: cloud, drift: 0.08 + Math.random() * 0.12, phase: Math.random() * Math.PI * 2 });
    }
  }

  addDustParticles() {
    const count = this.profile.dustCount;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i += 1) {
      const x = (Math.random() - 0.5) * 760;
      const z = (Math.random() - 0.5) * 760;
      const y = this.getTerrainHeight(x, z) + 1 + Math.random() * 28;

      positions[i * 3 + 0] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      const c = 0.55 + Math.random() * 0.25;
      colors[i * 3 + 0] = c * 0.8;
      colors[i * 3 + 1] = c * 0.92;
      colors[i * 3 + 2] = c;

      this.dustData.push({
        speed: 0.4 + Math.random() * 0.7,
        wobble: 0.2 + Math.random() * 0.5,
        phase: Math.random() * Math.PI * 2
      });
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({ size: 0.36, vertexColors: true, transparent: true, opacity: 0.28, depthWrite: false });
    this.dustParticles = new THREE.Points(geo, mat);
    this.trackAdd(this.dustParticles);
  }

  addDistantGiants() {
    const giantMat = new THREE.MeshStandardMaterial({ color: 0x37454f, roughness: 0.88 });

    for (let i = 0; i < 6; i += 1) {
      const x = (Math.random() > 0.5 ? 1 : -1) * (290 + Math.random() * 100);
      const z = (Math.random() - 0.5) * 700;
      const y = this.getTerrainHeight(x, z);

      const body = new THREE.Mesh(new THREE.CapsuleGeometry(4.2, 11, 6, 12), giantMat);
      body.position.set(0, 0, 0);
      body.castShadow = true;
      body.userData.isDistantGiant = true;

      const neck = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.6, 12, 10), giantMat);
      neck.position.set(0, 9, 3);
      neck.rotation.x = -0.2;
      body.add(neck);

      const low = new THREE.Mesh(new THREE.CapsuleGeometry(3.2, 7.5, 4, 8), giantMat);
      low.position.set(0, 0, 0);

      const lod = new THREE.LOD();
      lod.addLevel(body, 0);
      lod.addLevel(low, 180);
      lod.position.set(x, y + 15, z);
      lod.userData.isDistantGiant = true;
      this.trackAdd(lod);
      this.staticMeshes.push(lod);
    }
  }

  addPickups() {
    for (let i = 0; i < this.profile.pickupCount; i += 1) {
      const isHealth = Math.random() > 0.5;
      const color = isHealth ? 0x63f28f : 0x79b1ff;
      const x = (Math.random() - 0.5) * 540;
      const z = (Math.random() - 0.5) * 540;
      const y = this.getTerrainHeight(x, z) + 0.8;

      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.8, 0.8),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.2 })
      );
      mesh.position.set(x, y, z);
      mesh.castShadow = true;

      this.trackAdd(mesh);

      this.pickups.push({
        mesh,
        type: isHealth ? 'health' : 'ammo',
        amount: isHealth ? 25 : 12,
        active: true,
        phase: Math.random() * Math.PI * 2
      });
    }
  }

  registerPickupsToECS(world) {
    for (const pickup of this.pickups) {
      const entity = world.createEntity();
      pickup.entity = entity;

      world.addComponent(entity, 'pickup', {
        type: pickup.type,
        amount: pickup.amount
      });
      world.addComponent(entity, 'transform', {
        baseY: pickup.mesh.position.y,
        phase: pickup.phase
      });
      world.addComponent(entity, 'renderable', {
        mesh: pickup.mesh
      });
      world.addComponent(entity, 'lifecycle', {
        active: pickup.active
      });
    }
  }

  updateDynamicLightActivation(viewerPosition) {
    if (!viewerPosition || this.fires.length === 0) {
      this.performanceStats.activeDynamicLights = 0;
      this.performanceStats.totalDynamicLights = this.fires.length;
      return;
    }

    const maxDistSq = this.profile.dynamicLightDistance * this.profile.dynamicLightDistance;
    const candidates = [];

    for (const fire of this.fires) {
      const distSq = fire.light.position.distanceToSquared(viewerPosition);
      if (distSq <= maxDistSq) {
        candidates.push({ fire, distSq });
      }
      fire.light.visible = false;
    }

    candidates.sort((a, b) => a.distSq - b.distSq);
    const activeCount = Math.min(this.profile.dynamicLightCap, candidates.length);
    for (let i = 0; i < activeCount; i += 1) {
      candidates[i].fire.light.visible = true;
    }

    this.performanceStats.activeDynamicLights = activeCount;
    this.performanceStats.totalDynamicLights = this.fires.length;
  }

  getDiagnostics() {
    return { ...this.performanceStats };
  }

  update(dt, viewerPosition) {
    let sway = performance.now() * 0.00015;
    for (const mesh of this.staticMeshes) {
      if (mesh.userData.isDistantGiant) {
        mesh.rotation.y = Math.sin(sway + mesh.position.x * 0.01) * 0.1;
      }
    }

    this.lightCullTimer += dt;
    if (this.lightCullTimer >= 0.12) {
      this.lightCullTimer = 0;
      this.updateDynamicLightActivation(viewerPosition);
    }

    for (const f of this.fires) {
      if (!f.light.visible) continue;
      f.phase += dt * 2.8;
      f.light.intensity = f.base + Math.sin(f.phase * 4.3) * 0.24;
    }

    for (const s of this.smokeColumns) {
      s.phase += dt * s.drift;
      s.mesh.position.x += Math.sin(s.phase) * 0.02;
      s.mesh.position.z += Math.cos(s.phase * 0.8) * 0.02;
      s.mesh.material.opacity = 0.09 + Math.sin(s.phase * 1.6) * 0.04;
    }

    if (this.dustParticles) {
      const pos = this.dustParticles.geometry.attributes.position;
      for (let i = this.dustPhaseOffset; i < this.dustData.length; i += 2) {
        const d = this.dustData[i];
        d.phase += dt * d.speed;
        const ix = i * 3;

        pos.array[ix + 0] += Math.sin(d.phase) * 0.015 * d.wobble;
        pos.array[ix + 2] += Math.cos(d.phase * 1.2) * 0.012 * d.wobble;
        pos.array[ix + 1] += dt * 0.14;

        if (pos.array[ix + 1] > 34) {
          pos.array[ix + 1] = this.getTerrainHeight(pos.array[ix + 0], pos.array[ix + 2]) + 0.6;
        }
      }
      this.dustPhaseOffset = (this.dustPhaseOffset + 1) & 1;
      pos.needsUpdate = true;
    }
  }
}
