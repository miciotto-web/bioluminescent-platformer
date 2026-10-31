import {
  createEnemyAnimationController,
  resolveEnemyAnimState,
  stepEnemyAnimationController,
} from './animationController';
import { aabbOverlap, PLAYER_CONSTANTS } from './player';
import { Platform, PlayerState, ShadowCreature } from './types';

export interface EnemyStepEvents {
  playerHit: boolean;
  damageDealt: number;
  enemiesDissolved: { x: number; y: number }[];
  telegraphStarted: boolean;
}

const MAX_CONCURRENT_ATTACKERS = 2;
const ENEMY_GRAVITY = 1150;
const ENEMY_MAX_FALL = 540;

function resolveEnemyGroundCollision(
  enemy: ShadowCreature,
  platforms: Platform[],
  dt: number
): void {
  const wasGrounded = enemy.grounded ?? true;
  const prevBottom = enemy.y + enemy.height;

  enemy.vy = Math.min(ENEMY_MAX_FALL, enemy.vy + ENEMY_GRAVITY * dt);
  enemy.y += enemy.vy * dt;
  enemy.grounded = false;

  for (const plat of platforms) {
    if (
      aabbOverlap(
        enemy.x,
        enemy.y,
        enemy.width,
        enemy.height,
        plat.x,
        plat.y,
        plat.width,
        plat.height
      )
    ) {
      if (enemy.vy >= 0 && prevBottom <= plat.y + 18) {
        enemy.y = plat.y - enemy.height;
        enemy.vy = 0;
        enemy.grounded = true;
        enemy.homeY = enemy.y;
      }
    }
  }

  // Subtle physical landing compression when touching down on terrain
  if (!wasGrounded && enemy.grounded) {
    enemy.scaleX = 1.07;
    enemy.scaleY = 0.93;
  }
}

export function updateEnemies(
  enemies: ShadowCreature[],
  player: PlayerState,
  platforms: Platform[],
  dt: number
): EnemyStepEvents {
  const events: EnemyStepEvents = {
    playerHit: false,
    damageDealt: 0,
    enemiesDissolved: [],
    telegraphStarted: false,
  };

  const playerCenterX = player.x + player.width * 0.5;
  const playerCenterY = player.y + player.height * 0.5;

  // Count active windups/attacks for the crowd token pool
  let activeAttackers = 0;
  for (const e of enemies) {
    if (e.state === 'windup' || e.state === 'attack') {
      activeAttackers++;
    }
  }

  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];
    enemy.phaseOffset += dt * 3.2;

    if (!enemy.animController) {
      enemy.animController = createEnemyAnimationController('idle', enemy.facing);
    }
    if (enemy.scaleX === undefined) enemy.scaleX = 1;
    if (enemy.scaleY === undefined) enemy.scaleY = 1;
    if (enemy.idleTimer === undefined) enemy.idleTimer = 0;

    // Smoothly relax physical body compression toward 1.0
    const scaleLerp = Math.min(1, 12 * dt);
    enemy.scaleX += (1 - enemy.scaleX) * scaleLerp;
    enemy.scaleY += (1 - enemy.scaleY) * scaleLerp;

    if (enemy.hitFlashTimer > 0) {
      enemy.hitFlashTimer = Math.max(0, enemy.hitFlashTimer - dt);
    }
    if (enemy.cooldownTimer > 0) {
      enemy.cooldownTimer = Math.max(0, enemy.cooldownTimer - dt);
    }

    // Handle KO collapse & dissolution on the ground
    if (enemy.state === 'ko') {
      enemy.koTimer -= dt;
      enemy.vx *= Math.exp(-8 * dt);
      enemy.x += enemy.vx * dt;
      resolveEnemyGroundCollision(enemy, platforms, dt);
      stepEnemyAnimationController(enemy.animController, enemy, dt);
      enemy.animState = enemy.animController.currentState;

      if (enemy.koTimer <= 0) {
        events.enemiesDissolved.push({
          x: enemy.x + enemy.width * 0.5,
          y: enemy.y + enemy.height * 0.5,
        });
        enemies.splice(i, 1);
      }
      continue;
    }

    const enemyCenterX = enemy.x + enemy.width * 0.5;
    const enemyCenterY = enemy.y + enemy.height * 0.5;
    const dx = playerCenterX - enemyCenterX;
    const dy = playerCenterY - enemyCenterY;
    const dist = Math.hypot(dx, dy);

    const playerInTerritory =
      playerCenterX >= enemy.patrolMinX - 90 &&
      playerCenterX <= enemy.patrolMaxX + 90 &&
      Math.abs(dy) < 160;

    // If recoiling from a light beam hit, apply ground friction while preserving hit recoil animation
    if (enemy.hitFlashTimer > 0.04) {
      enemy.vx *= Math.exp(-7 * dt);
    } else if (enemy.state === 'windup') {
      // Preparatory crouch before lunge: strong braking & body compression on hind legs
      enemy.vx *= Math.exp(-14 * dt);
      if (Math.abs(enemy.vx) < 4) enemy.vx = 0;
      enemy.scaleX = 1.05;
      enemy.scaleY = 0.94;
      enemy.telegraphTimer -= dt;
      if (enemy.telegraphTimer <= 0) {
        enemy.state = 'attack';
        enemy.attackActiveTimer = 0.28;
        const lungeMult = enemy.archetype === 'brute' ? 2.1 : 1.65;
        enemy.vx = enemy.facing * enemy.speed * lungeMult;
        enemy.scaleX = 1.08;
        enemy.scaleY = 0.93;
      }
    } else if (enemy.state === 'attack') {
      enemy.attackActiveTimer -= dt;
      // Decelerate lunge during landing/follow-through phase
      if (enemy.attackActiveTimer < 0.12) {
        enemy.vx *= Math.exp(-9 * dt);
        enemy.scaleX = 1.05;
        enemy.scaleY = 0.95;
      }
      if (enemy.attackActiveTimer <= 0) {
        enemy.state = 'chase';
        enemy.cooldownTimer = 0.75;
      }
    } else if (dist <= enemy.detectRadius && playerInTerritory) {
      enemy.idleTimer = 0;
      const desiredFacing: 1 | -1 = dx >= 0 ? 1 : -1;

      // Trigger telegraph windup when in strike range and token available
      const strikeRange = enemy.archetype === 'brute' ? 110 : 72;
      if (
        dist <= strikeRange &&
        enemy.cooldownTimer <= 0 &&
        activeAttackers < MAX_CONCURRENT_ATTACKERS
      ) {
        enemy.facing = desiredFacing;
        enemy.state = 'windup';
        enemy.telegraphTimer = enemy.archetype === 'brute' ? 0.45 : 0.3;
        activeAttackers++;
        events.telegraphStarted = true;
      } else {
        enemy.state = 'chase';
        const chaseMult =
          enemy.archetype === 'brute' ? 0.85 : enemy.archetype === 'wraith' ? 1.05 : 1.0;
        const targetVx = desiredFacing * (enemy.speed * chaseMult);

        // Realistic direction-change braking when player crosses behind a running creature
        if (desiredFacing !== enemy.facing && Math.abs(enemy.vx) > 22) {
          enemy.vx *= Math.exp(-14 * dt);
          if (Math.abs(enemy.vx) <= 28) {
            enemy.facing = desiredFacing;
          }
        } else {
          enemy.facing = desiredFacing;
          const accelRate = enemy.archetype === 'brute' ? 6.5 : 10.5;
          enemy.vx += (targetVx - enemy.vx) * Math.min(1, accelRate * dt);
        }
      }
    } else {
      // Outside chase range: either pausing in grounded IDLE or walking in PATROL
      if (enemy.idleTimer > 0) {
        enemy.state = 'idle';
        enemy.idleTimer = Math.max(0, enemy.idleTimer - dt);
        // Smooth braking to 0 velocity
        enemy.vx *= Math.exp(-14 * dt);
        if (Math.abs(enemy.vx) < 5) {
          enemy.vx = 0;
        }
        if (enemy.idleTimer <= 0) {
          enemy.state = 'patrol';
        }
      } else {
        enemy.state = 'patrol';
        const patrolTargetSpeed = enemy.speed * 0.52;
        const patrolVel = enemy.facing * patrolTargetSpeed;

        // If decelerating down from a fast chase, brake smoothly toward walk speed
        const rate = Math.abs(enemy.vx) > patrolTargetSpeed * 1.15 ? 10 : 8;
        enemy.vx += (patrolVel - enemy.vx) * Math.min(1, rate * dt);

        // Decelerate as creature approaches territory boundary and pause briefly before turning
        const distToMin = enemy.x - enemy.patrolMinX;
        const distToMax = enemy.patrolMaxX - (enemy.x + enemy.width);
        if (enemy.facing === -1 && distToMin <= 24) {
          const slowFactor = Math.max(0.25, distToMin / 24);
          enemy.vx = Math.max(enemy.vx, -patrolTargetSpeed * slowFactor);
        } else if (enemy.facing === 1 && distToMax <= 24) {
          const slowFactor = Math.max(0.25, distToMax / 24);
          enemy.vx = Math.min(enemy.vx, patrolTargetSpeed * slowFactor);
        }

        if (enemy.x <= enemy.patrolMinX + 0.5 && enemy.facing === -1) {
          enemy.x = enemy.patrolMinX;
          enemy.vx = 0;
          enemy.facing = 1;
          enemy.state = 'idle';
          enemy.idleTimer = 0.28;
        } else if (
          enemy.x + enemy.width >= enemy.patrolMaxX - 0.5 &&
          enemy.facing === 1
        ) {
          enemy.x = enemy.patrolMaxX - enemy.width;
          enemy.vx = 0;
          enemy.facing = -1;
          enemy.state = 'idle';
          enemy.idleTimer = 0.28;
        }
      }
    }

    // Apply horizontal velocity clamped to territory bounds
    enemy.x += enemy.vx * dt;
    if (enemy.x < enemy.patrolMinX) {
      enemy.x = enemy.patrolMinX;
      if (enemy.state === 'patrol' || enemy.state === 'idle') {
        enemy.facing = 1;
        enemy.vx = 0;
      }
    }
    if (enemy.x + enemy.width > enemy.patrolMaxX) {
      enemy.x = enemy.patrolMaxX - enemy.width;
      if (enemy.state === 'patrol' || enemy.state === 'idle') {
        enemy.facing = -1;
        enemy.vx = 0;
      }
    }

    // Apply terrestrial gravity & platform surface adherence for ALL shadow creatures
    resolveEnemyGroundCollision(enemy, platforms, dt);

    // Step velocity-adapted EnemyAnimationController
    stepEnemyAnimationController(enemy.animController, enemy, dt);
    enemy.animState = resolveEnemyAnimState(enemy);

    // Contact damage check with Player
    if (
      player.invulnTimer <= 0 &&
      aabbOverlap(
        player.x + 4,
        player.y + 4,
        player.width - 8,
        player.height - 8,
        enemy.x + 4,
        enemy.y + 4,
        enemy.width - 8,
        enemy.height - 8
      )
    ) {
      player.hp = Math.max(0, player.hp - enemy.contactDamage);
      player.invulnTimer = PLAYER_CONSTANTS.INVULN_DURATION;
      player.hurtFlashTimer = 0.24;
      // Knockback player away from shadow creature
      const pushDir = playerCenterX >= enemyCenterX ? 1 : -1;
      player.vx = pushDir * 290;
      player.vy = -270;
      player.grounded = false;

      events.playerHit = true;
      events.damageDealt += enemy.contactDamage;
    }
  }

  return events;
}

