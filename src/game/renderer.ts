import {
  computeFrameIndex,
  drawSpriteSheetFrame,
  gameAssets,
  initGameAssets,
  selectEnemySheet,
  selectProtagonistSheet,
  TextureAsset,
} from './assets';
import {
  CameraState,
  CorruptedZone,
  LightBeam,
  LightSource,
  Platform,
  PlayerState,
  ScreenShakeReason,
  ShadowCreature,
  WorldState,
} from './types';

export interface ScreenShakeOffset {
  offsetX: number;
  offsetY: number;
  angleRad: number;
  envelope: number;
}

export function triggerScreenShake(
  camera: CameraState,
  reason: ScreenShakeReason,
  customIntensity?: number,
  customDuration?: number
): void {
  if (reason === 'player_damage') {
    const intensity = customIntensity ?? 16;
    const duration = customDuration ?? 0.38;
    camera.shakeTrauma = Math.min(1, camera.shakeTrauma + 0.85);
    camera.shakeIntensity = Math.max(camera.shakeIntensity, intensity);
    camera.shakeDuration = Math.max(camera.shakeDuration, duration);
    camera.shakeTimer = Math.max(camera.shakeTimer, duration);
    camera.shakeReason = 'player_damage';
    camera.flashAlpha = 0.42;
    camera.flashColor = '#f43f5e';
  } else if (reason === 'enemy_destroyed') {
    const intensity = customIntensity ?? 14;
    const duration = customDuration ?? 0.34;
    camera.shakeTrauma = Math.min(1, camera.shakeTrauma + 0.78);
    camera.shakeIntensity = Math.max(camera.shakeIntensity, intensity);
    camera.shakeDuration = Math.max(camera.shakeDuration, duration);
    camera.shakeTimer = Math.max(camera.shakeTimer, duration);
    camera.shakeReason = 'enemy_destroyed';
    camera.flashAlpha = 0.34;
    camera.flashColor = '#e879f9';
  } else if (reason === 'combat_hit') {
    const intensity = customIntensity ?? 7;
    const duration = customDuration ?? 0.18;
    camera.shakeTrauma = Math.min(1, camera.shakeTrauma + 0.38);
    camera.shakeIntensity = Math.max(camera.shakeIntensity, intensity);
    camera.shakeDuration = Math.max(camera.shakeDuration, duration);
    camera.shakeTimer = Math.max(camera.shakeTimer, duration);
    if (camera.shakeReason === 'none') {
      camera.shakeReason = 'combat_hit';
    }
  }
}

export function updateScreenShake(camera: CameraState, dt: number): void {
  if (camera.shakeTrauma > 0) {
    camera.shakeTrauma = Math.max(0, camera.shakeTrauma - 2.3 * dt);
  }
  if (camera.shakeTimer > 0) {
    camera.shakeTimer = Math.max(0, camera.shakeTimer - dt);
    if (camera.shakeTimer <= 0) {
      camera.shakeIntensity = 0;
      camera.shakeDuration = 0;
      camera.shakeReason = 'none';
    }
  }
  if (camera.flashAlpha > 0) {
    camera.flashAlpha = Math.max(0, camera.flashAlpha - 1.45 * dt);
  }
}

export function computeScreenShakeOffset(
  camera: CameraState,
  timeSec: number
): ScreenShakeOffset {
  const timerRatio =
    camera.shakeDuration > 0
      ? Math.max(0, Math.min(1, camera.shakeTimer / camera.shakeDuration))
      : 0;
  const traumaEnvelope = camera.shakeTrauma * camera.shakeTrauma;
  const envelope = Math.max(traumaEnvelope, timerRatio * timerRatio);

  if (envelope <= 0.001) {
    return { offsetX: 0, offsetY: 0, angleRad: 0, envelope: 0 };
  }

  const maxAmp = Math.max(12, camera.shakeIntensity);
  const waveX = Math.sin(timeSec * 67.3) * 0.68 + Math.cos(timeSec * 113.7) * 0.32;
  const waveY = Math.cos(timeSec * 73.1) * 0.68 + Math.sin(timeSec * 97.9) * 0.32;
  const waveRot = Math.sin(timeSec * 53.5);

  return {
    offsetX: waveX * maxAmp * envelope,
    offsetY: waveY * maxAmp * envelope,
    angleRad: waveRot * 0.014 * envelope,
    envelope,
  };
}

let darknessCanvas: HTMLCanvasElement | null = null;
let darknessCtx: CanvasRenderingContext2D | null = null;

function ensureDarknessBuffer(width: number, height: number): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  if (!darknessCanvas) {
    darknessCanvas = document.createElement('canvas');
    darknessCtx = darknessCanvas.getContext('2d');
  }
  if (darknessCanvas.width !== width || darknessCanvas.height !== height) {
    darknessCanvas.width = width;
    darknessCanvas.height = height;
  }
  return darknessCtx;
}

interface TrailMote {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  isCyan: boolean;
}

const TRAIL_POOL_SIZE = 48;
const playerTrailPool: TrailMote[] = Array.from({ length: TRAIL_POOL_SIZE }, () => ({
  active: false,
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  size: 2,
  life: 0,
  maxLife: 0.6,
  isCyan: false,
}));
let trailCursor = 0;
let lastTrailTime = 0;

function updateAndDrawPlayerTrail(
  ctx: CanvasRenderingContext2D,
  player: PlayerState,
  timeSec: number
): void {
  const dt = Math.min(0.05, Math.max(0.004, timeSec - lastTrailTime));
  lastTrailTime = timeSec;

  const speed = Math.hypot(player.vx, player.vy);
  const spawnInterval = speed > 60 ? 0.03 : 0.11;

  if ((timeSec % spawnInterval) < dt * 1.2) {
    const m = playerTrailPool[trailCursor];
    trailCursor = (trailCursor + 1) % TRAIL_POOL_SIZE;
    m.active = true;
    m.x = player.x + player.width * 0.5 - player.facing * 8 + Math.sin(timeSec * 43) * 6;
    m.y = player.y + player.height * 0.55 + Math.cos(timeSec * 37) * 8;
    m.vx = -player.vx * 0.18 + Math.sin(timeSec * 19) * 14;
    m.vy = -18 - Math.abs(Math.cos(timeSec * 29)) * 22;
    m.size = speed > 60 ? 3.2 : 2.2;
    m.maxLife = speed > 60 ? 0.55 : 0.75;
    m.life = m.maxLife;
    m.isCyan = trailCursor % 3 === 0;
  }

  for (let i = 0; i < TRAIL_POOL_SIZE; i++) {
    const m = playerTrailPool[i];
    if (!m.active) continue;
    m.life -= dt;
    if (m.life <= 0) {
      m.active = false;
      continue;
    }
    m.x += m.vx * dt;
    m.y += m.vy * dt;

    const alpha = Math.max(0, Math.min(1, m.life / m.maxLife));
    ctx.save();
    ctx.globalAlpha = alpha * 0.85;
    ctx.fillStyle = m.isCyan ? '#67e8f9' : '#fef08a';
    ctx.beginPath();
    ctx.arc(m.x, m.y, m.size * (0.4 + 0.6 * alpha), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

export function renderWorld(
  ctx: CanvasRenderingContext2D,
  world: WorldState,
  viewportWidth: number,
  viewportHeight: number,
  timeSec: number
): void {
  // Ensure PNG asset pipeline is initialized once
  initGameAssets();

  ctx.save();

  const shake = computeScreenShakeOffset(world.camera, timeSec);
  if (shake.envelope > 0.001) {
    const cx = viewportWidth * 0.5;
    const cy = viewportHeight * 0.5;
    ctx.translate(cx + shake.offsetX, cy + shake.offsetY);
    ctx.rotate(shake.angleRad);
    ctx.translate(-cx, -cy);
  }

  const camX = Math.round(world.camera.x + shake.offsetX * 0.45);
  const camY = Math.round(world.camera.y + shake.offsetY * 0.45);

  // 1. LAYER 1 (BACKGROUND) & LAYER 2 (MIDGROUND): Illustrated Sky, Gothic Citadel, Ruined Viaducts & Waterfalls
  drawParallaxEnvironment(ctx, camX, camY, viewportWidth, viewportHeight, timeSec);

  ctx.save();
  ctx.translate(-camX, -camY);

  // 2. Midground World Props (Stone Ruin Arches, Moss Archways, Hanging Golden Lantern)
  drawMidgroundLevelStructures(ctx, world, timeSec);

  // 3. Corrupted / Purified Zones (0% -> 50% -> 100% Illustrated Tree & Flora Transformation)
  for (const zone of world.corruptedZones) {
    drawCorruptedZone(ctx, zone, timeSec);
  }

  // 4. LAYER 3 (FOREGROUND): Illustrated Tileset Platforms, Stone Pillars, Mushrooms & Dynamic Light Reflections
  for (const plat of world.platforms) {
    drawPlatform(ctx, plat, world.corruptedZones, world.player, world.light.currentRadius, timeSec);
  }

  // 4b. Environmental Hazards (Corrupted Bramble Spikes -> Purified Cyan Flora)
  drawHazards(ctx, world, timeSec);

  // 4c. Sanctuary Checkpoints (Dormant Cyan Lantern -> Radiant Golden Beacon)
  drawCheckpoints(ctx, world, timeSec);

  // 4d. Secret Sanctuary Accents & Guiding Fireflies
  drawSecretAreaAccents(ctx, world, timeSec);

  // 5. Light Sources (Sanctuary Crystals)
  for (const src of world.lightSources) {
    drawLightSource(ctx, src, timeSec);
  }

  // 5b. Collectible Light Crystals & Ancient Sun-Heart Relic
  drawCollectibles(ctx, world, timeSec);

  // 6. Final Sanctuary Goal Portal
  drawGoalPortal(ctx, world, timeSec);

  // 7. Shadow Creatures (SHADOW_CREATURE — Multi-Frame Illustrated PNG Spritesheets)
  for (const enemy of world.enemies) {
    drawShadowCreature(ctx, enemy, timeSec);
  }

  // 8. Protagonist Movement Trail & Multi-Frame Illustrated PNG Spritesheets (8 Animations)
  updateAndDrawPlayerTrail(ctx, world.player, timeSec);

  const px = world.player.x + world.player.width * 0.5;
  const py = world.player.y + world.player.height * 0.5;
  const isPurifying =
    world.light.pulseBurstTimer > 0 ||
    world.corruptedZones.some(
      (z) =>
        !z.isPurified &&
        px >= z.x - 36 &&
        px <= z.x + z.width + 36 &&
        py >= z.y - 60 &&
        py <= z.y + z.height + 40
    );

  drawPlayerCreature(ctx, world.player, world.light.currentRadius, isPurifying, timeSec);

  // 9. LIGHT_BEAM Projectiles (Animated PNG Spritesheet)
  for (const beam of world.beams) {
    drawLightBeam(ctx, beam, timeSec);
  }

  // 10. Pooled Particles
  drawParticles(ctx, world, timeSec);

  ctx.restore();

  // 11. Foreground Decorative Framing Roots in Screen Space (1.15x Parallax)
  drawForegroundSilhouettes(ctx, camX, viewportWidth, viewportHeight);

  // 12. Dynamic Darkness Mask Overlay (0.5x Resolution Lightmap)
  drawDynamicDarknessMask(ctx, world, camX, camY, viewportWidth, viewportHeight, timeSec);

  // 13. Screen Shake Shockwave Rings & Hit Impact Sprites
  if (world.camera.flashAlpha > 0.01 || shake.envelope > 0.08) {
    drawScreenShakeFeedback(ctx, world, camX, camY, viewportWidth, viewportHeight, shake.envelope, timeSec);
  }

  // 14. Subtle Low-HP Peripheral Vignette
  if (world.player.hp <= 2) {
    const pulse = 0.25 + 0.12 * Math.sin(timeSec * 6);
    const vig = ctx.createRadialGradient(
      viewportWidth * 0.5,
      viewportHeight * 0.5,
      viewportHeight * 0.28,
      viewportWidth * 0.5,
      viewportHeight * 0.5,
      viewportWidth * 0.65
    );
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, `rgba(190, 18, 60, ${pulse.toFixed(3)})`);
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, viewportWidth, viewportHeight);
  }

  ctx.restore();
}

function drawParallaxEnvironment(
  ctx: CanvasRenderingContext2D,
  camX: number,
  camY: number,
  vw: number,
  vh: number,
  timeSec: number
): void {
  // Base Night Sky Gradient
  const skyGrad = ctx.createLinearGradient(0, 0, 0, vh);
  skyGrad.addColorStop(0, '#050613');
  skyGrad.addColorStop(0.38, '#100d26');
  skyGrad.addColorStop(0.75, '#191032');
  skyGrad.addColorStop(1, '#0e091e');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, vw, vh);

  // Twinkling Stars
  for (let i = 0; i < 36; i++) {
    const sx = (((i * 173 - camX * 0.02) % vw) + vw) % vw;
    const sy = (i * 47) % (vh * 0.52);
    const twinkle = 0.35 + 0.65 * Math.abs(Math.sin(timeSec * 1.8 + i));
    ctx.fillStyle =
      i % 4 === 0
        ? `rgba(254, 240, 138, ${twinkle * 0.7})`
        : `rgba(226, 232, 240, ${twinkle * 0.55})`;
    ctx.fillRect(sx, sy, i % 5 === 0 ? 2 : 1.5, i % 5 === 0 ? 2 : 1.5);
  }

  // LAYER 1 (BACKGROUND): Illustrated Sky, Crescent Moon & Gothic Citadel PNG
  const bgSky = gameAssets.environments.bgSkyCitadel;
  if (bgSky.loaded && bgSky.image) {
    const drawH = Math.min(vh * 0.68, 490);
    const drawW = drawH * (bgSky.width / bgSky.height);
    const citadelX = vw * 0.46 - camX * 0.05;
    const citadelY = -camY * 0.02;
    ctx.save();
    ctx.globalAlpha = 0.88;
    ctx.drawImage(bgSky.image, citadelX, citadelY, drawW, drawH);
    ctx.restore();
  }

  // LAYER 2 (MIDGROUND): Illustrated Ruined Viaducts, Forest & Waterfalls PNG
  const bgMid = gameAssets.environments.bgMidgroundRuins;
  if (bgMid.loaded && bgMid.image) {
    const tileH = Math.min(vh * 0.72, 520);
    const tileW = tileH * (bgMid.width / bgMid.height);
    const stepW = tileW - 76;
    const startOffset = -((camX * 0.24) % stepW);
    ctx.save();
    ctx.globalAlpha = 0.78;
    for (let x = startOffset - stepW; x < vw + stepW; x += stepW) {
      ctx.drawImage(bgMid.image, x, vh * 0.16 - camY * 0.08, tileW, tileH);
    }
    ctx.restore();
  }

  // Animated Cyan Waterfall Foam & Mist Pools in Midground across all 5 sections
  const waterfallPositions = [640, 1980, 2960, 4120, 5280, 6480, 7780];
  for (const wfWorldX of waterfallPositions) {
    const fallsX = wfWorldX - camX * 0.55;
    if (fallsX > -140 && fallsX < vw + 140) {
      const topY = vh * 0.26;
      const fallGrad = ctx.createLinearGradient(fallsX, topY, fallsX, vh);
      fallGrad.addColorStop(0, 'rgba(56, 189, 248, 0)');
      fallGrad.addColorStop(0.2, 'rgba(56, 189, 248, 0.3)');
      fallGrad.addColorStop(0.75, 'rgba(103, 232, 249, 0.48)');
      fallGrad.addColorStop(1, 'rgba(56, 189, 248, 0.12)');
      ctx.fillStyle = fallGrad;
      ctx.fillRect(fallsX - 24, topY, 48, vh - topY);

      ctx.fillStyle = 'rgba(224, 242, 254, 0.45)';
      for (let s = 0; s < 4; s++) {
        const sx = fallsX - 16 + s * 11;
        const sy = topY + ((timeSec * 140 + s * 85) % (vh - topY - 40));
        ctx.fillRect(sx, sy, 2.5, 32);
      }

      const mist = ctx.createRadialGradient(fallsX, vh - 30, 8, fallsX, vh - 30, 75);
      mist.addColorStop(0, 'rgba(103, 232, 249, 0.42)');
      mist.addColorStop(1, 'rgba(56, 189, 248, 0)');
      ctx.fillStyle = mist;
      ctx.beginPath();
      ctx.arc(fallsX, vh - 30, 75, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Suspended Bioluminescent Spores
  for (let i = 0; i < 26; i++) {
    const sx = (((i * 197 + timeSec * 14 - camX * 0.42) % vw) + vw) % vw;
    const sy = (((i * 113 + Math.sin(timeSec * 1.4 + i) * 26) % vh) + vh) % vh;
    ctx.fillStyle =
      i % 3 === 0
        ? 'rgba(254, 240, 138, 0.48)'
        : i % 3 === 1
        ? 'rgba(103, 232, 249, 0.38)'
        : 'rgba(232, 121, 249, 0.32)';
    ctx.beginPath();
    ctx.arc(sx, sy, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawMidgroundLevelStructures(
  ctx: CanvasRenderingContext2D,
  world: WorldState,
  timeSec: number
): void {
  // 1. Hanging Golden Sanctuary Lanterns (Illustrated PNG Asset)
  const lanternTex = gameAssets.environments.hangingLantern;
  const lanternLocations = [
    { x: 240, y: 328 },
    { x: 2740, y: 390 },
    { x: 4030, y: 300 },
    { x: 6600, y: 320 },
  ];

  for (let i = 0; i < lanternLocations.length; i++) {
    const loc = lanternLocations[i];
    const swing = Math.sin(timeSec * 2.1 + i * 1.3) * 3.5;
    const lx = loc.x + swing;
    const ly = loc.y;

    const lanternGlow = ctx.createRadialGradient(lx, ly, 4, lx, ly, 78);
    lanternGlow.addColorStop(0, 'rgba(255, 255, 255, 0.92)');
    lanternGlow.addColorStop(0.35, 'rgba(251, 191, 36, 0.52)');
    lanternGlow.addColorStop(1, 'rgba(245, 158, 11, 0)');
    ctx.fillStyle = lanternGlow;
    ctx.beginPath();
    ctx.arc(lx, ly, 78, 0, Math.PI * 2);
    ctx.fill();

    if (lanternTex.loaded && lanternTex.image) {
      ctx.drawImage(lanternTex.image, lx - 24, ly - 88, 48, 132);
    }
  }

  // 2. Illustrated Stone Ruin Archways & Moss-Draped Archways across all 5 sections
  const mossArch = gameAssets.environments.mossArchway;
  const stoneArch = gameAssets.environments.ruinArch;

  if (mossArch.loaded && mossArch.image) {
    ctx.drawImage(mossArch.image, 310, 520 - 128, 138, 132);
    ctx.drawImage(mossArch.image, 1885, 440 - 134, 146, 138);
    ctx.drawImage(mossArch.image, 3960, 470 - 132, 142, 134);
    ctx.drawImage(mossArch.image, 6035, 440 - 134, 146, 138);
    ctx.drawImage(mossArch.image, 6865, 226 - 132, 142, 134);
  }
  if (stoneArch.loaded && stoneArch.image) {
    ctx.drawImage(stoneArch.image, 840, 455 - 112, 74, 116);
    ctx.drawImage(stoneArch.image, 2570, 345 - 112, 74, 116);
    ctx.drawImage(stoneArch.image, 4510, 432 - 112, 74, 116);
    ctx.drawImage(stoneArch.image, 7320, 405 - 118, 78, 122);
    ctx.drawImage(stoneArch.image, 8735, 395 - 118, 78, 122);
  }

  // 3. Bioluminescent Butterflies fluttering near the initial grove & forgotten glades
  for (let b = 0; b < 3; b++) {
    const bx = 270 + b * 65 + Math.sin(timeSec * 2.2 + b * 2) * 24;
    const by = 430 - b * 28 + Math.cos(timeSec * 3.1 + b) * 14;
    const wing = Math.abs(Math.sin(timeSec * 12 + b));
    ctx.save();
    ctx.translate(bx, by);
    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.ellipse(-3, 0, 4.5 * wing, 3, -0.4, 0, Math.PI * 2);
    ctx.ellipse(3, 0, 4.5 * wing, 3, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  void world;
}

function drawCorruptedZone(
  ctx: CanvasRenderingContext2D,
  zone: CorruptedZone,
  timeSec: number
): void {
  const ratio = zone.purification / zone.maxPurification;
  const centerX = zone.x + zone.width * 0.5;
  const groundY = zone.y + zone.height;

  // Stage-dependent Atmospheric Glow
  if (ratio < 0.99) {
    const darkAlpha = (1 - ratio) * 0.52;
    const mistGrad = ctx.createRadialGradient(
      centerX,
      groundY - 40,
      20,
      centerX,
      groundY - 40,
      zone.width * 0.55
    );
    mistGrad.addColorStop(0, `rgba(192, 38, 211, ${darkAlpha.toFixed(3)})`);
    mistGrad.addColorStop(0.55, `rgba(88, 28, 135, ${(darkAlpha * 0.65).toFixed(3)})`);
    mistGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = mistGrad;
    ctx.fillRect(zone.x - 45, zone.y - 95, zone.width + 90, zone.height + 115);
  }

  if (ratio > 0.05) {
    const lightAlpha = ratio * 0.5;
    const pureGrad = ctx.createRadialGradient(
      centerX,
      groundY - 55,
      18,
      centerX,
      groundY - 55,
      zone.width * 0.62
    );
    pureGrad.addColorStop(0, `rgba(253, 224, 71, ${lightAlpha.toFixed(3)})`);
    pureGrad.addColorStop(0.5, `rgba(52, 211, 153, ${(lightAlpha * 0.65).toFixed(3)})`);
    pureGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = pureGrad;
    ctx.fillRect(zone.x - 60, zone.y - 130, zone.width + 120, zone.height + 150);
  }

  // Illustrated 3-Stage Purification Tree Assets (0% -> 50% -> 100%)
  const t0 = gameAssets.environments.treeCorrupted0;
  const t50 = gameAssets.environments.treeTransforming50;
  const t100 = gameAssets.environments.treePurified100;

  const treeW = 290;
  const treeH = 165;
  const treeX = centerX - treeW * 0.5;
  const treeY = groundY - treeH + 14;

  if (ratio < 0.45 && t0.loaded && t0.image) {
    ctx.drawImage(t0.image, treeX, treeY, treeW, treeH);
  } else if (ratio < 0.96 && t50.loaded && t50.image) {
    ctx.drawImage(t50.image, treeX, treeY, treeW, treeH);
  } else if (t100.loaded && t100.image) {
    ctx.drawImage(t100.image, treeX, treeY - 8, treeW * 1.06, treeH * 1.06);
  }

  // Illustrated Flora Props (Violet Crystals when Corrupted -> Cyan Bioluminescent Mushrooms when Purified)
  const mushTex = gameAssets.environments.mushroomCyan;
  const crysTex = gameAssets.environments.crystalViolet;

  for (let i = 0; i < zone.flora.length; i += 2) {
    const item = zone.flora[i];
    const fx = zone.x + item.offsetX;
    const fy = groundY;
    const isBloomed = zone.purification >= item.threshold;
    const sway = Math.sin(timeSec * 2.2 + item.offsetX) * 2;

    if (!isBloomed) {
      if (crysTex.loaded && crysTex.image) {
        const w = 32 * item.scale;
        const h = 68 * item.scale;
        ctx.drawImage(crysTex.image, fx - w * 0.5, fy - h + 6, w, h);
      }
    } else {
      if (mushTex.loaded && mushTex.image) {
        const w = 58 * item.scale;
        const h = 68 * item.scale;
        ctx.drawImage(mushTex.image, fx - w * 0.5 + sway, fy - h + 8, w, h);
      }
    }
  }
}

function selectPlatformTexture(
  plat: Platform,
  zoneRatio: number
): TextureAsset {
  if (plat.style === 'corrupted_ledge') {
    if (zoneRatio >= 0.85) return gameAssets.environments.platSanctuaryAltar;
    if (zoneRatio >= 0.4) return gameAssets.environments.platMossStone;
    return gameAssets.environments.platCorruptedLedge;
  }
  if (plat.style === 'sanctuary_altar') {
    return gameAssets.environments.platSanctuaryAltar;
  }
  if (plat.style === 'ancient_ruin') {
    return gameAssets.environments.platAncientRuin;
  }
  return gameAssets.environments.platMossStone;
}

function drawPlatform(
  ctx: CanvasRenderingContext2D,
  plat: Platform,
  zones: CorruptedZone[],
  player: PlayerState,
  auraRadius: number,
  timeSec: number
): void {
  let zoneRatio = 1;
  if (plat.corruptedZoneId) {
    const z = zones.find((zone) => zone.id === plat.corruptedZoneId);
    if (z) {
      zoneRatio = z.purification / z.maxPurification;
    }
  }

  // 1. Illustrated Stone Support Columns underneath elevated platforms
  const pillarTex =
    plat.width > 180
      ? gameAssets.environments.pillarTall
      : gameAssets.environments.pillarShort;
  if (plat.height <= 40 && pillarTex.loaded && pillarTex.image) {
    const pw = 54;
    const ph = 240;
    const px = plat.x + (plat.width - pw) * 0.5;
    ctx.drawImage(pillarTex.image, px, plat.y + plat.height - 6, pw, ph);
  }

  // 2. Solid Deep Stone Foundation Body (for tall ground ledges)
  const grad = ctx.createLinearGradient(plat.x, plat.y, plat.x, plat.y + plat.height);
  if (plat.style === 'corrupted_ledge' && zoneRatio < 0.85) {
    grad.addColorStop(0, '#1f1033');
    grad.addColorStop(0.35, '#120920');
    grad.addColorStop(1, '#07040e');
  } else {
    grad.addColorStop(0, '#1c263b');
    grad.addColorStop(0.38, '#101626');
    grad.addColorStop(1, '#060812');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(plat.x + 2, plat.y + 8, plat.width - 4, plat.height - 8);

  // 3. Tile the Illustrated Platform Texture along the platform's exact collision top & masonry rim
  const tex = selectPlatformTexture(plat, zoneRatio);
  if (tex.loaded && tex.image) {
    const tileH = Math.min(62, Math.max(34, plat.height));
    const tileW = Math.round(tileH * (tex.width / Math.max(1, tex.height)));

    ctx.save();
    ctx.beginPath();
    ctx.rect(plat.x - 4, plat.y - 4, plat.width + 8, plat.height + 10);
    ctx.clip();

    for (let x = plat.x; x < plat.x + plat.width; x += tileW - 8) {
      const drawW = Math.min(tileW, plat.x + plat.width - x + 6);
      ctx.drawImage(tex.image, x - 2, plat.y - 2, drawW, tileH);
    }
    ctx.restore();
  }

  // 4. Decorative Bioluminescent Cyan Mushroom Clusters on Safe / Ruin Platforms
  const mushTex = gameAssets.environments.mushroomCyan;
  if (plat.style !== 'corrupted_ledge' && mushTex.loaded && mushTex.image) {
    const sway = Math.sin(timeSec * 2 + plat.x) * 1.2;
    ctx.drawImage(mushTex.image, plat.x + 18 + sway, plat.y - 42, 42, 48);
  }

  // 5. Real-Time Dynamic Player Light Reflection along the Platform Top Edge
  const px = player.x + player.width * 0.5;
  const py = player.y + player.height;
  const vertDist = Math.abs(plat.y - py);
  if (
    vertDist < auraRadius * 0.85 &&
    px + auraRadius > plat.x &&
    px - auraRadius < plat.x + plat.width
  ) {
    const reflectLeft = Math.max(plat.x + 2, px - auraRadius * 0.75);
    const reflectRight = Math.min(plat.x + plat.width - 2, px + auraRadius * 0.75);
    if (reflectRight > reflectLeft) {
      const intensity = Math.max(0, 1 - vertDist / (auraRadius * 0.85)) * 0.75;
      const refGrad = ctx.createLinearGradient(reflectLeft, plat.y, reflectRight, plat.y);
      refGrad.addColorStop(0, 'rgba(254, 240, 138, 0)');
      refGrad.addColorStop(0.5, `rgba(254, 240, 138, ${intensity.toFixed(3)})`);
      refGrad.addColorStop(1, 'rgba(254, 240, 138, 0)');
      ctx.fillStyle = refGrad;
      ctx.fillRect(reflectLeft, plat.y - 2, reflectRight - reflectLeft, 6);
    }
  }
}

function drawLightSource(
  ctx: CanvasRenderingContext2D,
  src: LightSource,
  timeSec: number
): void {
  const bob = Math.sin(timeSec * 2.8 + src.pulsePhase) * 6;
  const cx = src.x;
  const cy = src.y + bob;

  const halo = ctx.createRadialGradient(cx, cy, 4, cx, cy, 86);
  halo.addColorStop(0, 'rgba(255, 255, 255, 0.98)');
  halo.addColorStop(0.32, 'rgba(254, 240, 138, 0.72)');
  halo.addColorStop(0.68, 'rgba(245, 158, 11, 0.28)');
  halo.addColorStop(1, 'rgba(245, 158, 11, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, 86, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(0, -25);
  ctx.lineTo(15, 0);
  ctx.lineTo(0, 25);
  ctx.lineTo(-15, 0);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.restore();
}

function drawHazards(
  ctx: CanvasRenderingContext2D,
  world: WorldState,
  timeSec: number
): void {
  const crysTex = gameAssets.environments.crystalViolet;
  const mushTex = gameAssets.environments.mushroomCyan;

  for (const haz of world.hazards) {
    const cx = haz.x + haz.width * 0.5;
    const groundY = haz.y + haz.height;

    if (haz.neutralized) {
      // Purified state: gentle cyan bioluminescent mushrooms
      if (mushTex.loaded && mushTex.image) {
        ctx.drawImage(mushTex.image, cx - 26, groundY - 46, 52, 52);
      }
      continue;
    }

    // Active corrupted bramble/spike cluster using existing violet crystal assets & dark aura
    const pulse = 0.55 + 0.25 * Math.sin(timeSec * 5.2 + haz.x);
    const aura = ctx.createRadialGradient(cx, groundY - 10, 4, cx, groundY - 10, haz.width * 0.72);
    aura.addColorStop(0, `rgba(225, 29, 72, ${(0.58 * pulse).toFixed(2)})`);
    aura.addColorStop(0.55, `rgba(147, 51, 234, ${(0.42 * pulse).toFixed(2)})`);
    aura.addColorStop(1, 'rgba(15, 7, 28, 0)');
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(cx, groundY - 10, haz.width * 0.72, 0, Math.PI * 2);
    ctx.fill();

    if (crysTex.loaded && crysTex.image) {
      const spikes = 3;
      for (let s = 0; s < spikes; s++) {
        const sx = haz.x + 12 + (s * (haz.width - 24)) / (spikes - 1);
        const h = s === 1 ? 54 : 42;
        const w = s === 1 ? 28 : 22;
        ctx.drawImage(crysTex.image, sx - w * 0.5, groundY - h + 6, w, h);
      }
    }
  }
}

function drawCheckpoints(
  ctx: CanvasRenderingContext2D,
  world: WorldState,
  timeSec: number
): void {
  const stoneArch = gameAssets.environments.ruinArch;
  const lanternTex = gameAssets.environments.hangingLantern;
  const waveSheet = gameAssets.effects.purifyWave;

  for (const cp of world.checkpoints) {
    const isActive = cp.activated;
    const isCurrent = world.activeCheckpointId === cp.id;
    const cx = cp.x;
    const groundY = cp.y;

    // 1. Radiant Sanctuary Halo & Vertical Light Pillar when activated
    const haloRadius = isActive ? 105 : 64;
    const halo = ctx.createRadialGradient(cx, groundY - 46, 6, cx, groundY - 46, haloRadius);
    if (isActive) {
      halo.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
      halo.addColorStop(0.32, 'rgba(254, 240, 138, 0.72)');
      halo.addColorStop(0.68, 'rgba(52, 211, 153, 0.34)');
      halo.addColorStop(1, 'rgba(52, 211, 153, 0)');
    } else {
      halo.addColorStop(0, 'rgba(186, 230, 253, 0.65)');
      halo.addColorStop(0.5, 'rgba(56, 189, 248, 0.25)');
      halo.addColorStop(1, 'rgba(56, 189, 248, 0)');
    }
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, groundY - 46, haloRadius, 0, Math.PI * 2);
    ctx.fill();

    // 2. Illustrated Stone Arch & Hanging Sanctuary Lantern
    if (stoneArch.loaded && stoneArch.image) {
      ctx.drawImage(stoneArch.image, cx - 42, groundY - 118, 84, 122);
    }
    if (lanternTex.loaded && lanternTex.image) {
      const swing = Math.sin(timeSec * 2.4 + cp.x * 0.01) * 2.5;
      ctx.save();
      ctx.globalAlpha = isActive ? 1.0 : 0.72;
      ctx.drawImage(lanternTex.image, cx - 18 + swing, groundY - 108, 36, 96);
      ctx.restore();
    }

    // 3. Ground Sanctuary Wave Ring for active checkpoint
    if (isActive) {
      const frame = computeFrameIndex(waveSheet, timeSec);
      drawSpriteSheetFrame(
        ctx,
        waveSheet,
        frame,
        cx,
        groundY - 2,
        isCurrent ? 0.65 : 0.5,
        1,
        1.25,
        0.4,
        isCurrent ? 0.85 : 0.55
      );
    }
  }
}

function drawSecretAreaAccents(
  ctx: CanvasRenderingContext2D,
  world: WorldState,
  timeSec: number
): void {
  // Subtle golden firefly trail hinting at the secret ascent in Section 4
  const trailPoints = [
    { x: 6335, y: 405 },
    { x: 6390, y: 345 },
    { x: 6585, y: 270 },
    { x: 6760, y: 205 },
  ];
  for (let i = 0; i < trailPoints.length; i++) {
    const pt = trailPoints[i];
    const bobX = Math.sin(timeSec * 2.5 + i * 1.7) * 8;
    const bobY = Math.cos(timeSec * 3.1 + i * 1.3) * 6;
    const glow = ctx.createRadialGradient(
      pt.x + bobX,
      pt.y + bobY,
      1,
      pt.x + bobX,
      pt.y + bobY,
      16
    );
    glow.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    glow.addColorStop(0.45, 'rgba(253, 224, 71, 0.65)');
    glow.addColorStop(1, 'rgba(245, 158, 11, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(pt.x + bobX, pt.y + bobY, 16, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const secret of world.secretAreas) {
    const cx = secret.x + secret.width * 0.5;
    const cy = secret.y + secret.height * 0.55;
    const aura = ctx.createRadialGradient(cx, cy, 12, cx, cy, secret.width * 0.55);
    aura.addColorStop(0, secret.discovered ? 'rgba(254, 240, 138, 0.48)' : 'rgba(56, 189, 248, 0.25)');
    aura.addColorStop(0.6, 'rgba(52, 211, 153, 0.18)');
    aura.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(cx, cy, secret.width * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCollectibles(
  ctx: CanvasRenderingContext2D,
  world: WorldState,
  timeSec: number
): void {
  const particleSheet = gameAssets.effects.particles;

  for (let i = 0; i < world.collectibles.length; i++) {
    const item = world.collectibles[i];
    if (item.collected) continue;

    const bob = Math.sin(timeSec * 3.4 + i * 0.9) * 5;
    const cx = item.x;
    const cy = item.y + bob;
    const isRelic = item.kind === 'sun_relic';
    const radius = isRelic ? 46 : 28;

    const glow = ctx.createRadialGradient(cx, cy, 2, cx, cy, radius);
    if (isRelic) {
      glow.addColorStop(0, 'rgba(255, 255, 255, 1)');
      glow.addColorStop(0.35, 'rgba(253, 224, 71, 0.85)');
      glow.addColorStop(0.7, 'rgba(52, 211, 153, 0.42)');
      glow.addColorStop(1, 'rgba(245, 158, 11, 0)');
    } else {
      glow.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
      glow.addColorStop(0.4, 'rgba(103, 232, 249, 0.68)');
      glow.addColorStop(0.75, 'rgba(254, 240, 138, 0.28)');
      glow.addColorStop(1, 'rgba(56, 189, 248, 0)');
    }
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    // Draw animated particle sprite frame around collectible
    const frame = computeFrameIndex(particleSheet, timeSec + i * 0.25);
    drawSpriteSheetFrame(
      ctx,
      particleSheet,
      frame,
      cx,
      cy + 14,
      isRelic ? 0.52 : 0.34,
      1,
      1,
      1,
      0.92
    );
  }
}

function drawGoalPortal(
  ctx: CanvasRenderingContext2D,
  world: WorldState,
  timeSec: number
): void {
  const { x, y, radius } = world.goalPortal;

  const aura = ctx.createRadialGradient(x, y, 8, x, y, radius * 2.2);
  aura.addColorStop(0, 'rgba(255, 255, 255, 0.98)');
  aura.addColorStop(0.35, 'rgba(253, 224, 71, 0.72)');
  aura.addColorStop(0.7, 'rgba(56, 189, 248, 0.34)');
  aura.addColorStop(1, 'rgba(56, 189, 248, 0)');

  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(x, y, radius * 2.2, 0, Math.PI * 2);
  ctx.fill();

  // Illustrated Stone Archway framing the Sanctuary Portal
  const stoneArch = gameAssets.environments.ruinArch;
  if (stoneArch.loaded && stoneArch.image) {
    ctx.drawImage(stoneArch.image, x - 52, y - 68, 104, 136);
  }

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(timeSec * 0.8);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 14, Math.sin(a) * 14);
    ctx.lineTo(Math.cos(a) * 36, Math.sin(a) * 36);
    ctx.stroke();
  }
  ctx.restore();
}

function drawShadowCreature(
  ctx: CanvasRenderingContext2D,
  enemy: ShadowCreature,
  timeSec: number
): void {
  const cx = enemy.x + enemy.width * 0.5;
  const cy = enemy.y + enemy.height * 0.5;
  const groundY = enemy.y + enemy.height;

  const isDamaged = enemy.hitFlashTimer > 0;
  const isDissolving = enemy.state === 'ko';
  const isAttacking = enemy.state === 'windup' || enemy.state === 'attack';

  // 1. Dark Violet/Magenta Miasma Aura around the Shadow Creature
  const auraR = enemy.width * (isAttacking ? 1.35 : 1.12);
  const shadowGrad = ctx.createRadialGradient(cx, cy, 4, cx, cy, auraR);
  shadowGrad.addColorStop(
    0,
    isDamaged ? 'rgba(254, 240, 138, 0.7)' : 'rgba(192, 38, 211, 0.48)'
  );
  shadowGrad.addColorStop(0.55, 'rgba(88, 28, 135, 0.28)');
  shadowGrad.addColorStop(1, 'rgba(15, 7, 28, 0)');
  ctx.fillStyle = shadowGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, auraR, 0, Math.PI * 2);
  ctx.fill();

  // 2. Terrain-Anchored Ground Contact Shadow (eliminates floating optical illusion)
  if (!isDissolving || enemy.koTimer > 0.15) {
    const isGrounded = enemy.grounded ?? true;
    const compressBoost = Math.max(0.9, Math.min(1.15, enemy.scaleX ?? 1));
    const shadowRx = enemy.width * 0.56 * compressBoost * (isGrounded ? 1.0 : 0.78);
    const shadowRy = isGrounded ? 5.2 : 3.6;
    const shadowAlpha = isDissolving
      ? Math.max(0, (enemy.koTimer / 0.42) * 0.55)
      : isGrounded
        ? 0.68
        : 0.38;

    ctx.save();
    const contactGrad = ctx.createRadialGradient(
      cx,
      groundY,
      2,
      cx,
      groundY,
      shadowRx * 1.15
    );
    contactGrad.addColorStop(0, `rgba(8, 4, 18, ${shadowAlpha.toFixed(2)})`);
    contactGrad.addColorStop(0.6, `rgba(88, 28, 135, ${(shadowAlpha * 0.55).toFixed(2)})`);
    contactGrad.addColorStop(1, 'rgba(15, 7, 28, 0)');
    ctx.fillStyle = contactGrad;
    ctx.beginPath();
    ctx.ellipse(cx, groundY, shadowRx, shadowRy, 0, 0, Math.PI * 2);
    ctx.fill();

    // Subtle front & hind paw ground contact pads when grounded
    if (isGrounded && !isDissolving) {
      const pawOffset = enemy.width * 0.28;
      ctx.fillStyle = 'rgba(6, 3, 14, 0.58)';
      ctx.beginPath();
      ctx.ellipse(cx - pawOffset, groundY + 0.5, 6.5, 2.2, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + pawOffset, groundY + 0.5, 6.5, 2.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // 3. Render Multi-Frame Articulated Quadruped PNG Spritesheet via EnemyAnimationController
  const sheet = selectEnemySheet(enemy);
  const customProgress = isDissolving
    ? 1 - Math.max(0, enemy.koTimer / 0.42)
    : undefined;
  const frameIdx = enemy.animController
    ? enemy.animController.frameIndex
    : computeFrameIndex(sheet, timeSec + enemy.phaseOffset, customProgress);

  const renderScale = (enemy.height / 76) * 1.15;
  const stableScaleX = Math.max(0.91, Math.min(1.09, enemy.scaleX ?? 1));
  const stableScaleY = Math.max(0.91, Math.min(1.09, enemy.scaleY ?? 1));

  drawSpriteSheetFrame(
    ctx,
    sheet,
    frameIdx,
    cx,
    groundY,
    renderScale,
    enemy.facing,
    stableScaleX,
    stableScaleY,
    isDissolving ? Math.max(0.15, enemy.koTimer / 0.42) : 1
  );

  // 4. Compact HP pips above damaged or alerted enemy
  if (
    !isDissolving &&
    (enemy.hp < enemy.maxHp || (enemy.state !== 'patrol' && enemy.state !== 'idle'))
  ) {
    const pipW = 8;
    const gap = 3;
    const totalW = enemy.maxHp * pipW + (enemy.maxHp - 1) * gap;
    const startX = cx - totalW * 0.5;
    for (let p = 0; p < enemy.maxHp; p++) {
      ctx.fillStyle = p < enemy.hp ? '#e879f9' : 'rgba(30, 15, 45, 0.85)';
      ctx.fillRect(startX + p * (pipW + gap), enemy.y - 12, pipW, 4);
    }
  }
}

function drawPlayerCreature(
  ctx: CanvasRenderingContext2D,
  player: PlayerState,
  auraRadius: number,
  isPurifying: boolean,
  timeSec: number
): void {
  const cx = player.x + player.width * 0.5;
  const cy = player.y + player.height * 0.5;
  const groundY = player.y + player.height;
  const isDamaged = player.hurtFlashTimer > 0;

  // 1. Dynamic Bioluminescent Aura Emitted by the Creature
  const breathPulse = 1 + Math.sin(timeSec * 3.8) * 0.04;
  const haloR = Math.max(92, auraRadius * 0.52) * breathPulse;
  const auraGrad = ctx.createRadialGradient(cx, cy, 4, cx, cy, haloR);
  if (isDamaged) {
    auraGrad.addColorStop(0, 'rgba(255, 228, 230, 0.92)');
    auraGrad.addColorStop(0.32, 'rgba(251, 113, 133, 0.6)');
    auraGrad.addColorStop(0.7, 'rgba(225, 29, 72, 0.2)');
    auraGrad.addColorStop(1, 'rgba(225, 29, 72, 0)');
  } else {
    auraGrad.addColorStop(0, 'rgba(255, 255, 255, 0.92)');
    auraGrad.addColorStop(0.28, 'rgba(254, 240, 138, 0.68)');
    auraGrad.addColorStop(0.64, 'rgba(245, 158, 11, 0.25)');
    auraGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');
  }
  ctx.fillStyle = auraGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, haloR, 0, Math.PI * 2);
  ctx.fill();

  // 2. Ground Contact Shadow (only when grounded on a platform, never floating in mid-air)
  if (player.grounded && player.hp > 0) {
    ctx.save();
    const shadowGrad = ctx.createRadialGradient(cx, groundY, 2, cx, groundY, 22);
    shadowGrad.addColorStop(0, 'rgba(254, 240, 138, 0.32)');
    shadowGrad.addColorStop(0.55, 'rgba(15, 23, 42, 0.42)');
    shadowGrad.addColorStop(1, 'rgba(15, 23, 42, 0)');
    ctx.fillStyle = shadowGrad;
    ctx.beginPath();
    ctx.ellipse(cx, groundY, 20, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 3. Purify Wave Ground Rings when purifying
  if (isPurifying) {
    const waveSheet = gameAssets.effects.purifyWave;
    const waveFrame = computeFrameIndex(waveSheet, timeSec);
    drawSpriteSheetFrame(ctx, waveSheet, waveFrame, cx, groundY - 4, 0.65, 1, 1.3, 0.45, 0.78);
  }

  // 4. Render Multi-Frame Illustrated Protagonist PNG Spritesheet (8 Animations via AnimationController)
  const sheet = selectProtagonistSheet(player, isPurifying);
  const frameIdx = player.animController
    ? player.animController.frameIndex
    : computeFrameIndex(sheet, timeSec);

  const invulnAlpha =
    player.invulnTimer > 0 && !isDamaged && Math.floor(timeSec * 16) % 2 === 0
      ? 0.72
      : 1.0;

  const stableScaleX = Math.max(0.92, Math.min(1.08, player.scaleX));
  const stableScaleY = Math.max(0.92, Math.min(1.08, player.scaleY));

  drawSpriteSheetFrame(
    ctx,
    sheet,
    frameIdx,
    cx,
    groundY + 2,
    0.72,
    player.facing,
    stableScaleX,
    stableScaleY,
    invulnAlpha
  );
}

function drawLightBeam(
  ctx: CanvasRenderingContext2D,
  beam: LightBeam,
  timeSec: number
): void {
  const dir: 1 | -1 = beam.vx >= 0 ? 1 : -1;
  const beamSheet = gameAssets.effects.lightBeam;
  const frameIdx = computeFrameIndex(beamSheet, timeSec);

  const drew = drawSpriteSheetFrame(
    ctx,
    beamSheet,
    frameIdx,
    beam.x - dir * 18,
    beam.y,
    0.75,
    dir,
    1,
    1,
    1
  );

  if (!drew) {
    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(beam.x, beam.y, beam.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawParticles(
  ctx: CanvasRenderingContext2D,
  world: WorldState,
  timeSec: number
): void {
  for (let i = 0; i < world.particles.length; i++) {
    const p = world.particles[i];
    if (!p.active) continue;
    const alpha = Math.max(0, Math.min(1, p.life / p.maxLife));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;

    if (i % 3 === 0) {
      const r = p.size * 1.35;
      ctx.translate(p.x, p.y);
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r * 0.65, 0);
      ctx.lineTo(0, r);
      ctx.lineTo(-r * 0.65, 0);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  void timeSec;
}

function drawForegroundSilhouettes(
  ctx: CanvasRenderingContext2D,
  camX: number,
  vw: number,
  vh: number
): void {
  const fgTex = gameAssets.environments.bgForegroundRoots;
  if (fgTex.loaded && fgTex.image) {
    const tileH = 54;
    const tileW = Math.round(tileH * (fgTex.width / Math.max(1, fgTex.height)));
    const startX = -((camX * 1.15) % tileW);
    ctx.save();
    ctx.globalAlpha = 0.62;
    for (let x = startX - tileW; x < vw + tileW; x += tileW - 8) {
      ctx.drawImage(fgTex.image, x, vh - tileH + 10, tileW, tileH);
    }
    ctx.restore();
  }
}

function drawScreenShakeFeedback(
  ctx: CanvasRenderingContext2D,
  world: WorldState,
  camX: number,
  camY: number,
  vw: number,
  vh: number,
  envelope: number,
  timeSec: number
): void {
  if (world.camera.flashAlpha > 0.01) {
    const flashGrad = ctx.createRadialGradient(
      vw * 0.5,
      vh * 0.5,
      vh * 0.22,
      vw * 0.5,
      vh * 0.5,
      vw * 0.68
    );
    flashGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    const isDamage = world.camera.shakeReason === 'player_damage';
    const edgeRgb = isDamage ? '244, 63, 94' : '232, 121, 249';
    flashGrad.addColorStop(
      1,
      `rgba(${edgeRgb}, ${world.camera.flashAlpha.toFixed(3)})`
    );
    ctx.fillStyle = flashGrad;
    ctx.fillRect(0, 0, vw, vh);
  }

  if (envelope > 0.12) {
    const px = world.player.x + world.player.width * 0.5 - camX;
    const py = world.player.y + world.player.height * 0.5 - camY;
    const waveSheet = gameAssets.effects.purifyWave;
    const hitSheet = gameAssets.effects.hitImpact;
    const frameIdx = computeFrameIndex(waveSheet, timeSec, 1 - envelope);
    drawSpriteSheetFrame(
      ctx,
      waveSheet,
      frameIdx,
      px,
      py,
      0.85 + (1 - envelope) * 0.8,
      1,
      1,
      1,
      envelope * 0.75
    );
    drawSpriteSheetFrame(
      ctx,
      hitSheet,
      computeFrameIndex(hitSheet, timeSec, 1 - envelope),
      px,
      py,
      0.7,
      1,
      1,
      1,
      envelope * 0.65
    );
  }
}

function drawDynamicDarknessMask(
  ctx: CanvasRenderingContext2D,
  world: WorldState,
  camX: number,
  camY: number,
  vw: number,
  vh: number,
  timeSec: number
): void {
  const scale = 0.5;
  const bw = Math.max(160, Math.ceil(vw * scale));
  const bh = Math.max(120, Math.ceil(vh * scale));
  const dCtx = ensureDarknessBuffer(bw, bh);
  if (!dCtx || !darknessCanvas) return;

  dCtx.save();
  dCtx.clearRect(0, 0, bw, bh);

  const sectionDarkness = world.currentSection?.darknessAlpha ?? 0.7;
  dCtx.fillStyle = `rgba(4, 5, 16, ${sectionDarkness.toFixed(2)})`;
  dCtx.fillRect(0, 0, bw, bh);

  dCtx.globalCompositeOperation = 'destination-out';

  const punchLightHole = (
    worldX: number,
    worldY: number,
    radius: number,
    strength = 1.0
  ) => {
    const sx = (worldX - camX) * scale;
    const sy = (worldY - camY) * scale;
    const sr = radius * scale;
    if (sx + sr < 0 || sx - sr > bw || sy + sr < 0 || sy - sr > bh) return;
    const g = dCtx.createRadialGradient(sx, sy, sr * 0.12, sx, sy, sr);
    g.addColorStop(0, `rgba(0, 0, 0, ${strength})`);
    g.addColorStop(0.52, `rgba(0, 0, 0, ${(strength * 0.76).toFixed(2)})`);
    g.addColorStop(0.82, `rgba(0, 0, 0, ${(strength * 0.32).toFixed(2)})`);
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    dCtx.fillStyle = g;
    dCtx.beginPath();
    dCtx.arc(sx, sy, sr, 0, Math.PI * 2);
    dCtx.fill();
  };

  const px = world.player.x + world.player.width * 0.5;
  const py = world.player.y + world.player.height * 0.5;
  const flicker = Math.sin(timeSec * 4.8) * 5;
  punchLightHole(px, py, world.light.currentRadius + flicker, 1.0);

  punchLightHole(240, 328, 175, 0.9);
  punchLightHole(2740, 390, 145, 0.78);
  punchLightHole(4030, 300, 145, 0.78);
  punchLightHole(6600, 320, 145, 0.78);

  for (const beam of world.beams) {
    if (beam.active) {
      punchLightHole(beam.x, beam.y, 155, 1.0);
    }
  }

  for (const src of world.lightSources) {
    punchLightHole(src.x, src.y, src.radius * 1.5, 1.0);
  }

  for (const cp of world.checkpoints) {
    punchLightHole(cp.x, cp.y - 46, cp.activated ? 210 : 125, cp.activated ? 0.96 : 0.68);
  }

  for (const item of world.collectibles) {
    if (!item.collected) {
      punchLightHole(item.x, item.y, item.kind === 'sun_relic' ? 135 : 68, 0.72);
    }
  }

  for (const secret of world.secretAreas) {
    punchLightHole(
      secret.x + secret.width * 0.5,
      secret.y + secret.height * 0.55,
      secret.discovered ? 240 : 150,
      secret.discovered ? 0.95 : 0.65
    );
  }

  for (const zone of world.corruptedZones) {
    const ratio = zone.purification / zone.maxPurification;
    punchLightHole(
      zone.x + zone.width * 0.5,
      zone.y + zone.height * 0.5,
      135 + ratio * (zone.width * 0.68),
      0.5 + ratio * 0.5
    );
  }

  for (const enemy of world.enemies) {
    punchLightHole(
      enemy.x + enemy.width * 0.5,
      enemy.y + enemy.height * 0.5,
      85,
      0.55
    );
  }

  punchLightHole(world.goalPortal.x, world.goalPortal.y, 270, 1.0);

  dCtx.restore();

  ctx.drawImage(darknessCanvas, 0, 0, vw, vh);
}
