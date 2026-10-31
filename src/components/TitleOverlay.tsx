import React from 'react';

interface TitleOverlayProps {
  onStartGame: () => void;
  onOpenInspector: () => void;
}

export const TitleOverlay: React.FC<TitleOverlayProps> = ({
  onStartGame,
  onOpenInspector,
}) => {
  return (
    <div
      className="fixed inset-0 z-30 flex flex-col justify-between p-6 sm:p-10 pointer-events-none"
      style={{
        background:
          'linear-gradient(90deg, rgba(4, 5, 15, 0.74) 0%, rgba(5, 6, 16, 0.24) 30%, rgba(5, 6, 16, 0) 55%)',
      }}
    >
      {/* Left/Upper Asymmetric Negative-Space Composition */}
      <div className="max-w-xl flex flex-col items-start gap-4 pointer-events-auto mt-1 sm:mt-4">
        {/* Custom Inline SVG Title Lockup matched to Fase 1.2 Concept Art Sheet */}
        <div className="relative flex flex-col items-start">
          <svg
            viewBox="0 0 540 205"
            className="w-[300px] sm:w-[430px] h-auto"
            role="img"
            aria-label="Luce contro Tenebre"
          >
            <defs>
              <linearGradient id="luceGoldGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="45%" stopColor="#fef08a" />
                <stop offset="85%" stopColor="#f59e0b" />
                <stop offset="100%" stopColor="#b45309" />
              </linearGradient>
              <linearGradient id="tenebreVioletGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#f8fafc" />
                <stop offset="50%" stopColor="#d8b4fe" />
                <stop offset="100%" stopColor="#7e22ce" />
              </linearGradient>
              <radialGradient id="starGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
                <stop offset="40%" stopColor="#fde047" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Ambient Animated Firefly Motes around the Logo */}
            <circle cx="38" cy="36" r="2.5" fill="#fef08a" opacity="0.85" />
            <circle cx="395" cy="48" r="2" fill="#fde047" opacity="0.7" />
            <circle cx="435" cy="118" r="2.8" fill="#c084fc" opacity="0.75" />
            <circle cx="24" cy="148" r="2" fill="#fef08a" opacity="0.65" />
            <circle cx="360" cy="175" r="2.2" fill="#fde047" opacity="0.8" />

            {/* Top 4-Point Radiant Star Crest above LUCE */}
            <circle cx="215" cy="20" r="18" fill="url(#starGlow)" />
            <path
              d="M215 4 L218 16 L230 20 L218 24 L215 36 L212 24 L200 20 L212 16 Z"
              fill="#ffffff"
            />

            {/* Main Word: LUCE */}
            <text
              x="215"
              y="88"
              textAnchor="middle"
              fill="url(#luceGoldGrad)"
              fontFamily="Cinzel, Georgia, serif"
              fontSize="74"
              fontWeight="700"
              letterSpacing="6"
            >
              LUCE
            </text>

            {/* Flanking Horizontal Lines & "contro" */}
            <line x1="88" y1="108" x2="164" y2="108" stroke="#cbd5e1" strokeWidth="1.2" opacity="0.65" />
            <text
              x="215"
              y="113"
              textAnchor="middle"
              fill="#e2e8f0"
              fontFamily="Plus Jakarta Sans, Georgia, serif"
              fontSize="17"
              fontWeight="500"
              letterSpacing="3"
            >
              contro
            </text>
            <line x1="266" y1="108" x2="342" y2="108" stroke="#cbd5e1" strokeWidth="1.2" opacity="0.65" />

            {/* Main Word: TENEBRE */}
            <text
              x="215"
              y="168"
              textAnchor="middle"
              fill="url(#tenebreVioletGrad)"
              fontFamily="Cinzel, Georgia, serif"
              fontSize="60"
              fontWeight="700"
              letterSpacing="3"
            >
              TENEBRE
            </text>

            {/* Ornamental Golden Diamond Divider Line from Concept Art Sheet */}
            <line x1="55" y1="190" x2="198" y2="190" stroke="#f59e0b" strokeWidth="1.6" opacity="0.8" />
            <polygon points="215,182 223,190 215,198 207,190" fill="#fde047" />
            <line x1="232" y1="190" x2="375" y2="190" stroke="#a855f7" strokeWidth="1.6" opacity="0.8" />
          </svg>
        </div>

        <p className="text-sm sm:text-base text-slate-200/95 leading-relaxed max-w-md font-normal pl-2">
          Una piccola creatura di luce in un mondo divorato dalle tenebre. La tua luce può
          combattere, riportare la vita e cambiare il destino di un intero regno.
        </p>

        {/* Primary & Secondary Action Buttons matching the Concept Art Sheet */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 pt-1 pl-2 w-full max-w-xs sm:max-w-none">
          <button
            type="button"
            data-start="true"
            onClick={(e) => {
              e.currentTarget.blur();
              onStartGame();
            }}
            className="flex items-center justify-center gap-2.5 px-8 py-3.5 rounded-full font-semibold text-base text-slate-950 bg-gradient-to-b from-amber-200 via-amber-300 to-amber-400 hover:from-amber-100 hover:to-amber-300 active:scale-95 transition-transform cursor-pointer whitespace-nowrap shrink-0 border border-amber-100"
            style={{
              boxShadow: '0 0 30px rgba(251, 191, 36, 0.55), inset 0 1px 2px rgba(255, 255, 255, 0.8)',
            }}
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5 text-slate-900" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M12 2L15 9L22 12L15 15L12 22L9 15L2 12L9 9L12 2Z" />
            </svg>
            <span>Inizia Viaggio</span>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.blur();
              onOpenInspector();
            }}
            className="flex items-center justify-center px-6 py-3.5 rounded-full font-medium text-sm text-amber-100 border border-amber-300/45 hover:border-amber-200 active:scale-95 transition-transform cursor-pointer whitespace-nowrap shrink-0"
            style={{
              backgroundColor: 'rgba(13, 11, 28, 0.86)',
              boxShadow: '0 6px 20px rgba(0, 0, 0, 0.65)',
            }}
          >
            Concept &amp; Progetto Godot 4
          </button>
        </div>
      </div>

      {/* Bottom Safe Margin: Single flat, borderless inline control hint */}
      <div className="w-full flex items-center justify-between text-xs sm:text-sm text-slate-300/90 pt-4 pl-2">
        <span>
          A/D o ←/→ Muovi · Spazio Salta · J/F Raggio di Luce · E Purifica · P Pausa · Touch Attivo
        </span>
        <span className="hidden sm:inline text-amber-200/85 font-mono-tabular">
          Livello 1 · Foresta Avvizzita
        </span>
      </div>
    </div>
  );
};

