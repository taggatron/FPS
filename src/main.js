import { Game } from './core/Game.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

function loadOptionalCityShell() {
	return new Promise((resolve) => {
		const loader = new GLTFLoader();
		loader.load(
			'/city-shell.glb',
			(gltf) => resolve(gltf?.scene ?? null),
			undefined,
			() => resolve(null)
		);
	});
}

async function bootstrap() {
	let bakedLayouts = null;
	const bakedShell = await loadOptionalCityShell();
	try {
		const res = await fetch('/city-layout.baked.json', { cache: 'force-cache' });
		if (res.ok) {
			const data = await res.json();
			bakedLayouts = data?.layouts ?? null;
			window.__RUINFALL_BAKED_LAYOUTS__ = bakedLayouts;
		}
	} catch {
		// Fall back to local cache/procedural generation when bake file is unavailable.
	}

	const mount = document.getElementById('app');
	const game = new Game(mount, { bakedLayouts, bakedShell });
	game.start();
}

bootstrap();