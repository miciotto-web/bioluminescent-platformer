import React, { useState } from 'react';

interface ConceptInspectorModalProps {
  onClose: () => void;
}

export const ConceptInspectorModal: React.FC<ConceptInspectorModalProps> = ({ onClose }) => {
  const [activeSheet, setActiveSheet] = useState<'fase1_2' | 'fase1_0'>('fase1_2');
  const [imgError, setImgError] = useState(false);

  const currentSrc =
    activeSheet === 'fase1_2'
      ? '/assets/aistudio/Luce_contro_Tenebre__Concept_Art_Sheet_f741623c.png'
      : '/assets/aistudio/Luce_contro_Tenebre__Concept_di_gioco_3dd32f1a.png';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      style={{ backgroundColor: 'rgba(5, 6, 15, 0.88)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="inspector-modal-title"
    >
      <div
        className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl border border-amber-300/35 p-5 sm:p-7 flex flex-col gap-5"
        style={{
          backgroundColor: '#0c0a1d',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.9)',
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h2
              id="inspector-modal-title"
              className="text-xl sm:text-2xl font-bold font-display text-amber-100"
            >
              Luce contro Tenebre — Art Direction &amp; Architettura
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
              Fase 1.2 Visual Polish · Protagonista (8 pose) · Shadow Creature (5 stati) · Purificazione 0%–50%–100%
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setImgError(false);
                setActiveSheet('fase1_2');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                activeSheet === 'fase1_2'
                  ? 'bg-amber-300 text-slate-950'
                  : 'bg-slate-900 text-slate-300 border border-slate-700'
              }`}
            >
              Tavola Art Direction 1.2
            </button>
            <button
              type="button"
              onClick={() => {
                setImgError(false);
                setActiveSheet('fase1_0');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                activeSheet === 'fase1_0'
                  ? 'bg-amber-300 text-slate-950'
                  : 'bg-slate-900 text-slate-300 border border-slate-700'
              }`}
            >
              Tavola Concept 1.0
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg text-sm font-semibold text-slate-950 bg-amber-300 hover:bg-amber-200 cursor-pointer shrink-0 ml-2"
            >
              Chiudi
            </button>
          </div>
        </div>

        {/* Official Concept Art Reference Image with Zero-Broken-Image Fallback */}
        <div className="rounded-xl overflow-hidden border border-slate-800 bg-slate-950">
          {!imgError ? (
            <img
              src={currentSrc}
              alt="Concept Art Ufficiale Luce contro Tenebre"
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
              className="w-full h-auto object-contain max-h-[430px]"
            />
          ) : (
            <div className="p-8 text-center text-amber-200">
              Tavola Concept Art: Luce contro Tenebre — Creatura Bioluminescente, Foreste Corrotte e Purificazione
            </div>
          )}
        </div>

        {/* Modular Architecture Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 flex flex-col gap-2">
            <h3 className="font-semibold text-amber-200">Fase 1.2 · Visual Polish &amp; Renderer 2D</h3>
            <ul className="text-xs text-slate-300 space-y-1.5 font-mono-tabular">
              <li>Protagonista: 8 stati (IDLE, RUN, JUMP, FALL, ATTACK, PURIFY, DAMAGE, DEATH)</li>
              <li>Illuminazione Dinamica: Aura radiale, riflessi piattaforme, maschera destination-out</li>
              <li>Parallasse 3 Livelli: Cittadella, Cascate bioluminescenti, Rovine, Lanterne</li>
              <li>Purificazione: 0% Corrotto · 50% Germogli · 100% Albero della Vita</li>
              <li>Shadow Creature: 5 stati (Pattuglia, Inseguimento, Attacco, Danno, Dissoluzione)</li>
            </ul>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 flex flex-col gap-2">
            <h3 className="font-semibold text-sky-200">Progetto Godot 4.x Android (`/godot_project`)</h3>
            <ul className="text-xs text-slate-300 space-y-1.5 font-mono-tabular">
              <li>godot_project/project.godot · Config 2D Landscape Android</li>
              <li>godot_project/export_presets.cfg · Preset Android Debug APK</li>
              <li>godot_project/scripts/player.gd · CharacterBody2D + Aura</li>
              <li>godot_project/scripts/light_system.gd · Gestione Energia</li>
              <li>godot_project/scripts/light_beam.gd · Area2D LIGHT_BEAM</li>
              <li>godot_project/scripts/shadow_creature.gd &amp; corrupted_zone.gd</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
