import React from 'react';

export interface HUDSnapshot {
  hp: number;
  maxHp: number;
  energy: number;
  maxEnergy: number;
  ghostEnergy: number;
  isRecharging: boolean;
  purificationPercent: number;
  purifiedZones: number;
  totalZones: number;
  activeZoneName: string | null;
  activeZonePurification: number;
  enemiesRemaining: number;
  totalEnemies: number;
  sectionIndex?: number;
  totalSections?: number;
  sectionName?: string;
  crystalsCollected?: number;
  totalCrystals?: number;
  activeCheckpointName?: string | null;
  checkpointBanner?: string | null;
  secretDiscovered?: boolean;
}

interface HUDProps {
  hud: HUDSnapshot;
  muted: boolean;
  onToggleMute: () => void;
  onPause: () => void;
  onRestart: () => void;
  onOpenInspector: () => void;
}

export const HUD: React.FC<HUDProps> = ({
  hud,
  muted,
  onToggleMute,
  onPause,
  onRestart,
  onOpenInspector,
}) => {
  const energyPct = Math.max(0, Math.min(100, (hud.energy / hud.maxEnergy) * 100));
  const ghostPct = Math.max(energyPct, Math.min(100, (hud.ghostEnergy / hud.maxEnergy) * 100));

  return (
    <div
      className="fixed inset-0 pointer-events-none z-20 flex flex-col justify-between p-2.5 sm:p-4"
      aria-label="HUD di gioco"
    >
      {/* Top Perimeter Row */}
      <div className="flex items-start justify-between gap-2 sm:gap-3 w-full">
        {/* Top-Left Cluster: Golden Vitality Hearts + Stacked LUCE & PURIFICAZIONE Bars */}
        <div
          className="flex items-center gap-3 px-3.5 py-2 rounded-2xl border border-amber-400/30"
          style={{
            backgroundColor: 'rgba(9, 8, 22, 0.86)',
            boxShadow: '0 10px 28px rgba(0, 0, 0, 0.7)',
          }}
        >
          {/* Left Column: Golden Hearts + Ornamental Diamond Line */}
          <div className="flex flex-col items-center gap-1 pr-1">
            <div className="flex items-center gap-1" aria-label={`Salute: ${hud.hp} su ${hud.maxHp}`}>
              {Array.from({ length: hud.maxHp }).map((_, idx) => {
                const full = idx < hud.hp;
                return (
                  <svg
                    key={idx}
                    viewBox="0 0 24 24"
                    className="w-4 h-4 sm:w-5 sm:h-5"
                    style={{ transform: full ? 'scale(1)' : 'scale(0.88)' }}
                  >
                    <path
                      d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                      fill={full ? '#fbbf24' : '#1e1b38'}
                      stroke={full ? '#fef08a' : '#475569'}
                      strokeWidth="1.8"
                    />
                    {full && (
                      <circle cx="8.5" cy="8.5" r="2" fill="#ffffff" opacity="0.8" />
                    )}
                  </svg>
                );
              })}
            </div>
            {/* Ornamental Golden Divider with Center Diamond */}
            <svg viewBox="0 0 110 10" className="w-20 sm:w-24 h-2">
              <line x1="4" y1="5" x2="48" y2="5" stroke="#f59e0b" strokeWidth="1.2" opacity="0.7" />
              <polygon points="55,1 59,5 55,9 51,5" fill="#fde047" />
              <line x1="62" y1="5" x2="106" y2="5" stroke="#f59e0b" strokeWidth="1.2" opacity="0.7" />
            </svg>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold tracking-wider text-amber-200/85 uppercase font-mono-tabular">
                HP {hud.hp}/{hud.maxHp}
              </span>
              {hud.totalCrystals !== undefined && (
                <span
                  data-testid="hud-crystals"
                  className="text-[10px] font-semibold tracking-wider text-sky-300 font-mono-tabular"
                >
                  ✦ {hud.crystalsCollected ?? 0}/{hud.totalCrystals}
                </span>
              )}
            </div>
          </div>

          {/* Right Column: LUCE Bar + PURIFICAZIONE Bar */}
          <div className="flex flex-col gap-1.5 min-w-[165px] sm:min-w-[235px]">
            {/* Row 1: Light Energy Bar */}
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center justify-between text-[10px] sm:text-[11px]">
                <span className="font-semibold tracking-wider uppercase text-sky-200">
                  LUCE {hud.isRecharging ? '· RICARICA' : ''}
                </span>
                <span
                  data-testid="hud-light-energy"
                  className="font-mono-tabular font-semibold text-amber-100"
                >
                  {Math.round(hud.energy)}/{hud.maxEnergy}
                </span>
              </div>
              <div className="relative h-2 w-full rounded-full overflow-hidden bg-slate-950 border border-sky-400/35">
                <div
                  className="absolute inset-0 bg-amber-200/45 origin-left"
                  style={{ transform: `scaleX(${ghostPct / 100})` }}
                />
                <div
                  className="absolute inset-0 origin-left"
                  style={{
                    transform: `scaleX(${energyPct / 100})`,
                    background:
                      hud.energy <= 20
                        ? '#f43f5e'
                        : 'linear-gradient(90deg, #38bdf8 0%, #fde047 62%, #ffffff 100%)',
                  }}
                />
              </div>
            </div>

            {/* Row 2: World Purification Bar */}
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center justify-between text-[10px] sm:text-[11px]">
                <span className="font-semibold tracking-wider uppercase text-emerald-300">
                  PURIFICAZIONE ({hud.purifiedZones}/{hud.totalZones})
                </span>
                <span
                  data-testid="hud-purification"
                  className="font-mono-tabular font-bold text-amber-200"
                >
                  {hud.purificationPercent}%
                </span>
              </div>
              <div className="relative h-2 w-full rounded-full overflow-hidden bg-slate-950 border border-amber-400/30">
                <div
                  className="absolute inset-0 origin-left"
                  style={{
                    transform: `scaleX(${hud.purificationPercent / 100})`,
                    background: 'linear-gradient(90deg, #38bdf8 0%, #fde047 65%, #ffffff 100%)',
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Center Progression & Contextual Zone / Checkpoint Banner */}
        <div className="hidden sm:flex flex-col items-center gap-1 min-w-0">
          <div
            data-testid="hud-section-indicator"
            className="flex items-center gap-1.5 lg:gap-2 px-2.5 lg:px-3.5 py-1 lg:py-1.5 rounded-xl border border-amber-400/25 text-[10px] lg:text-[11px] text-slate-200 whitespace-nowrap"
            style={{
              backgroundColor: 'rgba(10, 9, 24, 0.84)',
              boxShadow: '0 6px 18px rgba(0, 0, 0, 0.55)',
            }}
          >
            <span className="hidden xl:inline font-semibold text-amber-300 uppercase tracking-wider">
              Foresta Avvizzita
            </span>
            <span className="hidden xl:inline text-slate-500">·</span>
            <span className="font-mono-tabular text-sky-200 font-semibold">
              {hud.sectionIndex ?? 1}/{hud.totalSections ?? 5}
            </span>
            <span className="text-amber-100 font-medium">
              {hud.sectionName ?? 'Ingresso della Foresta'}
            </span>
            {hud.activeCheckpointName && (
              <>
                <span className="text-slate-500">·</span>
                <span
                  data-testid="hud-checkpoint-status"
                  title={hud.activeCheckpointName}
                  className="text-emerald-300 font-medium"
                >
                  ⚑ <span className="hidden lg:inline">{hud.activeCheckpointName}</span>
                </span>
              </>
            )}
            {hud.secretDiscovered && (
              <>
                <span className="text-slate-500">·</span>
                <span
                  data-testid="hud-secret-badge"
                  className="text-amber-300 font-semibold"
                >
                  ★ <span className="hidden md:inline">Segreto</span>
                </span>
              </>
            )}
          </div>

          {(hud.checkpointBanner || hud.activeZoneName) && (
            <div
              className="flex items-center gap-2 px-3 py-0.5 lg:py-1 rounded-xl border border-amber-300/35 text-[10px] lg:text-xs text-amber-100 font-medium whitespace-nowrap"
              style={{
                backgroundColor: 'rgba(12, 10, 28, 0.88)',
                boxShadow: '0 6px 20px rgba(0, 0, 0, 0.6)',
              }}
            >
              {hud.checkpointBanner ? (
                <span className="font-semibold text-emerald-300">{hud.checkpointBanner}</span>
              ) : (
                <>
                  <span className="font-semibold text-amber-300">{hud.activeZoneName}</span>
                  <span>·</span>
                  <span className="font-mono-tabular">{Math.round(hud.activeZonePurification)}%</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Top-Right Cluster: Compact Utility Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 pointer-events-auto shrink-0">
          <button
            type="button"
            tabIndex={-1}
            aria-label="Scheda Tecnica e Concept Art"
            onClick={(e) => {
              e.currentTarget.blur();
              onOpenInspector();
            }}
            className="min-w-[44px] min-h-[44px] w-11 h-11 rounded-xl border border-amber-300/30 flex items-center justify-center text-amber-200 hover:border-amber-300/70 active:scale-95"
            style={{ backgroundColor: 'rgba(12, 11, 29, 0.88)' }}
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="9" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label={muted ? 'Attiva Audio [M]' : 'Disattiva Audio [M]'}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            className="min-w-[44px] min-h-[44px] w-11 h-11 rounded-xl border border-slate-400/30 flex items-center justify-center text-slate-200 hover:border-amber-300/60 active:scale-95"
            style={{ backgroundColor: 'rgba(12, 11, 29, 0.88)' }}
          >
            {muted ? (
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 5L6 9H2v6h4l5 4V5z" />
                <line x1="23" y1="9" x2="17" y2="15" />
                <line x1="17" y1="9" x2="23" y2="15" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 5L6 9H2v6h4l5 4V5z" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </svg>
            )}
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label="Ricomincia Livello [R]"
            onClick={(e) => {
              e.currentTarget.blur();
              onRestart();
            }}
            className="min-w-[44px] min-h-[44px] w-11 h-11 rounded-xl border border-slate-400/30 flex items-center justify-center text-slate-200 hover:border-amber-300/60 active:scale-95"
            style={{ backgroundColor: 'rgba(12, 11, 29, 0.88)' }}
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label="Pausa Gioco [P]"
            onClick={(e) => {
              e.currentTarget.blur();
              onPause();
            }}
            className="min-w-[44px] min-h-[44px] w-11 h-11 rounded-xl border border-amber-300/40 flex items-center justify-center text-amber-100 hover:border-amber-300/80 active:scale-95"
            style={{ backgroundColor: 'rgba(12, 11, 29, 0.88)' }}
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};
