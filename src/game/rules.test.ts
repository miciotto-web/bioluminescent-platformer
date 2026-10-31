import assert from 'node:assert/strict';
import test from 'node:test';
import { trySpawnLightBeam, updateLightBeams } from './combat';
import { stepWorld } from './engine';
import { updateEnemies } from './enemy';
import { createDemoLevel } from './level';
import {
  consumeLightEnergy,
  LIGHT_CONSTANTS,
  recoverLightEnergy,
  updateLightSystem,
} from './lightSystem';
import { updatePlayer } from './player';
import { calculateGlobalPurification, updateCorruptedZones } from './purification';
import {
  createMultiTouchControllerState,
  DPAD_SECTORS_CLOCKWISE,
  dpadDirectionToAxes,
  endDPadPointer,
  evaluateDPadClientPoint,
  evaluateDPadTouchOffset,
  moveDPadPointer,
  pressActionPointer,
  releaseActionPointer,
  resetAllMultiTouchState,
  startDPadPointer,
} from './dpad';
import { InputState } from './types';

function emptyInput(): InputState {
  return {
    left: false,
    right: false,
    jumpHeld: false,
    jumpJustPressed: false,
    jumpJustReleased: false,
    attackJustPressed: false,
    purifyHeld: false,
  };
}

test('1. Project & Demo Level load with required entities', () => {
  const world = createDemoLevel();
  assert.ok(world.platforms.length >= 6, 'Level should have multiple platforms');
  assert.ok(world.corruptedZones.length >= 2, 'Level should have corrupted zones');
  assert.ok(world.enemies.length >= 1, 'Level should have at least one SHADOW_CREATURE');
  assert.ok(world.lightSources.length >= 2, 'Level should have light energy sources');
  assert.equal(world.player.hp, 5);
  assert.equal(world.light.energy, 100);
});

test('2. Player horizontal movement, acceleration, deceleration & animations', () => {
  const world = createDemoLevel();
  const input = emptyInput();

  // Settle on ground first
  for (let i = 0; i < 10; i++) {
    updatePlayer(world.player, input, world.platforms, world.levelWidth, world.pitY, 0.016);
  }
  assert.equal(world.player.grounded, true);
  assert.equal(world.player.animState, 'idle');

  const startX = world.player.x;
  input.right = true;
  for (let i = 0; i < 15; i++) {
    updatePlayer(world.player, input, world.platforms, world.levelWidth, world.pitY, 0.016);
  }
  assert.ok(world.player.x > startX, 'Player should move right');
  assert.ok(world.player.vx > 0, 'Player should accelerate horizontally');
  assert.equal(world.player.animState, 'run');

  // Release input -> decelerate to stop
  input.right = false;
  for (let i = 0; i < 25; i++) {
    updatePlayer(world.player, input, world.platforms, world.levelWidth, world.pitY, 0.016);
  }
  assert.equal(world.player.vx, 0, 'Player should decelerate to 0');
  assert.equal(world.player.animState, 'idle');
});

test('3. Player jump, gravity, and platform collisions', () => {
  const world = createDemoLevel();
  const input = emptyInput();

  // Land on initial platform
  for (let i = 0; i < 10; i++) {
    updatePlayer(world.player, input, world.platforms, world.levelWidth, world.pitY, 0.016);
  }
  const groundY = world.player.y;

  // Trigger jump
  input.jumpJustPressed = true;
  input.jumpHeld = true;
  const events = updatePlayer(world.player, input, world.platforms, world.levelWidth, world.pitY, 0.016);
  assert.equal(events.jumped, true);
  assert.ok(world.player.vy < 0, 'Jump should apply upward velocity');
  assert.equal(world.player.animState, 'jump');

  input.jumpJustPressed = false;
  updatePlayer(world.player, input, world.platforms, world.levelWidth, world.pitY, 0.016);
  assert.ok(world.player.y < groundY, 'Player should ascend above ground');
});

test('4. Light System energy consumption, aura scaling, and recovery from light sources', () => {
  const world = createDemoLevel();
  const initialRadius = world.light.currentRadius;

  const consumed = consumeLightEnergy(world.light, 40);
  assert.equal(consumed, true);
  assert.equal(world.light.energy, 60);
  assert.ok(world.light.currentRadius < initialRadius, 'Aura radius shrinks when energy drops');

  // Position player right on the first LightSource to verify active recharge
  world.player.x = world.lightSources[0].x - world.player.width * 0.5;
  world.player.y = world.lightSources[0].y - world.player.height * 0.5;
  const res = updateLightSystem(world.light, world.player, world.lightSources, 0.5);
  assert.ok(res.rechargedAmount > 0, 'Light source should recharge player light energy');
  assert.equal(world.light.isRecharging, true);

  recoverLightEnergy(world.light, 100);
  assert.equal(world.light.energy, LIGHT_CONSTANTS.MAX_ENERGY);
});

test('5. Combat LIGHT_BEAM firing, enemy damage, and enemy destruction', () => {
  const world = createDemoLevel();
  const targetEnemy = world.enemies[0];
  const initialEnemyHp = targetEnemy.hp;

  // Place player facing enemy at close range
  world.player.x = targetEnemy.x - 80;
  world.player.y = targetEnemy.y;
  world.player.facing = 1;

  const spawnRes = trySpawnLightBeam(world.player, world.light, world.beams, world.nextEntityId);
  assert.ok(spawnRes.spawned, 'LIGHT_BEAM should spawn');
  assert.equal(world.light.energy, 100 - LIGHT_CONSTANTS.BEAM_COST);

  // Advance beams until hit
  let hitDetected = false;
  for (let i = 0; i < 20; i++) {
    const impacts = updateLightBeams(
      world.beams,
      world.enemies,
      world.corruptedZones,
      world.platforms,
      0.016
    );
    if (impacts.some((imp) => imp.kind === 'enemy')) {
      hitDetected = true;
      break;
    }
  }
  assert.equal(hitDetected, true, 'LIGHT_BEAM should hit SHADOW_CREATURE');
  assert.equal(targetEnemy.hp, initialEnemyHp - 1);

  // Deal remaining hits to destroy the enemy
  while (targetEnemy.hp > 0) {
    world.player.attackCooldown = 0;
    trySpawnLightBeam(world.player, world.light, world.beams, world.nextEntityId++);
    for (let i = 0; i < 20; i++) {
      updateLightBeams(world.beams, world.enemies, world.corruptedZones, world.platforms, 0.016);
    }
  }
  assert.equal(targetEnemy.state, 'ko', 'Enemy enters KO state at 0 HP');
  updateEnemies(world.enemies, world.player, world.platforms, 0.5);
  assert.equal(world.enemies.includes(targetEnemy), false, 'Defeated enemy is removed after dissolve');
});

test('6. Purification transforms corrupted zones from 0% to 100%', () => {
  const world = createDemoLevel();
  const zone = world.corruptedZones[0];
  assert.equal(zone.purification, 0);
  assert.equal(zone.isPurified, false);

  // Place player inside the corrupted zone and channel light purification
  world.player.x = zone.x + zone.width * 0.5;
  world.player.y = zone.y + zone.height - world.player.height;

  for (let i = 0; i < 30; i++) {
    updateCorruptedZones(world.corruptedZones, world.player, world.light, true, 0.1);
  }

  assert.equal(zone.isPurified, true, 'Corrupted zone should become fully purified');
  assert.equal(zone.purification, 100);
  assert.equal(
    calculateGlobalPurification(world.corruptedZones),
    Math.round(100 / world.corruptedZones.length)
  );
});

test('7. Reaching Final Sanctuary Portal triggers Victory state', () => {
  const world = createDemoLevel();
  const input = emptyInput();

  world.player.x = world.goalPortal.x - world.player.width * 0.5;
  world.player.y = world.goalPortal.y - world.player.height * 0.5;

  const result = stepWorld(world, input, 0.016, 1280, 720);
  assert.equal(result.outcome, 'victory');
  assert.ok(result.summary);
});

test('8. Screen shake triggers when player takes damage or when a Shadow Creature is destroyed', async () => {
  const { computeScreenShakeOffset, updateScreenShake } = await import('./renderer');
  const world = createDemoLevel();
  const input = emptyInput();

  // Initially no screen shake
  assert.equal(world.camera.shakeTrauma, 0);
  assert.equal(computeScreenShakeOffset(world.camera, 1.0).envelope, 0);

  // A. Overlap player with first Shadow Creature to take contact damage
  const enemy = world.enemies[0];
  world.player.x = enemy.x;
  world.player.y = enemy.y;
  world.player.invulnTimer = 0;

  stepWorld(world, input, 0.016, 1280, 720);
  assert.equal(world.player.hp, 4, 'Player should take 1 contact damage');
  assert.equal(world.camera.shakeReason, 'player_damage');
  assert.ok(world.camera.shakeIntensity >= 16, 'Player damage should trigger strong shake intensity');
  const dmgShake = computeScreenShakeOffset(world.camera, 0.37);
  assert.ok(
    Math.hypot(dmgShake.offsetX, dmgShake.offsetY) > 1,
    'Screen shake offset should be non-zero during player damage shake'
  );

  // Decay screen shake completely
  for (let i = 0; i < 30; i++) {
    updateScreenShake(world.camera, 0.05);
  }
  assert.equal(world.camera.shakeReason, 'none');
  assert.equal(computeScreenShakeOffset(world.camera, 2.0).envelope, 0);

  // B. Destroy the Shadow Creature with a fatal LIGHT_BEAM
  world.hitstopTimer = 0;
  enemy.hp = 1;
  world.player.x = enemy.x - 50;
  world.player.y = enemy.y;
  world.player.facing = 1;
  world.player.attackCooldown = 0;
  input.attackJustPressed = true;

  for (let i = 0; i < 15; i++) {
    world.hitstopTimer = 0;
    stepWorld(world, input, 0.016, 1280, 720);
    input.attackJustPressed = false;
    if (world.camera.shakeReason === 'enemy_destroyed') {
      break;
    }
  }

  assert.equal(
    world.camera.shakeReason,
    'enemy_destroyed',
    'Destroying a Shadow Creature should trigger enemy_destroyed screen shake'
  );
  assert.ok(world.camera.shakeIntensity >= 14);
  const killShake = computeScreenShakeOffset(world.camera, 0.53);
  assert.ok(
    Math.hypot(killShake.offsetX, killShake.offsetY) > 1,
    'Screen shake offset should be non-zero when Shadow Creature is destroyed'
  );
});

test('9. Fase 1.3 Real Asset Pipeline: PNG existence, RGBA transparency, frame counts & animation selectors', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const {
    gameAssets,
    selectProtagonistSheet,
    selectEnemySheet,
    computeFrameIndex,
  } = await import('./assets');

  // Verify manifest.json and all 36 generated PNG files on disk
  const manifestPath = path.resolve(process.cwd(), 'public/assets/manifest.json');
  assert.equal(fs.existsSync(manifestPath), true, 'manifest.json must exist');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  assert.equal(manifest.totalAssets, 36, 'Manifest should list all 36 generated PNG assets');

  for (const item of manifest.assets) {
    const diskPath = path.resolve(process.cwd(), 'public', item.path.replace(/^\//, ''));
    assert.equal(fs.existsSync(diskPath), true, `PNG asset must exist: ${item.path}`);
    const buf = fs.readFileSync(diskPath);
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    const colorType = buf[25];
    assert.equal(w, item.width, `Width matches manifest for ${item.path}`);
    assert.equal(h, item.height, `Height matches manifest for ${item.path}`);
    assert.equal(colorType, 6, `PNG must be 8-bit RGBA (colorType 6) for ${item.path}`);
  }

  // Verify Protagonist required frame counts (Idle 8, Run 8, Jump 6, Fall 4, Attack 6, Damage 4, Death 8, Purify 8)
  assert.equal(gameAssets.protagonist.idle.frameCount, 8);
  assert.equal(gameAssets.protagonist.run.frameCount, 8);
  assert.equal(gameAssets.protagonist.jump.frameCount, 6);
  assert.equal(gameAssets.protagonist.fall.frameCount, 4);
  assert.equal(gameAssets.protagonist.attack.frameCount, 6);
  assert.equal(gameAssets.protagonist.damage.frameCount, 4);
  assert.equal(gameAssets.protagonist.death.frameCount, 8);
  assert.equal(gameAssets.protagonist.purify.frameCount, 8);

  // Verify animation selector logic across Protagonist & ShadowCreature states
  const world = createDemoLevel();
  world.player.grounded = true;
  world.player.vx = 0;
  assert.equal(selectProtagonistSheet(world.player, false).key, 'prot_idle');
  assert.equal(selectProtagonistSheet(world.player, true).key, 'prot_purify');

  world.player.vx = 180;
  assert.equal(selectProtagonistSheet(world.player, false).key, 'prot_run');

  world.player.grounded = false;
  world.player.vy = -300;
  assert.equal(selectProtagonistSheet(world.player, false).key, 'prot_jump');

  world.player.vy = 220;
  assert.equal(selectProtagonistSheet(world.player, false).key, 'prot_fall');

  world.player.attackAnimTimer = 0.15;
  assert.equal(selectProtagonistSheet(world.player, false).key, 'prot_attack');

  world.player.hurtFlashTimer = 0.2;
  assert.equal(selectProtagonistSheet(world.player, false).key, 'prot_damage');

  world.player.hp = 0;
  assert.equal(selectProtagonistSheet(world.player, false).key, 'prot_death');

  const enemy = world.enemies[0];
  enemy.state = 'patrol';
  enemy.vx = 80;
  assert.equal(selectEnemySheet(enemy).key, 'enemy_patrol');
  enemy.state = 'chase';
  assert.equal(selectEnemySheet(enemy).key, 'enemy_chase');
  enemy.state = 'attack';
  assert.equal(selectEnemySheet(enemy).key, 'enemy_attack');
  enemy.hitFlashTimer = 0.1;
  assert.equal(selectEnemySheet(enemy).key, 'enemy_hit');
  enemy.state = 'ko';
  assert.equal(selectEnemySheet(enemy).key, 'enemy_death');

  assert.ok(computeFrameIndex(gameAssets.protagonist.run, 1.25) < 8);
});

test('10. Fase 1.4 — All 18 Mandatory Protagonist Animation, Sprite Rendering & Delta-Time Tests', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const zlib = await import('node:zlib');
  const { gameAssets, selectProtagonistSheet } = await import('./assets');
  const {
    createAnimationController,
    PROTAGONIST_ANIM_SPECS,
    stepAnimationController,
  } = await import('./animationController');

  const world = createDemoLevel();
  const input = emptyInput();

  // Settle on ground
  for (let i = 0; i < 10; i++) {
    stepWorld(world, input, 0.016, 1280, 720);
  }

  // Test 1: Caricamento iniziale: creaturina in IDLE
  assert.equal(world.player.animState, 'idle');
  assert.equal(world.player.animController?.currentState, 'idle');
  assert.equal(selectProtagonistSheet(world.player, false).key, 'prot_idle');

  // Test 2: Pressione destra/sinistra: passaggio a RUN
  input.right = true;
  for (let i = 0; i < 6; i++) {
    stepWorld(world, input, 0.016, 1280, 720);
  }
  assert.equal(world.player.animState, 'run');
  assert.equal(world.player.animController?.currentState, 'run');
  assert.equal(selectProtagonistSheet(world.player, false).key, 'prot_run');

  // Test 3: Movimento continuo per 10 secondi: nessun quadrato e nessuna sparizione dello sprite
  let framesCycled = new Set<number>();
  for (let i = 0; i < 600; i++) {
    // Alternate direction before hitting level boundary
    if (world.player.x > 650) {
      input.right = false;
      input.left = true;
    } else if (world.player.x < 180) {
      input.left = false;
      input.right = true;
    }
    stepWorld(world, input, 1 / 60, 1280, 720);
    const sheet = selectProtagonistSheet(world.player, false);
    assert.ok(sheet && sheet.url.endsWith('.png'), 'Valid PNG spritesheet always selected');
    const fIdx = world.player.animController?.frameIndex ?? 0;
    assert.ok(fIdx >= 0 && fIdx < sheet.frameCount, 'Frame index always within valid bounds');
    if (world.player.animState === 'run') {
      framesCycled.add(fIdx);
    }
  }
  assert.equal(framesCycled.size, 8, 'All 8 frames of RUN cycle are played during continuous movement');

  // Test 4: RUN -> JUMP
  input.left = false;
  input.right = true;
  stepWorld(world, input, 0.016, 1280, 720);
  input.jumpJustPressed = true;
  input.jumpHeld = true;
  stepWorld(world, input, 0.016, 1280, 720);
  input.jumpJustPressed = false;
  assert.equal(world.player.animState, 'jump');
  assert.equal(world.player.animController?.currentState, 'jump');
  assert.equal(selectProtagonistSheet(world.player, false).key, 'prot_jump');

  // Test 5: JUMP -> FALL
  for (let i = 0; i < 45; i++) {
    stepWorld(world, input, 0.016, 1280, 720);
    if (world.player.vy > 0 && !world.player.grounded) break;
  }
  assert.equal(world.player.animState, 'fall');
  assert.equal(world.player.animController?.currentState, 'fall');
  assert.equal(selectProtagonistSheet(world.player, false).key, 'prot_fall');

  // Test 6: FALL -> RUN
  for (let i = 0; i < 60; i++) {
    stepWorld(world, input, 0.016, 1280, 720);
    if (world.player.grounded) break;
  }
  stepWorld(world, input, 0.016, 1280, 720);
  assert.equal(world.player.grounded, true);
  assert.equal(world.player.animState, 'run');
  assert.equal(world.player.animController?.currentState, 'run');

  // Test 7: RUN -> ATTACK
  world.player.attackCooldown = 0;
  world.light.energy = 100;
  input.attackJustPressed = true;
  stepWorld(world, input, 0.016, 1280, 720);
  input.attackJustPressed = false;
  assert.equal(world.player.animState, 'attack');
  assert.equal(world.player.animController?.currentState, 'attack');
  assert.equal(selectProtagonistSheet(world.player, false).key, 'prot_attack');

  // Test 8: ATTACK -> RUN
  for (let i = 0; i < 20; i++) {
    stepWorld(world, input, 0.016, 1280, 720);
  }
  assert.equal(world.player.animState, 'run');
  assert.equal(world.player.animController?.currentState, 'run');

  // Test 9: DAMAGE
  world.player.hurtFlashTimer = 0.25;
  stepWorld(world, input, 0.016, 1280, 720);
  assert.equal(world.player.animState, 'damage');
  assert.equal(world.player.animController?.currentState, 'damage');
  assert.equal(selectProtagonistSheet(world.player, false).key, 'prot_damage');

  // Recover from damage
  world.player.hurtFlashTimer = 0;
  stepWorld(world, input, 0.016, 1280, 720);
  assert.equal(world.player.animState, 'run');

  // Test 11: PURIFY
  input.right = false;
  input.left = false;
  input.jumpHeld = false;
  for (let i = 0; i < 25; i++) {
    stepWorld(world, input, 0.016, 1280, 720);
  }
  input.purifyHeld = true;
  world.light.energy = 100;
  stepWorld(world, input, 0.016, 1280, 720);
  assert.equal(world.player.animState, 'purify');
  assert.equal(world.player.animController?.currentState, 'purify');
  assert.equal(selectProtagonistSheet(world.player, true).key, 'prot_purify');
  input.purifyHeld = false;

  // Test 12: Cambio direzione (facing 1 <-> -1 uses horizontal flip without duplicating sheets)
  input.left = true;
  stepWorld(world, input, 0.016, 1280, 720);
  assert.equal(world.player.facing, -1);
  assert.equal(world.player.animController?.facing, -1);
  input.left = false;
  input.right = true;
  stepWorld(world, input, 0.016, 1280, 720);
  assert.equal(world.player.facing, 1);
  assert.equal(world.player.animController?.facing, 1);

  // Test 13 & 14: Screen Shake & Hitstop durante animazioni
  world.hitstopTimer = 0.05;
  const frameBeforeHitstop = world.player.animController?.frameIndex;
  stepWorld(world, input, 0.016, 1280, 720);
  assert.equal(
    world.player.animController?.frameIndex,
    frameBeforeHitstop,
    'Hitstop cleanly freezes protagonist animation frame'
  );

  // Test 10: DEATH
  world.hitstopTimer = 0;
  world.player.hp = 0;
  updatePlayer(world.player, input, world.platforms, world.levelWidth, world.pitY, 0.016);
  assert.equal(world.player.animState, 'death');
  assert.equal(world.player.animController?.currentState, 'death');
  assert.equal(selectProtagonistSheet(world.player, false).key, 'prot_death');

  // Test 15: Trasparenza PNG corretta & zero artefatti rettangolari sui bordi di ogni frame
  function decodePngRgba(filePath: string) {
    const buf = fs.readFileSync(filePath);
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    const idatChunks: Buffer[] = [];
    let offset = 8;
    while (offset < buf.length) {
      const len = buf.readUInt32BE(offset);
      const type = buf.toString('ascii', offset + 4, offset + 8);
      if (type === 'IDAT') {
        idatChunks.push(buf.subarray(offset + 8, offset + 8 + len));
      }
      offset += 12 + len;
    }
    const raw = zlib.inflateSync(Buffer.concat(idatChunks));
    const stride = width * 4;
    const pixels = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
      const filter = raw[y * (stride + 1)];
      for (let i = 0; i < stride; i++) {
        const rawByte = raw[y * (stride + 1) + 1 + i];
        const a = i >= 4 ? pixels[y * stride + i - 4] : 0;
        const b = y > 0 ? pixels[(y - 1) * stride + i] : 0;
        const c = y > 0 && i >= 4 ? pixels[(y - 1) * stride + i - 4] : 0;
        let val = rawByte;
        if (filter === 1) val = (rawByte + a) & 0xff;
        else if (filter === 2) val = (rawByte + b) & 0xff;
        else if (filter === 3) val = (rawByte + ((a + b) >> 1)) & 0xff;
        else if (filter === 4) {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          val = (rawByte + pr) & 0xff;
        }
        pixels[y * stride + i] = val;
      }
    }
    return { width, height, pixels };
  }

  for (const [stateName, sheet] of Object.entries(gameAssets.protagonist)) {
    const fullPath = path.resolve(process.cwd(), 'public', sheet.url.replace(/^\//, ''));
    const decoded = decodePngRgba(fullPath);
    assert.equal(decoded.width, sheet.frameCount * 128, `${stateName} width matches frameCount * 128`);
    assert.equal(decoded.height, 128, `${stateName} height is 128`);

    // Check every frame border (x=0, x=127, y=0, y=127) has strictly alpha === 0 (zero rectangular border artifacts!)
    for (let f = 0; f < sheet.frameCount; f++) {
      const fx0 = f * 128;
      let borderNonZero = 0;
      let interiorOpaque = 0;
      for (let y = 0; y < 128; y++) {
        for (let x = 0; x < 128; x++) {
          const alpha = decoded.pixels[((y * decoded.width + (fx0 + x)) * 4) + 3];
          if (x === 0 || x === 127 || y === 0 || y === 127) {
            if (alpha > 0) borderNonZero++;
          } else if (alpha > 40) {
            interiorOpaque++;
          }
        }
      }
      assert.equal(
        borderNonZero,
        0,
        `Protagonist ${stateName} frame ${f} must have 0 non-transparent border pixels (no square edge!)`
      );
      assert.ok(
        interiorOpaque > 120,
        `Protagonist ${stateName} frame ${f} must contain visible creature pixels`
      );
    }
  }

  // Test 16 & 17: Nessun rettangolo nel codice di drawPlayerCreature & dimensione/anchor stabili
  const rendererCode = fs.readFileSync(
    path.resolve(process.cwd(), 'src/game/renderer.ts'),
    'utf-8'
  );
  const drawPlayerStart = rendererCode.indexOf('function drawPlayerCreature');
  const drawPlayerEnd = rendererCode.indexOf('function drawLightBeam');
  const drawPlayerSection = rendererCode.slice(drawPlayerStart, drawPlayerEnd);
  assert.equal(
    drawPlayerSection.includes('fillRect'),
    false,
    'drawPlayerCreature must NEVER use fillRect placeholder'
  );
  for (const sheet of Object.values(gameAssets.protagonist)) {
    assert.equal(sheet.anchorX, 64, `${sheet.key} anchorX must be 64`);
    assert.equal(sheet.anchorY, 112, `${sheet.key} anchorY must be 112`);
  }

  // Test 18: Sincronizzazione delta time a 30, 60 e 120 FPS & collisioni separate
  const c30 = createAnimationController('run', 1);
  const c60 = createAnimationController('run', 1);
  const c120 = createAnimationController('run', 1);
  for (let i = 0; i < 30; i++) stepAnimationController(c30, 'run', 1, 1 / 30, 1);
  for (let i = 0; i < 60; i++) stepAnimationController(c60, 'run', 1, 1 / 60, 1);
  for (let i = 0; i < 120; i++) stepAnimationController(c120, 'run', 1, 1 / 120, 1);

  assert.equal(c30.frameIndex, c60.frameIndex, '30 FPS and 60 FPS produce identical frame index after 1.0s');
  assert.equal(c60.frameIndex, c120.frameIndex, '60 FPS and 120 FPS produce identical frame index after 1.0s');
  assert.equal(
    c60.frameIndex,
    PROTAGONIST_ANIM_SPECS.run.fps % PROTAGONIST_ANIM_SPECS.run.frameCount
  );
});

test('11. Creature Nere (SHADOW_CREATURE) — All 9 Mandatory Terrestrial Locomotion, Grounding, Velocity-Scaled Gait & Spritesheet Tests', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const zlib = await import('node:zlib');
  const { gameAssets, selectEnemySheet } = await import('./assets');
  const {
    createEnemyAnimationController,
    ENEMY_ANIM_SPECS,
    resolveEnemyAnimState,
    stepEnemyAnimationController,
  } = await import('./animationController');

  const world = createDemoLevel();
  const enemy = world.enemies[0];
  const plat1 = world.platforms.find((p) => p.id === 'plat_corrupted_1')!;

  // Verify ALL 3 enemies in the level spawn physically grounded on their platform surface (zero floating!)
  for (const e of world.enemies) {
    const hostPlat = world.platforms.find(
      (p) => e.x >= p.x && e.x + e.width <= p.x + p.width && Math.abs(e.y + e.height - p.y) <= 2
    );
    assert.ok(
      hostPlat,
      `Enemy ${e.id} (${e.name}) must rest directly on a platform surface (y+height=${e.y + e.height})`
    );
    assert.equal(e.y + e.height, hostPlat.y, `Enemy ${e.id} feet must align exactly with platform top y`);
    assert.equal(e.grounded, true, `Enemy ${e.id} must start grounded`);
  }

  // Scenario 1: Creatura ferma (IDLE) — breathing & grounded stance
  enemy.state = 'idle';
  enemy.idleTimer = 1.0;
  enemy.vx = 0;
  updateEnemies(world.enemies, world.player, world.platforms, 0.05);
  assert.equal(enemy.animState, 'idle', 'Stationary creature is in IDLE animation state');
  assert.equal(selectEnemySheet(enemy).key, 'enemy_idle');
  assert.equal(enemy.y + enemy.height, plat1.y, 'Stationary creature stays grounded on platform');

  // Scenario 2: Camminata lenta (WALK / PATROL) — alternating leg cycle & velocity-scaled cadence
  enemy.idleTimer = 0;
  enemy.state = 'patrol';
  const walkFramesVisited = new Set<number>();
  for (let i = 0; i < 60; i++) {
    updateEnemies(world.enemies, world.player, world.platforms, 1 / 60);
    if ((enemy.animState as string) === 'walk' && enemy.animController) {
      walkFramesVisited.add(enemy.animController.frameIndex);
    }
    assert.equal(enemy.y + enemy.height, plat1.y, 'Patrolling creature never floats above platform');
  }
  assert.equal(enemy.animState, 'walk', 'Patrolling creature uses WALK animation state');
  assert.equal(selectEnemySheet(enemy).key, 'enemy_patrol');
  assert.ok(walkFramesVisited.size >= 6, 'Walk cycle progresses across articulated stride frames');

  // Verify leg animation speed adapts proportionally to actual horizontal speed
  const slowCtrl = createEnemyAnimationController('walk', -1);
  const fastCtrl = createEnemyAnimationController('walk', -1);
  const dummySlow = { ...enemy, state: 'patrol' as const, vx: -35 };
  const dummyFast = { ...enemy, state: 'patrol' as const, vx: -85 };
  let slowSteps = 0;
  let fastSteps = 0;
  for (let i = 0; i < 60; i++) {
    const prevS = slowCtrl.frameIndex;
    const prevF = fastCtrl.frameIndex;
    stepEnemyAnimationController(slowCtrl, dummySlow, 1 / 60);
    stepEnemyAnimationController(fastCtrl, dummyFast, 1 / 60);
    if (slowCtrl.frameIndex !== prevS) slowSteps++;
    if (fastCtrl.frameIndex !== prevF) fastSteps++;
  }
  assert.ok(
    fastSteps > slowSteps,
    `Faster horizontal speed (${fastSteps} frame steps) must advance leg cycle faster than slow speed (${slowSteps} frame steps)`
  );

  // Scenario 4 & 8: Arresto improvviso & Cambio di direzione al limite del pattugliamento (walk -> braking -> idle -> turn -> walk)
  enemy.x = enemy.patrolMinX + 4;
  enemy.facing = -1;
  enemy.vx = -65;
  for (let i = 0; i < 15; i++) {
    updateEnemies(world.enemies, world.player, world.platforms, 0.016);
    if ((enemy.state as string) === 'idle') break;
  }
  assert.equal(enemy.state, 'idle', 'Creature pauses in IDLE upon reaching patrol boundary');
  assert.equal(enemy.vx, 0, 'Creature stops completely before turning around');
  assert.equal(enemy.facing, 1, 'Creature updates facing direction for turnaround');
  assert.equal(enemy.animState, 'idle', 'Creature returns smoothly to IDLE when stopped');

  // Advance past idle pause so creature accelerates smoothly into walk in the new direction
  for (let i = 0; i < 30; i++) {
    updateEnemies(world.enemies, world.player, world.platforms, 0.016);
  }
  assert.equal(enemy.state, 'patrol');
  assert.ok(enemy.vx > 20, 'Creature smoothly re-accelerates in new facing direction');
  assert.equal(enemy.animState, 'walk');

  // Scenario 3 & 5: Corsa veloce (RUN) & Inseguimento della protagonista
  world.player.x = enemy.x + 150;
  world.player.y = enemy.y;
  for (let i = 0; i < 25; i++) {
    updateEnemies(world.enemies, world.player, world.platforms, 0.016);
  }
  assert.equal(enemy.state, 'chase', 'Creature enters CHASE when protagonist is within detection range');
  assert.equal(enemy.animState, 'run', 'Chasing creature at full speed uses RUN animation state');
  assert.equal(selectEnemySheet(enemy).key, 'enemy_chase');
  assert.equal(enemy.y + enemy.height, plat1.y, 'Running creature stays grounded on platform');

  // Scenario 6: Attacco (preparatory windup frames 0..1 -> forward lunge & impact frames 2..5)
  world.player.x = enemy.x + 48;
  world.player.y = enemy.y;
  enemy.cooldownTimer = 0;
  updateEnemies(world.enemies, world.player, world.platforms, 0.016);
  assert.equal(enemy.state, 'windup', 'Creature enters preparatory windup in strike range');
  assert.equal(enemy.animState, 'attack');
  assert.equal(selectEnemySheet(enemy).key, 'enemy_attack');
  assert.ok(
    (enemy.animController?.frameIndex ?? 0) <= 1,
    'Windup phase uses preparatory crouch frames 0..1'
  );

  // Advance through windup into active lunge
  for (let i = 0; i < 25; i++) {
    updateEnemies(world.enemies, world.player, world.platforms, 0.016);
    if (enemy.state === 'attack') break;
  }
  assert.equal(enemy.state, 'attack', 'Creature transitions from windup to active lunge attack');
  assert.ok(
    (enemy.animController?.frameIndex ?? 0) >= 2,
    'Active attack lunge uses strike/impact frames 2..5'
  );

  // Scenario 7: Collisione con il terreno (verify airborne creature falls under gravity and lands with compression at plat.y)
  enemy.y = plat1.y - enemy.height - 45;
  enemy.vy = 0;
  enemy.grounded = false;
  for (let i = 0; i < 45; i++) {
    updateEnemies(world.enemies, world.player, world.platforms, 0.016);
    if (enemy.grounded) break;
  }
  assert.equal(enemy.grounded, true, 'Displaced creature falls under gravity and lands on terrain');
  assert.equal(enemy.y + enemy.height, plat1.y, 'Landed creature rests flush on platform top surface');

  // Scenario 9: Transizioni tra animazioni (hit & death) + verifica PNG border alpha = 0 e piedi a y = 112
  enemy.hitFlashTimer = 0.16;
  assert.equal(resolveEnemyAnimState(enemy), 'hit');
  assert.equal(selectEnemySheet(enemy).key, 'enemy_hit');

  enemy.hitFlashTimer = 0;
  enemy.hp = 0;
  enemy.state = 'ko';
  enemy.koTimer = 0.48;
  assert.equal(resolveEnemyAnimState(enemy), 'death');
  assert.equal(selectEnemySheet(enemy).key, 'enemy_death');
  assert.equal(ENEMY_ANIM_SPECS.idle.frameCount, 8);
  assert.equal(ENEMY_ANIM_SPECS.walk.frameCount, 8);
  assert.equal(ENEMY_ANIM_SPECS.run.frameCount, 8);
  assert.equal(ENEMY_ANIM_SPECS.attack.frameCount, 6);
  assert.equal(ENEMY_ANIM_SPECS.hit.frameCount, 4);
  assert.equal(ENEMY_ANIM_SPECS.death.frameCount, 8);

  // Decode all 6 enemy spritesheets and verify:
  // 1) Pure RGBA transparency with 0 non-transparent border pixels (no box/cutout artifact)
  // 2) Actual opaque paw pixels on the ground contact line (y in [109..112]) so feet never float!
  function decodePng(filePath: string) {
    const buf = fs.readFileSync(filePath);
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    const idatChunks: Buffer[] = [];
    let offset = 8;
    while (offset < buf.length) {
      const len = buf.readUInt32BE(offset);
      const type = buf.toString('ascii', offset + 4, offset + 8);
      if (type === 'IDAT') idatChunks.push(buf.subarray(offset + 8, offset + 8 + len));
      offset += 12 + len;
    }
    const raw = zlib.inflateSync(Buffer.concat(idatChunks));
    const stride = width * 4;
    const pixels = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
      const filter = raw[y * (stride + 1)];
      for (let i = 0; i < stride; i++) {
        const rawByte = raw[y * (stride + 1) + 1 + i];
        const a = i >= 4 ? pixels[y * stride + i - 4] : 0;
        const b = y > 0 ? pixels[(y - 1) * stride + i] : 0;
        const c = y > 0 && i >= 4 ? pixels[(y - 1) * stride + i - 4] : 0;
        let val = rawByte;
        if (filter === 1) val = (rawByte + a) & 0xff;
        else if (filter === 2) val = (rawByte + b) & 0xff;
        else if (filter === 3) val = (rawByte + ((a + b) >> 1)) & 0xff;
        else if (filter === 4) {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          val = (rawByte + pr) & 0xff;
        }
        pixels[y * stride + i] = val;
      }
    }
    return { width, height, pixels };
  }

  for (const [stateName, sheet] of Object.entries(gameAssets.shadowCreature)) {
    const fullPath = path.resolve(process.cwd(), 'public', sheet.url.replace(/^\//, ''));
    const decoded = decodePng(fullPath);
    assert.equal(decoded.width, sheet.frameCount * 128);
    assert.equal(decoded.height, 128);
    assert.equal(sheet.anchorX, 64);
    assert.equal(sheet.anchorY, 112);

    for (let f = 0; f < sheet.frameCount; f++) {
      const fx0 = f * 128;
      let borderNonZero = 0;
      let groundContactPixels = 0;
      for (let y = 0; y < 128; y++) {
        for (let x = 0; x < 128; x++) {
          const alpha = decoded.pixels[(y * decoded.width + (fx0 + x)) * 4 + 3];
          if (x === 0 || x === 127 || y === 0 || y === 127) {
            if (alpha > 0) borderNonZero++;
          }
          if (y >= 109 && y <= 112 && alpha >= 140) {
            groundContactPixels++;
          }
        }
      }
      assert.equal(
        borderNonZero,
        0,
        `ShadowCreature ${stateName} frame ${f} must have 0 border pixels`
      );
      if (stateName !== 'death' || f < 4) {
        assert.ok(
          groundContactPixels >= 10,
          `ShadowCreature ${stateName} frame ${f} must have solid paw contact pixels at ground line y=109..112 (found ${groundContactPixels})`
        );
      }
    }
  }
});

test('12. Fase 1.5: Dynamic Multidirectional 8-Way Digital D-Pad & Multi-Touch (all 15 mandatory scenarios)', () => {
  const radius = 70;

  // Scenario 1: Movimento a sinistra (LEFT)
  const leftRes = evaluateDPadTouchOffset(-52, 0, radius);
  assert.equal(leftRes.direction, 'LEFT');
  assert.equal(leftRes.inDeadZone, false);
  assert.deepEqual(leftRes.axes, { left: true, right: false, up: false, down: false });

  // Scenario 2: Movimento a destra (RIGHT)
  const rightRes = evaluateDPadTouchOffset(52, 0, radius);
  assert.equal(rightRes.direction, 'RIGHT');
  assert.equal(rightRes.inDeadZone, false);
  assert.deepEqual(rightRes.axes, { left: false, right: true, up: false, down: false });

  // Scenario 3: Direzione SU (UP)
  const upRes = evaluateDPadTouchOffset(0, -52, radius);
  assert.equal(upRes.direction, 'UP');
  assert.deepEqual(upRes.axes, { left: false, right: false, up: true, down: false });

  // Scenario 4: Direzione GIÙ (DOWN)
  const downRes = evaluateDPadTouchOffset(0, 52, radius);
  assert.equal(downRes.direction, 'DOWN');
  assert.deepEqual(downRes.axes, { left: false, right: false, up: false, down: true });

  // Scenario 5: Tutte e quattro le diagonali (UP_LEFT, UP_RIGHT, DOWN_LEFT, DOWN_RIGHT)
  const upLeftRes = evaluateDPadTouchOffset(-44, -44, radius);
  assert.equal(upLeftRes.direction, 'UP_LEFT');
  assert.deepEqual(upLeftRes.axes, { left: true, right: false, up: true, down: false });

  const upRightRes = evaluateDPadTouchOffset(44, -44, radius);
  assert.equal(upRightRes.direction, 'UP_RIGHT');
  assert.deepEqual(upRightRes.axes, { left: false, right: true, up: true, down: false });

  const downLeftRes = evaluateDPadTouchOffset(-44, 44, radius);
  assert.equal(downLeftRes.direction, 'DOWN_LEFT');
  assert.deepEqual(downLeftRes.axes, { left: true, right: false, up: false, down: true });

  const downRightRes = evaluateDPadTouchOffset(44, 44, radius);
  assert.equal(downRightRes.direction, 'DOWN_RIGHT');
  assert.deepEqual(downRightRes.axes, { left: false, right: true, up: false, down: true });

  // Verify diagonal horizontal speed is strictly identical to cardinal horizontal speed (digital D-Pad, NOT analog)
  const worldCard = createDemoLevel();
  const worldDiag = createDemoLevel();
  for (let i = 0; i < 20; i++) {
    updatePlayer(
      worldCard.player,
      { ...emptyInput(), ...rightRes.axes, dpadDirection: rightRes.direction },
      worldCard.platforms,
      worldCard.levelWidth,
      worldCard.pitY,
      0.016
    );
    updatePlayer(
      worldDiag.player,
      { ...emptyInput(), ...upRightRes.axes, dpadDirection: upRightRes.direction },
      worldDiag.platforms,
      worldDiag.levelWidth,
      worldDiag.pitY,
      0.016
    );
  }
  assert.equal(
    worldCard.player.vx,
    worldDiag.player.vx,
    'Diagonal UP_RIGHT must produce the exact same horizontal velocity as cardinal RIGHT'
  );
  assert.equal(
    worldCard.player.x,
    worldDiag.player.x,
    'Diagonal UP_RIGHT must advance horizontal position identically to cardinal RIGHT'
  );

  // Scenario 6: Ritorno al centro neutro (Dead zone)
  const neutralCenter = evaluateDPadTouchOffset(4, -3, radius);
  assert.equal(neutralCenter.direction, 'NEUTRAL');
  assert.equal(neutralCenter.inDeadZone, true);
  assert.deepEqual(neutralCenter.axes, { left: false, right: false, up: false, down: false });

  // Scenario 7 & 8: Trascinamento continuo tra tutte le 8 direzioni e rilascio del dito
  const ctrl = createMultiTouchControllerState();
  const startVec = startDPadPointer(ctrl, 1, 55, 0, radius);
  assert.equal(startVec.direction, 'RIGHT');

  const visitedDirections: string[] = [];
  for (const sector of DPAD_SECTORS_CLOCKWISE) {
    const rad = (sector.centerAngleDeg * Math.PI) / 180;
    const dx = Math.cos(rad) * 54;
    const dy = Math.sin(rad) * 54;
    const dragged = moveDPadPointer(ctrl, 1, dx, dy, radius);
    assert.ok(dragged, 'Active pointer drag must return updated vector');
    assert.equal(dragged.direction, sector.direction);
    assert.equal(
      dragged.axes.left && dragged.axes.right,
      false,
      'Opposite horizontal axes never active simultaneously'
    );
    assert.equal(
      dragged.axes.up && dragged.axes.down,
      false,
      'Opposite vertical axes never active simultaneously'
    );
    visitedDirections.push(dragged.direction);
  }
  assert.equal(visitedDirections.length, 8, 'Continuous drag smoothly visits all 8 sectors');

  // Scenario 7: Rilascio del dito
  const released = endDPadPointer(ctrl, 1);
  assert.ok(released);
  assert.equal(released.direction, 'NEUTRAL');
  assert.equal(ctrl.dpadPointerId, null);

  // Scenario 9, 10, 11, 12: Multi-touch simultaneo (D-Pad + SALTO, D-Pad + LUCE, D-Pad + PURIFICA, D-Pad + SALTO + LUCE)
  startDPadPointer(ctrl, 10, -56, 0, radius); // Pointer 10 holds LEFT on D-Pad
  assert.equal(ctrl.dpadVector.direction, 'LEFT');
  assert.equal(ctrl.dpadVector.axes.left, true);

  // Pointer 20 presses SALTO while D-Pad is held
  const jumpDown = pressActionPointer(ctrl, 'jump', 20);
  assert.equal(jumpDown.becamePressed, true);
  assert.equal(jumpDown.isPressed, true);
  assert.equal(ctrl.dpadVector.direction, 'LEFT', 'D-Pad stays active when SALTO is pressed');

  // Pointer 30 presses LUCE simultaneously (3 fingers: D-Pad + SALTO + LUCE)
  const lightDown = pressActionPointer(ctrl, 'light', 30);
  assert.equal(lightDown.becamePressed, true);
  assert.equal(lightDown.isPressed, true);
  assert.equal(ctrl.dpadVector.direction, 'LEFT', 'D-Pad stays active during 3-finger multi-touch');

  // Releasing LUCE and SALTO must NOT stop D-Pad movement
  const lightUp = releaseActionPointer(ctrl, 'light', 30);
  assert.equal(lightUp.becameReleased, true);
  assert.equal(ctrl.dpadVector.direction, 'LEFT', 'Releasing LUCE never interrupts D-Pad');

  const jumpUp = releaseActionPointer(ctrl, 'jump', 20);
  assert.equal(jumpUp.becameReleased, true);
  assert.equal(ctrl.dpadVector.direction, 'LEFT', 'Releasing SALTO never interrupts D-Pad');

  // Pointer 40 holds PURIFICA while D-Pad drags to DOWN_LEFT
  const purifyDown = pressActionPointer(ctrl, 'purify', 40);
  assert.equal(purifyDown.becamePressed, true);
  moveDPadPointer(ctrl, 10, -45, 45, radius);
  assert.equal(ctrl.dpadVector.direction, 'DOWN_LEFT');
  assert.equal(ctrl.activeActionPointers.purify.size, 1);

  const purifyUp = releaseActionPointer(ctrl, 'purify', 40);
  assert.equal(purifyUp.becameReleased, true);
  assert.equal(ctrl.dpadVector.direction, 'DOWN_LEFT', 'Releasing PURIFICA never interrupts D-Pad');

  // Scenario 13 & 15: touchcancel / pointercancel & assenza di input bloccati
  resetAllMultiTouchState(ctrl);
  assert.equal(ctrl.dpadPointerId, null);
  assert.equal(ctrl.dpadVector.direction, 'NEUTRAL');
  assert.equal(ctrl.activeActionPointers.jump.size, 0);
  assert.equal(ctrl.activeActionPointers.light.size, 0);
  assert.equal(ctrl.activeActionPointers.purify.size, 0);

  // Scenario 14: Cambio orientamento e ridimensionamento finestra (phone 844x390 & tablet 1024x768 rects)
  const phoneRect = { left: 16, top: 230, width: 128, height: 128 };
  const tabletRect = { left: 24, top: 576, width: 168, height: 168 };
  const phoneRight = evaluateDPadClientPoint(phoneRect.left + 115, phoneRect.top + 64, phoneRect);
  const tabletUpLeft = evaluateDPadClientPoint(tabletRect.left + 25, tabletRect.top + 25, tabletRect);
  assert.equal(phoneRight.direction, 'RIGHT');
  assert.equal(tabletUpLeft.direction, 'UP_LEFT');
  assert.deepEqual(dpadDirectionToAxes('NEUTRAL'), {
    left: false,
    right: false,
    up: false,
    down: false,
  });
});

test('13. Fase 2 — Primo Livello Completo "Foresta Avvizzita": 5 Sezioni, Raggiungibilità, Checkpoint, Segreto, Ricompense, Ostacoli e Collisioni', async () => {
  const {
    activateCheckpoint,
    createForestaAvvizzitaLevel,
    FORESTA_AVVIZZITA_SECTIONS,
    resolveCurrentSection,
    respawnAtCheckpoint,
  } = await import('./level');
  const { aabbOverlap, PLAYER_CONSTANTS } = await import('./player');

  const world = createForestaAvvizzitaLevel();
  const input = emptyInput();

  // 1. Caricamento, identità del livello e 5 sezioni riconoscibili
  assert.equal(world.levelId, 'foresta_avvizzita');
  assert.equal(world.levelTitle, 'Foresta Avvizzita');
  assert.equal(world.levelWidth, 9200);
  assert.equal(world.sections.length, 5);
  assert.deepEqual(
    world.sections.map((s) => s.name),
    [
      'Ingresso della Foresta',
      'Sentiero Spezzato',
      'Bosco Corrotto',
      'Radure Dimenticate',
      'Cuore Avvizzito',
    ]
  );

  // Verify contiguous coverage of all 5 sections from 0 to 9200
  assert.equal(FORESTA_AVVIZZITA_SECTIONS[0].startX, 0);
  for (let i = 0; i < FORESTA_AVVIZZITA_SECTIONS.length - 1; i++) {
    assert.equal(
      FORESTA_AVVIZZITA_SECTIONS[i].endX,
      FORESTA_AVVIZZITA_SECTIONS[i + 1].startX,
      `Section ${i + 1} endX must connect seamlessly to Section ${i + 2} startX`
    );
  }
  assert.equal(
    FORESTA_AVVIZZITA_SECTIONS[FORESTA_AVVIZZITA_SECTIONS.length - 1].endX,
    world.levelWidth
  );

  // Verify section resolution along X
  world.player.x = 300;
  assert.equal(resolveCurrentSection(world).id, 'sec_ingresso');
  world.player.x = 2500;
  assert.equal(resolveCurrentSection(world).id, 'sec_sentiero');
  world.player.x = 4500;
  assert.equal(resolveCurrentSection(world).id, 'sec_bosco');
  world.player.x = 6800;
  assert.equal(resolveCurrentSection(world).id, 'sec_radure');
  world.player.x = 8500;
  assert.equal(resolveCurrentSection(world).id, 'sec_cuore');

  // Reset player to initial spawn
  world.player.x = 220;
  world.player.y = 476;

  // 2. Verifica punti di spawn, nemici, cristalli, checkpoint e assenza di compenetrazioni con piattaforme
  assert.equal(world.checkpoints.length, 3, 'Must have 3 recognizable checkpoints');
  assert.equal(world.corruptedZones.length, 5, 'Must have 5 corrupted zones across the forest');
  assert.equal(world.lightSources.length, 6, 'Must have 6 Sanctuary Light Sources');
  assert.equal(world.enemies.length, 10, 'Must have 10 Shadow Creatures across all 3 archetypes');
  assert.equal(world.secretAreas.length, 1, 'Must have 1 optional secret sanctuary area');
  assert.equal(world.hazards.length, 3, 'Must have 3 environmental bramble hazards');
  assert.ok(world.collectibles.length >= 20, 'Must distribute light crystals along the path');

  // Check player spawn is not inside any platform
  for (const plat of world.platforms) {
    assert.equal(
      aabbOverlap(
        world.player.x,
        world.player.y,
        world.player.width,
        world.player.height - 1,
        plat.x,
        plat.y,
        plat.width,
        plat.height
      ),
      false,
      `Player spawn must not overlap interior of platform ${plat.id}`
    );
  }

  // Check all 10 enemies are within bounds, grounded on a platform, and never inside a platform interior
  for (const e of world.enemies) {
    assert.ok(e.x >= 0 && e.x + e.width <= world.levelWidth, `Enemy ${e.id} within level X`);
    assert.ok(e.y >= 0 && e.y + e.height < world.pitY, `Enemy ${e.id} above pitY`);
    const hostPlat = world.platforms.find(
      (p) => e.x >= p.x && e.x + e.width <= p.x + p.width && e.y + e.height === p.y
    );
    assert.ok(hostPlat, `Enemy ${e.id} (${e.name}) rests flush on platform top`);
    assert.ok(
      e.patrolMinX >= hostPlat.x && e.patrolMaxX <= hostPlat.x + hostPlat.width,
      `Enemy ${e.id} patrol bounds stay strictly on its host platform ${hostPlat.id}`
    );
    for (const p of world.platforms) {
      if (p.id === hostPlat.id) continue;
      assert.equal(
        aabbOverlap(e.x, e.y, e.width, e.height, p.x, p.y, p.width, p.height),
        false,
        `Enemy ${e.id} must not intersect overhead or adjacent platform ${p.id}`
      );
    }
  }

  // Check all collectibles are in playable space and not buried inside any solid platform
  for (const item of world.collectibles) {
    assert.ok(item.x > 0 && item.x < world.levelWidth, `Collectible ${item.id} within level X`);
    assert.ok(item.y > 0 && item.y < world.pitY, `Collectible ${item.id} above pitY`);
    for (const p of world.platforms) {
      const insidePlat =
        item.x > p.x + 2 &&
        item.x < p.x + p.width - 2 &&
        item.y > p.y + 2 &&
        item.y < p.y + p.height - 2;
      assert.equal(
        insidePlat,
        false,
        `Collectible ${item.id} must not be buried inside platform ${p.id}`
      );
    }
  }

  // 3. Raggiungibilità fisica dell’uscita (percorso principale) e del percorso segreto + via di recupero
  const maxJumpHeight =
    (PLAYER_CONSTANTS.JUMP_VELOCITY * PLAYER_CONSTANTS.JUMP_VELOCITY) /
    (2 * PLAYER_CONSTANTS.GRAVITY); // ~107.6 px
  assert.ok(maxJumpHeight > 100, 'Max jump height is > 100px');

  const getPlat = (id: string) => {
    const found = world.platforms.find((p) => p.id === id);
    assert.ok(found, `Platform ${id} must exist`);
    return found;
  };

  const mainPathChain = [
    'plat_start',
    'plat_step_1',
    'plat_step_2',
    'plat_corrupted_1',
    'plat_sanctuary_cp1',
    'plat_broken_1',
    'plat_broken_2',
    'plat_broken_3',
    'plat_broken_4',
    'plat_corrupted_2',
    'plat_grove_entry',
    'plat_corrupted_3',
    'plat_bosco_bridge',
    'plat_corrupted_4',
    'plat_sanctuary_cp2',
    'plat_glade_main_1',
    'plat_glade_main_2',
    'plat_glade_rejoin',
    'plat_corrupted_5',
    'plat_final_sanctuary',
  ];

  for (let i = 0; i < mainPathChain.length - 1; i++) {
    const a = getPlat(mainPathChain[i]);
    const b = getPlat(mainPathChain[i + 1]);
    const horizontalGap = b.x - (a.x + a.width);
    const upwardStep = a.y - b.y; // positive if b is higher than a
    assert.ok(
      horizontalGap <= 90,
      `Main path gap ${a.id} -> ${b.id} (${horizontalGap}px) must be comfortably jumpable (<= 90px)`
    );
    assert.ok(
      upwardStep <= maxJumpHeight - 20,
      `Main path upward step ${a.id} -> ${b.id} (${upwardStep}px) must be well below maxJumpHeight (${maxJumpHeight.toFixed(1)}px)`
    );
  }

  // Verify Secret Path reachability (plat_sanctuary_cp2 -> step1 -> step2 -> sanctuary -> rejoin)
  const secretChain = [
    'plat_sanctuary_cp2',
    'plat_secret_step1',
    'plat_secret_step2',
    'plat_secret_sanctuary',
    'plat_glade_rejoin',
  ];
  for (let i = 0; i < secretChain.length - 1; i++) {
    const a = getPlat(secretChain[i]);
    const b = getPlat(secretChain[i + 1]);
    const horizontalGap = Math.max(0, b.x - (a.x + a.width));
    const upwardStep = a.y - b.y;
    assert.ok(
      horizontalGap <= 115,
      `Secret path gap ${a.id} -> ${b.id} (${horizontalGap}px) must be jumpable`
    );
    assert.ok(
      upwardStep <= maxJumpHeight - 25,
      `Secret path upward step ${a.id} -> ${b.id} (${upwardStep}px) must be reachable`
    );
  }

  // Verify Lower Recovery Valley under Sentiero Spezzato lets the player climb back up without getting stuck
  const valley = getPlat('plat_recovery_valley');
  const recStep1 = getPlat('plat_recovery_step1');
  const recStep2 = getPlat('plat_recovery_step2');
  const broken1 = getPlat('plat_broken_1');
  const corr2 = getPlat('plat_corrupted_2');
  assert.ok(valley.y - recStep1.y <= 75, 'Can jump from recovery valley to recovery step 1');
  assert.ok(recStep1.y - broken1.y <= 65, 'Can jump from recovery step 1 back to plat_broken_1');
  assert.ok(valley.y - recStep2.y <= 75, 'Can jump from recovery valley to recovery step 2');
  assert.ok(recStep2.y - corr2.y <= 45, 'Can jump from recovery step 2 onto plat_corrupted_2');

  // 4. Attivazione e ripristino dai Checkpoint
  const cp1 = world.checkpoints[0];
  const cp2 = world.checkpoints[1];
  assert.equal(cp1.activated, false);
  assert.equal(world.activeCheckpointId, null);

  // Move player to Checkpoint 1 with reduced HP & energy
  world.player.hp = 3;
  world.light.energy = 40;
  world.player.x = cp1.x - world.player.width * 0.5;
  world.player.y = cp1.y - world.player.height;
  stepWorld(world, input, 0.016, 1280, 720);

  assert.equal(cp1.activated, true, 'Checkpoint 1 activates when reached');
  assert.equal(world.activeCheckpointId, cp1.id);
  assert.equal(world.player.hp, 4, 'Activating checkpoint restores +1 HP');
  assert.ok(world.light.energy >= 75, 'Activating checkpoint restores light energy');

  // Activate Checkpoint 2 later in the level
  activateCheckpoint(world, cp2);
  assert.equal(world.activeCheckpointId, cp2.id);

  // Simulate falling into a pit chasm: player automatically recovers at active Checkpoint 2
  world.player.x = 5935;
  world.player.y = world.pitY + 50;
  stepWorld(world, input, 0.016, 1280, 720);
  assert.equal(world.player.x, cp2.spawnX, 'Pit fall restores player X to active checkpoint');
  assert.equal(world.player.y, cp2.spawnY, 'Pit fall restores player Y to active checkpoint');

  // Simulate full defeat & respawnAtCheckpoint()
  world.player.hp = 0;
  world.light.energy = 10;
  const respawned = respawnAtCheckpoint(world);
  assert.equal(respawned, true);
  assert.equal(world.player.x, cp2.spawnX);
  assert.equal(world.player.y, cp2.spawnY);
  assert.equal(world.player.hp, world.player.maxHp, 'Respawn at checkpoint restores full HP');
  assert.equal(world.light.energy, world.light.maxEnergy, 'Respawn at checkpoint restores full Light');

  // 5. Raccolta delle ricompense e Percorso Segreto ("Santuario Nascosto delle Alture")
  const firstCrystal = world.collectibles[0];
  world.light.energy = 50;
  world.player.x = firstCrystal.x - world.player.width * 0.5;
  world.player.y = firstCrystal.y - world.player.height * 0.5;
  stepWorld(world, input, 0.016, 1280, 720);
  assert.equal(firstCrystal.collected, true, 'Crystal is collected on contact');
  assert.equal(world.stats.crystalsCollected, 1);
  assert.ok(world.light.energy > 65, 'Crystal restores light energy');

  // Reach Secret Sanctuary and collect the Ancient Sun-Heart Relic
  const secretArea = world.secretAreas[0];
  const sunRelic = world.collectibles.find((c) => c.id === 'relic_sun_heart')!;
  assert.equal(secretArea.discovered, false);
  assert.equal(sunRelic.collected, false);

  world.player.hp = 3;
  world.light.energy = 25;
  world.player.x = sunRelic.x - world.player.width * 0.5;
  world.player.y = sunRelic.y - world.player.height * 0.5;
  stepWorld(world, input, 0.016, 1280, 720);

  assert.equal(secretArea.discovered, true, 'Secret Sanctuary is marked as discovered');
  assert.equal(sunRelic.collected, true, 'Sun-Heart Relic is collected');
  assert.equal(world.player.maxHp, 6, 'Sun-Heart Relic permanently increases maxHp from 5 to 6');
  assert.equal(world.player.hp, 6, 'Sun-Heart Relic heals player to full 6/6 HP');
  assert.equal(world.light.energy, 100, 'Sun-Heart Relic restores light energy to 100');

  // 6. Ostacoli ambientali (Rovi d’Ombra) e neutralizzazione tramite purificazione
  const hazard1 = world.hazards[0];
  const linkedZone = world.corruptedZones.find((z) => z.id === hazard1.linkedCorruptedZoneId)!;
  assert.equal(hazard1.neutralized, false);

  world.player.invulnTimer = 0;
  world.hitstopTimer = 0;
  const hpBeforeHazard = world.player.hp;
  world.player.x = hazard1.x + 15;
  world.player.y = hazard1.y + hazard1.height - world.player.height;
  stepWorld(world, input, 0.016, 1280, 720);
  assert.equal(
    world.player.hp,
    hpBeforeHazard - 1,
    'Active corrupted brambles deal 1 contact damage'
  );

  // Purify linked zone -> hazard becomes neutralized and harmless
  linkedZone.purification = 100;
  linkedZone.isPurified = true;
  world.hitstopTimer = 0;
  world.player.invulnTimer = 0;
  const hpAfterPurify = world.player.hp;
  world.player.x = hazard1.x + 15;
  world.player.y = hazard1.y + hazard1.height - world.player.height;
  stepWorld(world, input, 0.016, 1280, 720);
  assert.equal(hazard1.neutralized, true, 'Purifying zone neutralizes linked bramble hazard');
  assert.equal(world.player.hp, hpAfterPurify, 'Neutralized hazard deals 0 damage');

  // 7. Conclusione del livello all'Altare della Rinascita
  world.hitstopTimer = 0;
  world.player.x = world.goalPortal.x - world.player.width * 0.5;
  world.player.y = world.goalPortal.y - world.player.height * 0.5;
  const endRes = stepWorld(world, input, 0.016, 1280, 720);
  assert.equal(endRes.outcome, 'victory');
  assert.equal(endRes.summary?.levelTitle, 'Foresta Avvizzita');
  assert.equal(endRes.summary?.secretDiscovered, true);
  assert.ok((endRes.summary?.crystalsCollected ?? 0) >= 2);
  assert.ok((endRes.summary?.checkpointsActivated ?? 0) >= 2);
});






