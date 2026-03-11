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
