import * as THREE from 'three';

export class FPSController {
  constructor(camera, input) {
    this.camera = camera;
    this.input = input;
    this.enabled = false;

    this.position = new THREE.Vector3(0, 46, 40);
    this.velocity = new THREE.Vector3();
    this.direction = new THREE.Vector3();

    this.pitch = 0;
    this.yaw = 0;
    this.height = 1.7;
    this.crouchHeight = 1.05;
    this.currentHeight = this.height;

    this.walkSpeed = 9;
    this.sprintSpeed = 15;
    this.crouchSpeed = 5.2;
    this.jumpSpeed = 9.8;
    this.gravity = 24;
    this.mouseSensitivity = 0.0018;

    this.grounded = false;
    this.radius = 0.35;
    this.worldBounds = 380;

    this.bob = 0;
  }

  setEnabled(v) {
    this.enabled = v;
  }

  teleport(pos) {
    this.position.copy(pos);
    this.velocity.set(0, 0, 0);
  }

  update(dt, terrainHeightFn) {
    if (!this.enabled) {
      this.applyCamera();
      return;
    }

    const mouse = this.input.consumeMouseDelta();
    this.yaw -= mouse.x * this.mouseSensitivity;
    this.pitch -= mouse.y * this.mouseSensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.45, 1.45);

    const moveForward = (this.input.isDown('KeyW') ? 1 : 0) - (this.input.isDown('KeyS') ? 1 : 0);
    const moveRight = (this.input.isDown('KeyD') ? 1 : 0) - (this.input.isDown('KeyA') ? 1 : 0);

    const isCrouching = this.input.isDown('ControlLeft') || this.input.isDown('KeyC');
    const isSprinting = this.input.isDown('ShiftLeft') && !isCrouching;

    const speed = isCrouching ? this.crouchSpeed : isSprinting ? this.sprintSpeed : this.walkSpeed;

    this.currentHeight = THREE.MathUtils.damp(
      this.currentHeight,
      isCrouching ? this.crouchHeight : this.height,
      16,
      dt
    );

    const forward = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)).normalize();
    const right = new THREE.Vector3(forward.z, 0, -forward.x);

    this.direction.set(0, 0, 0);
    this.direction.addScaledVector(forward, moveForward);
    this.direction.addScaledVector(right, moveRight);

    if (this.direction.lengthSq() > 0) {
      this.direction.normalize();
      this.velocity.x = THREE.MathUtils.damp(this.velocity.x, this.direction.x * speed, 10, dt);
      this.velocity.z = THREE.MathUtils.damp(this.velocity.z, this.direction.z * speed, 10, dt);
      this.bob += dt * speed * 0.9;
    } else {
      this.velocity.x = THREE.MathUtils.damp(this.velocity.x, 0, 12, dt);
      this.velocity.z = THREE.MathUtils.damp(this.velocity.z, 0, 12, dt);
      this.bob += dt * 1.5;
    }

    if (this.grounded && this.input.isDown('Space')) {
      this.velocity.y = this.jumpSpeed;
      this.grounded = false;
    }

    this.velocity.y -= this.gravity * dt;
    this.position.addScaledVector(this.velocity, dt);

    this.position.x = THREE.MathUtils.clamp(this.position.x, -this.worldBounds, this.worldBounds);
    this.position.z = THREE.MathUtils.clamp(this.position.z, -this.worldBounds, this.worldBounds);

    const floor = terrainHeightFn(this.position.x, this.position.z) + this.currentHeight;
    if (this.position.y <= floor) {
      this.position.y = floor;
      this.velocity.y = 0;
      this.grounded = true;
    }

    this.applyCamera();
  }

  applyCamera() {
    this.camera.position.copy(this.position);
    const bobAmount = this.enabled && this.grounded ? Math.sin(this.bob * 1.7) * 0.04 : 0;
    this.camera.position.y += bobAmount;

    this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
  }

  getLookDirection(target = new THREE.Vector3()) {
    return target.set(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
  }
}
