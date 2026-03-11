// Example AI worker: computes coarse threat analysis and recommended behavior level.
self.onmessage = (event) => {
  const { enemies = [], player } = event.data;
  let nearest = Number.POSITIVE_INFINITY;

  for (let i = 0; i < enemies.length; i += 1) {
    const e = enemies[i];
    const dx = e.x - player.x;
    const dz = e.z - player.z;
    const d = Math.hypot(dx, dz);
    if (d < nearest) nearest = d;
  }

  const threatLevel = nearest < 12 ? 'critical' : nearest < 24 ? 'high' : 'elevated';
  self.postMessage({
    type: 'ai-snapshot',
    nearestDistance: Number.isFinite(nearest) ? nearest : 999,
    threatLevel
  });
};
