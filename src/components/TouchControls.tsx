import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActionButtonId,
  createMultiTouchControllerState,
  DPAD_DEFAULT_DEADZONE_RATIO,
  DPAD_SECTORS_CLOCKWISE,
  DPadAxes,
  DPadDirection,
  DPadVectorResult,
  endDPadPointer,
  evaluateDPadTouchOffset,
  moveDPadPointer,
  pressActionPointer,
  releaseActionPointer,
  resetAllMultiTouchState,
  startDPadPointer,
} from '../game/dpad';

interface TouchControlsProps {
  onLeftChange: (pressed: boolean) => void;
  onRightChange: (pressed: boolean) => void;
  onUpChange?: (pressed: boolean) => void;
  onDownChange?: (pressed: boolean) => void;
  onDirectionChange?: (direction: DPadDirection, axes: DPadAxes) => void;
  onJumpPress: () => void;
  onJumpRelease: () => void;
  onAttackPress: () => void;
  onPurifyChange: (pressed: boolean) => void;
}

const INITIAL_VECTOR: DPadVectorResult = evaluateDPadTouchOffset(0, 0, 64);

/**
 * Helper to build an SVG annular sector wedge path between innerRadius and outerRadius
 * from startAngleDeg to endAngleDeg.
 */
function buildSectorPath(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  startAngleDeg: number,
  endAngleDeg: number
): string {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const a0 = toRad(startAngleDeg);
  const a1 = toRad(endAngleDeg);

  const x0Out = cx + outerR * Math.cos(a0);
  const y0Out = cy + outerR * Math.sin(a0);
  const x1Out = cx + outerR * Math.cos(a1);
  const y1Out = cy + outerR * Math.sin(a1);

  const x1In = cx + innerR * Math.cos(a1);
  const y1In = cy + innerR * Math.sin(a1);
  const x0In = cx + innerR * Math.cos(a0);
  const y0In = cy + innerR * Math.sin(a0);

  return [
    `M ${x0Out.toFixed(2)} ${y0Out.toFixed(2)}`,
    `A ${outerR} ${outerR} 0 0 1 ${x1Out.toFixed(2)} ${y1Out.toFixed(2)}`,
    `L ${x1In.toFixed(2)} ${y1In.toFixed(2)}`,
    `A ${innerR} ${innerR} 0 0 0 ${x0In.toFixed(2)} ${y0In.toFixed(2)}`,
    'Z',
  ].join(' ');
}

export const TouchControls: React.FC<TouchControlsProps> = ({
  onLeftChange,
  onRightChange,
  onUpChange,
  onDownChange,
  onDirectionChange,
  onJumpPress,
  onJumpRelease,
  onAttackPress,
  onPurifyChange,
}) => {
  const dpadElementRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef(createMultiTouchControllerState());
  const lastAxesRef = useRef<DPadAxes>({ left: false, right: false, up: false, down: false });
  const lastDirectionRef = useRef<DPadDirection>('NEUTRAL');

  const [dpadVector, setDpadVector] = useState<DPadVectorResult>(INITIAL_VECTOR);
  const [dpadPressed, setDpadPressed] = useState(false);
  const [jumpActive, setJumpActive] = useState(false);
  const [attackActive, setAttackActive] = useState(false);
  const [purifyActive, setPurifyActive] = useState(false);

  const commitDPadVector = useCallback(
    (nextVector: DPadVectorResult, isActiveTouch: boolean) => {
      setDpadVector(nextVector);
      setDpadPressed(isActiveTouch);

      const prevAxes = lastAxesRef.current;
      const nextAxes = nextVector.axes;

      // Guarantee opposite axes are never simultaneously true
      if (prevAxes.left !== nextAxes.left) {
        onLeftChange(nextAxes.left);
      }
      if (prevAxes.right !== nextAxes.right) {
        onRightChange(nextAxes.right);
      }
      if (prevAxes.up !== nextAxes.up) {
        onUpChange?.(nextAxes.up);
      }
      if (prevAxes.down !== nextAxes.down) {
        onDownChange?.(nextAxes.down);
      }

      if (
        lastDirectionRef.current !== nextVector.direction ||
        prevAxes.left !== nextAxes.left ||
        prevAxes.right !== nextAxes.right ||
        prevAxes.up !== nextAxes.up ||
        prevAxes.down !== nextAxes.down
      ) {
        onDirectionChange?.(nextVector.direction, nextAxes);
      }

      lastAxesRef.current = nextAxes;
      lastDirectionRef.current = nextVector.direction;
    },
    [onLeftChange, onRightChange, onUpChange, onDownChange, onDirectionChange]
  );

  const resetAllControls = useCallback(() => {
    const ctrl = controllerRef.current;
    const wasJumpPressed = ctrl.activeActionPointers.jump.size > 0;
    const wasPurifyPressed = ctrl.activeActionPointers.purify.size > 0;

    resetAllMultiTouchState(ctrl);
    commitDPadVector(INITIAL_VECTOR, false);

    setJumpActive(false);
    setAttackActive(false);
    setPurifyActive(false);

    if (wasJumpPressed) {
      onJumpRelease();
    }
    if (wasPurifyPressed) {
      onPurifyChange(false);
    }
  }, [commitDPadVector, onJumpRelease, onPurifyChange]);

  useEffect(() => {
    const handleWindowBlur = () => resetAllControls();
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        resetAllControls();
      }
    };
    const handleOrientationOrResize = () => {
      // If orientation changes mid-gesture, clear stale coordinates to prevent stuck inputs
      if (controllerRef.current.dpadPointerId !== null) {
        const neutral = endDPadPointer(
          controllerRef.current,
          controllerRef.current.dpadPointerId
        );
        if (neutral) {
          commitDPadVector(neutral, false);
        }
      }
    };

    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('orientationchange', handleOrientationOrResize);

    return () => {
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('orientationchange', handleOrientationOrResize);
    };
  }, [commitDPadVector, resetAllControls]);

  const computeOffsetFromClient = (clientX: number, clientY: number) => {
    const el = dpadElementRef.current;
    if (!el) {
      return { dx: 0, dy: 0, radius: 68 };
    }
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    const radius = Math.max(28, Math.min(rect.width, rect.height) * 0.5);
    return { dx: clientX - cx, dy: clientY - cy, radius };
  };

  // --- D-Pad Pointer & Touch Handlers (isolated by pointerId / touch.identifier) ---
  const handleDPadPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // When real TouchEvents are dispatched on mobile, touch handlers manage Touch.identifier;
    // PointerEvents handle mouse and synthetic pointer interactions seamlessly.
    e.preventDefault();
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      // Ignore synthetic events where pointerId is not active in browser native table
    }
    const { dx, dy, radius } = computeOffsetFromClient(e.clientX, e.clientY);
    const vec = startDPadPointer(
      controllerRef.current,
      e.pointerId,
      dx,
      dy,
      radius,
      DPAD_DEFAULT_DEADZONE_RATIO
    );
    commitDPadVector(vec, true);
  };

  const handleDPadPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (controllerRef.current.dpadPointerId !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    const { dx, dy, radius } = computeOffsetFromClient(e.clientX, e.clientY);
    const vec = moveDPadPointer(
      controllerRef.current,
      e.pointerId,
      dx,
      dy,
      radius,
      DPAD_DEFAULT_DEADZONE_RATIO
    );
    if (vec) {
      commitDPadVector(vec, true);
    }
  };

  const handleDPadPointerEndOrCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (controllerRef.current.dpadPointerId !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
        e.currentTarget.releasePointerCapture?.(e.pointerId);
      }
    } catch {
      // Ignore synthetic pointer capture release errors
    }
    const vec = endDPadPointer(controllerRef.current, e.pointerId);
    if (vec) {
      commitDPadVector(vec, false);
    }
  };

  // Native TouchEvent support for multi-touch mobile browsers & synthetic TouchEvent testing
  const TOUCH_ID_OFFSET = 10000;
  const handleDPadTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.changedTouches.length === 0) return;
    e.stopPropagation();
    const touch = e.changedTouches[0];
    const pointerId = TOUCH_ID_OFFSET + touch.identifier;
    const { dx, dy, radius } = computeOffsetFromClient(touch.clientX, touch.clientY);
    const vec = startDPadPointer(
      controllerRef.current,
      pointerId,
      dx,
      dy,
      radius,
      DPAD_DEFAULT_DEADZONE_RATIO
    );
    commitDPadVector(vec, true);
  };

  const handleDPadTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const activeId = controllerRef.current.dpadPointerId;
    if (activeId === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (TOUCH_ID_OFFSET + touch.identifier === activeId) {
        e.stopPropagation();
        const { dx, dy, radius } = computeOffsetFromClient(touch.clientX, touch.clientY);
        const vec = moveDPadPointer(
          controllerRef.current,
          activeId,
          dx,
          dy,
          radius,
          DPAD_DEFAULT_DEADZONE_RATIO
        );
        if (vec) {
          commitDPadVector(vec, true);
        }
        break;
      }
    }
  };

  const handleDPadTouchEndOrCancel = (e: React.TouchEvent<HTMLDivElement>) => {
    const activeId = controllerRef.current.dpadPointerId;
    if (activeId === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (TOUCH_ID_OFFSET + touch.identifier === activeId) {
        e.stopPropagation();
        const vec = endDPadPointer(controllerRef.current, activeId);
        if (vec) {
          commitDPadVector(vec, false);
        }
        break;
      }
    }
  };

  // --- Right Cluster Action Button Multi-Touch Handlers ---
  const handleActionDown = (button: ActionButtonId, pointerId: number) => {
    const res = pressActionPointer(controllerRef.current, button, pointerId);
    if (button === 'jump') {
      setJumpActive(res.isPressed);
      if (res.becamePressed) onJumpPress();
    } else if (button === 'light') {
      setAttackActive(res.isPressed);
      if (res.becamePressed) onAttackPress();
    } else if (button === 'purify') {
      setPurifyActive(res.isPressed);
      if (res.becamePressed) onPurifyChange(true);
    }
  };

  const handleActionUpOrCancel = (button: ActionButtonId, pointerId: number) => {
    const res = releaseActionPointer(controllerRef.current, button, pointerId);
    if (button === 'jump') {
      setJumpActive(res.isPressed);
      if (res.becameReleased) onJumpRelease();
    } else if (button === 'light') {
      setAttackActive(res.isPressed);
    } else if (button === 'purify') {
      setPurifyActive(res.isPressed);
      if (res.becameReleased) onPurifyChange(false);
    }
  };

  const bindActionButtonEvents = (button: ActionButtonId) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        e.currentTarget.setPointerCapture?.(e.pointerId);
      } catch {
        // Ignore synthetic pointer capture error
      }
      handleActionDown(button, e.pointerId);
    },
    onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      handleActionUpOrCancel(button, e.pointerId);
    },
    onPointerCancel: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      handleActionUpOrCancel(button, e.pointerId);
    },
    onLostPointerCapture: (e: React.PointerEvent<HTMLButtonElement>) => {
      handleActionUpOrCancel(button, e.pointerId);
    },
    onTouchStart: (e: React.TouchEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      for (let i = 0; i < e.changedTouches.length; i++) {
        handleActionDown(button, TOUCH_ID_OFFSET + e.changedTouches[i].identifier);
      }
    },
    onTouchEnd: (e: React.TouchEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      for (let i = 0; i < e.changedTouches.length; i++) {
        handleActionUpOrCancel(button, TOUCH_ID_OFFSET + e.changedTouches[i].identifier);
      }
    },
    onTouchCancel: (e: React.TouchEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      for (let i = 0; i < e.changedTouches.length; i++) {
        handleActionUpOrCancel(button, TOUCH_ID_OFFSET + e.changedTouches[i].identifier);
      }
    },
  });

  const activeDir = dpadVector.direction;
  const isCardinalOrDiagActive = activeDir !== 'NEUTRAL';
  // Digital center offset for subtle tactile feedback (snapped along active digital direction, not free analog)
  const activeSectorObj = DPAD_SECTORS_CLOCKWISE.find((s) => s.direction === activeDir);
  const digitalSnapRad = activeSectorObj ? (activeSectorObj.centerAngleDeg * Math.PI) / 180 : 0;
  const coreOffsetX = isCardinalOrDiagActive ? Math.cos(digitalSnapRad) * 8 : 0;
  const coreOffsetY = isCardinalOrDiagActive ? Math.sin(digitalSnapRad) * 8 : 0;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-30 pointer-events-none flex items-end justify-between select-none"
      style={{
        paddingLeft: 'max(1rem, env(safe-area-inset-left, 1rem))',
        paddingRight: 'max(1rem, env(safe-area-inset-right, 1rem))',
        paddingBottom: 'max(0.85rem, env(safe-area-inset-bottom, 0.85rem))',
      }}
      aria-label="Controlli Touch"
    >
      {/* Left Thumb Cluster: Dynamic Multidirectional 8-Way Circular Digital D-Pad */}
      <div className="pointer-events-auto flex items-center">
        <div
          ref={dpadElementRef}
          role="group"
          aria-label="D-Pad Direzionale Multidirezionale"
          data-testid="virtual-dpad"
          data-direction={activeDir}
          data-left={dpadVector.axes.left ? 'true' : 'false'}
          data-right={dpadVector.axes.right ? 'true' : 'false'}
          data-up={dpadVector.axes.up ? 'true' : 'false'}
          data-down={dpadVector.axes.down ? 'true' : 'false'}
          onPointerDown={handleDPadPointerDown}
          onPointerMove={handleDPadPointerMove}
          onPointerUp={handleDPadPointerEndOrCancel}
          onPointerCancel={handleDPadPointerEndOrCancel}
          onLostPointerCapture={handleDPadPointerEndOrCancel}
          onTouchStart={handleDPadTouchStart}
          onTouchMove={handleDPadTouchMove}
          onTouchEnd={handleDPadTouchEndOrCancel}
          onTouchCancel={handleDPadTouchEndOrCancel}
          className="relative w-32 h-32 sm:w-38 sm:h-38 md:w-42 md:h-42 rounded-full cursor-pointer touch-none flex items-center justify-center transition-transform duration-75"
          style={{
            touchAction: 'none',
            backgroundColor: 'rgba(8, 14, 32, 0.66)',
            backdropFilter: 'blur(6px)',
            border: isCardinalOrDiagActive
              ? '2px solid rgba(125, 211, 252, 0.92)'
              : '2px solid rgba(56, 189, 248, 0.48)',
            transform: dpadPressed ? 'scale(0.97)' : 'scale(1)',
            boxShadow: isCardinalOrDiagActive
              ? '0 0 28px rgba(56, 189, 248, 0.55), inset 0 0 22px rgba(56, 189, 248, 0.24)'
              : '0 8px 24px rgba(0, 0, 0, 0.65), inset 0 0 16px rgba(56, 189, 248, 0.14)',
          }}
        >
          <svg
            viewBox="0 0 160 160"
            className="w-full h-full pointer-events-none overflow-visible"
          >
            <defs>
              <radialGradient id="dpadActiveGlow" cx="50%" cy="50%" r="55%">
                <stop offset="0%" stopColor="rgba(186, 230, 253, 0.55)" />
                <stop offset="65%" stopColor="rgba(56, 189, 248, 0.36)" />
                <stop offset="100%" stopColor="rgba(14, 165, 233, 0.08)" />
              </radialGradient>
              <radialGradient id="dpadCoreGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="rgba(224, 242, 254, 0.9)" />
                <stop offset="55%" stopColor="rgba(56, 189, 248, 0.45)" />
                <stop offset="100%" stopColor="rgba(12, 22, 48, 0.85)" />
              </radialGradient>
            </defs>

            {/* Outer Subtle Bioluminescent Ring */}
            <circle
              cx="80"
              cy="80"
              r="74"
              fill="none"
              stroke="rgba(56, 189, 248, 0.22)"
              strokeWidth="1"
              strokeDasharray="4 3"
            />

            {/* 8 Digital Directional Sectors (45° each) */}
            {DPAD_SECTORS_CLOCKWISE.map((sector) => {
              const isSelected = activeDir === sector.direction;
              const isAdjacentAxisActive =
                (sector.direction === 'LEFT' && dpadVector.axes.left && !isSelected) ||
                (sector.direction === 'RIGHT' && dpadVector.axes.right && !isSelected) ||
                (sector.direction === 'UP' && dpadVector.axes.up && !isSelected) ||
                (sector.direction === 'DOWN' && dpadVector.axes.down && !isSelected);

              const startDeg = sector.centerAngleDeg - 22.5;
              const endDeg = sector.centerAngleDeg + 22.5;
              const pathD = buildSectorPath(80, 80, 20, 72, startDeg, endDeg);

              const rad = (sector.centerAngleDeg * Math.PI) / 180;
              const iconRadius = 50;
              const ix = 80 + Math.cos(rad) * iconRadius;
              const iy = 80 + Math.sin(rad) * iconRadius;
              const isCardinal =
                sector.direction === 'UP' ||
                sector.direction === 'DOWN' ||
                sector.direction === 'LEFT' ||
                sector.direction === 'RIGHT';

              return (
                <g
                  key={sector.direction}
                  data-sector={sector.direction}
                  data-active={isSelected ? 'true' : 'false'}
                >
                  <path
                    d={pathD}
                    fill={
                      isSelected
                        ? 'url(#dpadActiveGlow)'
                        : isAdjacentAxisActive
                          ? 'rgba(56, 189, 248, 0.16)'
                          : 'rgba(15, 25, 52, 0.26)'
                    }
                    stroke={
                      isSelected
                        ? 'rgba(186, 230, 253, 0.9)'
                        : isAdjacentAxisActive
                          ? 'rgba(56, 189, 248, 0.45)'
                          : 'rgba(56, 189, 248, 0.18)'
                    }
                    strokeWidth={isSelected ? '1.8' : '0.9'}
                  />

                  {/* Cardinal Chevrons vs Diagonal Bioluminescent Nodes */}
                  {isCardinal ? (
                    <g
                      transform={`translate(${ix.toFixed(2)}, ${iy.toFixed(2)}) rotate(${sector.centerAngleDeg + 90})`}
                    >
                      <polygon
                        points="0,-9 8,5 0,2 -8,5"
                        fill={
                          isSelected
                            ? '#ffffff'
                            : isAdjacentAxisActive
                              ? '#7dd3fc'
                              : 'rgba(125, 211, 252, 0.72)'
                        }
                      />
                    </g>
                  ) : (
                    <g
                      transform={`translate(${ix.toFixed(2)}, ${iy.toFixed(2)}) rotate(${sector.centerAngleDeg + 90})`}
                    >
                      <polygon
                        points="0,-6 4.5,3 0,1 -4.5,3"
                        fill={isSelected ? '#fde68a' : 'rgba(125, 211, 252, 0.45)'}
                      />
                    </g>
                  )}
                </g>
              );
            })}

            {/* Central Dead Zone Ring & Directional Compass Symbol */}
            <circle
              cx="80"
              cy="80"
              r="20"
              fill="rgba(7, 12, 28, 0.88)"
              stroke={
                isCardinalOrDiagActive
                  ? 'rgba(186, 230, 253, 0.85)'
                  : 'rgba(56, 189, 248, 0.45)'
              }
              strokeWidth="1.5"
            />

            {/* Digital Directional Core Emblem (snaps discretely to selected sector) */}
            <g transform={`translate(${(80 + coreOffsetX).toFixed(1)}, ${(80 + coreOffsetY).toFixed(1)})`}>
              <circle
                cx="0"
                cy="0"
                r="11"
                fill="url(#dpadCoreGlow)"
                stroke={isCardinalOrDiagActive ? '#ffffff' : '#38bdf8'}
                strokeWidth="1.4"
              />
              {/* 4-Point Bioluminescent Star inside Neutral Center */}
              <path
                d="M 0 -7 L 2.2 -2.2 L 7 0 L 2.2 2.2 L 0 7 L -2.2 2.2 L -7 0 L -2.2 -2.2 Z"
                fill={isCardinalOrDiagActive ? '#fef08a' : '#bae6fd'}
              />
            </g>
          </svg>
        </div>
      </div>

      {/* Right Thumb Cluster: SALTO (⬆), LUCE (☀), & PURIFICA (❖) with independent multi-touch tracking */}
      <div className="flex items-center gap-3 sm:gap-4 pointer-events-auto">
        {/* SALTO (Jump — Cyan Rim) */}
        <button
          type="button"
          tabIndex={-1}
          aria-label="Salto"
          data-testid="touch-jump"
          data-active={jumpActive ? 'true' : 'false'}
          {...bindActionButtonEvents('jump')}
          className="w-16 h-16 sm:w-20 sm:h-20 rounded-full flex flex-col items-center justify-center border-2 touch-none"
          style={{
            touchAction: 'none',
            backgroundColor: jumpActive ? 'rgba(56, 189, 248, 0.36)' : 'rgba(10, 18, 38, 0.8)',
            borderColor: jumpActive ? '#bae6fd' : '#38bdf8',
            transform: jumpActive ? 'scale(0.93)' : 'scale(1)',
            boxShadow: jumpActive
              ? '0 0 24px rgba(56, 189, 248, 0.65)'
              : '0 6px 18px rgba(0, 0, 0, 0.65), inset 0 0 14px rgba(56, 189, 248, 0.22)',
          }}
        >
          <svg viewBox="0 0 24 24" className="w-8 h-8 text-sky-200" fill="currentColor">
            <path d="M12 4L5 12h4.5v8h5v-8H19L12 4z" />
          </svg>
          <span className="text-[9px] font-bold tracking-wider uppercase text-sky-200/90 mt-0.5">
            SALTO
          </span>
        </button>

        {/* LUCE (Primary Attack: LIGHT_BEAM — Radiant Sun Emblem) */}
        <button
          type="button"
          tabIndex={-1}
          aria-label="Attacco Raggio di Luce"
          data-testid="touch-light"
          data-active={attackActive ? 'true' : 'false'}
          {...bindActionButtonEvents('light')}
          className="w-18 h-18 sm:w-22 sm:h-22 rounded-full flex flex-col items-center justify-center border-2 touch-none"
          style={{
            touchAction: 'none',
            backgroundColor: attackActive ? 'rgba(251, 191, 36, 0.44)' : 'rgba(34, 24, 10, 0.84)',
            borderColor: attackActive ? '#ffffff' : '#fbbf24',
            transform: attackActive ? 'scale(0.92)' : 'scale(1)',
            boxShadow: attackActive
              ? '0 0 32px rgba(254, 240, 138, 0.85)'
              : '0 0 20px rgba(245, 158, 11, 0.45), inset 0 0 14px rgba(251, 191, 36, 0.25)',
          }}
        >
          <svg viewBox="0 0 32 32" className="w-9 h-9 text-amber-200" fill="currentColor">
            <circle cx="16" cy="16" r="6" fill="#ffffff" />
            <path d="M16 2 L18 9 L24 5 L21 11 L28 11 L23 16 L28 21 L21 21 L24 27 L18 23 L16 30 L14 23 L8 27 L11 21 L4 21 L9 16 L4 11 L11 11 L8 5 L14 9 Z" />
          </svg>
          <span className="text-[9px] font-bold tracking-wider uppercase text-amber-200 mt-0.5">
            LUCE
          </span>
        </button>

        {/* PURIFICA (Channel Purifying Energy — Violet Crystal Lotus Emblem) */}
        <button
          type="button"
          tabIndex={-1}
          aria-label="Purifica Area"
          data-testid="touch-purify"
          data-active={purifyActive ? 'true' : 'false'}
          {...bindActionButtonEvents('purify')}
          className="w-16 h-16 sm:w-20 sm:h-20 rounded-full flex flex-col items-center justify-center border-2 touch-none"
          style={{
            touchAction: 'none',
            backgroundColor: purifyActive ? 'rgba(192, 38, 211, 0.42)' : 'rgba(24, 11, 38, 0.82)',
            borderColor: purifyActive ? '#f5d0fe' : '#c084fc',
            transform: purifyActive ? 'scale(0.92)' : 'scale(1)',
            boxShadow: purifyActive
              ? '0 0 26px rgba(232, 121, 249, 0.75)'
              : '0 6px 18px rgba(0, 0, 0, 0.65), inset 0 0 14px rgba(192, 38, 211, 0.25)',
          }}
        >
          <svg viewBox="0 0 24 24" className="w-7 h-7 text-fuchsia-200" fill="currentColor">
            <path d="M12 2L15.5 8.5L20 6L17.5 13.5L21 16L12 21L3 16L6.5 13.5L4 6L8.5 8.5L12 2Z" />
          </svg>
          <span className="text-[9px] font-bold tracking-wider uppercase text-fuchsia-200 mt-0.5">
            PURI
          </span>
        </button>
      </div>
    </div>
  );
};
