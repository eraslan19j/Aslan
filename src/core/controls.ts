import { clamp } from './math';

export interface KeyboardInputState {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  sprint: boolean;
}

export interface TouchStickInput {
  x: number; // -1 (left) .. +1 (right)
  y: number; // -1 (back) .. +1 (forward)
  sprint?: boolean;
}

export interface ControlIntent {
  moveX: number; // -1..1 (right positive)
  moveY: number; // -1..1 (forward positive)
  sprint: boolean;
}

const STICK_DEADZONE = 0.12;

export function applyDeadzone(x: number, y: number, deadzone = STICK_DEADZONE): { x: number; y: number } {
  const mag = Math.hypot(x, y);
  if (mag <= deadzone) return { x: 0, y: 0 };
  const scaled = clamp((mag - deadzone) / (1 - deadzone), 0, 1);
  return {
    x: (x / mag) * scaled,
    y: (y / mag) * scaled,
  };
}

/** Merge keyboard and touch stick into a single normalized control intent. */
export function mergeControlIntent(
  kb: KeyboardInputState,
  touch: TouchStickInput,
): ControlIntent {
  const kbX = (kb.right ? 1 : 0) - (kb.left ? 1 : 0);
  const kbY = (kb.forward ? 1 : 0) - (kb.backward ? 1 : 0);
  const stick = applyDeadzone(touch.x, touch.y);

  let moveX = kbX + stick.x;
  let moveY = kbY + stick.y;

  const mag = Math.hypot(moveX, moveY);
  if (mag > 1) {
    moveX /= mag;
    moveY /= mag;
  }

  return {
    moveX: clamp(moveX, -1, 1),
    moveY: clamp(moveY, -1, 1),
    sprint: kb.sprint || Boolean(touch.sprint),
  };
}
