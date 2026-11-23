import { guessDevice, type Device } from '../../systems/inputMode';

/**
 * Remembers which device the player used last, for the Auto controls setting: a touch switches
 * to twin-stick controls, a key press or a real mouse switches back. Installed once per page.
 * Pointer events are used (not mouse events) because phones also fire fake mouse events after a tap.
 */
let last: Device = 'keyboard';
let forced = false;
let installed = false;

export function installDeviceTracker(): void {
  if (installed) return;
  installed = true;
  forced = new URLSearchParams(window.location.search).has('touch');
  last = guessDevice({
    coarsePointer: window.matchMedia?.('(pointer: coarse)').matches ?? false,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    forceTouch: forced,
  });
  if (forced) return; // ?touch: stay in touch mode even when testing with a mouse
  const opts = { capture: true, passive: true } as const;
  window.addEventListener(
    'pointerdown',
    (e) => (last = e.pointerType === 'touch' ? 'touch' : 'keyboard'),
    opts,
  );
  window.addEventListener('pointermove', (e) => e.pointerType === 'mouse' && (last = 'keyboard'), opts);
  window.addEventListener('keydown', () => (last = 'keyboard'), opts);
}

export function lastDevice(): Device {
  return last;
}
