// Fonts are bundled (not fetched from a CDN) so the game also works offline.
import '@fontsource/cinzel/latin-400.css';
import '@fontsource/cinzel/latin-600.css';
import '@fontsource/cinzel/latin-700.css';
import '@fontsource/eb-garamond/latin-400.css';
import '@fontsource/eb-garamond/latin-400-italic.css';
import '@fontsource/eb-garamond/latin-600.css';
import './style.css';
import { Game } from './game/game';
import { initUpdates } from './updates';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const overlay = document.getElementById('overlay') as HTMLElement;
const game = new Game(canvas, overlay);
game.boot();

// Exposed for debugging and automated smoke tests.
(window as unknown as { __game: Game }).__game = game;

const native = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();

// Android app: the system back button closes menus / pauses instead of quitting.
if (native) {
  void import('@capacitor/app').then(({ App }) => {
    void App.addListener('backButton', () => {
      if (!game.handleBack()) void App.minimizeApp();
    });
  });
}

// Update checks, and offline support for the installable web version.
initUpdates();
