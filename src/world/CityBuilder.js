import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

function noise(x, z) {
  return Math.sin(x * 0.09) * 1.6 + Math.cos(z * 0.07) * 1.2 + Math.sin((x + z) * 0.04) * 2.3;
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
            fireChance: 0.11
          }
        : preset === 'performance'
          ? {
              skylineCount: 120,
              propCount: 170,
              streetLightCount: 48,
              smokeCount: 18,
              dustCount: 280,
              pickupCount: 18,
              fireChance: 0.045
            }
          : {
              skylineCount: 180,
              propCount: 280,
              streetLightCount: 85,
              smokeCount: 36,
              dustCount: 680,
              pickupCount: 24,
              fireChance: 0.08
            };
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
    this.clearGenerated();
    this.addSkyDome();
    this.addGround();
    this.addRoadGrid();
    this.addSkylineRuins();
    this.addStreetLights();
    this.addProps();
    this.addAtmosphericVolumes();
    this.addDustParticles();
    this.addDistantGiants();
    this.addPickups();
  }

  addSkyDome() {
    const skyGeo = new THREE.SphereGeometry(1200, 24, 20);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        topColor: { value: new THREE.Color(0x1d2e3e) },
        horizonColor: { value: new THREE.Color(0x425867) },
        bottomColor: { value: new THREE.Color(0x0a1016) }
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
    const block = new THREE.Group();
    const windowMat = new THREE.MeshBasicMaterial({
      color: 0x7fc4ff,
      transparent: true,
      opacity: 0.12
    });

    for (let i = 0; i < this.profile.skylineCount; i += 1) {
      const w = 10 + Math.random() * 26;
      const d = 10 + Math.random() * 26;
      const h = 18 + Math.random() * 110;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.materials.concrete.clone());

      const x = (Math.random() - 0.5) * 760;
      const z = (Math.random() - 0.5) * 760;
      if (Math.abs(x) < 70 && Math.abs(z) < 70) continue;

      const base = this.getTerrainHeight(x, z);
      mesh.position.set(x, base + h / 2, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      if (Math.random() < 0.28) {
        mesh.rotation.z = (Math.random() - 0.5) * 0.25;
      }

      if (Math.random() < 0.2) {
        mesh.material.color.setHex(0x3f4955);
        mesh.material.emissive.setHex(0x0f0c16);
      }

      if (Math.random() < 0.15) {
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.7, h * 0.12), this.materials.neon);
        sign.position.set(0, h * 0.2, d / 2 + 0.02);
        mesh.add(sign);
      }

      if (Math.random() < 0.62) {
        const floors = Math.max(2, Math.floor(h / 6));
        const cols = Math.max(2, Math.floor(w / 3.5));
        const panel = new THREE.Group();
        const startY = -h * 0.42;

        for (let fy = 0; fy < floors; fy += 1) {
          for (let cx = 0; cx < cols; cx += 1) {
            if (Math.random() < 0.38) continue;
            const cell = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 1.05), windowMat.clone());
            cell.material.opacity = 0.07 + Math.random() * 0.1;
            cell.position.set((cx - cols * 0.5) * 1.1, startY + fy * 1.55, d * 0.5 + 0.03);
            panel.add(cell);
          }
        }

        mesh.add(panel);
      }

      block.add(mesh);
      this.staticMeshes.push(mesh);
    }

    this.trackAdd(block);
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
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x454f57, roughness: 0.65, metalness: 0.72 });
    const lampMat = new THREE.MeshStandardMaterial({ color: 0x94d7ff, emissive: 0x2a7fb0, emissiveIntensity: 0.8 });

    for (let i = 0; i < this.profile.streetLightCount; i += 1) {
      const alongX = Math.random() > 0.5;
      const lane = (Math.floor(Math.random() * 9) - 4) * 80;
      const offset = (Math.random() - 0.5) * 700;
      const x = alongX ? offset : lane + (Math.random() > 0.5 ? 10 : -10);
      const z = alongX ? lane + (Math.random() > 0.5 ? 10 : -10) : offset;
      const y = this.getTerrainHeight(x, z);

      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 8.5, 10), poleMat);
      pole.position.set(x, y + 4.2, z);
      pole.castShadow = true;
      this.trackAdd(pole);
      this.staticMeshes.push(pole);

      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.35), lampMat);
      lamp.position.set(x, y + 8.2, z);
      this.trackAdd(lamp);
      this.staticMeshes.push(lamp);

      if (Math.random() < 0.72) {
        const light = new THREE.PointLight(0x79c9ff, 0.75, 20, 2);
        light.position.set(x, y + 8, z);
        this.trackAdd(light);
        this.fires.push({ light, base: 0.55 + Math.random() * 0.4, phase: Math.random() * Math.PI * 2 });
      }
    }
  }

  addFireCluster(x, z) {
    const y = this.getTerrainHeight(x, z);

    const fire = new THREE.PointLight(0xff6a33, 3.2, 24, 2);
    fire.position.set(x, y + 2, z);
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

  update(dt) {
    for (const p of this.pickups) {
      if (!p.active) continue;
      p.phase += dt * 2.2;
      p.mesh.position.y += Math.sin(p.phase) * 0.005;
      p.mesh.rotation.y += dt;
    }

    let sway = performance.now() * 0.00015;
    for (const mesh of this.staticMeshes) {
      if (mesh.userData.isDistantGiant) {
        mesh.rotation.y = Math.sin(sway + mesh.position.x * 0.01) * 0.1;
      }
    }

    for (const f of this.fires) {
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
      for (let i = 0; i < this.dustData.length; i += 1) {
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
      pos.needsUpdate = true;
    }
  }
}
