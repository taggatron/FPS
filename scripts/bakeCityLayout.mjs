import fs from 'node:fs/promises';
import path from 'node:path';

function hashString(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function round(value, places = 4) {
  const m = 10 ** places;
  return Math.round(value * m) / m;
}

function generateLayoutData(key, profile) {
  const rng = mulberry32(hashString(key));
  const skyline = [];
  const streetLights = [];

  const targetSkyline = profile.skylineCount;
  for (let i = 0; i < targetSkyline * 2 && skyline.length < targetSkyline; i += 1) {
    const x = (rng() - 0.5) * 760;
    const z = (rng() - 0.5) * 760;
    if (Math.abs(x) < 70 && Math.abs(z) < 70) continue;

    skyline.push({
      x: round(x),
      z: round(z),
      w: round(10 + rng() * 26),
      d: round(10 + rng() * 26),
      h: round(18 + rng() * 110),
      rotY: round(rng() * Math.PI * 2),
      tiltZ: round(rng() < 0.28 ? (rng() - 0.5) * 0.25 : 0),
      dark: rng() < 0.2,
      neon: rng() < 0.15
    });
  }

  const litBudget = Math.min(26, Math.floor(profile.streetLightCount * 0.35));
  let litCount = 0;
  for (let i = 0; i < profile.streetLightCount; i += 1) {
    const alongX = rng() > 0.5;
    const lane = (Math.floor(rng() * 9) - 4) * 80;
    const offset = (rng() - 0.5) * 700;
    const x = alongX ? offset : lane + (rng() > 0.5 ? 10 : -10);
    const z = alongX ? lane + (rng() > 0.5 ? 10 : -10) : offset;
    const hasLight = litCount < litBudget && rng() < 0.72;
    if (hasLight) litCount += 1;

    streetLights.push({
      x: round(x),
      z: round(z),
      hasLight,
      phase: round(rng() * Math.PI * 2),
      base: round(0.55 + rng() * 0.4)
    });
  }

  return { skyline, streetLights };
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

async function main() {
  const version = 4;
  const profiles = getProfiles();
  const layouts = {};

  for (const profile of Object.values(profiles)) {
    const key = `ruinfall-city-layout-v${version}-${JSON.stringify(profile)}`;
    layouts[key] = generateLayoutData(key, profile);
  }

  const out = {
    schema: 1,
    generatedAt: new Date().toISOString(),
    version,
    layouts
  };

  const outPath = path.resolve(process.cwd(), 'public/city-layout.baked.json');
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, `${JSON.stringify(out)}\n`, 'utf8');
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
