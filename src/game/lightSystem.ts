import { LightSource, LightSystemState, PlayerState } from './types';

export const LIGHT_CONSTANTS = {
  MAX_ENERGY: 100,
  INITIAL_ENERGY: 100,
  BEAM_COST: 12,
  PURIFY_PULSE_COST_PER_SEC: 18,
  PASSIVE_REGEN_PER_SEC: 2.5,
  BASE_AURA_RADIUS: 185,
  MAX_AURA_RADIUS: 390,
  LOW_ENERGY_THRESHOLD: 24,
};

export function createInitialLightSystem(): LightSystemState {
  return {
    energy: LIGHT_CONSTANTS.INITIAL_ENERGY,
    maxEnergy: LIGHT_CONSTANTS.MAX_ENERGY,
    ghostEnergy: LIGHT_CONSTANTS.INITIAL_ENERGY,
    baseRadius: LIGHT_CONSTANTS.BASE_AURA_RADIUS,
    maxRadius: LIGHT_CONSTANTS.MAX_AURA_RADIUS,
    currentRadius: LIGHT_CONSTANTS.MAX_AURA_RADIUS,
    isRecharging: false,
    pulseBurstTimer: 0,
    pulseBurstRadius: 0,
  };
}

export function canConsumeLight(light: LightSystemState, cost: number): boolean {
  return light.energy >= cost;
}

export function consumeLightEnergy(light: LightSystemState, amount: number): boolean {
  if (light.energy < amount) {
    return false;
  }
  light.energy = Math.max(0, light.energy - amount);
  updateAuraRadius(light);
  return true;
}

export function recoverLightEnergy(light: LightSystemState, amount: number): void {
  light.energy = Math.min(light.maxEnergy, light.energy + amount);
  updateAuraRadius(light);
}

export function updateAuraRadius(light: LightSystemState): void {
  const ratio = Math.max(0, Math.min(1, light.energy / light.maxEnergy));
  // Smooth non-linear curve so high energy feels radiant and zero energy still leaves a tiny visibility rim
  const curved = Math.pow(ratio, 0.75);
  const pulseBonus = light.pulseBurstTimer > 0 ? Math.sin(light.pulseBurstTimer * Math.PI * 2) * 55 : 0;
  light.currentRadius = light.baseRadius + (light.maxRadius - light.baseRadius) * curved + pulseBonus;
}

export function updateLightSystem(
  light: LightSystemState,
  player: PlayerState,
  sources: LightSource[],
  dt: number
): { rechargedAmount: number; activeSource: LightSource | null } {
  let rechargedAmount = 0;
  let activeSource: LightSource | null = null;

  const playerCenterX = player.x + player.width * 0.5;
  const playerCenterY = player.y + player.height * 0.5;

  for (const src of sources) {
    src.pulsePhase += dt * 2.4;
    const dx = playerCenterX - src.x;
    const dy = playerCenterY - src.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= src.radius) {
      activeSource = src;
      const gain = src.rechargeRate * dt;
      const before = light.energy;
      recoverLightEnergy(light, gain);
      rechargedAmount += light.energy - before;
    }
  }

  // Gentle passive trickle so the player is never permanently soft-locked far from a crystal
  if (!activeSource && light.energy < light.maxEnergy) {
    recoverLightEnergy(light, LIGHT_CONSTANTS.PASSIVE_REGEN_PER_SEC * dt);
  }

  light.isRecharging = activeSource !== null;

  // Smooth trailing ghost bar for HUD feedback
  if (light.ghostEnergy > light.energy) {
    light.ghostEnergy = Math.max(light.energy, light.ghostEnergy - 32 * dt);
  } else {
    light.ghostEnergy = light.energy;
  }

  if (light.pulseBurstTimer > 0) {
    light.pulseBurstTimer = Math.max(0, light.pulseBurstTimer - dt);
    light.pulseBurstRadius += 380 * dt;
  } else {
    light.pulseBurstRadius = 0;
  }

  updateAuraRadius(light);

  return { rechargedAmount, activeSource };
}
