import { consumeLightEnergy, LIGHT_CONSTANTS } from './lightSystem';
import { applyBeamPurification } from './purification';
import {
  CorruptedZone,
  LightBeam,
  LightSystemState,
  Platform,
  PlayerState,
  ShadowCreature,
} from './types';

export const COMBAT_CONSTANTS = {
  BEAM_SPEED: 620,
  BEAM_RADIUS: 11,
  BEAM_LIFETIME: 1.15,
  BEAM_DAMAGE: 1,
  ATTACK_COOLDOWN: 0.26,
};

export interface BeamImpactEvent {
  x: number;
  y: number;
  kind: 'enemy' | 'purify' | 'wall';
  enemyKilled?: boolean;
  zoneCompleted?: boolean;
}

export function trySpawnLightBeam(
  player: PlayerState,
  light: LightSystemState,
  beams: LightBeam[],
  nextId: number
): { spawned: LightBeam | null; nextId: number } {
  if (player.attackCooldown > 0) {
    return { spawned: null, nextId };
  }

  if (!consumeLightEnergy(light, LIGHT_CONSTANTS.BEAM_COST)) {
    return { spawned: null, nextId };
  }

  player.attackCooldown = COMBAT_CONSTANTS.ATTACK_COOLDOWN;
  player.attackAnimTimer = 0.22;
  player.animState = 'attack';

  const spawnX = player.facing === 1 ? player.x + player.width + 6 : player.x - 6;
  const spawnY = player.y + player.height * 0.46;

  const beam: LightBeam = {
    id: nextId,
    x: spawnX,
    y: spawnY,
    vx: player.facing * COMBAT_CONSTANTS.BEAM_SPEED,
    vy: 0,
    radius: COMBAT_CONSTANTS.BEAM_RADIUS,
    damage: COMBAT_CONSTANTS.BEAM_DAMAGE,
    life: COMBAT_CONSTANTS.BEAM_LIFETIME,
    maxLife: COMBAT_CONSTANTS.BEAM_LIFETIME,
    active: true,
  };

  beams.push(beam);
  return { spawned: beam, nextId: nextId + 1 };
}

export function updateLightBeams(
  beams: LightBeam[],
  enemies: ShadowCreature[],
  corruptedZones: CorruptedZone[],
  platforms: Platform[],
  dt: number
): BeamImpactEvent[] {
  const impacts: BeamImpactEvent[] = [];

  for (const beam of beams) {
    if (!beam.active) continue;

    beam.x += beam.vx * dt;
    beam.y += beam.vy * dt;
    beam.life -= dt;

    if (beam.life <= 0) {
      beam.active = false;
      continue;
    }

    // 1. Check collision against Shadow Creatures
    let hitEnemy = false;
    for (const enemy of enemies) {
      if (enemy.state === 'ko') continue;

      const ex = enemy.x;
      const ey = enemy.y;
      const ew = enemy.width;
      const eh = enemy.height;

      if (
        beam.x + beam.radius >= ex &&
        beam.x - beam.radius <= ex + ew &&
        beam.y + beam.radius >= ey &&
        beam.y - beam.radius <= ey + eh
      ) {
        enemy.hp = Math.max(0, enemy.hp - beam.damage);
        enemy.hitFlashTimer = 0.18;
        // Grounded physical skid recoil away from the light beam (without floating into air)
        const dir = beam.vx >= 0 ? 1 : -1;
        enemy.vx = dir * 165;
        enemy.vy = 0;
        enemy.scaleX = 1.07;
        enemy.scaleY = 0.93;

        const killed = enemy.hp <= 0;
        if (killed) {
          enemy.state = 'ko';
          enemy.koTimer = 0.48;
          enemy.animState = 'death';
          if (enemy.animController) {
            enemy.animController.previousState = enemy.animController.currentState;
            enemy.animController.currentState = 'death';
            enemy.animController.frameIndex = 0;
            enemy.animController.frameTimer = 0;
            enemy.animController.stateElapsed = 0;
            enemy.animController.finished = false;
          }
        } else {
          if (enemy.state === 'patrol' || enemy.state === 'idle') {
            enemy.state = 'chase';
          }
          enemy.animState = 'hit';
          if (enemy.animController) {
            enemy.animController.previousState = enemy.animController.currentState;
            enemy.animController.currentState = 'hit';
            enemy.animController.frameIndex = 0;
            enemy.animController.frameTimer = 0;
            enemy.animController.stateElapsed = 0;
            enemy.animController.finished = false;
          }
        }

        beam.active = false;
        hitEnemy = true;
        impacts.push({
          x: beam.x,
          y: beam.y,
          kind: 'enemy',
          enemyKilled: killed,
        });
        break;
      }
    }

    if (hitEnemy) continue;

    // 2. Check interaction with Corrupted Zones (purifies corrupted essence mid-flight or on contact)
    for (const zone of corruptedZones) {
      if (zone.isPurified) continue;
      // Hit corrupted core totem in center of zone
      const coreX = zone.x + zone.width * 0.5;
      const coreY = zone.y + zone.height - 38;
      const distToCore = Math.hypot(beam.x - coreX, beam.y - coreY);

      if (distToCore <= 46) {
        const res = applyBeamPurification(zone, beam);
        if (res.purifiedDelta > 0) {
          beam.active = false;
          impacts.push({
            x: beam.x,
            y: beam.y,
            kind: 'purify',
            zoneCompleted: res.newlyCompleted,
          });
          break;
        }
      }
    }

    if (!beam.active) continue;

    // 3. Check collision against solid platforms/walls
    for (const plat of platforms) {
      if (
        beam.x + beam.radius >= plat.x &&
        beam.x - beam.radius <= plat.x + plat.width &&
        beam.y + beam.radius >= plat.y &&
        beam.y - beam.radius <= plat.y + plat.height
      ) {
        // Also purify any corrupted zone attached to this platform
        for (const zone of corruptedZones) {
          if (!zone.isPurified) {
            applyBeamPurification(zone, beam);
          }
        }
        beam.active = false;
        impacts.push({
          x: beam.x,
          y: beam.y,
          kind: 'wall',
        });
        break;
      }
    }
  }

  // Remove inactive beams in-place
  for (let i = beams.length - 1; i >= 0; i--) {
    if (!beams[i].active) {
      beams.splice(i, 1);
    }
  }

  return impacts;
}
