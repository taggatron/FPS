import * as THREE from 'three';
import { ECSWorld } from '../engine/ecs/World.js';

export class WeaponSystem {
  constructor(camera, scene) {
    this.camera = camera;
    this.scene = scene;

    this.maxAmmo = 36;
    this.clipSize = 12;
    this.ammoInClip = this.clipSize;
    this.reserveAmmo = this.maxAmmo;

    this.fireRate = 10;
    this.reloadTime = 1.45;
    this.damage = 24;
    this.range = 120;

    this.cooldown = 0;
    this.reloading = false;
    this.reloadTimer = 0;

    this.recoil = 0;
    this.time = 0;
    this.reloadPulse = 0;
    this.adsLerp = 0;

    this.raycaster = new THREE.Raycaster();
    this.tmpDirection = new THREE.Vector3();
    this.tmpOrigin = new THREE.Vector3();

    this.muzzleFlash = new THREE.PointLight(0xffbb77, 0, 12, 2);
    this.scene.add(this.muzzleFlash);

    this.shotParticles = [];
    this.tracerWorld = new ECSWorld();
    this.tracerPoolIds = [];
    this.activeTracerIds = [];

    this.tracerGeometry = new THREE.SphereGeometry(0.05, 5, 5);
    this.createTracerPool(48);

    this.buildViewModel();
  }

  createTracerPool(count) {
    for (let i = 0; i < count; i += 1) {
      const mat = new THREE.MeshBasicMaterial({ color: 0x74d7ff, transparent: true, opacity: 0 });
      const mesh = new THREE.Mesh(this.tracerGeometry, mat);
      mesh.visible = false;
      this.scene.add(mesh);
      const entity = this.tracerWorld.createEntity();
      this.tracerWorld.addComponent(entity, 'renderable', { mesh });
      this.tracerWorld.addComponent(entity, 'trace', {
        active: false,
        vel: new THREE.Vector3(),
        life: 0
      });
      this.tracerPoolIds.push(entity);
    }
  }

  buildViewModel() {
    this.viewModel = new THREE.Group();
    this.viewModel.position.set(0.42, -0.36, -0.72);
    this.viewModel.rotation.y = -0.05;
    this.camera.add(this.viewModel);

    const weaponRoot = new THREE.Group();
    this.viewModel.add(weaponRoot);
    this.weaponRoot = weaponRoot;

    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x2a3642,
      roughness: 0.28,
      metalness: 0.82
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x131b23,
      roughness: 0.48,
      metalness: 0.75
    });
    const glowMat = new THREE.MeshStandardMaterial({
      color: 0x58d6ff,
      emissive: 0x58d6ff,
      emissiveIntensity: 1.8,
      roughness: 0.2,
      metalness: 0.5
    });

    this.plasmaUniforms = {
      uTime: { value: 0 },
      uPulse: { value: 0 },
      uColorA: { value: new THREE.Color(0x41bcff) },
      uColorB: { value: new THREE.Color(0x9cf2ff) }
    };
    const plasmaMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: this.plasmaUniforms,
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        void main() {
          vUv = uv;
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uPulse;
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        varying vec2 vUv;
        varying vec3 vNormal;

        void main() {
          float flow = sin((vUv.y * 22.0) - (uTime * 9.0)) * 0.5 + 0.5;
          float stripe = smoothstep(0.35, 1.0, flow);
          float fres = pow(1.0 - abs(vNormal.z), 2.0);
          float energy = stripe * 0.7 + fres * 0.9 + uPulse;
          vec3 c = mix(uColorA, uColorB, flow) * energy;
          gl_FragColor = vec4(c, clamp(energy, 0.18, 1.0));
        }
      `
    });

    const core = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.18, 0.84), bodyMat);
    core.position.set(0, 0.03, -0.15);
    core.castShadow = true;
    weaponRoot.add(core);

    const barrelHousing = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.44), darkMat);
    barrelHousing.position.set(0, 0.05, -0.58);
    weaponRoot.add(barrelHousing);

    const barrelCore = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.45, 14), glowMat);
    barrelCore.position.set(0, 0.05, -0.59);
    barrelCore.rotation.x = Math.PI / 2;
    weaponRoot.add(barrelCore);
    this.barrelCore = barrelCore;

    const plasmaSleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.47, 16, 1, true), plasmaMat);
    plasmaSleeve.position.copy(barrelCore.position);
    plasmaSleeve.rotation.copy(barrelCore.rotation);
    weaponRoot.add(plasmaSleeve);

    for (let i = 0; i < 3; i += 1) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.008, 8, 18), glowMat);
      ring.position.set(0, 0.05, -0.74 + i * 0.09);
      ring.rotation.x = Math.PI / 2;
      weaponRoot.add(ring);
    }

    const sideCoilLeft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.52, 8), glowMat);
    sideCoilLeft.position.set(-0.068, 0.08, -0.45);
    sideCoilLeft.rotation.x = Math.PI / 2;
    weaponRoot.add(sideCoilLeft);

    const sideCoilRight = sideCoilLeft.clone();
    sideCoilRight.position.x = 0.068;
    weaponRoot.add(sideCoilRight);

    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.26), darkMat);
    stock.position.set(0, -0.01, 0.22);
    weaponRoot.add(stock);

    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.18, 0.09), darkMat);
    grip.position.set(0, -0.14, 0.02);
    weaponRoot.add(grip);

    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.16), bodyMat);
    sight.position.set(0, 0.14, -0.16);
    weaponRoot.add(sight);

    const sightGlow = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 10), glowMat);
    sightGlow.position.set(0, 0.14, -0.2);
    weaponRoot.add(sightGlow);

    this.viewMuzzleLight = new THREE.PointLight(0x63d6ff, 0.4, 1.8);
    this.viewMuzzleLight.position.set(0, 0.05, -0.83);
    weaponRoot.add(this.viewMuzzleLight);
  }

  update(dt, playerVelocity = new THREE.Vector3(), isAiming = false) {
    this.time += dt;
    this.adsLerp = THREE.MathUtils.damp(this.adsLerp, isAiming ? 1 : 0, 12, dt);
    if (this.cooldown > 0) this.cooldown -= dt;

    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        const needed = this.clipSize - this.ammoInClip;
        const load = Math.min(needed, this.reserveAmmo);
        this.ammoInClip += load;
        this.reserveAmmo -= load;
        this.reloading = false;
        this.reloadPulse = 0;
      }
    }

    if (this.reloading) {
      this.reloadPulse += dt * 8;
    }

    this.recoil = THREE.MathUtils.damp(this.recoil, 0, 18, dt);
    this.muzzleFlash.intensity = THREE.MathUtils.damp(this.muzzleFlash.intensity, 0, 22, dt);
    this.viewMuzzleLight.intensity = THREE.MathUtils.damp(this.viewMuzzleLight.intensity, 0.35, 12, dt);

    for (let i = this.activeTracerIds.length - 1; i >= 0; i -= 1) {
      const entity = this.activeTracerIds[i];
      const trace = this.tracerWorld.getComponent(entity, 'trace');
      const renderable = this.tracerWorld.getComponent(entity, 'renderable');

      trace.life -= dt;
      renderable.mesh.position.addScaledVector(trace.vel, dt);
      renderable.mesh.material.opacity = Math.max(0, trace.life * 4);

      if (trace.life <= 0) {
        trace.active = false;
        renderable.mesh.visible = false;
        renderable.mesh.material.opacity = 0;
        this.activeTracerIds.splice(i, 1);
        this.tracerPoolIds.push(entity);
      }
    }

    this.muzzleFlash.position.copy(this.camera.position).add(this.camera.getWorldDirection(this.tmpDirection).multiplyScalar(0.6));

    const moveAmount = Math.min(playerVelocity.length() * 0.06, 0.18);
    const bob = Math.sin(this.time * 8.4) * moveAmount;
    const sway = Math.cos(this.time * 6.2) * moveAmount;
    const reloadOffset = this.reloading ? Math.sin(this.reloadPulse) * 0.035 : 0;

    const adsX = THREE.MathUtils.lerp(0.42, 0.03, this.adsLerp);
    const adsY = THREE.MathUtils.lerp(-0.36, -0.12, this.adsLerp);
    const adsZ = THREE.MathUtils.lerp(-0.72, -0.42, this.adsLerp);

    this.viewModel.position.x = adsX + sway * (1 - this.adsLerp * 0.8) - this.recoil * 0.05;
    this.viewModel.position.y = adsY + bob * (1 - this.adsLerp * 0.85) + reloadOffset;
    this.viewModel.position.z = adsZ + this.recoil * (0.06 - this.adsLerp * 0.02);

    this.weaponRoot.rotation.x = -0.04 + this.recoil * 0.07 + reloadOffset * 0.8 - this.adsLerp * 0.02;
    this.weaponRoot.rotation.y = -0.05 - this.recoil * 0.03 + this.adsLerp * 0.04;

    if (this.barrelCore?.material) {
      const pulse = 1.4 + Math.sin(this.time * 7) * 0.5 + this.recoil * 1.6 + Math.max(0, Math.sin(this.reloadPulse)) * 0.7;
      this.barrelCore.material.emissiveIntensity = pulse;
    }

    if (this.plasmaUniforms) {
      this.plasmaUniforms.uTime.value = this.time;
      this.plasmaUniforms.uPulse.value = this.recoil * 0.85 + Math.max(0, Math.sin(this.reloadPulse)) * 0.35;
    }
  }

  tryReload() {
    if (this.reloading || this.ammoInClip >= this.clipSize || this.reserveAmmo <= 0) return false;
    this.reloading = true;
    this.reloadTimer = this.reloadTime;
    this.reloadPulse = 0;
    return true;
  }

  tryFire(targets, onHit) {
    if (this.reloading || this.cooldown > 0 || this.ammoInClip <= 0) return false;

    this.ammoInClip -= 1;
    this.cooldown = 1 / this.fireRate;
    this.recoil = 1;

    this.muzzleFlash.intensity = 2.1;
    this.viewMuzzleLight.intensity = 2.4;

    const origin = this.tmpOrigin.copy(this.camera.position);
    const direction = this.camera.getWorldDirection(this.tmpDirection);

    this.spawnTracer(origin, direction);

    this.raycaster.set(origin, direction);
    this.raycaster.far = this.range;

    const hit = this.raycaster.intersectObjects(targets, true)[0];
    if (hit && onHit) {
      onHit(hit, this.damage);
    }

    return true;
  }

  spawnTracer(origin, direction) {
    const entity = this.tracerPoolIds.pop() || this.activeTracerIds.shift();
    if (!entity) return;

    const trace = this.tracerWorld.getComponent(entity, 'trace');
    const renderable = this.tracerWorld.getComponent(entity, 'renderable');

    trace.active = true;
    trace.life = 0.08;
    trace.vel.copy(direction).multiplyScalar(70);
    renderable.mesh.visible = true;
    renderable.mesh.material.opacity = 1;
    renderable.mesh.position.copy(origin).addScaledVector(direction, 0.8);
    this.activeTracerIds.push(entity);
  }

  addAmmo(amount) {
    this.reserveAmmo = Math.min(this.maxAmmo * 3, this.reserveAmmo + amount);
  }

  getHudState() {
    return {
      ammoInClip: this.ammoInClip,
      reserveAmmo: this.reserveAmmo,
      reloading: this.reloading,
      recoil: this.recoil,
      ads: this.adsLerp
    };
  }
}
