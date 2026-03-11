// Ordered system scheduler to standardize ECS update sequencing.
export class SystemScheduler {
  constructor() {
    this.systems = [];
  }

  add(name, order, run) {
    this.systems.push({ name, order, run });
    this.systems.sort((a, b) => a.order - b.order);
  }

  update(context) {
    for (let i = 0; i < this.systems.length; i += 1) {
      this.systems[i].run(context);
    }
  }
}
