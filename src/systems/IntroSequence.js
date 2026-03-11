import * as THREE from 'three';

export class IntroSequence {
  constructor(camera, playerController, cityHeightFn) {
    this.camera = camera;
    this.playerController = playerController;
    this.cityHeightFn = cityHeightFn;

    this.state = 'inactive';
    this.time = 0;

    this.dropStart = new THREE.Vector3(-220, 140, 280);
    this.dropEnd = new THREE.Vector3(0, 44, 38);

    this.captionEl = null;
  }

  setCaptionElement(el) {
    this.captionEl = el;
  }

  start() {
    this.state = 'dropship';
    this.time = 0;
    this.playerController.setEnabled(false);
  }

  update(dt, onComplete) {
    if (this.state === 'inactive') return;

    this.time += dt;

    if (this.state === 'dropship') {
      const t = Math.min(this.time / 8, 1);
      const x = THREE.MathUtils.lerp(-260, 45, t);
      const z = THREE.MathUtils.lerp(340, -100, t);
      const y = 150 + Math.sin(t * Math.PI * 3) * 7;

      this.camera.position.set(x, y, z);
      this.camera.lookAt(20, 40, -40);

      if (this.captionEl) this.captionEl.textContent = 'Approach Vector: Last Light District';

      if (t >= 1) {
        this.state = 'drop';
        this.time = 0;
      }
    } else if (this.state === 'drop') {
      const t = Math.min(this.time / 5.4, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      this.camera.position.lerpVectors(this.dropStart, this.dropEnd, eased);

      const lookX = THREE.MathUtils.lerp(40, 0, eased);
      const lookZ = THREE.MathUtils.lerp(-80, 20, eased);
      const lookY = this.cityHeightFn(lookX, lookZ) + 12;

      this.camera.lookAt(lookX, lookY, lookZ);

      if (this.captionEl) {
        this.captionEl.textContent = t < 0.45 ? 'Drop Bay Open - Contact Below' : 'Brace For Impact';
      }

      if (t >= 1) {
        this.state = 'landed';
        this.time = 0;
        this.playerController.teleport(this.dropEnd.clone());
      }
    } else if (this.state === 'landed') {
      if (this.captionEl) this.captionEl.textContent = 'Landing Complete - Survive And Reach Extraction';
      if (this.time > 1.4) {
        this.state = 'inactive';
        this.playerController.setEnabled(true);
        if (this.captionEl) this.captionEl.textContent = '';
        onComplete?.();
      }
    }
  }

  isActive() {
    return this.state !== 'inactive';
  }
}
