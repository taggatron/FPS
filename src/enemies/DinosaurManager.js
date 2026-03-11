import * as THREE from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { SpatialHashGrid } from '../engine/spatial/SpatialHashGrid.js';
import { ECSWorld } from '../engine/ecs/World.js';
import { DinosaurAISystem } from '../game/systems/DinosaurAISystem.js';

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

    this.tmpImpact = new THREE.Vector3();
    this.hitTargets = [];
    this.spatialQuery = [];
    this.spatial = new SpatialHashGrid(36);
    this.ecs = new ECSWorld();
    this.aiSystem = new DinosaurAISystem(this.terrainHeightFn, this.spatial);

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

    const entity = this.ecs.createEntity();
    const aiTarget = new THREE.Vector3(x, y, z);
    const motionVelocity = new THREE.Vector3();
    const motionDesired = new THREE.Vector3();
    const damagePos = new THREE.Vector3();

    this.ecs.addComponent(entity, 'dino', { typeName, type });
    this.ecs.addComponent(entity, 'ai', {
      state: 'roam',
      target: aiTarget,
      attackCd: 0,
      anim: Math.random() * Math.PI * 2,
      alive: true
    });
    this.ecs.addComponent(entity, 'motion', {
      velocity: motionVelocity,
      desired: motionDesired
    });
    this.ecs.addComponent(entity, 'combat', {
      health: type.health,
      damagePos
    });
    this.ecs.addComponent(entity, 'render', { mesh: group });
    this.ecs.addComponent(entity, 'animation', { legs, mixer });

    this.enemies.push({
      entity,
      typeName,
      type,
      mesh: group,
      health: type.health,
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

    this.aiSystem.update(this.ecs, dt, playerPos, onDamagePlayer);

    for (const enemy of this.enemies) {
      const ai = this.ecs.getComponent(enemy.entity, 'ai');
      const combat = this.ecs.getComponent(enemy.entity, 'combat');
      enemy.alive = !!ai?.alive;
      if (combat) enemy.health = combat.health;
    }
  }

  getHitTargets(origin = null, range = 120) {
    this.hitTargets.length = 0;

    if (origin) {
      this.spatial.queryRadius(origin.x, origin.z, range + 8, this.spatialQuery);
      for (const found of this.spatialQuery) {
        const ai = this.ecs.getComponent(found.entity, 'ai');
        if (!ai?.alive) continue;
        this.hitTargets.push(found.mesh);
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

    const combat = this.ecs.getComponent(hitEnemy.entity, 'combat');
    const ai = this.ecs.getComponent(hitEnemy.entity, 'ai');
    if (!combat || !ai) return null;

    combat.health -= damage;
    hitEnemy.health = combat.health;
    this.tmpImpact.copy(intersection.face?.normal || this.tmpImpact.set(0, 0, 1));
    hitEnemy.mesh.position.addScaledVector(this.tmpImpact, -0.2);

    if (combat.health <= 0) {
      hitEnemy.alive = false;
      ai.alive = false;
      ai.state = 'dead';
      hitEnemy.mesh.traverse((o) => {
        if (o.isMesh) o.material.color.offsetHSL(0, -0.2, -0.2);
      });
      setTimeout(() => {
        this.scene.remove(hitEnemy.mesh);
        this.ecs.removeEntity(hitEnemy.entity);
      }, 4500);

      return { killed: true, score: hitEnemy.type.score, type: hitEnemy.typeName };
    }

    return { killed: false, score: 0, type: hitEnemy.typeName };
  }

  aliveCount() {
    let count = 0;
    for (const e of this.enemies) {
      if (e.alive) count += 1;
    }
    return count;
  }

  clearAll() {
    for (const enemy of this.enemies) {
      this.scene.remove(enemy.mesh);
      this.ecs.removeEntity(enemy.entity);
    }
    this.enemies.length = 0;
  }
}
