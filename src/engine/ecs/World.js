// Minimal ECS core for scalable game logic growth.
export class ECSWorld {
  constructor() {
    this.nextEntity = 1;
    this.components = new Map();
  }

  createEntity() {
    const id = this.nextEntity;
    this.nextEntity += 1;
    return id;
  }

  addComponent(entity, name, value) {
    let store = this.components.get(name);
    if (!store) {
      store = new Map();
      this.components.set(name, store);
    }
    store.set(entity, value);
  }

  getComponent(entity, name) {
    return this.components.get(name)?.get(entity);
  }

  removeComponent(entity, name) {
    this.components.get(name)?.delete(entity);
  }

  removeEntity(entity) {
    for (const store of this.components.values()) {
      store.delete(entity);
    }
  }

  clear() {
    this.components.clear();
    this.nextEntity = 1;
  }

  *view(...names) {
    if (!names.length) return;
    const base = this.components.get(names[0]);
    if (!base) return;

    for (const entity of base.keys()) {
      let valid = true;
      for (let i = 1; i < names.length; i += 1) {
        if (!this.components.get(names[i])?.has(entity)) {
          valid = false;
          break;
        }
      }
      if (valid) yield entity;
    }
  }
}
