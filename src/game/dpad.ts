export type DPadDirection =
  | 'NEUTRAL'
  | 'UP'
  | 'UP_RIGHT'
  | 'RIGHT'
  | 'DOWN_RIGHT'
  | 'DOWN'
  | 'DOWN_LEFT'
  | 'LEFT'
  | 'UP_LEFT';

export interface DPadAxes {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
}

export interface DPadVectorResult {
  direction: DPadDirection;
  axes: DPadAxes;
  angleDeg: number | null;
  normalizedDistance: number;
  inDeadZone: boolean;
  /** Visual thumb indicator offset clamped within the D-Pad ring (-1..1) */
  normX: number;
  normY: number;
}

/**
 * Default central dead zone ratio (18% of D-Pad radius) to prevent accidental inputs
 * when resting the thumb near the center.
 */
export const DPAD_DEFAULT_DEADZONE_RATIO = 0.18;

/**
 * Minimum pixel dead zone so tiny viewports still have a reliable neutral center.
 */
export const DPAD_MIN_DEADZONE_PX = 11;

/**
 * Ordered list of the 8 digital sectors starting at RIGHT (0°) and proceeding clockwise
 * in 45° increments ([-22.5°, +22.5°) = RIGHT, [22.5°, 67.5°) = DOWN_RIGHT, etc.).
 */
export const DPAD_SECTORS_CLOCKWISE: readonly {
  direction: Exclude<DPadDirection, 'NEUTRAL'>;
  centerAngleDeg: number;
  labelIt: string;
  shortLabel: string;
}[] = [
  { direction: 'RIGHT', centerAngleDeg: 0, labelIt: 'Destra', shortLabel: 'E' },
  { direction: 'DOWN_RIGHT', centerAngleDeg: 45, labelIt: 'Giù-Destra', shortLabel: 'SE' },
  { direction: 'DOWN', centerAngleDeg: 90, labelIt: 'Giù', shortLabel: 'S' },
  { direction: 'DOWN_LEFT', centerAngleDeg: 135, labelIt: 'Giù-Sinistra', shortLabel: 'SW' },
  { direction: 'LEFT', centerAngleDeg: 180, labelIt: 'Sinistra', shortLabel: 'W' },
  { direction: 'UP_LEFT', centerAngleDeg: -135, labelIt: 'Su-Sinistra', shortLabel: 'NW' },
  { direction: 'UP', centerAngleDeg: -90, labelIt: 'Su', shortLabel: 'N' },
  { direction: 'UP_RIGHT', centerAngleDeg: -45, labelIt: 'Su-Destra', shortLabel: 'NE' },
];

/**
 * Maps a discrete DPadDirection to digital orthogonal axes.
 * Guarantees that opposite directions (left+right or up+down) are NEVER active simultaneously,
 * and diagonal directions activate full digital horizontal movement without scaling speed up or down.
 */
export function dpadDirectionToAxes(direction: DPadDirection): DPadAxes {
  switch (direction) {
    case 'LEFT':
      return { left: true, right: false, up: false, down: false };
    case 'RIGHT':
      return { left: false, right: true, up: false, down: false };
    case 'UP':
      return { left: false, right: false, up: true, down: false };
    case 'DOWN':
      return { left: false, right: false, up: false, down: true };
    case 'UP_LEFT':
      return { left: true, right: false, up: true, down: false };
    case 'UP_RIGHT':
      return { left: false, right: true, up: true, down: false };
    case 'DOWN_LEFT':
      return { left: true, right: false, up: false, down: true };
    case 'DOWN_RIGHT':
      return { left: false, right: true, up: false, down: true };
    case 'NEUTRAL':
    default:
      return { left: false, right: false, up: false, down: false };
  }
}

/**
 * Resolves a touch/pointer offset `(dx, dy)` relative to the D-Pad center `(cx, cy)`
 * into one of the 8 discrete digital directions or `'NEUTRAL'` if inside the dead zone.
 *
 * Coordinate convention: screen space (`+x` right, `+y` down).
 */
export function evaluateDPadTouchOffset(
  dx: number,
  dy: number,
  radius: number,
  deadZoneRatio: number = DPAD_DEFAULT_DEADZONE_RATIO
): DPadVectorResult {
  const safeRadius = Math.max(24, Number.isFinite(radius) ? radius : 64);
  const clampedDeadZoneRatio = Math.max(0.08, Math.min(0.45, deadZoneRatio));
  const deadZonePx = Math.max(DPAD_MIN_DEADZONE_PX, safeRadius * clampedDeadZoneRatio);

  const dist = Math.hypot(dx, dy);
  const normalizedDistance = Math.min(1, dist / safeRadius);

  if (!Number.isFinite(dist) || dist < deadZonePx) {
    return {
      direction: 'NEUTRAL',
      axes: dpadDirectionToAxes('NEUTRAL'),
      angleDeg: null,
      normalizedDistance: Number.isFinite(normalizedDistance) ? normalizedDistance : 0,
      inDeadZone: true,
      normX: 0,
      normY: 0,
    };
  }

  // Screen-space angle in degrees: 0° = RIGHT (+X), +90° = DOWN (+Y), ±180° = LEFT (-X), -90° = UP (-Y)
  const angleRad = Math.atan2(dy, dx);
  const angleDeg = (angleRad * 180) / Math.PI;

  // Normalize angle to [0, 360) shifted by +22.5° so each 45° bucket maps cleanly to one of 8 sectors
  const shifted = (((angleDeg + 22.5) % 360) + 360) % 360;
  const sectorIndex = Math.floor(shifted / 45) % 8;
  const direction = DPAD_SECTORS_CLOCKWISE[sectorIndex].direction;

  const clampScale = dist > safeRadius ? safeRadius / dist : 1;
  const normX = (dx * clampScale) / safeRadius;
  const normY = (dy * clampScale) / safeRadius;

  return {
    direction,
    axes: dpadDirectionToAxes(direction),
    angleDeg,
    normalizedDistance,
    inDeadZone: false,
    normX,
    normY,
  };
}

/**
 * Resolves a client touch/pointer coordinate `(clientX, clientY)` against a D-Pad bounding rect.
 */
export function evaluateDPadClientPoint(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  deadZoneRatio: number = DPAD_DEFAULT_DEADZONE_RATIO
): DPadVectorResult {
  const centerX = rect.left + rect.width * 0.5;
  const centerY = rect.top + rect.height * 0.5;
  const radius = Math.min(rect.width, rect.height) * 0.5;
  return evaluateDPadTouchOffset(clientX - centerX, clientY - centerY, radius, deadZoneRatio);
}

/**
 * Pure multi-touch controller state tracker.
 * Isolates pointer/touch identifiers across the D-Pad and the right-hand action buttons
 * (`SALTO`, `LUCE`, `PURIFICA`) so pressing or releasing any action button NEVER interrupts
 * an active D-Pad movement touch (and vice versa).
 */
export type ActionButtonId = 'jump' | 'light' | 'purify';

export interface MultiTouchControllerState {
  dpadPointerId: number | null;
  dpadVector: DPadVectorResult;
  activeActionPointers: Record<ActionButtonId, Set<number>>;
}

export function createMultiTouchControllerState(): MultiTouchControllerState {
  return {
    dpadPointerId: null,
    dpadVector: evaluateDPadTouchOffset(0, 0, 64),
    activeActionPointers: {
      jump: new Set<number>(),
      light: new Set<number>(),
      purify: new Set<number>(),
    },
  };
}

export function startDPadPointer(
  state: MultiTouchControllerState,
  pointerId: number,
  dx: number,
  dy: number,
  radius: number,
  deadZoneRatio: number = DPAD_DEFAULT_DEADZONE_RATIO
): DPadVectorResult {
  state.dpadPointerId = pointerId;
  state.dpadVector = evaluateDPadTouchOffset(dx, dy, radius, deadZoneRatio);
  return state.dpadVector;
}

export function moveDPadPointer(
  state: MultiTouchControllerState,
  pointerId: number,
  dx: number,
  dy: number,
  radius: number,
  deadZoneRatio: number = DPAD_DEFAULT_DEADZONE_RATIO
): DPadVectorResult | null {
  if (state.dpadPointerId !== pointerId) {
    return null;
  }
  state.dpadVector = evaluateDPadTouchOffset(dx, dy, radius, deadZoneRatio);
  return state.dpadVector;
}

export function endDPadPointer(
  state: MultiTouchControllerState,
  pointerId: number
): DPadVectorResult | null {
  if (state.dpadPointerId !== pointerId) {
    return null;
  }
  state.dpadPointerId = null;
  state.dpadVector = evaluateDPadTouchOffset(0, 0, 64);
  return state.dpadVector;
}

export function pressActionPointer(
  state: MultiTouchControllerState,
  button: ActionButtonId,
  pointerId: number
): { becamePressed: boolean; isPressed: boolean } {
  const set = state.activeActionPointers[button];
  const wasPressed = set.size > 0;
  set.add(pointerId);
  return {
    becamePressed: !wasPressed && set.size > 0,
    isPressed: set.size > 0,
  };
}

export function releaseActionPointer(
  state: MultiTouchControllerState,
  button: ActionButtonId,
  pointerId: number
): { becameReleased: boolean; isPressed: boolean } {
  const set = state.activeActionPointers[button];
  const wasPressed = set.size > 0;
  set.delete(pointerId);
  return {
    becameReleased: wasPressed && set.size === 0,
    isPressed: set.size > 0,
  };
}

export function resetAllMultiTouchState(state: MultiTouchControllerState): void {
  state.dpadPointerId = null;
  state.dpadVector = evaluateDPadTouchOffset(0, 0, 64);
  state.activeActionPointers.jump.clear();
  state.activeActionPointers.light.clear();
  state.activeActionPointers.purify.clear();
}
