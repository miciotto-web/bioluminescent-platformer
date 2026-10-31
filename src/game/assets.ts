import { EnemyAIState, PlayerState, ShadowCreature } from './types';

export interface SpriteSheetAsset {
  key: string;
  url: string;
  image: HTMLImageElement | null;
  loaded: boolean;
  error: boolean;
  frameCount: number;
  frameWidth: number;
  frameHeight: number;
  fps: number;
  loop: boolean;
  anchorX: number;
  anchorY: number;
}

export interface TextureAsset {
  key: string;
  url: string;
  image: HTMLImageElement | null;
  loaded: boolean;
  error: boolean;
  width: number;
  height: number;
}

export interface GameAssetRegistry {
  initialized: boolean;
  protagonist: {
    idle: SpriteSheetAsset;
    run: SpriteSheetAsset;
    jump: SpriteSheetAsset;
    fall: SpriteSheetAsset;
    attack: SpriteSheetAsset;
    damage: SpriteSheetAsset;
    death: SpriteSheetAsset;
    purify: SpriteSheetAsset;
  };
  shadowCreature: {
    idle: SpriteSheetAsset;
    patrol: SpriteSheetAsset;
    chase: SpriteSheetAsset;
    attack: SpriteSheetAsset;
    hit: SpriteSheetAsset;
    death: SpriteSheetAsset;
  };
  effects: {
    lightBeam: SpriteSheetAsset;
    hitImpact: SpriteSheetAsset;
    purifyWave: SpriteSheetAsset;
    particles: SpriteSheetAsset;
  };
  environments: {
    bgSkyCitadel: TextureAsset;
    bgMidgroundRuins: TextureAsset;
    bgForegroundRoots: TextureAsset;
    platMossStone: TextureAsset;
    platAncientRuin: TextureAsset;
    platCorruptedLedge: TextureAsset;
    platSanctuaryAltar: TextureAsset;
    pillarShort: TextureAsset;
    pillarTall: TextureAsset;
    mushroomCyan: TextureAsset;
    crystalViolet: TextureAsset;
    ruinArch: TextureAsset;
    mossArchway: TextureAsset;
    hangingLantern: TextureAsset;
    treeCorrupted0: TextureAsset;
    treeTransforming50: TextureAsset;
    treePurified100: TextureAsset;
  };
  ui: {
    goldenHeartsStrip: TextureAsset;
  };
}

function createSheetDef(
  key: string,
  url: string,
  frameCount: number,
  fps: number,
  loop = true,
  anchorX = 64,
  anchorY = 112
): SpriteSheetAsset {
  return {
    key,
    url,
    image: null,
    loaded: false,
    error: false,
    frameCount,
    frameWidth: 128,
    frameHeight: 128,
    fps,
    loop,
    anchorX,
    anchorY,
  };
}

function createTexDef(key: string, url: string): TextureAsset {
  return {
    key,
    url,
    image: null,
    loaded: false,
    error: false,
    width: 0,
    height: 0,
  };
}

const registry: GameAssetRegistry = {
  initialized: false,
  protagonist: {
    idle: createSheetDef('prot_idle', '/assets/characters/protagonist/idle/spritesheet.png', 8, 10, true, 64, 112),
    run: createSheetDef('prot_run', '/assets/characters/protagonist/run/spritesheet.png', 8, 14, true, 64, 112),
    jump: createSheetDef('prot_jump', '/assets/characters/protagonist/jump/spritesheet.png', 6, 14, false, 64, 112),
    fall: createSheetDef('prot_fall', '/assets/characters/protagonist/fall/spritesheet.png', 4, 11, true, 64, 112),
    attack: createSheetDef('prot_attack', '/assets/characters/protagonist/attack/spritesheet.png', 6, 24, false, 64, 112),
    damage: createSheetDef('prot_damage', '/assets/characters/protagonist/damage/spritesheet.png', 4, 15, false, 64, 112),
    death: createSheetDef('prot_death', '/assets/characters/protagonist/death/spritesheet.png', 8, 10, false, 64, 112),
    purify: createSheetDef('prot_purify', '/assets/characters/protagonist/purify/spritesheet.png', 8, 12, true, 64, 112),
  },
  shadowCreature: {
    idle: createSheetDef('enemy_idle', '/assets/characters/enemies/shadow_creature/idle/spritesheet.png', 8, 10, true, 64, 112),
    patrol: createSheetDef('enemy_patrol', '/assets/characters/enemies/shadow_creature/patrol/spritesheet.png', 8, 12, true, 64, 112),
    chase: createSheetDef('enemy_chase', '/assets/characters/enemies/shadow_creature/chase/spritesheet.png', 8, 16, true, 64, 112),
    attack: createSheetDef('enemy_attack', '/assets/characters/enemies/shadow_creature/attack/spritesheet.png', 6, 15, false, 64, 112),
    hit: createSheetDef('enemy_hit', '/assets/characters/enemies/shadow_creature/hit/spritesheet.png', 4, 15, false, 64, 112),
    death: createSheetDef('enemy_death', '/assets/characters/enemies/shadow_creature/death/spritesheet.png', 8, 14, false, 64, 112),
  },
  effects: {
    lightBeam: createSheetDef('fx_beam', '/assets/effects/light_beam_spritesheet.png', 4, 16, true, 64, 64),
    hitImpact: createSheetDef('fx_hit', '/assets/effects/hit_impact_spritesheet.png', 6, 18, true, 64, 64),
    purifyWave: createSheetDef('fx_wave', '/assets/effects/purify_wave_spritesheet.png', 6, 14, true, 64, 64),
    particles: createSheetDef('fx_particles', '/assets/effects/particles_spritesheet.png', 4, 10, true, 64, 64),
  },
  environments: {
    bgSkyCitadel: createTexDef('bg_sky', '/assets/environments/backgrounds/bg_layer_1_sky_citadel.png'),
    bgMidgroundRuins: createTexDef('bg_mid', '/assets/environments/backgrounds/bg_layer_2_midground_ruins.png'),
    bgForegroundRoots: createTexDef('bg_fore', '/assets/environments/backgrounds/bg_layer_3_foreground_roots.png'),
    platMossStone: createTexDef('plat_moss', '/assets/environments/tilesets/platform_moss_stone.png'),
    platAncientRuin: createTexDef('plat_ruin', '/assets/environments/tilesets/platform_ancient_ruin.png'),
    platCorruptedLedge: createTexDef('plat_corrupted', '/assets/environments/tilesets/platform_corrupted_ledge.png'),
    platSanctuaryAltar: createTexDef('plat_sanctuary', '/assets/environments/tilesets/platform_sanctuary_altar.png'),
    pillarShort: createTexDef('pillar_short', '/assets/environments/tilesets/stone_pillar_short.png'),
    pillarTall: createTexDef('pillar_tall', '/assets/environments/tilesets/stone_pillar_tall.png'),
    mushroomCyan: createTexDef('mush_cyan', '/assets/environments/decorations/mushroom_cyan.png'),
    crystalViolet: createTexDef('crystal_violet', '/assets/environments/decorations/crystal_violet.png'),
    ruinArch: createTexDef('ruin_arch', '/assets/environments/decorations/ruin_arch.png'),
    mossArchway: createTexDef('moss_archway', '/assets/environments/decorations/moss_archway.png'),
    hangingLantern: createTexDef('hanging_lantern', '/assets/environments/decorations/hanging_lantern.png'),
    treeCorrupted0: createTexDef('tree_0', '/assets/environments/forest/tree_corrupted_0.png'),
    treeTransforming50: createTexDef('tree_50', '/assets/environments/forest/tree_transforming_50.png'),
    treePurified100: createTexDef('tree_100', '/assets/environments/forest/tree_purified_100.png'),
  },
  ui: {
    goldenHeartsStrip: createTexDef('ui_hearts', '/assets/ui/golden_hearts_strip.png'),
  },
};

export function initGameAssets(): GameAssetRegistry {
  if (registry.initialized || typeof Image === 'undefined') {
    return registry;
  }
  registry.initialized = true;

  const allSheets: SpriteSheetAsset[] = [
    ...Object.values(registry.protagonist),
    ...Object.values(registry.shadowCreature),
    ...Object.values(registry.effects),
  ];

  for (const sheet of allSheets) {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      sheet.loaded = true;
    };
    img.onerror = () => {
      sheet.error = true;
    };
    img.src = sheet.url;
    sheet.image = img;
  }

  const allTextures: TextureAsset[] = [
    ...Object.values(registry.environments),
    ...Object.values(registry.ui),
  ];

  for (const tex of allTextures) {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      tex.loaded = true;
      tex.width = img.naturalWidth;
      tex.height = img.naturalHeight;
    };
    img.onerror = () => {
      tex.error = true;
    };
    img.src = tex.url;
    tex.image = img;
  }

  return registry;
}

export function getAssetLoadingStats(): {
  total: number;
  loaded: number;
  failed: number;
  ready: boolean;
} {
  const all = [
    ...Object.values(registry.protagonist),
    ...Object.values(registry.shadowCreature),
    ...Object.values(registry.effects),
    ...Object.values(registry.environments),
    ...Object.values(registry.ui),
  ];
  const loaded = all.filter((a) => a.loaded).length;
  const failed = all.filter((a) => a.error).length;
  return {
    total: all.length,
    loaded,
    failed,
    ready: loaded === all.length && failed === 0,
  };
}

export function isSpriteSheetReady(sheet: SpriteSheetAsset): boolean {
  if (!sheet || !sheet.image) return false;
  if (sheet.loaded && sheet.image.naturalWidth > 0) return true;
  if (sheet.image.complete && sheet.image.naturalWidth > 0) {
    sheet.loaded = true;
    return true;
  }
  return false;
}

export function selectProtagonistSheet(
  player: PlayerState,
  isPurifying: boolean
): SpriteSheetAsset {
  let target: SpriteSheetAsset;

  if (player.hp <= 0 || player.animState === 'death') {
    target = registry.protagonist.death;
  } else if (player.hurtFlashTimer > 0.04 || player.animState === 'damage') {
    target = registry.protagonist.damage;
  } else if (player.attackAnimTimer > 0 || player.animState === 'attack') {
    target = registry.protagonist.attack;
  } else if (!player.grounded) {
    target = player.vy < 0 ? registry.protagonist.jump : registry.protagonist.fall;
  } else if (
    (isPurifying || (player.purifyAnimTimer ?? 0) > 0 || player.animState === 'purify') &&
    Math.abs(player.vx) <= 24
  ) {
    target = registry.protagonist.purify;
  } else if (Math.abs(player.vx) > 18 || player.animState === 'run') {
    target = registry.protagonist.run;
  } else {
    target = registry.protagonist.idle;
  }

  if (isSpriteSheetReady(target)) {
    return target;
  }

  // Fallback to any already-decoded protagonist spritesheet if target is still decoding asynchronously
  const fallbacks: SpriteSheetAsset[] = [
    registry.protagonist.idle,
    registry.protagonist.run,
    registry.protagonist.jump,
    registry.protagonist.fall,
    registry.protagonist.attack,
  ];
  for (const fb of fallbacks) {
    if (isSpriteSheetReady(fb)) {
      return fb;
    }
  }

  return target;
}

export function selectEnemySheet(enemy: ShadowCreature): SpriteSheetAsset {
  let target: SpriteSheetAsset;
  const st: EnemyAIState = enemy.state;
  const absVx = Math.abs(enemy.vx);

  if (st === 'ko' || enemy.hp <= 0 || enemy.animState === 'death') {
    target = registry.shadowCreature.death;
  } else if (enemy.hitFlashTimer > 0.02 || enemy.animState === 'hit') {
    target = registry.shadowCreature.hit;
  } else if (st === 'windup' || st === 'attack' || enemy.animState === 'attack') {
    target = registry.shadowCreature.attack;
  } else if (
    enemy.animState === 'run' ||
    ((st === 'chase' || st === 'alert') &&
      enemy.animState !== 'walk' &&
      (absVx === 0 || absVx >= enemy.speed * 0.56))
  ) {
    target = registry.shadowCreature.chase;
  } else if (enemy.animState === 'walk' || absVx >= 10) {
    target = registry.shadowCreature.patrol;
  } else {
    target = registry.shadowCreature.idle;
  }

  if (isSpriteSheetReady(target)) {
    return target;
  }

  const fallbacks: SpriteSheetAsset[] = [
    registry.shadowCreature.idle,
    registry.shadowCreature.patrol,
    registry.shadowCreature.chase,
    registry.shadowCreature.attack,
    registry.shadowCreature.hit,
  ];
  for (const fb of fallbacks) {
    if (isSpriteSheetReady(fb)) {
      return fb;
    }
  }

  return target;
}

export function computeFrameIndex(
  sheet: SpriteSheetAsset,
  timeSec: number,
  customProgress?: number
): number {
  if (customProgress !== undefined) {
    const idx = Math.floor(customProgress * sheet.frameCount);
    return Math.max(0, Math.min(sheet.frameCount - 1, idx));
  }
  const rawFrame = Math.floor(timeSec * sheet.fps);
  if (sheet.loop) {
    return ((rawFrame % sheet.frameCount) + sheet.frameCount) % sheet.frameCount;
  }
  return Math.max(0, Math.min(sheet.frameCount - 1, rawFrame));
}

export function drawSpriteSheetFrame(
  ctx: CanvasRenderingContext2D,
  sheet: SpriteSheetAsset,
  frameIdx: number,
  worldAnchorX: number,
  worldAnchorY: number,
  renderScale: number,
  facing: 1 | -1,
  scaleX = 1,
  scaleY = 1,
  alpha = 1
): boolean {
  if (!isSpriteSheetReady(sheet) || !sheet.image) return false;

  const natW = sheet.image.naturalWidth;
  const natH = sheet.image.naturalHeight;
  const fw = Math.min(sheet.frameWidth, natW);
  const fh = Math.min(sheet.frameHeight, natH);
  const maxFramesInImage = Math.max(1, Math.floor(natW / fw));
  const validFrameCount = Math.min(sheet.frameCount, maxFramesInImage);
  const clampedFrame = Math.max(0, Math.min(validFrameCount - 1, Math.floor(frameIdx)));
  const sx = clampedFrame * fw;

  ctx.save();
  ctx.translate(worldAnchorX, worldAnchorY);
  ctx.scale(facing * scaleX * renderScale, scaleY * renderScale);
  if (alpha < 1) {
    ctx.globalAlpha *= alpha;
  }

  ctx.drawImage(
    sheet.image,
    sx,
    0,
    fw,
    fh,
    -sheet.anchorX,
    -sheet.anchorY,
    fw,
    fh
  );

  ctx.restore();
  return true;
}

export { registry as gameAssets };
