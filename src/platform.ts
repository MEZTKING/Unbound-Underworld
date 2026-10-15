// What kind of app the game is running in, and how to close it.

/** The packaged desktop app (Electron). */
export const IS_DESKTOP = typeof navigator !== 'undefined' && navigator.userAgent.includes('Electron');

/** The Android app (Capacitor). */
export const IS_NATIVE = !!(globalThis as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();

/** Apps can close themselves; a browser tab can't. */
export const CAN_EXIT = IS_DESKTOP || IS_NATIVE;

export function exitGame(): void {
  if (IS_NATIVE) void import('@capacitor/app').then(({ App }) => App.exitApp());
  else window.close();
}
