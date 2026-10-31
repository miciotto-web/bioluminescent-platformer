import React from 'react';
import { RunSummarySnapshot } from '../game/types';

interface StatusModalProps {
  mode: 'paused' | 'gameover';
  summary: RunSummarySnapshot | null;
  onResume?: () => void;
  onRespawnCheckpoint?: () => void;
  onRestart: () => void;
  onReturnTitle: () => void;
}

export const StatusModal: React.FC<StatusModalProps> = ({
  mode,
  summary,
  onResume,
  onRespawnCheckpoint,
  onRestart,
  onReturnTitle,
}) => {
  const isVictory = summary?.outcome === 'victory';
  const hasActiveCheckpoint = (summary?.checkpointsActivated ?? 0) > 0;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(6, 7, 17, 0.82)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="status-modal-title"
    >
      <div
        className="w-full max-w-lg rounded-2xl border p-6 sm:p-7 flex flex-col gap-5"
        style={{
          backgroundColor: '#0e0c22',
          borderColor:
            mode === 'paused'
              ? 'rgba(251, 191, 36, 0.35)'
              : isVictory
              ? 'rgba(52, 211, 153, 0.5)'
              : 'rgba(244, 63, 94, 0.45)',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.85)',
        }}
      >
        <div className="flex flex-col gap-1 text-center">
          <span className="text-xs font-semibold uppercase tracking-widest text-amber-300/80">
            {summary?.levelTitle ?? 'Foresta Avvizzita'}
          </span>
          <h2
            id="status-modal-title"
            className="text-2xl sm:text-3xl font-bold font-display tracking-wide text-amber-100"
          >
            {mode === 'paused'
              ? 'Viaggio in Pausa'
              : isVictory
              ? 'Foresta Avvizzita Purificata'
              : 'La Luce Si È Affievolita'}
          </h2>
          <p className="text-sm text-slate-300">
            {mode === 'paused'
              ? 'Prendi fiato prima di affrontare nuovamente le Tenebre.'
              : isVictory
              ? 'Hai raggiunto l’Altare della Rinascita e riportato la luce nella Foresta Avvizzita.'
              : 'Le Ombre hanno sopraffatto la creatura. Riaccendi la tua scintilla dall’ultimo santuario.'}
          </p>
        </div>

        {/* Tabular Stat Tiles */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="rounded-xl p-2.5 border border-slate-800 bg-slate-950/80 flex flex-col items-center">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                PURIFICAZIONE
              </span>
              <span className="text-lg font-bold font-mono-tabular text-emerald-300 mt-0.5">
                {summary.purificationPercent}%
              </span>
            </div>

            <div className="rounded-xl p-2.5 border border-slate-800 bg-slate-950/80 flex flex-col items-center">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                OMBRE DISSOLTE
              </span>
              <span className="text-lg font-bold font-mono-tabular text-amber-200 mt-0.5">
                {summary.enemiesDefeated}/{summary.totalEnemies}
              </span>
            </div>

            <div className="rounded-xl p-2.5 border border-slate-800 bg-slate-950/80 flex flex-col items-center">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                CRISTALLI
              </span>
              <span className="text-lg font-bold font-mono-tabular text-sky-300 mt-0.5">
                {summary.crystalsCollected ?? 0}/{summary.totalCrystals ?? 0}
              </span>
            </div>

            <div className="rounded-xl p-2.5 border border-slate-800 bg-slate-950/80 flex flex-col items-center">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                SEGRETO · TEMPO
              </span>
              <span className="text-lg font-bold font-mono-tabular text-amber-300 mt-0.5">
                {summary.secretDiscovered ? '★ ' : ''}
                {summary.clearTimeSec}s
              </span>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-2.5 pt-1">
          {mode === 'paused' && onResume && (
            <button
              type="button"
              onClick={onResume}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl font-semibold text-sm text-slate-950 bg-amber-300 hover:bg-amber-200 transition-colors cursor-pointer whitespace-nowrap"
            >
              Riprendi Gioco
            </button>
          )}

          {hasActiveCheckpoint && onRespawnCheckpoint && !isVictory && (
            <button
              type="button"
              onClick={onRespawnCheckpoint}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl font-semibold text-sm text-slate-950 bg-emerald-300 hover:bg-emerald-200 transition-colors cursor-pointer whitespace-nowrap"
            >
              Riprendi da Checkpoint
            </button>
          )}

          <button
            type="button"
            data-start="true"
            onClick={onRestart}
            className={`w-full sm:w-auto px-5 py-2.5 rounded-xl font-semibold text-sm transition-colors cursor-pointer whitespace-nowrap ${
              mode === 'gameover' && (!hasActiveCheckpoint || isVictory)
                ? 'text-slate-950 bg-amber-300 hover:bg-amber-200'
                : 'text-amber-100 border border-amber-300/40 hover:border-amber-300'
            }`}
          >
            {mode === 'gameover' ? 'Gioca Ancora' : 'Ricomincia Livello'}
          </button>

          <button
            type="button"
            onClick={onReturnTitle}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl font-medium text-sm text-slate-300 border border-slate-700 hover:border-slate-500 transition-colors cursor-pointer whitespace-nowrap"
          >
            Schermata Titolo
          </button>
        </div>
      </div>
    </div>
  );
};

