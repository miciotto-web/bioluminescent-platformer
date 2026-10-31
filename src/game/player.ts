import {
  createAnimationController,
  resolveProtagonistAnimState,
  stepAnimationController,
} from './animationController';
import { InputState, Platform, PlayerState } from './types';

export const PLAYER_CONSTANTS = {
  WIDTH: 38,
  HEIGHT: 44,
  MAX_SPEED: 295,
  ACCELERATION: 1650,
  DECELERATION: 1950,
  AIR_ACCELERATION: 1200,
  AIR_DECELERATION: 850,
  GRAVITY: 1380,
  FALL_GRAVITY_MULTIPLIER: 1.28,
  MAX_FALL_SPEED: 720,
  JUMP_VELOCITY: -545,
  JUMP_CUT_MULTIPLIER: 0.45,
  COYOTE_TIME: 0.11,
  JUMP_BUFFER_TIME: 0.12,
  MAX_HP: 5,
  INVULN_DURATION: 1.05,
};

export function createInitialPlayer(spawnX: number, spawnY: number): PlayerState {
  return {
    x: spawnX,
    y: spawnY,
    vx: 0,
    vy: 0,
    width: PLAYER_CONSTANTS.WIDTH,
    height: PLAYER_CONSTANTS.HEIGHT,
    facing: 1,
    grounded: false,
    coyoteTimer: 0,
    jumpBufferTimer: 0,
    animState: 'idle',
    animTimer: 0,
    walkCycleDist: 0,
    scaleX: 1,
    scaleY: 1,
    hp: PLAYER_CONSTANTS.MAX_HP,
    maxHp: PLAYER_CONSTANTS.MAX_HP,
    invulnTimer: 0,
    hurtFlashTimer: 0,
    attackCooldown: 0,
    attackAnimTimer: 0,
    purifyAnimTimer: 0,
    animController: createAnimationController('idle', 1),
    safeCheckpointX: spawnX,
    safeCheckpointY: spawnY,
  };
}

export interface PlayerStepEvents {
  jumped: boolean;
  landed: boolean;
  fellInPit: boolean;
}

export function updatePlayer(
  player: PlayerState,
  input: InputState,
  platforms: Platform[],
  levelWidth: number,
  pitY: number,
  dt: number
): PlayerStepEvents {
  const events: PlayerStepEvents = {
    jumped: false,
    landed: false,
    fellInPit: false,
  };

  // Timers
  if (player.invulnTimer > 0) player.invulnTimer = Math.max(0, player.invulnTimer - dt);
  if (player.hurtFlashTimer > 0) player.hurtFlashTimer = Math.max(0, player.hurtFlashTimer - dt);
  if (player.attackCooldown > 0) player.attackCooldown = Math.max(0, player.attackCooldown - dt);
  if (player.attackAnimTimer > 0) player.attackAnimTimer = Math.max(0, player.attackAnimTimer - dt);
  if ((player.purifyAnimTimer ?? 0) > 0) {
    player.purifyAnimTimer = Math.max(0, (player.purifyAnimTimer ?? 0) - dt);
  }
  if (input.purifyHeld) {
    player.purifyAnimTimer = 0.14;
  }

  // Horizontal input & acceleration/deceleration
  const moveDir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (moveDir !== 0) {
    player.facing = moveDir > 0 ? 1 : -1;
    const accel = player.grounded ? PLAYER_CONSTANTS.ACCELERATION : PLAYER_CONSTANTS.AIR_ACCELERATION;
    player.vx += moveDir * accel * dt;
    if (Math.abs(player.vx) > PLAYER_CONSTANTS.MAX_SPEED) {
      player.vx = Math.sign(player.vx) * PLAYER_CONSTANTS.MAX_SPEED;
    }
  } else {
    const decel = player.grounded ? PLAYER_CONSTANTS.DECELERATION : PLAYER_CONSTANTS.AIR_DECELERATION;
    if (Math.abs(player.vx) <= decel * dt) {
      player.vx = 0;
    } else {
      player.vx -= Math.sign(player.vx) * decel * dt;
    }
  }

  // Coyote time & Jump buffer
  if (player.grounded) {
    player.coyoteTimer = PLAYER_CONSTANTS.COYOTE_TIME;
  } else {
    player.coyoteTimer = Math.max(0, player.coyoteTimer - dt);
  }

  if (input.jumpJustPressed) {
    player.jumpBufferTimer = PLAYER_CONSTANTS.JUMP_BUFFER_TIME;
  } else {
    player.jumpBufferTimer = Math.max(0, player.jumpBufferTimer - dt);
  }

  // Execute Jump if buffered and within coyote time
  if (player.jumpBufferTimer > 0 && player.coyoteTimer > 0) {
    player.vy = PLAYER_CONSTANTS.JUMP_VELOCITY;
    player.grounded = false;
    player.coyoteTimer = 0;
    player.jumpBufferTimer = 0;
    player.scaleX = 0.95;
    player.scaleY = 1.06;
    events.jumped = true;
  }

  // Variable jump height cut when jump button is released early while ascending
  if (input.jumpJustReleased && player.vy < 0) {
    player.vy *= PLAYER_CONSTANTS.JUMP_CUT_MULTIPLIER;
  }

  // Gravity
  const gravMultiplier = player.vy > 0 ? PLAYER_CONSTANTS.FALL_GRAVITY_MULTIPLIER : 1.0;
  player.vy = Math.min(
    PLAYER_CONSTANTS.MAX_FALL_SPEED,
    player.vy + PLAYER_CONSTANTS.GRAVITY * gravMultiplier * dt
  );

  // Move X & resolve horizontal collisions
  player.x += player.vx * dt;
  player.x = Math.max(16, Math.min(levelWidth - player.width - 16, player.x));

  for (const plat of platforms) {
    if (aabbOverlap(player.x, player.y, player.width, player.height, plat.x, plat.y, plat.width, plat.height)) {
      if (player.vx > 0) {
        player.x = plat.x - player.width;
        player.vx = 0;
      } else if (player.vx < 0) {
        player.x = plat.x + plat.width;
        player.vx = 0;
      }
    }
  }

  // Move Y & resolve vertical collisions
  const wasGrounded = player.grounded;
  player.grounded = false;
  player.y += player.vy * dt;

  for (const plat of platforms) {
    if (aabbOverlap(player.x, player.y, player.width, player.height, plat.x, plat.y, plat.width, plat.height)) {
      if (player.vy >= 0) {
        player.y = plat.y - player.height;
        if (!wasGrounded && player.vy > 180) {
          events.landed = true;
          player.scaleX = 1.06;
          player.scaleY = 0.94;
        }
        player.vy = 0;
        player.grounded = true;
        // Record safe checkpoint when standing firmly on a platform interior
        if (player.x > plat.x + 12 && player.x + player.width < plat.x + plat.width - 12) {
          player.safeCheckpointX = player.x;
          player.safeCheckpointY = plat.y - player.height - 2;
        }
      } else if (player.vy < 0) {
        player.y = plat.y + plat.height;
        player.vy = 0;
      }
    }
  }

  // Pit fall recovery
  if (player.y > pitY) {
    events.fellInPit = true;
    player.hp = Math.max(0, player.hp - 1);
    player.invulnTimer = PLAYER_CONSTANTS.INVULN_DURATION;
    player.hurtFlashTimer = 0.28;
    if (player.hp > 0) {
      player.x = player.safeCheckpointX;
      player.y = player.safeCheckpointY;
      player.vx = 0;
      player.vy = 0;
    }
  }

  // Exponentially damp squash-and-stretch back to (1, 1)
  const damp = Math.exp(-16 * dt);
  player.scaleX = 1 + (player.scaleX - 1) * damp;
  player.scaleY = 1 + (player.scaleY - 1) * damp;

  // Gait sync & modular AnimationController update
  player.animTimer += dt;
  if (player.grounded) {
    player.walkCycleDist += Math.abs(player.vx) * dt * 0.045;
  }

  const isPurifying =
    (player.purifyAnimTimer ?? 0) > 0 && player.grounded && Math.abs(player.vx) <= 24;
  const desiredState = resolveProtagonistAnimState(player, isPurifying);
  player.animState = desiredState;

  if (!player.animController) {
    player.animController = createAnimationController(desiredState, player.facing);
  }
  const speedRatio = Math.abs(player.vx) / PLAYER_CONSTANTS.MAX_SPEED;
  stepAnimationController(player.animController, desiredState, player.facing, dt, speedRatio);

  return events;
}

export function aabbOverlap(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}
