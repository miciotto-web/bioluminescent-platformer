import { createEnemyAnimationController } from './animationController';
import { createInitialLightSystem, recoverLightEnergy } from './lightSystem';
import { aabbOverlap, createInitialPlayer, PLAYER_CONSTANTS } from './player';
import {
  Checkpoint,
  CollectibleCrystal,
  CorruptedZone,
  FloraElement,
  HazardZone,
  LevelSection,
  LightSource,
  Particle,
  Platform,
  SecretArea,
  ShadowCreature,
  WorldState,
} from './types';

export const PARTICLE_POOL_SIZE = 280;

export const FORESTA_AVVIZZITA_SECTIONS: LevelSection[] = [
  {
    id: 'sec_ingresso',
    index: 1,
    name: 'Ingresso della Foresta',
    subtitle: 'Radura del Risveglio e prime tracce di corruzione',
    startX: 0,
    endX: 1850,
    darknessAlpha: 0.62,
  },
  {
    id: 'sec_sentiero',
    index: 2,
    name: 'Sentiero Spezzato',
    subtitle: 'Antico viadotto sospeso tra le radici',
    startX: 1850,
    endX: 3880,
    darknessAlpha: 0.68,
  },
  {
    id: 'sec_bosco',
    index: 3,
    name: 'Bosco Corrotto',
    subtitle: 'Rovi d’ombra e creature nelle tenebre profonde',
    startX: 3880,
    endX: 5960,
    darknessAlpha: 0.76,
  },
  {
    id: 'sec_radure',
    index: 4,
    name: 'Radure Dimenticate',
    subtitle: 'Bivio antico e Santuario Nascosto delle Alture',
    startX: 5960,
    endX: 7640,
    darknessAlpha: 0.7,
  },
  {
    id: 'sec_cuore',
    index: 5,
    name: 'Cuore Avvizzito',
    subtitle: 'Sfida finale e Altare della Rinascita',
    startX: 7640,
    endX: 9200,
    darknessAlpha: 0.8,
  },
];

function generateFloraForZone(width: number): FloraElement[] {
  const items: FloraElement[] = [];
  const count = Math.max(6, Math.floor(width / 38));
  const kinds: FloraElement['kind'][] = ['fern', 'flower', 'crystal_bloom', 'ancient_tree'];

  for (let i = 0; i < count; i++) {
    const ratio = (i + 0.5) / count;
    items.push({
      offsetX: ratio * (width - 36) + 18,
      kind: i === Math.floor(count / 2) ? 'ancient_tree' : kinds[i % 3],
      scale: 0.8 + ((i * 37) % 5) * 0.12,
      hue: i % 2 === 0 ? 46 : 168,
      threshold: Math.min(92, Math.round(ratio * 85) + 8),
    });
  }
  return items;
}

function createEnemy(
  id: number,
  name: string,
  archetype: ShadowCreature['archetype'],
  x: number,
  platformTopY: number,
  patrolMinX: number,
  patrolMaxX: number,
  hp: number,
  speed: number,
  detectRadius: number,
  phaseOffset: number
): ShadowCreature {
  const width = archetype === 'brute' ? 54 : 44;
  const height = archetype === 'brute' ? 56 : 44;
  const y = platformTopY - height;
  return {
    id,
    name,
    archetype,
    x,
    y,
    vx: 0,
    vy: 0,
    width,
    height,
    patrolMinX,
    patrolMaxX,
    homeY: y,
    detectRadius,
    speed,
    hp,
    maxHp: hp,
    contactDamage: 1,
    state: 'patrol',
    facing: -1,
    grounded: true,
    idleTimer: 0,
    animState: 'idle',
    animController: createEnemyAnimationController('idle', -1),
    scaleX: 1,
    scaleY: 1,
    telegraphTimer: 0,
    attackActiveTimer: 0,
    cooldownTimer: 0,
    hitFlashTimer: 0,
    koTimer: 0,
    phaseOffset,
  };
}

function createCrystal(
  id: string,
  x: number,
  y: number,
  isSecret = false
): CollectibleCrystal {
  return {
    id,
    x,
    y,
    kind: 'crystal',
    energyRestore: 18,
    healHp: 0,
    maxHpBonus: 0,
    collected: false,
    isSecret,
  };
}

export function createForestaAvvizzitaLevel(): WorldState {
  const levelWidth = 9200;
  const levelHeight = 760;
  const pitY = 740;

  const platforms: Platform[] = [
    // =========================================================================
    // SEZIONE 1 — INGRESSO DELLA FORESTA (0 - 1850)
    // =========================================================================
    {
      id: 'plat_start',
      x: 0,
      y: 520,
      width: 520,
      height: 300,
      style: 'moss_stone',
    },
    {
      id: 'plat_step_1',
      x: 575,
      y: 445,
      width: 190,
      height: 32,
      style: 'ancient_ruin',
    },
    {
      id: 'plat_step_2',
      x: 820,
      y: 375,
      width: 210,
      height: 32,
      style: 'ancient_ruin',
    },
    {
      id: 'plat_corrupted_1',
      x: 1080,
      y: 490,
      width: 720,
      height: 330,
      style: 'corrupted_ledge',
      corruptedZoneId: 'zone_radura_1',
    },
    {
      id: 'plat_high_arch',
      x: 1270,
      y: 412,
      width: 230,
      height: 24,
      style: 'ancient_ruin',
    },

    // =========================================================================
    // SEZIONE 2 — SENTIERO SPEZZATO (1850 - 3880)
    // =========================================================================
    {
      id: 'plat_sanctuary_cp1',
      x: 1855,
      y: 440,
      width: 340,
      height: 380,
      style: 'sanctuary_altar',
    },
    {
      id: 'plat_broken_1',
      x: 2255,
      y: 395,
      width: 190,
      height: 28,
      style: 'ancient_ruin',
    },
    {
      id: 'plat_broken_2',
      x: 2510,
      y: 345,
      width: 195,
      height: 28,
      style: 'ancient_ruin',
    },
    {
      id: 'plat_broken_3',
      x: 2770,
      y: 390,
      width: 230,
      height: 28,
      style: 'ancient_ruin',
    },
    {
      id: 'plat_broken_4',
      x: 3065,
      y: 335,
      width: 200,
      height: 28,
      style: 'ancient_ruin',
    },
    // Safe lower root bridge under Sentiero Spezzato so falling never traps the player
    {
      id: 'plat_recovery_valley',
      x: 2215,
      y: 525,
      width: 1090,
      height: 32,
      style: 'moss_stone',
    },
    {
      id: 'plat_recovery_step1',
      x: 2340,
      y: 455,
      width: 145,
      height: 24,
      style: 'moss_stone',
    },
    {
      id: 'plat_recovery_step2',
      x: 3080,
      y: 455,
      width: 160,
      height: 24,
      style: 'moss_stone',
    },
    {
      id: 'plat_corrupted_2',
      x: 3325,
      y: 420,
      width: 520,
      height: 400,
      style: 'corrupted_ledge',
      corruptedZoneId: 'zone_ponte_2',
    },

    // =========================================================================
    // SEZIONE 3 — BOSCO CORROTTO (3880 - 5960)
    // =========================================================================
    {
      id: 'plat_grove_entry',
      x: 3905,
      y: 470,
      width: 250,
      height: 350,
      style: 'moss_stone',
    },
    {
      id: 'plat_corrupted_3',
      x: 4215,
      y: 510,
      width: 820,
      height: 310,
      style: 'corrupted_ledge',
      corruptedZoneId: 'zone_bosco_3',
    },
    {
      id: 'plat_bosco_canopy',
      x: 4440,
      y: 432,
      width: 210,
      height: 24,
      style: 'ancient_ruin',
    },
    {
      id: 'plat_bosco_bridge',
      x: 5095,
      y: 455,
      width: 195,
      height: 28,
      style: 'ancient_ruin',
    },
    {
      id: 'plat_corrupted_4',
      x: 5350,
      y: 495,
      width: 580,
      height: 325,
      style: 'corrupted_ledge',
      corruptedZoneId: 'zone_conca_4',
    },

    // =========================================================================
    // SEZIONE 4 — RADURE DIMENTICATE & PERCORSO SEGRETO (5960 - 7640)
    // =========================================================================
    {
      id: 'plat_sanctuary_cp2',
      x: 5990,
      y: 440,
      width: 380,
      height: 380,
      style: 'sanctuary_altar',
    },
    // Main Lower Path
    {
      id: 'plat_glade_main_1',
      x: 6435,
      y: 460,
      width: 340,
      height: 360,
      style: 'moss_stone',
    },
    {
      id: 'plat_glade_main_2',
      x: 6840,
      y: 430,
      width: 340,
      height: 390,
      style: 'moss_stone',
    },
    {
      id: 'plat_glade_rejoin',
      x: 7245,
      y: 405,
      width: 360,
      height: 415,
      style: 'sanctuary_altar',
    },
    // Optional Upper Secret Path ("Santuario Nascosto delle Alture")
    {
      id: 'plat_secret_step1',
      x: 6320,
      y: 368,
      width: 145,
      height: 24,
      style: 'ancient_ruin',
    },
    {
      id: 'plat_secret_step2',
      x: 6515,
      y: 296,
      width: 155,
      height: 24,
      style: 'ancient_ruin',
    },
    {
      id: 'plat_secret_sanctuary',
      x: 6720,
      y: 226,
      width: 430,
      height: 28,
      style: 'sanctuary_altar',
    },

    // =========================================================================
    // SEZIONE 5 — CUORE AVVIZZITO & USCITA (7640 - 9200)
    // =========================================================================
    {
      id: 'plat_corrupted_5',
      x: 7665,
      y: 455,
      width: 960,
      height: 365,
      style: 'corrupted_ledge',
      corruptedZoneId: 'zone_cuore_5',
    },
    {
      id: 'plat_heart_ledge_1',
      x: 7860,
      y: 377,
      width: 190,
      height: 24,
      style: 'ancient_ruin',
    },
    {
      id: 'plat_heart_ledge_2',
      x: 8160,
      y: 372,
      width: 180,
      height: 22,
      style: 'ancient_ruin',
    },
    {
      id: 'plat_final_sanctuary',
      x: 8685,
      y: 395,
      width: 485,
      height: 425,
      style: 'sanctuary_altar',
    },
  ];

  const lightSources: LightSource[] = [
    {
      id: 'source_start',
      name: 'Fiamma Primordiale',
      x: 160,
      y: 468,
      radius: 145,
      rechargeRate: 40,
      pulsePhase: 0,
    },
    {
      id: 'source_cp1',
      name: 'Cristallo del Sentiero',
      x: 2055,
      y: 385,
      radius: 160,
      rechargeRate: 45,
      pulsePhase: 1.2,
    },
    {
      id: 'source_bosco',
      name: 'Lanterna delle Radici',
      x: 4030,
      y: 415,
      radius: 155,
      rechargeRate: 45,
      pulsePhase: 2.4,
    },
    {
      id: 'source_cp2',
      name: 'Fiamma della Memoria',
      x: 6210,
      y: 385,
      radius: 165,
      rechargeRate: 48,
      pulsePhase: 3.6,
    },
    {
      id: 'source_cp3',
      name: 'Cristallo della Veglia',
      x: 7490,
      y: 350,
      radius: 160,
      rechargeRate: 50,
      pulsePhase: 4.5,
    },
    {
      id: 'source_final',
      name: 'Faro dell’Alba',
      x: 8810,
      y: 342,
      radius: 165,
      rechargeRate: 55,
      pulsePhase: 5.2,
    },
  ];

  const corruptedZones: CorruptedZone[] = [
    {
      id: 'zone_radura_1',
      name: 'Margine Avvizzito',
      x: 1065,
      y: 380,
      width: 710,
      height: 110,
      purification: 0,
      maxPurification: 100,
      isPurified: false,
      justPurifiedTimer: 0,
      flora: generateFloraForZone(710),
    },
    {
      id: 'zone_ponte_2',
      name: 'Rovine Infestate',
      x: 3345,
      y: 310,
      width: 480,
      height: 110,
      purification: 0,
      maxPurification: 100,
      isPurified: false,
      justPurifiedTimer: 0,
      flora: generateFloraForZone(480),
    },
    {
      id: 'zone_bosco_3',
      name: 'Bosco delle Spine Nere',
      x: 4240,
      y: 400,
      width: 770,
      height: 110,
      purification: 0,
      maxPurification: 100,
      isPurified: false,
      justPurifiedTimer: 0,
      flora: generateFloraForZone(770),
    },
    {
      id: 'zone_conca_4',
      name: 'Conca dei Sussurri',
      x: 5375,
      y: 385,
      width: 530,
      height: 110,
      purification: 0,
      maxPurification: 100,
      isPurified: false,
      justPurifiedTimer: 0,
      flora: generateFloraForZone(530),
    },
    {
      id: 'zone_cuore_5',
      name: 'Cuore Avvizzito',
      x: 7695,
      y: 345,
      width: 900,
      height: 110,
      purification: 0,
      maxPurification: 100,
      isPurified: false,
      justPurifiedTimer: 0,
      flora: generateFloraForZone(900),
    },
  ];

  const checkpoints: Checkpoint[] = [
    {
      id: 'cp_sentiero',
      name: 'Altare del Sentiero Spezzato',
      sectionId: 'sec_sentiero',
      x: 1960,
      y: 440,
      spawnX: 1940,
      spawnY: 440 - PLAYER_CONSTANTS.HEIGHT,
      activated: false,
      justActivatedTimer: 0,
    },
    {
      id: 'cp_radure',
      name: 'Santuario delle Radure Dimenticate',
      sectionId: 'sec_radure',
      x: 6110,
      y: 440,
      spawnX: 6090,
      spawnY: 440 - PLAYER_CONSTANTS.HEIGHT,
      activated: false,
      justActivatedTimer: 0,
    },
    {
      id: 'cp_cuore',
      name: 'Veglia del Cuore Avvizzito',
      sectionId: 'sec_cuore',
      x: 7380,
      y: 405,
      spawnX: 7360,
      spawnY: 405 - PLAYER_CONSTANTS.HEIGHT,
      activated: false,
      justActivatedTimer: 0,
    },
  ];

  const secretAreas: SecretArea[] = [
    {
      id: 'secret_alture',
      name: 'Santuario Nascosto delle Alture',
      x: 6720,
      y: 110,
      width: 430,
      height: 120,
      discovered: false,
      justDiscoveredTimer: 0,
    },
  ];

  const hazards: HazardZone[] = [
    {
      id: 'hazard_spine_1',
      name: 'Rovi d’Ombra',
      x: 4520,
      y: 486,
      width: 86,
      height: 24,
      damage: 1,
      linkedCorruptedZoneId: 'zone_bosco_3',
      neutralized: false,
    },
    {
      id: 'hazard_spine_2',
      name: 'Rovi dei Sussurri',
      x: 5615,
      y: 471,
      width: 82,
      height: 24,
      damage: 1,
      linkedCorruptedZoneId: 'zone_conca_4',
      neutralized: false,
    },
    {
      id: 'hazard_spine_3',
      name: 'Spine del Cuore Nero',
      x: 8095,
      y: 431,
      width: 90,
      height: 24,
      damage: 1,
      linkedCorruptedZoneId: 'zone_cuore_5',
      neutralized: false,
    },
  ];

  const collectibles: CollectibleCrystal[] = [
    // Sezione 1: Ingresso della Foresta
    createCrystal('crys_1', 390, 484),
    createCrystal('crys_2', 665, 408),
    createCrystal('crys_3', 920, 338),
    createCrystal('crys_4', 1350, 374),
    createCrystal('crys_5', 1430, 374),
    // Sezione 2: Sentiero Spezzato
    createCrystal('crys_6', 2350, 358),
    createCrystal('crys_7', 2605, 308),
    createCrystal('crys_8', 2885, 352),
    createCrystal('crys_9', 3165, 298),
    createCrystal('crys_10', 2740, 488), // on lower recovery bridge
    // Sezione 3: Bosco Corrotto
    createCrystal('crys_11', 4510, 394),
    createCrystal('crys_12', 4580, 394),
    createCrystal('crys_13', 5190, 418),
    createCrystal('crys_14', 5655, 410), // jump arc over hazard_spine_2
    // Sezione 4: Radure Dimenticate (Main + Secret Path)
    createCrystal('crys_15', 6600, 422),
    createCrystal('crys_16', 7010, 392),
    createCrystal('crys_secret_step1', 6392, 330, true),
    createCrystal('crys_secret_step2', 6592, 258, true),
    createCrystal('crys_secret_1', 6810, 188, true),
    {
      id: 'relic_sun_heart',
      x: 6935,
      y: 180,
      kind: 'sun_relic',
      energyRestore: 100,
      healHp: 6,
      maxHpBonus: 1,
      collected: false,
      isSecret: true,
    },
    createCrystal('crys_secret_2', 7060, 188, true),
    // Sezione 5: Cuore Avvizzito
    createCrystal('crys_17', 7955, 340),
    createCrystal('crys_18', 8250, 335),
    createCrystal('crys_19', 8740, 358),
  ];

  const enemies: ShadowCreature[] = [
    // Sezione 1
    createEnemy(101, 'Ombra Minore', 'stalker', 1240, 490, 1100, 1460, 3, 135, 270, 0.4),
    createEnemy(102, 'Segugio dell’Ombra', 'wraith', 1540, 490, 1420, 1760, 2, 148, 290, 1.9),
    // Sezione 2
    createEnemy(103, 'Sentinella del Ponte', 'stalker', 2860, 390, 2780, 2990, 3, 138, 260, 1.1),
    createEnemy(104, 'Spettro del Viadotto', 'wraith', 3560, 420, 3350, 3820, 3, 152, 295, 2.7),
    // Sezione 3
    createEnemy(105, 'Predatore del Bosco', 'stalker', 4360, 510, 4235, 4505, 3, 142, 280, 0.8),
    createEnemy(106, 'Bruto di Corteccia Nera', 'brute', 4780, 510, 4655, 5010, 4, 120, 300, 3.1),
    createEnemy(107, 'Segugio dei Sussurri', 'wraith', 5470, 495, 5365, 5595, 3, 154, 290, 2.2),
    // Sezione 4
    createEnemy(108, 'Errante del Crepuscolo', 'stalker', 6580, 460, 6455, 6755, 3, 140, 275, 1.5),
    // Sezione 5
    createEnemy(109, 'Cacciatore del Cuore', 'wraith', 7850, 455, 7690, 8070, 3, 155, 300, 0.6),
    createEnemy(110, 'Colosso Avvizzito', 'brute', 8380, 455, 8220, 8600, 5, 125, 320, 3.8),
  ];

  const particles: Particle[] = Array.from({ length: PARTICLE_POOL_SIZE }, () => ({
    active: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    size: 2,
    life: 0,
    maxLife: 1,
    color: '#fef08a',
    glowColor: '#f59e0b',
    gravity: 0,
  }));

  const player = createInitialPlayer(220, 476);
  const light = createInitialLightSystem();

  return {
    levelId: 'foresta_avvizzita',
    levelTitle: 'Foresta Avvizzita',
    levelWidth,
    levelHeight,
    pitY,
    sections: FORESTA_AVVIZZITA_SECTIONS,
    currentSection: FORESTA_AVVIZZITA_SECTIONS[0],
    goalPortal: {
      x: 8990,
      y: 330,
      radius: 56,
      unlocked: true,
    },
    player,
    light,
    platforms,
    lightSources,
    corruptedZones,
    checkpoints,
    activeCheckpointId: null,
    collectibles,
    hazards,
    secretAreas,
    enemies,
    beams: [],
    particles,
    particleCursor: 0,
    camera: {
      x: 0,
      y: 0,
      shakeTrauma: 0,
      shakeIntensity: 0,
      shakeDuration: 0,
      shakeTimer: 0,
      shakeReason: 'none',
      flashAlpha: 0,
      flashColor: '#f43f5e',
    },
    stats: {
      elapsedTime: 0,
      enemiesDefeated: 0,
      totalEnemies: enemies.length,
      crystalsCollected: 0,
      totalCrystals: collectibles.length,
      checkpointsActivated: 0,
      secretsDiscovered: 0,
      beamsFired: 0,
      damageTaken: 0,
    },
    hitstopTimer: 0,
    nextEntityId: 200,
  };
}

export function createDemoLevel(): WorldState {
  return createForestaAvvizzitaLevel();
}

export function resolveCurrentSection(world: WorldState): LevelSection {
  const px = world.player.x + world.player.width * 0.5;
  for (const sec of world.sections) {
    if (px >= sec.startX && px < sec.endX) {
      return sec;
    }
  }
  return world.sections[world.sections.length - 1];
}

export function activateCheckpoint(world: WorldState, cp: Checkpoint): boolean {
  const wasActivated = cp.activated;
  cp.activated = true;
  world.activeCheckpointId = cp.id;
  world.player.safeCheckpointX = cp.spawnX;
  world.player.safeCheckpointY = cp.spawnY;

  if (!wasActivated) {
    cp.justActivatedTimer = 2.2;
    world.stats.checkpointsActivated = world.checkpoints.filter((c) => c.activated).length;
    if (world.player.hp > 0 && world.player.hp < world.player.maxHp) {
      world.player.hp = Math.min(world.player.maxHp, world.player.hp + 1);
    }
    recoverLightEnergy(world.light, 35);
    return true;
  }
  return false;
}

export function respawnAtCheckpoint(world: WorldState): boolean {
  const activeCp = world.checkpoints.find((c) => c.id === world.activeCheckpointId);
  if (activeCp) {
    world.player.x = activeCp.spawnX;
    world.player.y = activeCp.spawnY;
    world.player.safeCheckpointX = activeCp.spawnX;
    world.player.safeCheckpointY = activeCp.spawnY;
  } else {
    world.player.x = 220;
    world.player.y = 476;
    world.player.safeCheckpointX = 220;
    world.player.safeCheckpointY = 476;
  }
  world.player.vx = 0;
  world.player.vy = 0;
  world.player.grounded = true;
  world.player.hp = world.player.maxHp;
  world.player.invulnTimer = PLAYER_CONSTANTS.INVULN_DURATION;
  world.player.hurtFlashTimer = 0;
  world.player.animState = 'idle';
  recoverLightEnergy(world.light, world.light.maxEnergy);
  world.currentSection = resolveCurrentSection(world);
  return activeCp !== undefined;
}

export interface LevelProgressEvents {
  activatedCheckpoint: Checkpoint | null;
  collectedItems: CollectibleCrystal[];
  discoveredSecret: SecretArea | null;
  hazardHit: HazardZone | null;
}

export function updateLevelEntities(world: WorldState, dt: number): LevelProgressEvents {
  const events: LevelProgressEvents = {
    activatedCheckpoint: null,
    collectedItems: [],
    discoveredSecret: null,
    hazardHit: null,
  };

  world.currentSection = resolveCurrentSection(world);

  const { player } = world;
  const px = player.x + player.width * 0.5;
  const py = player.y + player.height * 0.5;

  // 1. Checkpoints activation & timers
  for (const cp of world.checkpoints) {
    if (cp.justActivatedTimer > 0) {
      cp.justActivatedTimer = Math.max(0, cp.justActivatedTimer - dt);
    }
    const dist = Math.hypot(px - cp.x, py - (cp.y - 28));
    if (dist <= 64) {
      const newly = activateCheckpoint(world, cp);
      if (newly) {
        events.activatedCheckpoint = cp;
      }
    }
  }

  // 2. Collectible Light Crystals & Ancient Sun-Heart Relic
  for (const item of world.collectibles) {
    if (item.collected) continue;
    const collectRadius = item.kind === 'sun_relic' ? 42 : 32;
    if (Math.hypot(px - item.x, py - item.y) <= collectRadius) {
      item.collected = true;
      world.stats.crystalsCollected += 1;
      if (item.maxHpBonus > 0) {
        player.maxHp += item.maxHpBonus;
      }
      if (item.healHp > 0 && player.hp > 0) {
        player.hp = Math.min(player.maxHp, player.hp + item.healHp);
      }
      if (item.energyRestore > 0) {
        recoverLightEnergy(world.light, item.energyRestore);
      }
      events.collectedItems.push(item);
    }
  }

  // 3. Secret Area Discovery
  for (const secret of world.secretAreas) {
    if (secret.justDiscoveredTimer > 0) {
      secret.justDiscoveredTimer = Math.max(0, secret.justDiscoveredTimer - dt);
    }
    if (
      !secret.discovered &&
      px >= secret.x &&
      px <= secret.x + secret.width &&
      py >= secret.y &&
      py <= secret.y + secret.height
    ) {
      secret.discovered = true;
      secret.justDiscoveredTimer = 2.8;
      world.stats.secretsDiscovered += 1;
      events.discoveredSecret = secret;
    }
  }

  // 4. Environmental Hazards (Corrupted Brambles / Thorns)
  for (const haz of world.hazards) {
    if (haz.linkedCorruptedZoneId) {
      const z = world.corruptedZones.find((zone) => zone.id === haz.linkedCorruptedZoneId);
      if (z && z.isPurified) {
        haz.neutralized = true;
      }
    }
    if (haz.neutralized) continue;

    if (
      player.invulnTimer <= 0 &&
      aabbOverlap(
        player.x + 6,
        player.y + 6,
        player.width - 12,
        player.height - 6,
        haz.x + 4,
        haz.y + 4,
        haz.width - 8,
        haz.height - 4
      )
    ) {
      player.hp = Math.max(0, player.hp - haz.damage);
      player.invulnTimer = PLAYER_CONSTANTS.INVULN_DURATION;
      player.hurtFlashTimer = 0.24;
      player.vy = -290;
      player.vx = -player.facing * 210;
      player.grounded = false;
      events.hazardHit = haz;
    }
  }

  return events;
}

export function spawnParticleBurst(
  world: WorldState,
  x: number,
  y: number,
  count: number,
  options: {
    color: string;
    glowColor: string;
    speedMin: number;
    speedMax: number;
    sizeMin: number;
    sizeMax: number;
    lifeMin: number;
    lifeMax: number;
    gravity?: number;
    upwardBias?: number;
  }
): void {
  const pool = world.particles;
  for (let i = 0; i < count; i++) {
    const p = pool[world.particleCursor];
    world.particleCursor = (world.particleCursor + 1) % pool.length;

    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
    const speed = options.speedMin + Math.random() * (options.speedMax - options.speedMin);

    p.active = true;
    p.x = x + (Math.random() - 0.5) * 10;
    p.y = y + (Math.random() - 0.5) * 10;
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed - (options.upwardBias ?? 0);
    p.size = options.sizeMin + Math.random() * (options.sizeMax - options.sizeMin);
    p.maxLife = options.lifeMin + Math.random() * (options.lifeMax - options.lifeMin);
    p.life = p.maxLife;
    p.color = options.color;
    p.glowColor = options.glowColor;
    p.gravity = options.gravity ?? 0;
  }
}

export function updateParticles(world: WorldState, dt: number): void {
  for (const p of world.particles) {
    if (!p.active) continue;
    p.life -= dt;
    if (p.life <= 0) {
      p.active = false;
      continue;
    }
    p.vy += p.gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
}
