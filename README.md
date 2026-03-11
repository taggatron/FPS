# Ruinfall: Dino Siege

A browser-based first-person shooter prototype built with Three.js. You deploy from a dropship into a ruined post-apocalyptic city overrun by dinosaurs.

## Features

- Dramatic dropship intro and controlled city drop
- First-person movement: WASD, mouse look, jump, sprint, crouch
- Shooting system with ammo, reload, recoil, muzzle flash, and hit detection
- HUD with crosshair, objective tracking, health, ammo, threat count, score, and minimap
- Dinosaur enemy archetypes with basic AI states: roam, detect, chase, attack
- Objective loop: kill apex threats, then hold extraction beacon to win
- Health/ammo pickups and fail/restart flow
- Atmospheric world: ruined skyline, fog, fires, smoke-like ambience, neon remnants, rubble, overgrowth
- Elite performance layer: fixed-step simulation, adaptive resolution scaling, instancing, geometry batching, worker offload, and diagnostics overlay

## Tech Stack

- Three.js (rendering, camera, scene, lighting)
- Vite (local dev/build tooling)
- Modern ES modules and modular game architecture

## Project Structure

- index.html
- package.json
- vite.config.js
- src/main.js
- src/styles.css
- src/core/Game.js
- src/core/Input.js
- src/core/Soundscape.js
- src/player/FPSController.js
- src/player/WeaponSystem.js
- src/enemies/DinosaurManager.js
- src/world/CityBuilder.js
- src/systems/IntroSequence.js
- src/systems/HUD.js
- src/systems/GameState.js
- src/assets/README.md

## Engine and Game Architecture

Performance-oriented architecture is now split under src:

- src/engine/physics/FixedStepLoop.js
: fixed 60 Hz simulation scheduler with frame-clamp safeguards
- src/engine/diagnostics/DebugOverlay.js
: lightweight runtime diagnostics (FPS, ms, draw calls, triangles, memory)
- src/engine/spatial/SpatialHashGrid.js
: broad-phase acceleration structure for enemy query pruning
- src/engine/assets/AssetManager.js
: lazy model loading, region preload/unload hooks, and KTX2 pipeline support
- src/engine/ecs/World.js
: minimal ECS foundation for scalable entity/system growth
- src/engine/workers/WorkerBridge.js
: worker message bridge for AI/path offload
- src/workers/aiWorker.js
: AI snapshot worker example
- src/workers/pathWorker.js
: pathfinding worker example
- src/game/entities
: game-entity module area
- src/game/systems
: game-system module area
- src/game/levels
: level and region descriptors

## Implemented Performance Optimisations

1. Rendering Optimisation

- Repeated props are rendered via InstancedMesh in city generation.
- Road and highway chunks are merged using BufferGeometryUtils.mergeGeometries.
- Frustum culling is enforced on instanced and dynamic model content.
- LOD is applied to apex dinosaur visuals and distant giant silhouettes.
- Static node count and draw calls are reduced through batching and flattening.

1. Game Loop Optimisation

- Update and render are separated.
- Fixed timestep simulation runs at 60 Hz.
- Frame-rate dependent simulation drift is removed by stepping simulation in fixed slices.

1. Memory Optimisation

- Hot loops reuse vectors and temporary arrays.
- Bullet/tracer visuals use object pooling (no per-shot geometry/material allocation).
- City rebuild lifecycle includes controlled cleanup and disposal for generated resources.

1. Parallel Processing

- AI and pathfinding workers are implemented and integrated via WorkerBridge.
- Main thread posts periodic enemy/player snapshots to worker infrastructure.

1. Scene Graph Optimisation

- Repeated decorative geometry is flattened with instancing.
- Static road/highway meshes are batched.
- Scene hierarchy is reduced where possible to lower traversal overhead.

1. Spatial Acceleration Structures

- Enemy broad-phase queries use SpatialHashGrid.
- Shooting raycast candidate sets are spatially pruned instead of scanning all enemies.

1. Asset Loading Improvements

- Apex model uses lazy loading through AssetManager.
- Region preload/unload APIs are available for level-streaming expansion.
- Start menu load gating prevents entering combat before critical model readiness.

1. Texture Optimisation Pipeline

- KTX2Loader support is wired in AssetManager.
- Runtime still supports standard textures as fallback while enabling compressed texture rollout.

1. Code Architecture

- Added engine, game, and assets directory layout for scalable growth.
- ECS foundation is present to migrate gameplay logic incrementally.

1. Performance Diagnostics

- In-game debug overlay is enabled in development runtime.
- Tracks FPS, frame time, draw calls, triangle count, and heap memory (when available).

1. Web Worker Infrastructure

- Implemented:
: src/workers/aiWorker.js
: src/workers/pathWorker.js

1. Optimisation Documentation

- Performance-critical classes include comments describing why each optimisation exists.

## Biggest Current Bottlenecks

- Large single JS bundle: main runtime remains in one large chunk, affecting startup parse/compile time.
- Heavy model payload: apex glTF + textures are sizable and dominate first-load bandwidth.
- Dynamic lights and shadows: many light sources and shadow maps can saturate fill and GPU time.
- Frequent animation and AI updates: enemy updates still scale linearly with active enemy count.
- Particle/fog effects: atmospheric visuals increase overdraw on low-end GPUs.

## Additional Improvements If Scene Exceeds 10k Objects

1. Move all decorative static assets to region-based streaming chunks and unload aggressively by distance.
2. Adopt GPU frustum/occlusion culling for large instanced sets (CPU culling is no longer enough at scale).
3. Use hierarchical spatial indices (coarse grid + subcell BVH) for collision and ray queries.
4. Reduce per-light cost by baking lighting into probes or lightmaps for static geometry.
5. Convert enemy update logic to worker-driven jobs with deterministic command buffers.
6. Migrate gameplay runtime fully onto ECS with archetype iteration to reduce update overhead.
7. Add texture atlas and strict material sharing to minimize material switches and draw state changes.
8. Use meshlet/cluster LOD or impostors for far geometry.
9. Introduce manual chunk splitting and dynamic imports to reduce initial payload.
10. Add automated frame budget telemetry and quality auto-tuning policies per hardware tier.

## Run Locally

1. Install dependencies:

   npm install

2. Start development server:

   npm run dev

3. Open the URL shown in terminal (usually <http://localhost:5173>)

## Build

- Production build: npm run build
- Preview build: npm run preview

## Control Summary

- Move: WASD
- Aim: Mouse
- Fire: Left click
- Reload: R
- Jump: Space
- Sprint: Shift
- Crouch: Left Ctrl or C
- Pause: Esc

## Expansion Notes

The codebase is intentionally modular so you can add:

- GLTF dinosaur/weapon models and animation mixers
- Additional weapons and enemy variants
- More objective types and mission scripting
- Physics engine integration for richer collision and ragdoll behavior
- Streaming world chunks for larger maps
