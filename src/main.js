import { Game } from './core/Game.js';

const mount = document.getElementById('app');
const game = new Game(mount);
game.start();