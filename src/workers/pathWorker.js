// Example pathfinding worker: returns straight-line waypoints with cheap obstacle offset hook.
self.onmessage = (event) => {
  const { start, end } = event.data;
  const waypoints = [];
  const segments = 8;

  for (let i = 1; i <= segments; i += 1) {
    const t = i / segments;
    waypoints.push({
      x: start.x + (end.x - start.x) * t,
      z: start.z + (end.z - start.z) * t
    });
  }

  self.postMessage({ type: 'path-result', waypoints });
};
