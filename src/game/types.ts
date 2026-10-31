import {
  AnimationControllerState,
  EnemyAnimationControllerState,
  EnemyAnimState,
  ProtagonistAnimState,
} from './animationController';
import { DPadDirection } from './dpad';

export type GameScreenState = 'title' | 'playing' | 'paused' | 'gameover';

export type GameOutcome = 'none' | 'victory' | 'defeat';

export type PlayerAnimState = ProtagonistAnimState;

export interface PlayerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  facing: 1 | -1;
  grounded: boolean;
  coyoteTimer: number;
  jumpBufferTimer: number;
  animState: PlayerAnimState;
  animTimer: number;
  walkCycleDist: number;
  scaleX: number;
  scaleY: number;
  hp: number;
  maxHp: number;
  invulnTimer: number;
  hurtFlashTimer: number;
  attackCooldown: number;
  attackAnimTimer: number;
  purifyAnimTimer?: number;
  animController?: AnimationControllerState;
  safeCheckpointX: number;
  safeCheckpointY: number;
}

export interface LightSystemState {
  energy: number;
  maxEnergy: number;
  ghostEnergy: number;
  baseRadius: number;
  maxRadius: number;
  currentRadius: number;
  isRecharging: boolean;
  pulseBurstTimer: number;
  pulseBurstRadius: number;
}

export interface LightBeam {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  life: number;
  maxLife: number;
  active: boolean;
}

export type ShadowArchetype = 'stalker' | 'brute' | 'wraith';

export type EnemyAIState =
  | 'idle'
  | 'patrol'
  | 'alert'
  | 'chase'
  | 'windup'
  | 'attack'
  | 'ko';

export interface ShadowCreature {
  id: number;
  name: string;
  archetype: ShadowArchetype;
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  patrolMinX: number;
  patrolMaxX: number;
  homeY: number;
  detectRadius: number;
  speed: number;
  hp: number;
  maxHp: number;
  contactDamage: number;
  state: EnemyAIState;
  facing: 1 | -1;
  grounded?: boolean;
  idleTimer?: number;
  animState?: EnemyAnimState;
  animController?: EnemyAnimationControllerState;
  scaleX?: number;
  scaleY?: number;
  telegraphTimer: number;
  attackActiveTimer: number;
  cooldownTimer: number;
  hitFlashTimer: number;
  koTimer: number;
  phaseOffset: number;
}

export interface FloraElement {
  offsetX: number;
  kind: 'fern' | 'flower' | 'crystal_bloom' | 'ancient_tree';
  scale: number;
  hue: number;
  threshold: number; // 0..100 purification needed to bloom
}

export interface CorruptedZone {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  purification: number; // 0 to 100
  maxPurification: number; // 100
  isPurified: boolean;
  justPurifiedTimer: number;
  flora: FloraElement[];
}

export interface LightSource {
  id: string;
  name: string;
  x: number;
  y: number;
  radius: number;
  rechargeRate: number; // energy per second
  pulsePhase: number;
}

export interface Platform {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  style: 'moss_stone' | 'ancient_ruin' | 'corrupted_ledge' | 'sanctuary_altar';
  corruptedZoneId?: string;
}

export interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  color: string;
  glowColor: string;
  gravity: number;
}

export interface Checkpoint {
  id: string;
  name: string;
  sectionId: string;
  x: number;
  y: number;
  spawnX: number;
  spawnY: number;
  activated: boolean;
  justActivatedTimer: number;
}

export interface CollectibleCrystal {
  id: string;
  x: number;
  y: number;
  kind: 'crystal' | 'sun_relic';
  energyRestore: number;
  healHp: number;
  maxHpBonus: number;
  collected: boolean;
  isSecret?: boolean;
}

export interface HazardZone {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  damage: number;
  linkedCorruptedZoneId?: string;
  neutralized: boolean;
}

export interface LevelSection {
  id: string;
  index: number;
  name: string;
  subtitle: string;
  startX: number;
  endX: number;
  darknessAlpha: number;
}

export interface SecretArea {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  discovered: boolean;
  justDiscoveredTimer: number;
}

export interface InputState {
  left: boolean;
  right: boolean;
  up?: boolean;
  down?: boolean;
  dpadDirection?: DPadDirection;
  jumpHeld: boolean;
  jumpJustPressed: boolean;
  jumpJustReleased: boolean;
  attackJustPressed: boolean;
  purifyHeld: boolean;
}

export interface RunSummarySnapshot {
  outcome: GameOutcome;
  levelTitle?: string;
  clearTimeSec: number;
  purificationPercent: number;
  purifiedZonesCount: number;
  totalZonesCount: number;
  enemiesDefeated: number;
  totalEnemies: number;
  crystalsCollected?: number;
  totalCrystals?: number;
  checkpointsActivated?: number;
  totalCheckpoints?: number;
  secretDiscovered?: boolean;
  remainingHp: number;
  maxHp: number;
  remainingEnergy: number;
  maxEnergy: number;
}

export type ScreenShakeReason = 'none' | 'player_damage' | 'enemy_destroyed' | 'combat_hit';

export interface CameraState {
  x: number;
  y: number;
  shakeTrauma: number;
  shakeIntensity: number;
  shakeDuration: number;
  shakeTimer: number;
  shakeReason: ScreenShakeReason;
  flashAlpha: number;
  flashColor: string;
}

export interface WorldState {
  levelId: string;
  levelTitle: string;
  levelWidth: number;
  levelHeight: number;
  pitY: number;
  sections: LevelSection[];
  currentSection: LevelSection;
  goalPortal: {
    x: number;
    y: number;
    radius: number;
    unlocked: boolean;
  };
  player: PlayerState;
  light: LightSystemState;
  platforms: Platform[];
  lightSources: LightSource[];
  corruptedZones: CorruptedZone[];
  checkpoints: Checkpoint[];
  activeCheckpointId: string | null;
  collectibles: CollectibleCrystal[];
  hazards: HazardZone[];
  secretAreas: SecretArea[];
  enemies: ShadowCreature[];
  beams: LightBeam[];
  particles: Particle[];
  particleCursor: number;
  camera: CameraState;
  stats: {
    elapsedTime: number;
    enemiesDefeated: number;
    totalEnemies: number;
    crystalsCollected: number;
    totalCrystals: number;
    checkpointsActivated: number;
    secretsDiscovered: number;
    beamsFired: number;
    damageTaken: number;
  };
  hitstopTimer: number;
  nextEntityId: number;
}

