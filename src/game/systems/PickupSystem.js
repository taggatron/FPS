// ECS pickup system handles bob animation and player collection checks.
export class PickupSystem {
  constructor(world, player, onCollect) {
    this.world = world;
    this.player = player;
    this.onCollect = onCollect;
  }

  update(dt) {
    for (const entity of this.world.view('pickup', 'transform', 'renderable', 'lifecycle')) {
      const pickup = this.world.getComponent(entity, 'pickup');
      const transform = this.world.getComponent(entity, 'transform');
      const renderable = this.world.getComponent(entity, 'renderable');
      const lifecycle = this.world.getComponent(entity, 'lifecycle');

      if (!lifecycle.active) continue;

      transform.phase += dt * 2.2;
      renderable.mesh.position.y = transform.baseY + Math.sin(transform.phase) * 0.12;
      renderable.mesh.rotation.y += dt;

      if (renderable.mesh.position.distanceTo(this.player.position) < 1.4) {
        lifecycle.active = false;
        renderable.mesh.visible = false;
        this.onCollect(pickup);
      }
    }
  }
}
