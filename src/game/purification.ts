import { CorruptedZone, LightBeam, LightSystemState, PlayerState } from './types';

export const PURIFICATION_CONSTANTS = {
  BEAM_PURIFY_AMOUNT: 28,
  AURA_PURIFY_RATE_PER_SEC: 42,
  PASSIVE_PROXIMITY_PURIFY_RATE: 10,
};

export function applyBeamPurification(
  zone: CorruptedZone,
  beam: LightBeam
): { purifiedDelta: number; newlyCompleted: boolean } {
  if (zone.isPurified) {
    return { purifiedDelta: 0, newlyCompleted: false };
  }

  // Check if beam intersects the corrupted zone
  const inX = beam.x + beam.radius >= zone.x && beam.x - beam.radius <= zone.x + zone.width;
  const inY = beam.y + beam.radius >= zone.y - 40 && beam.y - beam.radius <= zone.y + zone.height + 20;

  if (!inX || !inY) {
    return { purifiedDelta: 0, newlyCompleted: false };
  }

  const before = zone.purification;
  zone.purification = Math.min(zone.maxPurification, zone.purification + PURIFICATION_CONSTANTS.BEAM_PURIFY_AMOUNT);
  const delta = zone.purification - before;

  let newlyCompleted = false;
  if (zone.purification >= zone.maxPurification && !zone.isPurified) {
    zone.isPurified = true;
    zone.justPurifiedTimer = 1.6;
    newlyCompleted = true;
  }

  return { purifiedDelta: delta, newlyCompleted };
}

export function updateCorruptedZones(
  zones: CorruptedZone[],
  player: PlayerState,
  light: LightSystemState,
  isChannelingPurify: boolean,
  dt: number
): { newlyPurifiedZones: CorruptedZone[]; activeZone: CorruptedZone | null; totalProgressRatio: number } {
  const newlyPurifiedZones: CorruptedZone[] = [];
  let activeZone: CorruptedZone | null = null;

  const px = player.x + player.width * 0.5;
  const py = player.y + player.height * 0.5;

  for (const zone of zones) {
    if (zone.justPurifiedTimer > 0) {
      zone.justPurifiedTimer = Math.max(0, zone.justPurifiedTimer - dt);
    }

    const insideZone =
      px >= zone.x - 36 &&
      px <= zone.x + zone.width + 36 &&
      py >= zone.y - 60 &&
      py <= zone.y + zone.height + 40;

    if (insideZone) {
      activeZone = zone;
    }

    if (!zone.isPurified && insideZone && light.energy > 5) {
      // Player's bioluminescent aura gently purifies when standing inside, or rapidly when channeling Light
      const rate = isChannelingPurify
        ? PURIFICATION_CONSTANTS.AURA_PURIFY_RATE_PER_SEC
        : PURIFICATION_CONSTANTS.PASSIVE_PROXIMITY_PURIFY_RATE;

      zone.purification = Math.min(zone.maxPurification, zone.purification + rate * dt);

      if (zone.purification >= zone.maxPurification) {
        zone.isPurified = true;
        zone.justPurifiedTimer = 1.6;
        newlyPurifiedZones.push(zone);
      }
    }
  }

  const totalProgressRatio = calculateGlobalPurification(zones);

  return { newlyPurifiedZones, activeZone, totalProgressRatio };
}

export function calculateGlobalPurification(zones: CorruptedZone[]): number {
  if (zones.length === 0) return 100;
  const sum = zones.reduce((acc, z) => acc + z.purification, 0);
  const max = zones.reduce((acc, z) => acc + z.maxPurification, 0);
  return Math.round((sum / max) * 100);
}
