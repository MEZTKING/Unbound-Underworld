import './style.css';
import { Game } from './game/game';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const overlay = document.getElementById('overlay') as HTMLElement;
const game = new Game(canvas, overlay);
game.boot();

// Exposed for debugging and automated smoke tests.
(window as unknown as { __game: Game }).__game = game;
