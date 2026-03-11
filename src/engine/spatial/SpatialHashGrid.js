// Lightweight spatial acceleration structure for broad-phase collision/query pruning.
export class SpatialHashGrid {
  constructor(cellSize = 35) {
    this.cellSize = cellSize;
    this.cells = new Map();
  }

  clear() {
    this.cells.clear();
  }

  cellKey(x, z) {
    const cx = Math.floor(x / this.cellSize);
    const cz = Math.floor(z / this.cellSize);
    return `${cx},${cz}`;
  }

  insert(object, x, z) {
    const key = this.cellKey(x, z);
    let bucket = this.cells.get(key);
    if (!bucket) {
      bucket = [];
      this.cells.set(key, bucket);
    }
    bucket.push(object);
  }

  queryRadius(x, z, radius, out = []) {
    out.length = 0;

    const minX = Math.floor((x - radius) / this.cellSize);
    const maxX = Math.floor((x + radius) / this.cellSize);
    const minZ = Math.floor((z - radius) / this.cellSize);
    const maxZ = Math.floor((z + radius) / this.cellSize);

    for (let cx = minX; cx <= maxX; cx += 1) {
      for (let cz = minZ; cz <= maxZ; cz += 1) {
        const key = `${cx},${cz}`;
        const bucket = this.cells.get(key);
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i += 1) out.push(bucket[i]);
      }
    }

    return out;
  }
}
