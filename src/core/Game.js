import * as THREE from 'three';
import { Input } from './Input.js';
import { FPSController } from '../player/FPSController.js';
import { WeaponSystem } from '../player/WeaponSystem.js';
import { CityBuilder } from '../world/CityBuilder.js';
import { DinosaurManager } from '../enemies/DinosaurManager.js';
import { IntroSequence } from '../systems/IntroSequence.js';
import { HUD } from '../systems/HUD.js';
import { GameState, GamePhase } from '../systems/GameState.js';
import { Soundscape } from './Soundscape.js';

export class Game {
  constructor(mountNode) {
    this.mountNode = mountNode;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0f171e);
    this.scene.fog = new THREE.FogExp2(0x27353f, 0.0038);

    this.camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.1, 1400);
    this.scene.add(this.camera);
    this.defaultFov = 78;
    this.adsFov = 58;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.mountNode.appendChild(this.renderer.domElement);

    this.clock = new THREE.Clock();
    this.input = new Input();
    this.player = new FPSController(this.camera, this.input);

    this.city = new CityBuilder(this.scene);
    this.city.build();

    this.weapon = new WeaponSystem(this.camera, this.scene);
    this.dinosaurs = new DinosaurManager(this.scene, (x, z) => this.city.getTerrainHeight(x, z));
    this.state = new GameState();
    this.hud = new HUD(this.mountNode);
    this.sound = new Soundscape();

    this.hud.setStartEnabled(false);
    this.hud.setAssetStatus('Streaming apex signatures 0%');

    this.dinosaurs.onLoadingStatus(({ state, progress }) => {
      if (state === 'loading') {
        this.hud.setAssetStatus(`Streaming apex signatures ${Math.floor(progress)}%`);
        this.hud.setStartEnabled(false);
        return;
      }

      if (state === 'ready') {
        this.hud.setAssetStatus('Apex bioprofiles synced');
        this.hud.setStartEnabled(true);
        return;
      }

      this.hud.setAssetStatus('Apex fallback mesh online');
      this.hud.setStartEnabled(true);
    });

    if (this.dinosaurs.isApexModelReady()) {
      this.hud.setAssetStatus('Apex bioprofiles synced');
      this.hud.setStartEnabled(true);
    }

    this.intro = new IntroSequence(this.camera, this.player, (x, z) => this.city.getTerrainHeight(x, z));
    this.intro.setCaptionElement(this.hud.introCaption);

    this.extractionPoint = new THREE.Vector3(184, this.city.getTerrainHeight(184, -172) + 0.4, -172);
    this.extractionRadius = 16;

    this.beacon = this.createBeacon();
    this.scene.add(this.beacon);

    this.roarTimer = 0;
    this.invincibleMode = true;

    this.setupLights();
    this.bindUI();
    this.bindEvents();

    this.resetWorld();
  }

  setupLights() {
    const hemi = new THREE.HemisphereLight(0x89b8ff, 0x0a0d11, 0.55);
    this.scene.add(hemi);

    const moon = new THREE.DirectionalLight(0xc8dcff, 0.8);
    moon.position.set(120, 180, 80);
    moon.castShadow = true;
    moon.shadow.camera.left = -260;
    moon.shadow.camera.right = 260;
    moon.shadow.camera.top = 260;
    moon.shadow.camera.bottom = -260;
    moon.shadow.mapSize.set(2048, 2048);
    this.scene.add(moon);

    const redPulse = new THREE.PointLight(0xff4a3b, 1.4, 120);
    redPulse.position.set(-80, 20, 25);
    this.scene.add(redPulse);

    const cyanPulse = new THREE.PointLight(0x3ed0f0, 1.2, 90);
    cyanPulse.position.set(160, 16, -130);
    this.scene.add(cyanPulse);
  }

  createBeacon() {
    const g = new THREE.Group();

    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1.2, 6, 10),
      new THREE.MeshStandardMaterial({ color: 0x5fd5ff, emissive: 0x205577, emissiveIntensity: 0.8 })
    );
    core.position.y = 3;
    core.castShadow = true;
    g.add(core);

    const halo = new THREE.PointLight(0x5fd5ff, 1.8, 30);
    halo.position.y = 7;
    g.add(halo);

    g.position.copy(this.extractionPoint);
    return g;
  }

  bindUI() {
    this.hud.onStart(() => {
      this.sound.ensureContext();
      this.startRun();
    });

    this.hud.onRestart(() => {
      this.sound.ensureContext();
      this.resetWorld();
      this.state.phase = GamePhase.MENU;
      this.hud.setMenuVisible(true);
      this.hud.setPauseVisible(false);
      this.hud.setFailVisible(false);
      this.hud.setWinVisible(false);
      this.hud.setHudVisible(false);
      document.exitPointerLock?.();
    });
  }

  bindEvents() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        if (this.state.phase === GamePhase.PLAYING) {
          this.state.phase = GamePhase.PAUSED;
          this.player.setEnabled(false);
          this.hud.setPauseVisible(true);
          document.exitPointerLock?.();
        } else if (this.state.phase === GamePhase.PAUSED) {
          this.resume();
        }
      }

      if (e.code === 'KeyR' && this.state.phase === GamePhase.PLAYING) {
        const ok = this.weapon.tryReload();
        if (ok) this.sound.reload();
      }
    });

    this.renderer.domElement.addEventListener('click', () => {
      if (this.state.phase === GamePhase.PLAYING && document.pointerLockElement !== this.renderer.domElement) {
        this.renderer.domElement.requestPointerLock();
      }
      if (this.state.phase === GamePhase.PAUSED) {
        this.resume();
      }
    });

    this.renderer.domElement.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.renderer.domElement;
      if (this.state.phase === GamePhase.PLAYING) {
        this.player.setEnabled(locked && !this.intro.isActive());
      }
    });
  }

  startRun() {
    if (!this.dinosaurs.isApexModelReady()) {
      this.hud.setAssetStatus('Waiting for apex asset stream...');
      return;
    }

    this.resetWorld();
    this.hud.setMenuVisible(false);
    this.hud.setPauseVisible(false);
    this.hud.setFailVisible(false);
    this.hud.setWinVisible(false);
    this.hud.setHudVisible(true);

    this.state.phase = GamePhase.INTRO;
    this.state.updateObjective();

    this.intro.start();
    this.renderer.domElement.requestPointerLock();
  }

  resume() {
    if (this.state.phase !== GamePhase.PAUSED) return;
    this.state.phase = GamePhase.PLAYING;
    this.hud.setPauseVisible(false);
    this.renderer.domElement.requestPointerLock();
    this.player.setEnabled(true);
  }

  resetWorld() {
    this.state.reset();

    for (const e of this.dinosaurs.enemies) {
      this.scene.remove(e.mesh);
    }
    this.dinosaurs.enemies.length = 0;
    this.dinosaurs.spawnInitial();

    for (const p of this.city.pickups) {
      p.active = true;
      p.mesh.visible = true;
    }

    this.player.teleport(new THREE.Vector3(0, 46, 40));
  }

  processShooting() {
    if (this.input.isMouseDown(0)) {
      const fired = this.weapon.tryFire(this.dinosaurs.getHitTargets(), (hit, damage) => {
        const result = this.dinosaurs.applyHit(hit, damage);
        if (result?.killed) {
          this.state.addKill(result.score, result.type);
          this.sound.roar(result.type === 'apex' ? 'large' : result.type === 'mauler' ? 'medium' : 'small');
        }
      });

      if (fired) this.sound.shot();
    }
  }

  processPickups() {
    for (const p of this.city.pickups) {
      if (!p.active) continue;
      if (p.mesh.position.distanceTo(this.player.position) < 1.4) {
        p.active = false;
        p.mesh.visible = false;

        if (p.type === 'health') this.state.heal(p.amount);
        else this.weapon.addAmmo(p.amount);
      }
    }
  }

  processObjectives(dt) {
    const distToExtract = this.player.position.distanceTo(this.extractionPoint);

    if (this.state.apexKills >= 2) {
      if (distToExtract <= this.extractionRadius) {
        this.state.extractionTimer -= dt;
      }

      if (this.state.extractionTimer <= 0) {
        this.state.phase = GamePhase.WON;
        this.hud.setWinVisible(true);
        this.player.setEnabled(false);
        document.exitPointerLock?.();
      }
    }

    this.state.updateObjective();
  }

  handlePlayerDamage(amount, enemyPos, typeName) {
    if (this.state.phase !== GamePhase.PLAYING) return;

    if (this.invincibleMode) {
      this.hud.pulseHit();
      return;
    }

    const toEnemy = enemyPos.clone().sub(this.player.position).normalize();
    const knock = Math.max(0.5, amount * 0.02);
    this.player.velocity.addScaledVector(toEnemy, -knock);

    this.state.applyDamage(amount);
    this.hud.pulseHit();
    this.sound.damage();

    if (Math.random() < 0.45) this.sound.roar(typeName === 'apex' ? 'large' : typeName === 'mauler' ? 'medium' : 'small');

    if (this.state.health <= 0) {
      this.state.phase = GamePhase.LOST;
      this.hud.setFailVisible(true);
      this.player.setEnabled(false);
      document.exitPointerLock?.();
    }
  }

  updateAtmosphere(dt) {
    this.roarTimer -= dt;
    if (this.roarTimer <= 0) {
      this.roarTimer = 6 + Math.random() * 8;
      this.sound.roar(Math.random() > 0.75 ? 'large' : 'medium');
    }

    this.beacon.rotation.y += dt;
    const pulse = (Math.sin(performance.now() * 0.004) + 1) * 0.5;
    this.beacon.children[1].intensity = 1.2 + pulse * 1.8;
  }

  updateHud() {
    const weaponHud = this.weapon.getHudState();
    const headingDegrees = ((THREE.MathUtils.radToDeg(this.player.yaw) % 360) + 360) % 360;
    this.hud.update({
      health: this.state.health,
      ammoInClip: weaponHud.ammoInClip,
      reserveAmmo: weaponHud.reserveAmmo,
      maxClipAmmo: this.weapon.clipSize,
      reloading: weaponHud.reloading,
      threats: this.dinosaurs.aliveCount(),
      score: this.state.score,
      heading: Math.round(headingDegrees),
      extractionDistance: this.player.position.distanceTo(this.extractionPoint),
      objective: this.state.objective
    });
    this.hud.drawMinimap(this.player.position, this.dinosaurs.enemies);
  }

  update(dt) {
    this.city.update(dt);
    const isAiming = this.state.phase === GamePhase.PLAYING && this.input.isMouseDown(2);
    this.weapon.update(dt, this.player.velocity, isAiming);
    const weaponHud = this.weapon.getHudState();
    const targetFov = THREE.MathUtils.lerp(this.defaultFov, this.adsFov, weaponHud.ads ?? 0);
    this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 14, dt);
    this.camera.updateProjectionMatrix();

    if (this.state.phase === GamePhase.INTRO) {
      this.intro.update(dt, () => {
        this.state.phase = GamePhase.PLAYING;
      });
      this.dinosaurs.update(dt, this.player.position, (dmg, enemyPos, typeName) => this.handlePlayerDamage(dmg, enemyPos, typeName));
    }

    if (this.state.phase === GamePhase.PLAYING) {
      this.player.update(dt, (x, z) => this.city.getTerrainHeight(x, z));
      this.processShooting();
      this.processPickups();
      this.dinosaurs.update(dt, this.player.position, (dmg, enemyPos, typeName) => this.handlePlayerDamage(dmg, enemyPos, typeName));
      this.processObjectives(dt);
      this.updateAtmosphere(dt);
    }

    if (this.state.phase === GamePhase.PAUSED || this.state.phase === GamePhase.WON || this.state.phase === GamePhase.LOST) {
      this.player.applyCamera();
    }

    this.updateHud();
  }

  loop = () => {
    const dt = Math.min(this.clock.getDelta(), 0.033);
    this.update(dt);
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this.loop);
  };

  start() {
    this.loop();
  }
}
