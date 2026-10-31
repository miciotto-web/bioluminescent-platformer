import { PlayerState, ShadowCreature } from './types';

export type ProtagonistAnimState =
  | 'idle'
  | 'run'
  | 'jump'
  | 'fall'
  | 'attack'
  | 'damage'
  | 'death'
  | 'purify';

export interface AnimationClipSpec {
  state: ProtagonistAnimState;
  frameCount: number;
  fps: number;
  loop: boolean;
  priority: number;
}

export const PROTAGONIST_ANIM_SPECS: Record<ProtagonistAnimState, AnimationClipSpec> = {
  idle: {
    state: 'idle',
    frameCount: 8,
    fps: 10,
    loop: true,
    priority: 10,
  },
  run: {
    state: 'run',
    frameCount: 8,
    fps: 14,
    loop: true,
    priority: 20,
  },
  purify: {
    state: 'purify',
    frameCount: 8,
    fps: 12,
    loop: true,
    priority: 30,
  },
  jump: {
    state: 'jump',
    frameCount: 6,
    fps: 14,
    loop: false,
    priority: 40,
  },
  fall: {
    state: 'fall',
    frameCount: 4,
    fps: 11,
    loop: true,
    priority: 40,
  },
  attack: {
    state: 'attack',
    frameCount: 6,
    fps: 24,
    loop: false,
    priority: 50,
  },
  damage: {
    state: 'damage',
    frameCount: 4,
    fps: 15,
    loop: false,
    priority: 60,
  },
  death: {
    state: 'death',
    frameCount: 8,
    fps: 10,
    loop: false,
    priority: 100,
  },
};

export interface AnimationControllerState {
  currentState: ProtagonistAnimState;
  previousState: ProtagonistAnimState;
  frameIndex: number;
  frameTimer: number;
  stateElapsed: number;
  facing: 1 | -1;
  finished: boolean;
  transitionBlend: number;
}

export function createAnimationController(
  initialState: ProtagonistAnimState = 'idle',
  facing: 1 | -1 = 1
): AnimationControllerState {
  return {
    currentState: initialState,
    previousState: initialState,
    frameIndex: 0,
    frameTimer: 0,
    stateElapsed: 0,
    facing,
    finished: false,
    transitionBlend: 1,
  };
}

/**
 * Resolves the highest-priority animation state for the Protagonist
 * based on physical state, combat timers, damage reaction, and purification channeling.
 */
export function resolveProtagonistAnimState(
  player: PlayerState,
  isPurifying: boolean = false
): ProtagonistAnimState {
  if (player.hp <= 0) {
    return 'death';
  }
  if (player.hurtFlashTimer > 0.04) {
    return 'damage';
  }
  if (player.attackAnimTimer > 0) {
    return 'attack';
  }
  if (!player.grounded) {
    return player.vy < 0 ? 'jump' : 'fall';
  }
  if (isPurifying) {
    return 'purify';
  }
  if (Math.abs(player.vx) > 18) {
    return 'run';
  }
  return 'idle';
}

/**
 * Advances the Protagonist AnimationController strictly using delta time (dt).
 * Ensures frame rate independence across 30, 60, and 120 FPS, proper one-shot handling,
 * and smooth state transitions without resetting physics.
 */
export function stepAnimationController(
  ctrl: AnimationControllerState,
  desiredState: ProtagonistAnimState,
  facing: 1 | -1,
  dt: number,
  speedRatio: number = 1
): AnimationControllerState {
  const safeDt = Math.max(0, Math.min(0.1, dt));
  ctrl.facing = facing;

  if (desiredState !== ctrl.currentState) {
    const prev = ctrl.currentState;
    ctrl.previousState = prev;
    ctrl.currentState = desiredState;
    ctrl.stateElapsed = 0;
    ctrl.finished = false;
    ctrl.transitionBlend = 0;

    // Seamless stride continuation when returning to RUN from ATTACK or FALL
    if (desiredState === 'run' && (prev === 'attack' || prev === 'fall')) {
      const runFrames = PROTAGONIST_ANIM_SPECS.run.frameCount;
      ctrl.frameIndex = ctrl.frameIndex % runFrames;
      ctrl.frameTimer = 0;
    } else {
      ctrl.frameIndex = 0;
      ctrl.frameTimer = 0;
    }
    return ctrl;
  }

  const spec = PROTAGONIST_ANIM_SPECS[ctrl.currentState];
  ctrl.stateElapsed += safeDt;
  ctrl.transitionBlend = Math.min(1, ctrl.transitionBlend + safeDt * 12);

  // Modulate run cycle cadence slightly by horizontal speed ratio while keeping minimum cadence natural
  let effectiveFps = spec.fps;
  if (ctrl.currentState === 'run') {
    const clampedRatio = Math.max(0.65, Math.min(1.2, speedRatio));
    effectiveFps = spec.fps * clampedRatio;
  }

  ctrl.frameTimer += safeDt * effectiveFps;

  while (ctrl.frameTimer >= 1) {
    ctrl.frameTimer -= 1;
    if (spec.loop) {
      ctrl.frameIndex = (ctrl.frameIndex + 1) % spec.frameCount;
    } else {
      if (ctrl.frameIndex < spec.frameCount - 1) {
        ctrl.frameIndex += 1;
      } else {
        ctrl.frameIndex = spec.frameCount - 1;
        ctrl.finished = true;
      }
    }
  }

  return ctrl;
}

// ============================================================================
// Shadow Creature (Creature Nere) Terrestrial Animation Controller
// ============================================================================

export type EnemyAnimState = 'idle' | 'walk' | 'run' | 'attack' | 'hit' | 'death';

export interface EnemyAnimationClipSpec {
  state: EnemyAnimState;
  frameCount: number;
  fps: number;
  loop: boolean;
  priority: number;
}

export const ENEMY_ANIM_SPECS: Record<EnemyAnimState, EnemyAnimationClipSpec> = {
  idle: {
    state: 'idle',
    frameCount: 8,
    fps: 10,
    loop: true,
    priority: 10,
  },
  walk: {
    state: 'walk',
    frameCount: 8,
    fps: 12,
    loop: true,
    priority: 20,
  },
  run: {
    state: 'run',
    frameCount: 8,
    fps: 16,
    loop: true,
    priority: 30,
  },
  attack: {
    state: 'attack',
    frameCount: 6,
    fps: 15,
    loop: false,
    priority: 50,
  },
  hit: {
    state: 'hit',
    frameCount: 4,
    fps: 15,
    loop: false,
    priority: 60,
  },
  death: {
    state: 'death',
    frameCount: 8,
    fps: 14,
    loop: false,
    priority: 100,
  },
};

export interface EnemyAnimationControllerState {
  currentState: EnemyAnimState;
  previousState: EnemyAnimState;
  frameIndex: number;
  frameTimer: number;
  stateElapsed: number;
  facing: 1 | -1;
  finished: boolean;
  transitionBlend: number;
  stridePhase: number;
}

export function createEnemyAnimationController(
  initialState: EnemyAnimState = 'idle',
  facing: 1 | -1 = -1
): EnemyAnimationControllerState {
  return {
    currentState: initialState,
    previousState: initialState,
    frameIndex: 0,
    frameTimer: 0,
    stateElapsed: 0,
    facing,
    finished: false,
    transitionBlend: 1,
    stridePhase: 0,
  };
}

/**
 * Resolves the highest-priority animation state for a Black Shadow Creature (`SHADOW_CREATURE`)
 * based on HP/KO state, hit recoil, attack windup/lunge, and actual horizontal velocity.
 */
export function resolveEnemyAnimState(enemy: ShadowCreature): EnemyAnimState {
  if (enemy.state === 'ko' || enemy.hp <= 0) {
    return 'death';
  }
  if (enemy.hitFlashTimer > 0.02) {
    return 'hit';
  }
  if (enemy.state === 'windup' || enemy.state === 'attack') {
    return 'attack';
  }
  const absVx = Math.abs(enemy.vx);
  const runThreshold = enemy.speed * 0.56;
  const walkThreshold = 10;

  if ((enemy.state === 'chase' || enemy.state === 'alert') && absVx >= runThreshold) {
    return 'run';
  }
  if (absVx >= walkThreshold) {
    return 'walk';
  }
  return 'idle';
}

/**
 * Advances the Shadow Creature AnimationController using delta time (dt) and velocity-scaled cadence.
 * - Adapts leg cycle speed to actual horizontal speed so feet never slide on the ground.
 * - Preserves stride phase when transitioning between walk and run.
 * - Coordinates windup frames (0..1) and lunge/recovery frames (2..5) during attack.
 */
export function stepEnemyAnimationController(
  ctrl: EnemyAnimationControllerState,
  enemy: ShadowCreature,
  dt: number
): EnemyAnimationControllerState {
  const safeDt = Math.max(0, Math.min(0.1, dt));
  const desiredState = resolveEnemyAnimState(enemy);
  ctrl.facing = enemy.facing;

  if (desiredState !== ctrl.currentState) {
    const prev = ctrl.currentState;
    ctrl.previousState = prev;
    ctrl.currentState = desiredState;
    ctrl.stateElapsed = 0;
    ctrl.finished = false;
    ctrl.transitionBlend = 0;

    // Preserve stride phase when transitioning smoothly between WALK and RUN
    if (
      (desiredState === 'run' && prev === 'walk') ||
      (desiredState === 'walk' && prev === 'run')
    ) {
      ctrl.frameIndex = ctrl.frameIndex % 8;
    } else {
      ctrl.frameIndex = 0;
      ctrl.frameTimer = 0;
    }
  }

  const spec = ENEMY_ANIM_SPECS[ctrl.currentState];
  ctrl.stateElapsed += safeDt;
  ctrl.transitionBlend = Math.min(1, ctrl.transitionBlend + safeDt * 10);

  if (ctrl.currentState === 'attack') {
    // Synchronize attack frames explicitly with windup (frames 0..1) and lunge/recovery (frames 2..5)
    if (enemy.state === 'windup') {
      const totalWindup = enemy.archetype === 'brute' ? 0.45 : 0.3;
      const windupProgress = Math.max(0, Math.min(1, 1 - enemy.telegraphTimer / totalWindup));
      ctrl.frameIndex = windupProgress < 0.5 ? 0 : 1;
      ctrl.frameTimer = 0;
    } else {
      const totalLunge = 0.28;
      const lungeProgress = Math.max(0, Math.min(1, 1 - enemy.attackActiveTimer / totalLunge));
      ctrl.frameIndex = Math.min(5, 2 + Math.floor(lungeProgress * 4));
      if (ctrl.frameIndex >= 5) ctrl.finished = true;
    }
    ctrl.stridePhase = ctrl.frameIndex / spec.frameCount;
    return ctrl;
  }

  if (ctrl.currentState === 'death') {
    const koDuration = 0.48;
    const progress = Math.max(0, Math.min(1, 1 - enemy.koTimer / koDuration));
    ctrl.frameIndex = Math.min(spec.frameCount - 1, Math.floor(progress * spec.frameCount));
    if (ctrl.frameIndex >= spec.frameCount - 1) ctrl.finished = true;
    ctrl.stridePhase = progress;
    return ctrl;
  }

  // Velocity-proportional leg cadence for walk & run so footsteps match actual ground speed
  let effectiveFps = spec.fps;
  const absVx = Math.abs(enemy.vx);
  if (ctrl.currentState === 'walk') {
    const refWalkSpeed = Math.max(30, enemy.speed * 0.52);
    const speedRatio = Math.max(0.45, Math.min(1.4, absVx / refWalkSpeed));
    effectiveFps = spec.fps * speedRatio;
  } else if (ctrl.currentState === 'run') {
    const refRunSpeed = Math.max(50, enemy.speed);
    const speedRatio = Math.max(0.6, Math.min(1.45, absVx / refRunSpeed));
    effectiveFps = spec.fps * speedRatio;
  }

  ctrl.frameTimer += safeDt * effectiveFps;

  while (ctrl.frameTimer >= 1) {
    ctrl.frameTimer -= 1;
    if (spec.loop) {
      ctrl.frameIndex = (ctrl.frameIndex + 1) % spec.frameCount;
    } else {
      if (ctrl.frameIndex < spec.frameCount - 1) {
        ctrl.frameIndex += 1;
      } else {
        ctrl.frameIndex = spec.frameCount - 1;
        ctrl.finished = true;
      }
    }
  }

  ctrl.stridePhase = (ctrl.frameIndex + Math.min(0.99, ctrl.frameTimer)) / spec.frameCount;
  return ctrl;
}

