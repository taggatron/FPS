import fs from 'node:fs/promises';
import path from 'node:path';

function noise(x, z) {
  return Math.sin(x * 0.09) * 1.6 + Math.cos(z * 0.07) * 1.2 + Math.sin((x + z) * 0.04) * 2.3;
}

function getTerrainHeight(x, z) {
  return noise(x, z) * 0.28;
}

function makeKey(version, profile) {
  return `ruinfall-city-layout-v${version}-${JSON.stringify(profile)}`;
}

function getProfiles() {
  return {
    high: {
      skylineCount: 220,
      propCount: 420,
      streetLightCount: 120,
      smokeCount: 52,
      dustCount: 980,
      pickupCount: 26,
      fireChance: 0.11,
      dynamicLightDistance: 150,
      dynamicLightCap: 28
    },
    performance: {
      skylineCount: 120,
      propCount: 170,
      streetLightCount: 48,
      smokeCount: 18,
      dustCount: 280,
      pickupCount: 18,
      fireChance: 0.045,
      dynamicLightDistance: 95,
      dynamicLightCap: 12
    },
    balanced: {
      skylineCount: 180,
      propCount: 280,
      streetLightCount: 85,
      smokeCount: 36,
      dustCount: 680,
      pickupCount: 24,
      fireChance: 0.08,
      dynamicLightDistance: 125,
      dynamicLightCap: 20
    }
  };
}

class ObjBuilder {
  constructor() {
    this.lines = ['# Ruinfall city shell export'];
    this.vertexCount = 0;
  }

  addBox({ x, y, z, sx, sy, sz, yaw = 0, name = 'box' }) {
    const hx = sx * 0.5;
    const hy = sy * 0.5;
    const hz = sz * 0.5;

    const local = [
      [-hx, -hy, -hz],
      [hx, -hy, -hz],
      [hx, hy, -hz],
      [-hx, hy, -hz],
      [-hx, -hy, hz],
      [hx, -hy, hz],
      [hx, hy, hz],
      [-hx, hy, hz]
    ];

    const cy = Math.cos(yaw);
    const syaw = Math.sin(yaw);

    const verts = local.map(([lx, ly, lz]) => {
      const rx = lx * cy - lz * syaw;
      const rz = lx * syaw + lz * cy;
      return [x + rx, y + ly, z + rz];
    });

    this.lines.push(`o ${name}`);
    for (const [vx, vy, vz] of verts) {
      this.lines.push(`v ${vx.toFixed(4)} ${vy.toFixed(4)} ${vz.toFixed(4)}`);
    }

    const i = this.vertexCount + 1;
    const faces = [
      [i + 0, i + 1, i + 2],
      [i + 0, i + 2, i + 3],
      [i + 4, i + 7, i + 6],
      [i + 4, i + 6, i + 5],
      [i + 0, i + 4, i + 5],
      [i + 0, i + 5, i + 1],
      [i + 1, i + 5, i + 6],
      [i + 1, i + 6, i + 2],
      [i + 2, i + 6, i + 7],
      [i + 2, i + 7, i + 3],
      [i + 3, i + 7, i + 4],
      [i + 3, i + 4, i + 0]
    ];

    for (const f of faces) {
      this.lines.push(`f ${f[0]} ${f[1]} ${f[2]}`);
    }

    this.vertexCount += 8;
  }

  toString() {
    return `${this.lines.join('\n')}\n`;
  }
}

function addRoadGrid(builder) {
  for (let i = -4; i <= 4; i += 1) {
    const z = i * 80;
    builder.addBox({
      x: 0,
      y: getTerrainHeight(0, z) + 0.05,
      z,
      sx: 700,
      sy: 0.2,
      sz: 16,
      name: `road_x_${i}`
    });

    const x = i * 80;
    builder.addBox({
      x,
      y: getTerrainHeight(x, 0) + 0.05,
      z: 0,
      sx: 16,
      sy: 0.2,
      sz: 700,
      name: `road_z_${i}`
    });
  }

  builder.addBox({ x: 120, y: 18, z: -120, sx: 240, sy: 8, sz: 24, yaw: -0.12, name: 'highway_broken' });
  builder.addBox({ x: 210, y: 4, z: -90, sx: 140, sy: 7, sz: 24, yaw: 0.45, name: 'highway_collapsed' });
}

function addSkyline(builder, layout) {
  for (let i = 0; i < layout.skyline.length; i += 1) {
    const b = layout.skyline[i];
    const base = getTerrainHeight(b.x, b.z);
    builder.addBox({
      x: b.x,
      y: base + b.h * 0.5,
      z: b.z,
      sx: b.w,
      sy: b.h,
      sz: b.d,
      yaw: b.rotY,
      name: `building_${i}`
    });
  }
}

function addStreetlights(builder, layout) {
  for (let i = 0; i < layout.streetLights.length; i += 1) {
    const s = layout.streetLights[i];
    const y = getTerrainHeight(s.x, s.z);
    builder.addBox({ x: s.x, y: y + 4.2, z: s.z, sx: 0.22, sy: 8.5, sz: 0.22, name: `pole_${i}` });
    builder.addBox({ x: s.x, y: y + 8.2, z: s.z, sx: 0.55, sy: 0.22, sz: 0.35, name: `lamp_${i}` });
  }
}

async function main() {
  const root = process.cwd();
  const inPath = path.resolve(root, 'public/city-layout.baked.json');
  const raw = await fs.readFile(inPath, 'utf8');
  const baked = JSON.parse(raw);

  const version = baked.version ?? 4;
  const layouts = baked.layouts ?? {};
  const profiles = getProfiles();

  const outDir = path.resolve(root, 'tools/city-shell');
  await fs.mkdir(outDir, { recursive: true });

  for (const [preset, profile] of Object.entries(profiles)) {
    const key = makeKey(version, profile);
    const layout = layouts[key];
    if (!layout) {
      console.warn(`Skipping ${preset}: missing layout for key ${key}`);
      continue;
    }

    const builder = new ObjBuilder();
    addRoadGrid(builder);
    addSkyline(builder, layout);
    addStreetlights(builder, layout);

    const outObj = path.resolve(outDir, `city-shell-${preset}.obj`);
    await fs.writeFile(outObj, builder.toString(), 'utf8');
    console.log(`Wrote ${outObj}`);
  }

  console.log('Done. Import OBJ into Blender and export as public/city-shell.glb for runtime use.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
