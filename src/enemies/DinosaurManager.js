import * as THREE from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { SpatialHashGrid } from '../engine/spatial/SpatialHashGrid.js';

const TYPES = {
  raptor: {
    speed: 11,
    health: 55,
    damage: 11,
    radius: 0.85,
    detection: 55,
    color: 0x9bcf77,
    score: 30,
    size: 0.9
  },
  mauler: {
    speed: 7,
    health: 110,
    damage: 21,
    radius: 1.25,
    detection: 65,
    color: 0xc58f5d,
    score: 80,
    size: 1.35
  },
  apex: {
    speed: 5.5,
    health: 250,
    damage: 34,
    radius: 1.9,
    detection: 90,
    color: 0xb95e55,
    score: 200,
    size: 2.2
  }
};

export class DinosaurManager {
  constructor(scene, terrainHeightFn, assetManager) {
    this.scene = scene;
    this.terrainHeightFn = terrainHeightFn;
    this.assetManager = assetManager;
    this.enemies = [];
    this.spawnTimer = 0;
    this.maxEnemies = 28;
    this.onlyApexMode = true;

    this.apexModelReady = false;
    this.loadingProgress = 0;
    this.loadingSubscribers = [];

    this.tmpToPlayer = new THREE.Vector3();
    this.tmpDesired = new THREE.Vector3();
    this.tmpImpact = new THREE.Vector3();
    this.hitTargets = [];
    this.spatialQuery = [];
    this.spatial = new SpatialHashGrid(36);

    this.apexModelTemplate = null;
    this.apexAnimations = [];

    this.preloadApexModel();
  }

  preloadApexModel() {
    const modelUrl = '/t-rex/scene.gltf';
    this.emitLoadingStatus('loading', 0);
    this.assetManager
      .loadModel(modelUrl)
      .then((gltf) => {
        const root = gltf.scene;
        root.traverse((obj) => {
          if (obj.isMesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
            obj.frustumCulled = true;
            if (obj.material?.map) obj.material.map.colorSpace = THREE.SRGBColorSpace;
          }
        });

        // Normalize arbitrary authoring units so every apex spawn has reliable in-game size.
        const initialBounds = new THREE.Box3().setFromObject(root);
        const initialSize = initialBounds.getSize(new THREE.Vector3());
        const maxAxis = Math.max(initialSize.x, initialSize.y, initialSize.z, 0.0001);
        const targetWorldSize = 8.5;
        const uniformScale = targetWorldSize / maxAxis;
        root.scale.setScalar(uniformScale);

        // Recompute bounds after scaling and shift pivot to be centered on X/Z with feet at Y=0.
        const fittedBounds = new THREE.Box3().setFromObject(root);
        const fittedCenter = fittedBounds.getCenter(new THREE.Vector3());
        root.position.x -= fittedCenter.x;
        root.position.z -= fittedCenter.z;
        root.position.y -= fittedBounds.min.y;

        this.apexModelTemplate = root;
        this.apexAnimations = gltf.animations ?? [];
        this.apexModelReady = true;
        this.emitLoadingStatus('ready', 100);
      })
      .catch((err) => {
        this.apexModelReady = true;
        this.emitLoadingStatus('fallback', 100);
        console.warn('Failed to load T-Rex model, using placeholder apex mesh.', err);
      });
  }

  onLoadingStatus(callback) {
    this.loadingSubscribers.push(callback);
  }

  emitLoadingStatus(state, progress) {
    for (const callback of this.loadingSubscribers) {
      callback({ state, progress });
    }
  }

  isApexModelReady() {
    return this.apexModelReady;
  }

  spawnInitial() {
    if (this.onlyApexMode) {
      for (let i = 0; i < 6; i += 1) this.spawn('apex');
      return;
    }

    for (let i = 0; i < 8; i += 1) this.spawn('raptor');
    for (let i = 0; i < 5; i += 1) this.spawn('mauler');
    for (let i = 0; i < 2; i += 1) this.spawn('apex');
  }

  makeDinoMesh(typeName) {
    if (typeName === 'apex' && this.apexModelTemplate) {
      const lod = new THREE.LOD();
      const instance = clone(this.apexModelTemplate);
      const lowProxy = new THREE.Mesh(
        new THREE.CapsuleGeometry(1.4, 3.2, 4, 8),
        new THREE.MeshStandardMaterial({ color: 0x4e5a63, roughness: 0.84 })
      );
      lowProxy.castShadow = true;

      lod.addLevel(instance, 0);
      lod.addLevel(lowProxy, 50);
      lod.autoUpdate = true;
      lod.frustumCulled = true;

      const legs = [];
      const mixer = this.apexAnimations.length > 0 ? new THREE.AnimationMixer(instance) : null;
      if (mixer) {
        const action = mixer.clipAction(this.apexAnimations[0]);
        action.timeScale = 1.1;
        action.play();
      }

      return { group: lod, legs, mixer };
    }

    const type = TYPES[typeName];
    const g = new THREE.Group();

    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.55 * type.size, 1.4 * type.size, 6, 10),
      new THREE.MeshStandardMaterial({ color: type.color, roughness: 0.78 })
    );
    body.rotation.z = Math.PI / 2;
    body.castShadow = true;
    g.add(body);

    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.8 * type.size, 0.45 * type.size, 0.95 * type.size),
      body.material
    );
    head.position.set(1.25 * type.size, 0.2 * type.size, 0);
    head.castShadow = true;
    g.add(head);

    const tail = new THREE.Mesh(
      new THREE.ConeGeometry(0.25 * type.size, 1.6 * type.size, 8),
      body.material
    );
    tail.rotation.z = -Math.PI / 2;
    tail.position.set(-1.3 * type.size, 0, 0);
    tail.castShadow = true;
    g.add(tail);

    const legs = [];
    for (let i = 0; i < 2; i += 1) {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.11 * type.size, 0.14 * type.size, 0.8 * type.size, 6),
        body.material
      );
      leg.position.set(0.2 * type.size, -0.55 * type.size, i === 0 ? -0.3 * type.size : 0.3 * type.size);
      leg.castShadow = true;
      g.add(leg);
      legs.push(leg);
    }

    return { group: g, legs, mixer: null };
  }

  spawn(typeName = 'raptor', around = null) {
    const type = TYPES[typeName];
    const { group, legs, mixer } = this.makeDinoMesh(typeName);

    let x;
    let z;

    if (around) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 28 + Math.random() * 45;
      x = around.x + Math.cos(angle) * dist;
      z = around.z + Math.sin(angle) * dist;
    } else {
      x = (Math.random() - 0.5) * 620;
      z = (Math.random() - 0.5) * 620;
    }

    const y = this.terrainHeightFn(x, z) + 1.2;

    group.position.set(x, y, z);
    group.rotation.y = Math.random() * Math.PI * 2;
    this.scene.add(group);

    this.enemies.push({
      typeName,
      type,
      mesh: group,
      legs,
      health: type.health,
      state: 'roam',
      target: new THREE.Vector3(x, y, z),
      velocity: new THREE.Vector3(),
      desired: new THREE.Vector3(),
      damagePos: new THREE.Vector3(),
      attackCd: 0,
      anim: Math.random() * Math.PI * 2,
      mixer,
      alive: true
    });
  }

  update(dt, playerPos, onDamagePlayer) {
    this.spatial.clear();

    this.spawnTimer += dt;
    if (this.spawnTimer > 7 && this.aliveCount() < this.maxEnemies) {
      this.spawnTimer = 0;
      const roll = Math.random();
      const type = this.onlyApexMode ? 'apex' : roll > 0.87 ? 'apex' : roll > 0.5 ? 'mauler' : 'raptor';
      this.spawn(type, playerPos);
    }

    for (const e of this.enemies) {
      if (!e.alive) continue;

      e.anim += dt * (e.type.speed * 0.8);
      if (e.mixer) e.mixer.update(dt);

      const toPlayer = this.tmpToPlayer.copy(playerPos).sub(e.mesh.position);
      const dist = toPlayer.length();

      if (dist < e.type.detection) {
        e.state = dist < 3.5 + e.type.radius ? 'attack' : 'chase';
      } else if (e.state !== 'roam') {
        e.state = 'roam';
        e.target.set(
          e.mesh.position.x + (Math.random() - 0.5) * 40,
          e.mesh.position.y,
          e.mesh.position.z + (Math.random() - 0.5) * 40
        );
      }

      const desired = e.desired || this.tmpDesired;

      if (e.state === 'roam') {
        desired.copy(e.target).sub(e.mesh.position);
        if (desired.length() < 2) {
          e.target.set(
            e.mesh.position.x + (Math.random() - 0.5) * 45,
            e.mesh.position.y,
            e.mesh.position.z + (Math.random() - 0.5) * 45
          );
          desired.copy(e.target).sub(e.mesh.position);
        }
      } else {
        desired.copy(toPlayer);
      }

      desired.y = 0;
      if (desired.lengthSq() > 0.01) desired.normalize();

      const stateSpeed = e.state === 'chase' || e.state === 'attack' ? e.type.speed : e.type.speed * 0.45;
      e.velocity.lerp(desired.multiplyScalar(stateSpeed), dt * 3.5);

      if (e.state === 'chase' && e.typeName === 'mauler' && dist < 14 && Math.random() < 0.02) {
        e.velocity.multiplyScalar(2);
      }

      e.mesh.position.addScaledVector(e.velocity, dt);
      const floor = this.terrainHeightFn(e.mesh.position.x, e.mesh.position.z) + 1.2;
      e.mesh.position.y = floor;

      if (e.velocity.lengthSq() > 0.001) {
        const desiredRot = Math.atan2(e.velocity.x, e.velocity.z);
        e.mesh.rotation.y = THREE.MathUtils.damp(e.mesh.rotation.y, desiredRot, 12, dt);
      }

      const step = Math.sin(e.anim * 4) * 0.35;
      if (e.legs.length >= 2) {
        e.legs[0].rotation.x = step;
        e.legs[1].rotation.x = -step;
      }

      if (e.attackCd > 0) e.attackCd -= dt;
      if (e.state === 'attack' && e.attackCd <= 0) {
        e.damagePos.copy(e.mesh.position);
        onDamagePlayer(e.type.damage, e.damagePos, e.typeName);
        e.attackCd = e.typeName === 'raptor' ? 0.9 : e.typeName === 'mauler' ? 1.2 : 1.7;
      }

      this.spatial.insert(e, e.mesh.position.x, e.mesh.position.z);
    }
  }

  getHitTargets(origin = null, range = 120) {
    this.hitTargets.length = 0;

    if (origin) {
      this.spatial.queryRadius(origin.x, origin.z, range + 8, this.spatialQuery);
      for (const enemy of this.spatialQuery) {
        if (!enemy.alive) continue;
        this.hitTargets.push(enemy.mesh);
      }
      return this.hitTargets;
    }

    for (const enemy of this.enemies) {
      if (enemy.alive) this.hitTargets.push(enemy.mesh);
    }
    return this.hitTargets;
  }

  getEnemySnapshot() {
    const out = [];
    for (const e of this.enemies) {
      if (!e.alive) continue;
      out.push({ x: e.mesh.position.x, z: e.mesh.position.z, type: e.typeName });
    }
    return out;
  }

  applyHit(intersection, damage) {
    let hitEnemy = null;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (intersection.object === e.mesh || e.mesh.getObjectById(intersection.object.id)) {
        hitEnemy = e;
        break;
      }
    }

    if (!hitEnemy) return null;

    hitEnemy.health -= damage;
    this.tmpImpact.copy(intersection.face?.normal || this.tmpImpact.set(0, 0, 1));
    hitEnemy.mesh.position.addScaledVector(this.tmpImpact, -0.2);

    if (hitEnemy.health <= 0) {
      hitEnemy.alive = false;
      hitEnemy.state = 'dead';
      hitEnemy.mesh.traverse((o) => {
        if (o.isMesh) o.material.color.offsetHSL(0, -0.2, -0.2);
      });
      setTimeout(() => {
        this.scene.remove(hitEnemy.mesh);
      }, 4500);

      return { killed: true, score: hitEnemy.type.score, type: hitEnemy.typeName };
    }

    return { killed: false, score: 0, type: hitEnemy.typeName };
  }

  aliveCount() {
    return this.enemies.filter((e) => e.alive).length;
  }
}
