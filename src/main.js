import { Game } from './core/Game.js';

async function bootstrap() {
	let bakedLayouts = null;
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
	const game = new Game(mount, { bakedLayouts });
	game.start();
}

bootstrap();