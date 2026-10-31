import { soundEngine } from './audio';
import { trySpawnLightBeam, updateLightBeams } from './combat';
import { updateEnemies } from './enemy';
import { spawnParticleBurst, updateLevelEntities, updateParticles } from './level';
import { consumeLightEnergy, LIGHT_CONSTANTS, updateLightSystem } from './lightSystem';
import { updatePlayer } from './player';
import { calculateGlobalPurification, updateCorruptedZones } from './purification';
import { triggerScreenShake, updateScreenShake } from './renderer';
import { GameOutcome, InputState, RunSummarySnapshot, WorldState } from './types';

export interface StepResult {
  outcome: GameOutcome;
  summary: RunSummarySnapshot | null;
}

export function stepWorld(
  world: WorldState,
  input: InputState,
  rawDt: number,
  viewportWidth: number,
  viewportHeight: number
): StepResult {
  // Clamp dt to <= 0.05s to prevent tunneling
  const dt = Math.min(rawDt, 0.05);

  // Screen shake decay & hitstop timer always advance in real dt
  updateScreenShake(world.camera, dt);

  if (world.hitstopTimer > 0) {
    world.hitstopTimer = Math.max(0, world.hitstopTimer - dt);
    updateParticles(world, dt * 0.35);
    return { outcome: 'none', summary: null };
  }

  world.stats.elapsedTime += dt;

  const { player, light } = world;

  // 1. Update Player physics, movement, jump & collisions
  const playerEvents = updatePlayer(
    player,
    input,
    world.platforms,
    world.levelWidth,
    world.pitY,
    dt
  );

  if (playerEvents.jumped) {
    soundEngine.playJump();
    spawnParticleBurst(world, player.x + player.width * 0.5, player.y + player.height, 6, {
      color: '#fef08a',
      glowColor: '#f59e0b',
      speedMin: 35,
      speedMax: 95,
      sizeMin: 2,
      sizeMax: 4.5,
      lifeMin: 0.22,
      lifeMax: 0.42,
      upwardBias: 30,
    });
  }

  if (playerEvents.landed) {
    soundEngine.playLand();
    spawnParticleBurst(world, player.x + player.width * 0.5, player.y + player.height, 5, {
      color: '#fde68a',
      glowColor: '#38bdf8',
      speedMin: 30,
      speedMax: 80,
      sizeMin: 2,
      sizeMax: 3.5,
      lifeMin: 0.18,
      lifeMax: 0.35,
      upwardBias: 15,
    });
  }

  if (playerEvents.fellInPit) {
    // If an active sanctuary checkpoint is unlocked, restore player directly at its safe spawn
    const activeCp = world.checkpoints.find((c) => c.id === world.activeCheckpointId);
    if (activeCp && player.hp > 0) {
      player.x = activeCp.spawnX;
      player.y = activeCp.spawnY;
    }
    soundEngine.playPlayerHurt();
    triggerScreenShake(world.camera, 'player_damage');
    world.stats.damageTaken += 1;
  }

  // 1b. Update Checkpoints, Collectibles, Secret Area & Environmental Hazards
  const levelEvents = updateLevelEntities(world, dt);

  if (levelEvents.activatedCheckpoint) {
    soundEngine.playPurificationComplete();
    spawnParticleBurst(
      world,
      levelEvents.activatedCheckpoint.x,
      levelEvents.activatedCheckpoint.y - 36,
      22,
      {
        color: '#fef08a',
        glowColor: '#38bdf8',
        speedMin: 45,
        speedMax: 165,
        sizeMin: 2.5,
        sizeMax: 5.5,
        lifeMin: 0.35,
        lifeMax: 0.75,
        upwardBias: 50,
      }
    );
  }

  for (const item of levelEvents.collectedItems) {
    if (item.kind === 'sun_relic') {
      soundEngine.playPurificationComplete();
      triggerScreenShake(world.camera, 'combat_hit', 9, 0.22);
    } else {
      soundEngine.playLightBeam();
    }
    spawnParticleBurst(world, item.x, item.y, item.kind === 'sun_relic' ? 26 : 10, {
      color: '#fef08a',
      glowColor: item.kind === 'sun_relic' ? '#34d399' : '#38bdf8',
      speedMin: 40,
      speedMax: item.kind === 'sun_relic' ? 190 : 120,
      sizeMin: 2.2,
      sizeMax: 5.0,
      lifeMin: 0.25,
      lifeMax: 0.55,
      upwardBias: 35,
    });
  }

  if (levelEvents.discoveredSecret) {
    soundEngine.playPurificationComplete();
  }

  if (levelEvents.hazardHit) {
    soundEngine.playPlayerHurt();
    world.hitstopTimer = 0.05;
    triggerScreenShake(world.camera, 'player_damage');
    world.stats.damageTaken += levelEvents.hazardHit.damage;
    const hitTargetState = player.hp <= 0 ? 'death' : 'damage';
    player.animState = hitTargetState;
    if (player.animController) {
      player.animController.previousState = player.animController.currentState;
      player.animController.currentState = hitTargetState;
      player.animController.frameIndex = 0;
      player.animController.frameTimer = 0;
      player.animController.stateElapsed = 0;
      player.animController.finished = false;
    }
    spawnParticleBurst(world, player.x + player.width * 0.5, player.y + player.height * 0.5, 14, {
      color: '#fda4af',
      glowColor: '#e11d48',
      speedMin: 60,
      speedMax: 180,
      sizeMin: 2.5,
      sizeMax: 5,
      lifeMin: 0.22,
      lifeMax: 0.45,
    });
  }

  // 2. Handle Attack: LIGHT_BEAM
  if (input.attackJustPressed) {
    const res = trySpawnLightBeam(player, light, world.beams, world.nextEntityId);
    world.nextEntityId = res.nextId;
    if (res.spawned) {
      world.stats.beamsFired += 1;
      soundEngine.playLightBeam();
      // Subtle recoil impulse (main motion is in the 6-frame attack spritesheet)
      player.scaleX = 1.04;
      player.scaleY = 0.96;
      if (player.animController) {
        player.animController.previousState = player.animController.currentState;
        player.animController.currentState = 'attack';
        player.animController.frameIndex = 0;
        player.animController.frameTimer = 0;
        player.animController.stateElapsed = 0;
        player.animController.finished = false;
      }
      spawnParticleBurst(world, res.spawned.x, res.spawned.y, 5, {
        color: '#ffffff',
        glowColor: '#fbbf24',
        speedMin: 40,
        speedMax: 110,
        sizeMin: 2,
        sizeMax: 4,
        lifeMin: 0.15,
        lifeMax: 0.3,
      });
    }
  }

  // 3. Handle Channeling Purify Aura Burst (optional active hold or automatic inside corrupted zone)
  let isChannelingPurify = false;
  if (input.purifyHeld && light.energy >= 8) {
    const cost = LIGHT_CONSTANTS.PURIFY_PULSE_COST_PER_SEC * dt;
    if (consumeLightEnergy(light, cost)) {
      isChannelingPurify = true;
      player.purifyAnimTimer = 0.16;
      if (light.pulseBurstTimer <= 0) {
        light.pulseBurstTimer = 0.45;
        light.pulseBurstRadius = light.currentRadius * 0.5;
      }
    }
  }

  // 4. Update Light System (energy recovery near sources, aura radius)
  const lightEvents = updateLightSystem(light, player, world.lightSources, dt);
  if (lightEvents.rechargedAmount > 0 && Math.random() < 0.35) {
    spawnParticleBurst(
      world,
      player.x + player.width * 0.5 + (Math.random() - 0.5) * 28,
      player.y + player.height * 0.6,
      1,
      {
        color: '#fef08a',
        glowColor: '#38bdf8',
        speedMin: 15,
        speedMax: 40,
        sizeMin: 2,
        sizeMax: 4,
        lifeMin: 0.35,
        lifeMax: 0.65,
        upwardBias: 45,
      }
    );
  }

  // 5. Update LIGHT_BEAM projectiles & collisions
  const impacts = updateLightBeams(
    world.beams,
    world.enemies,
    world.corruptedZones,
    world.platforms,
    dt
  );

  for (const impact of impacts) {
    if (impact.kind === 'enemy') {
      soundEngine.playEnemyHit(Boolean(impact.enemyKilled));
      world.hitstopTimer = impact.enemyKilled ? 0.055 : 0.03;
      triggerScreenShake(
        world.camera,
        impact.enemyKilled ? 'enemy_destroyed' : 'combat_hit'
      );
      spawnParticleBurst(world, impact.x, impact.y, impact.enemyKilled ? 20 : 10, {
        color: '#fef08a',
        glowColor: impact.enemyKilled ? '#f59e0b' : '#e879f9',
        speedMin: 60,
        speedMax: impact.enemyKilled ? 240 : 150,
        sizeMin: 2.5,
        sizeMax: 6,
        lifeMin: 0.25,
        lifeMax: 0.55,
      });
      if (impact.enemyKilled) {
        world.stats.enemiesDefeated += 1;
      }
    } else if (impact.kind === 'purify') {
      spawnParticleBurst(world, impact.x, impact.y, impact.zoneCompleted ? 24 : 12, {
        color: '#6ee7b7',
        glowColor: '#fbbf24',
        speedMin: 50,
        speedMax: 190,
        sizeMin: 2.5,
        sizeMax: 5.5,
        lifeMin: 0.3,
        lifeMax: 0.65,
        upwardBias: 40,
      });
      if (impact.zoneCompleted) {
        soundEngine.playPurificationComplete();
        world.hitstopTimer = 0.05;
        triggerScreenShake(world.camera, 'combat_hit', 10, 0.25);
      } else {
        soundEngine.playEnemyHit(false);
      }
    } else {
      spawnParticleBurst(world, impact.x, impact.y, 6, {
        color: '#fef08a',
        glowColor: '#f59e0b',
        speedMin: 30,
        speedMax: 90,
        sizeMin: 1.8,
        sizeMax: 3.5,
        lifeMin: 0.16,
        lifeMax: 0.32,
      });
    }
  }

  // 6. Update Corrupted Zones & Purification transformation
  const purifyEvents = updateCorruptedZones(
    world.corruptedZones,
    player,
    light,
    isChannelingPurify,
    dt
  );

  for (const zone of purifyEvents.newlyPurifiedZones) {
    soundEngine.playPurificationComplete();
    world.hitstopTimer = 0.05;
    triggerScreenShake(world.camera, 'combat_hit', 10, 0.25);
    spawnParticleBurst(world, zone.x + zone.width * 0.5, zone.y + zone.height * 0.6, 26, {
      color: '#fef08a',
      glowColor: '#34d399',
      speedMin: 60,
      speedMax: 220,
      sizeMin: 3,
      sizeMax: 6.5,
      lifeMin: 0.4,
      lifeMax: 0.85,
      upwardBias: 55,
    });
  }

  // Ambient particles inside Corrupted vs Purified zones
  for (const zone of world.corruptedZones) {
    if (Math.random() < 0.28) {
      const rx = zone.x + Math.random() * zone.width;
      const ry = zone.y + zone.height - Math.random() * 35;
      if (zone.isPurified || zone.purification >= 60) {
        spawnParticleBurst(world, rx, ry, 1, {
          color: '#fef08a',
          glowColor: '#34d399',
          speedMin: 10,
          speedMax: 28,
          sizeMin: 2,
          sizeMax: 4,
          lifeMin: 0.6,
          lifeMax: 1.1,
          upwardBias: 35,
        });
      } else {
        spawnParticleBurst(world, rx, ry, 1, {
          color: '#581c87',
          glowColor: '#c026d3',
          speedMin: 8,
          speedMax: 24,
          sizeMin: 2.2,
          sizeMax: 4.5,
          lifeMin: 0.5,
          lifeMax: 0.95,
          upwardBias: 22,
        });
      }
    }
  }

  // 7. Update Enemies (SHADOW_CREATURE)
  const enemyEvents = updateEnemies(world.enemies, player, world.platforms, dt);
  if (enemyEvents.telegraphStarted) {
    soundEngine.playTelegraph();
  }
  if (enemyEvents.playerHit) {
    soundEngine.playPlayerHurt();
    world.hitstopTimer = 0.06;
    triggerScreenShake(world.camera, 'player_damage');
    world.stats.damageTaken += enemyEvents.damageDealt;
    const hitTargetState = player.hp <= 0 ? 'death' : 'damage';
    player.animState = hitTargetState;
    if (player.animController) {
      player.animController.previousState = player.animController.currentState;
      player.animController.currentState = hitTargetState;
      player.animController.frameIndex = 0;
      player.animController.frameTimer = 0;
      player.animController.stateElapsed = 0;
      player.animController.finished = false;
    }
    spawnParticleBurst(
      world,
      player.x + player.width * 0.5,
      player.y + player.height * 0.5,
      16,
      {
        color: '#fda4af',
        glowColor: '#e11d48',
        speedMin: 70,
        speedMax: 210,
        sizeMin: 2.5,
        sizeMax: 5.5,
        lifeMin: 0.25,
        lifeMax: 0.5,
      }
    );
  }
  for (const dissolved of enemyEvents.enemiesDissolved) {
    triggerScreenShake(world.camera, 'enemy_destroyed');
    spawnParticleBurst(world, dissolved.x, dissolved.y, 18, {
      color: '#f0abfc',
      glowColor: '#fef08a',
      speedMin: 50,
      speedMax: 180,
      sizeMin: 2.5,
      sizeMax: 5.5,
      lifeMin: 0.3,
      lifeMax: 0.65,
      upwardBias: 35,
    });
  }

  // 8. Update Particles
  updateParticles(world, dt);

  // 9. Smooth Camera Follow in Landscape Viewport
  const targetCamX = Math.max(
    0,
    Math.min(
      world.levelWidth - viewportWidth,
      player.x + player.width * 0.5 - viewportWidth * 0.38 + player.facing * 55
    )
  );
  const targetCamY = Math.max(
    0,
    Math.min(
      Math.max(0, world.levelHeight - viewportHeight),
      player.y + player.height * 0.5 - viewportHeight * 0.56
    )
  );

  const camLerp = 1 - Math.exp(-7.5 * dt);
  world.camera.x += (targetCamX - world.camera.x) * camLerp;
  world.camera.y += (targetCamY - world.camera.y) * camLerp;

  // 10. Check Defeat or Victory conditions
  if (player.hp <= 0) {
    return {
      outcome: 'defeat',
      summary: createRunSummary(world, 'defeat'),
    };
  }

  const playerCenterX = player.x + player.width * 0.5;
  const playerCenterY = player.y + player.height * 0.5;
  const distToGoal = Math.hypot(
    playerCenterX - world.goalPortal.x,
    playerCenterY - world.goalPortal.y
  );

  if (distToGoal <= world.goalPortal.radius) {
    soundEngine.playVictory();
    return {
      outcome: 'victory',
      summary: createRunSummary(world, 'victory'),
    };
  }

  return { outcome: 'none', summary: null };
}

export function createRunSummary(world: WorldState, outcome: GameOutcome): RunSummarySnapshot {
  const purifiedZonesCount = world.corruptedZones.filter((z) => z.isPurified).length;
  return {
    outcome,
    levelTitle: world.levelTitle,
    clearTimeSec: Math.round(world.stats.elapsedTime),
    purificationPercent: calculateGlobalPurification(world.corruptedZones),
    purifiedZonesCount,
    totalZonesCount: world.corruptedZones.length,
    enemiesDefeated: world.stats.enemiesDefeated,
    totalEnemies: world.stats.totalEnemies,
    crystalsCollected: world.stats.crystalsCollected,
    totalCrystals: world.stats.totalCrystals,
    checkpointsActivated: world.checkpoints.filter((c) => c.activated).length,
    totalCheckpoints: world.checkpoints.length,
    secretDiscovered: world.secretAreas.some((s) => s.discovered),
    remainingHp: world.player.hp,
    maxHp: world.player.maxHp,
    remainingEnergy: Math.round(world.light.energy),
    maxEnergy: world.light.maxEnergy,
  };
}

