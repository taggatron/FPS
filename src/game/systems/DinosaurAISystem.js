import * as THREE from 'three';

// ECS system for dinosaur behavior and movement. Keeps logic deterministic and component-driven.
export class DinosaurAISystem {
  constructor(terrainHeightFn, spatial) {
    this.terrainHeightFn = terrainHeightFn;
    this.spatial = spatial;
    this.tmpToPlayer = new THREE.Vector3();
  }

  update(world, dt, playerPos, onDamagePlayer) {
    for (const entity of world.view('dino', 'ai', 'motion', 'combat', 'render', 'animation')) {
      const dino = world.getComponent(entity, 'dino');
      const ai = world.getComponent(entity, 'ai');
      const motion = world.getComponent(entity, 'motion');
      const combat = world.getComponent(entity, 'combat');
      const render = world.getComponent(entity, 'render');
      const anim = world.getComponent(entity, 'animation');

      if (!ai.alive) continue;

      ai.anim += dt * (dino.type.speed * 0.8);
      if (anim.mixer) anim.mixer.update(dt);

      const toPlayer = this.tmpToPlayer.copy(playerPos).sub(render.mesh.position);
      const dist = toPlayer.length();

      if (dist < dino.type.detection) {
        ai.state = dist < 3.5 + dino.type.radius ? 'attack' : 'chase';
      } else if (ai.state !== 'roam') {
        ai.state = 'roam';
        ai.target.set(
          render.mesh.position.x + (Math.random() - 0.5) * 40,
          render.mesh.position.y,
          render.mesh.position.z + (Math.random() - 0.5) * 40
        );
      }

      if (ai.state === 'roam') {
        motion.desired.copy(ai.target).sub(render.mesh.position);
        if (motion.desired.length() < 2) {
          ai.target.set(
            render.mesh.position.x + (Math.random() - 0.5) * 45,
            render.mesh.position.y,
            render.mesh.position.z + (Math.random() - 0.5) * 45
          );
          motion.desired.copy(ai.target).sub(render.mesh.position);
        }
      } else {
        motion.desired.copy(toPlayer);
      }

      motion.desired.y = 0;
      if (motion.desired.lengthSq() > 0.01) motion.desired.normalize();

      const stateSpeed = ai.state === 'chase' || ai.state === 'attack' ? dino.type.speed : dino.type.speed * 0.45;
      motion.velocity.lerp(motion.desired.multiplyScalar(stateSpeed), dt * 3.5);

      if (ai.state === 'chase' && dino.typeName === 'mauler' && dist < 14 && Math.random() < 0.02) {
        motion.velocity.multiplyScalar(2);
      }

      render.mesh.position.addScaledVector(motion.velocity, dt);
      const floor = this.terrainHeightFn(render.mesh.position.x, render.mesh.position.z) + 1.2;
      render.mesh.position.y = floor;

      if (motion.velocity.lengthSq() > 0.001) {
        const desiredRot = Math.atan2(motion.velocity.x, motion.velocity.z);
        render.mesh.rotation.y = THREE.MathUtils.damp(render.mesh.rotation.y, desiredRot, 12, dt);
      }

      const step = Math.sin(ai.anim * 4) * 0.35;
      if (anim.legs.length >= 2) {
        anim.legs[0].rotation.x = step;
        anim.legs[1].rotation.x = -step;
      }

      if (ai.attackCd > 0) ai.attackCd -= dt;
      if (ai.state === 'attack' && ai.attackCd <= 0) {
        combat.damagePos.copy(render.mesh.position);
        onDamagePlayer(dino.type.damage, combat.damagePos, dino.typeName);
        ai.attackCd = dino.typeName === 'raptor' ? 0.9 : dino.typeName === 'mauler' ? 1.2 : 1.7;
      }

      this.spatial.insert({ entity, mesh: render.mesh, typeName: dino.typeName, type: dino.type }, render.mesh.position.x, render.mesh.position.z);
    }
  }
}
