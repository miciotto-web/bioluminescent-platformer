import { useCallback, useEffect, useRef, useState } from 'react';
import { ConceptInspectorModal } from './components/ConceptInspectorModal';
import { HUD, HUDSnapshot } from './components/HUD';
import { StatusModal } from './components/StatusModal';
import { TitleOverlay } from './components/TitleOverlay';
import { TouchControls } from './components/TouchControls';
import { stepAnimationController } from './game/animationController';
import { soundEngine } from './game/audio';
import { createRunSummary, stepWorld } from './game/engine';
import {
  activateCheckpoint,
  createDemoLevel,
  resolveCurrentSection,
  respawnAtCheckpoint,
} from './game/level';
import { calculateGlobalPurification } from './game/purification';
import { renderWorld } from './game/renderer';
import { DPadDirection } from './game/dpad';
import {
  GameScreenState,
  InputState,
  RunSummarySnapshot,
  WorldState,
} from './game/types';

function getInitialScreenState(): GameScreenState {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1' || params.get('scene')) {
      return 'playing';
    }
  }
  return 'title';
}

function createInitialWorld(): WorldState {
  const w = createDemoLevel();
  w.player.x = 355;
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const scene = params.get('scene');
    if (scene === 'combat' || scene === 'attack') {
      // Position player in the first Corrupted Grove facing the Shadow Creature with an active LIGHT_BEAM
      w.player.x = 1125;
      w.player.y = 446;
      w.player.grounded = true;
      w.player.facing = 1;
      w.player.animState = 'attack';
      w.player.attackAnimTimer = 1.2;
      if (w.player.animController) {
        w.player.animController.currentState = 'attack';
        w.player.animController.frameIndex = 2;
      }
      w.light.energy = 88;
      w.light.ghostEnergy = 88;
      if (w.corruptedZones[0]) {
        w.corruptedZones[0].purification = 52;
      }
      if (w.enemies[0]) {
        w.enemies[0].x = 1440;
        w.enemies[0].y = 446;
        w.enemies[0].state = 'chase';
        w.enemies[0].facing = -1;
        w.enemies[0].hitFlashTimer = 0.25;
      }
      w.beams.push({
        id: 901,
        x: 1185,
        y: 466,
        vx: 420,
        vy: 0,
        radius: 12,
        damage: 1,
        life: 1.15,
        maxLife: 1.15,
        active: true,
      });
      w.camera.x = 760;
      w.camera.y = 0;
    } else if (scene === 'run') {
      w.player.x = 420;
      w.player.y = 476;
      w.player.vx = 295;
      w.player.grounded = true;
      w.player.facing = 1;
      w.player.animState = 'run';
      if (w.player.animController) {
        w.player.animController.currentState = 'run';
        w.player.animController.frameIndex = 3;
      }
    } else if (scene === 'jump') {
      w.player.x = 590;
      w.player.y = 335;
      w.player.vx = 210;
      w.player.vy = -380;
      w.player.grounded = false;
      w.player.facing = 1;
      w.player.animState = 'jump';
      if (w.player.animController) {
        w.player.animController.currentState = 'jump';
        w.player.animController.frameIndex = 2;
      }
    } else if (scene === 'fall') {
      w.player.x = 690;
      w.player.y = 315;
      w.player.vx = 160;
      w.player.vy = 340;
      w.player.grounded = false;
      w.player.facing = 1;
      w.player.animState = 'fall';
      if (w.player.animController) {
        w.player.animController.currentState = 'fall';
        w.player.animController.frameIndex = 1;
      }
    } else if (scene === 'idle') {
      w.player.x = 355;
      w.player.y = 476;
      w.player.vx = 0;
      w.player.vy = 0;
      w.player.grounded = true;
      w.player.facing = 1;
      w.player.animState = 'idle';
    } else if (scene === 'sentiero' || scene === 'checkpoint') {
      w.player.x = 1950;
      w.player.y = 396;
      w.player.grounded = true;
      w.player.facing = 1;
      if (w.checkpoints[0]) {
        activateCheckpoint(w, w.checkpoints[0]);
      }
      w.currentSection = resolveCurrentSection(w);
      w.camera.x = 1620;
      w.camera.y = 0;
    } else if (scene === 'bosco') {
      w.player.x = 4420;
      w.player.y = 466;
      w.player.grounded = true;
      w.player.facing = 1;
      w.currentSection = resolveCurrentSection(w);
      w.camera.x = 4120;
      w.camera.y = 0;
    } else if (scene === 'secret') {
      w.player.x = 6890;
      w.player.y = 182;
      w.player.grounded = true;
      w.player.facing = 1;
      if (w.secretAreas[0]) {
        w.secretAreas[0].discovered = true;
        w.secretAreas[0].justDiscoveredTimer = 2.5;
      }
      w.currentSection = resolveCurrentSection(w);
      w.camera.x = 6400;
      w.camera.y = 0;
    } else if (scene === 'cuore' || scene === 'portal') {
      w.player.x = 8750;
      w.player.y = 351;
      w.player.grounded = true;
      w.player.facing = 1;
      if (w.checkpoints[2]) {
        activateCheckpoint(w, w.checkpoints[2]);
      }
      w.currentSection = resolveCurrentSection(w);
      w.camera.x = 8050;
      w.camera.y = 0;
    } else if (
      scene === 'enemy_idle' ||
      scene === 'enemy_walk' ||
      scene === 'enemy_run' ||
      scene === 'enemy_attack'
    ) {
      w.player.x = 1140;
      w.player.y = 446;
      w.player.grounded = true;
      w.player.facing = 1;
      w.light.energy = 100;
      w.light.currentRadius = 260;
      if (w.corruptedZones[0]) {
        w.corruptedZones[0].purification = 35;
      }
      const e0 = w.enemies[0];
      const e1 = w.enemies[1];
      if (e0) {
        e0.x = 1280;
        e0.y = 446;
        e0.grounded = true;
        e0.facing = -1;
        if (scene === 'enemy_idle') {
          e0.state = 'idle';
          e0.idleTimer = 5.0;
          e0.vx = 0;
          e0.animState = 'idle';
          if (e0.animController) {
            e0.animController.currentState = 'idle';
            e0.animController.frameIndex = 2;
          }
        } else if (scene === 'enemy_walk') {
          e0.state = 'patrol';
          e0.vx = -70;
          e0.animState = 'walk';
          if (e0.animController) {
            e0.animController.currentState = 'walk';
            e0.animController.frameIndex = 1;
          }
        } else if (scene === 'enemy_run') {
          e0.state = 'chase';
          e0.vx = -135;
          e0.animState = 'run';
          if (e0.animController) {
            e0.animController.currentState = 'run';
            e0.animController.frameIndex = 2;
          }
        } else if (scene === 'enemy_attack') {
          e0.x = 1210;
          e0.state = 'attack';
          e0.attackActiveTimer = 0.2;
          e0.vx = -180;
          e0.animState = 'attack';
          if (e0.animController) {
            e0.animController.currentState = 'attack';
            e0.animController.frameIndex = 2;
          }
        }
      }
      if (e1) {
        e1.x = 1435;
        e1.y = 446;
        e1.grounded = true;
        e1.facing = -1;
        e1.state = 'patrol';
        e1.vx = -76;
        e1.animState = 'walk';
        if (e1.animController) {
          e1.animController.currentState = 'walk';
          e1.animController.frameIndex = 5;
        }
      }
      w.camera.x = 760;
      w.camera.y = 0;
    }
  }
  return w;
}

export default function App() {
  const [screenState, setScreenState] = useState<GameScreenState>(getInitialScreenState);
  const [muted, setMuted] = useState<boolean>(false);
  const [inspectorOpen, setInspectorOpen] = useState<boolean>(false);
  const [summarySnapshot, setSummarySnapshot] = useState<RunSummarySnapshot | null>(null);

  const [hudState, setHudState] = useState<HUDSnapshot>(() => {
    const initialW = createInitialWorld();
    const activeCp = initialW.checkpoints.find((c) => c.id === initialW.activeCheckpointId);
    return {
      hp: initialW.player.hp,
      maxHp: initialW.player.maxHp,
      energy: Math.round(initialW.light.energy),
      maxEnergy: initialW.light.maxEnergy,
      ghostEnergy: Math.round(initialW.light.ghostEnergy),
      isRecharging: initialW.light.isRecharging,
      purificationPercent: calculateGlobalPurification(initialW.corruptedZones),
      purifiedZones: initialW.corruptedZones.filter((z) => z.isPurified).length,
      totalZones: initialW.corruptedZones.length,
      activeZoneName: null,
      activeZonePurification: 0,
      enemiesRemaining: initialW.enemies.length,
      totalEnemies: initialW.stats.totalEnemies,
      sectionIndex: initialW.currentSection.index,
      totalSections: initialW.sections.length,
      sectionName: initialW.currentSection.name,
      crystalsCollected: initialW.stats.crystalsCollected,
      totalCrystals: initialW.stats.totalCrystals,
      activeCheckpointName: activeCp ? activeCp.name : null,
      checkpointBanner: null,
      secretDiscovered: initialW.secretAreas.some((s) => s.discovered),
    };
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const worldRef = useRef<WorldState>(createInitialWorld());
  const screenStateRef = useRef<GameScreenState>(screenState);

  const keysHeldRef = useRef<Set<string>>(new Set());
  const touchHeldRef = useRef<{
    left: boolean;
    right: boolean;
    up: boolean;
    down: boolean;
    dpadDirection: DPadDirection;
    jump: boolean;
    purify: boolean;
  }>({
    left: false,
    right: false,
    up: false,
    down: false,
    dpadDirection: 'NEUTRAL',
    jump: false,
    purify: false,
  });

  const pendingEdgesRef = useRef<{
    jumpJustPressed: boolean;
    jumpJustReleased: boolean;
    attackJustPressed: boolean;
  }>({
    jumpJustPressed: false,
    jumpJustReleased: false,
    attackJustPressed: false,
  });

  // Keep body data-state synchronized with screenState for automated & accessibility inspection
  useEffect(() => {
    screenStateRef.current = screenState;
    document.body.dataset.state = screenState;
  }, [screenState]);

  const clearAllInputs = useCallback(() => {
    keysHeldRef.current.clear();
    touchHeldRef.current = {
      left: false,
      right: false,
      up: false,
      down: false,
      dpadDirection: 'NEUTRAL',
      jump: false,
      purify: false,
    };
    pendingEdgesRef.current = {
      jumpJustPressed: false,
      jumpJustReleased: false,
      attackJustPressed: false,
    };
  }, []);

  const syncHudFromWorld = useCallback((w: WorldState) => {
    const px = w.player.x + w.player.width * 0.5;
    const py = w.player.y + w.player.height * 0.5;
    let activeZoneName: string | null = null;
    let activeZonePurification = 0;

    for (const z of w.corruptedZones) {
      if (
        px >= z.x - 36 &&
        px <= z.x + z.width + 36 &&
        py >= z.y - 60 &&
        py <= z.y + z.height + 40
      ) {
        activeZoneName = z.name;
        activeZonePurification = z.purification;
        break;
      }
    }

    const activeCp = w.checkpoints.find((c) => c.id === w.activeCheckpointId);
    const recentCp = w.checkpoints.find((c) => c.justActivatedTimer > 0);
    const recentSecret = w.secretAreas.find((s) => s.justDiscoveredTimer > 0);

    let checkpointBanner: string | null = null;
    if (recentSecret) {
      checkpointBanner = `★ Segreto Scoperto: ${recentSecret.name}`;
    } else if (recentCp) {
      checkpointBanner = `⚑ Checkpoint Attivato: ${recentCp.name}`;
    }

    const nextHud: HUDSnapshot = {
      hp: w.player.hp,
      maxHp: w.player.maxHp,
      energy: Math.round(w.light.energy),
      maxEnergy: w.light.maxEnergy,
      ghostEnergy: Math.round(w.light.ghostEnergy),
      isRecharging: w.light.isRecharging,
      purificationPercent: calculateGlobalPurification(w.corruptedZones),
      purifiedZones: w.corruptedZones.filter((z) => z.isPurified).length,
      totalZones: w.corruptedZones.length,
      activeZoneName,
      activeZonePurification: Math.round(activeZonePurification),
      enemiesRemaining: w.enemies.length,
      totalEnemies: w.stats.totalEnemies,
      sectionIndex: w.currentSection.index,
      totalSections: w.sections.length,
      sectionName: w.currentSection.name,
      crystalsCollected: w.stats.crystalsCollected,
      totalCrystals: w.stats.totalCrystals,
      activeCheckpointName: activeCp ? activeCp.name : null,
      checkpointBanner,
      secretDiscovered: w.secretAreas.some((s) => s.discovered),
    };

    setHudState((prev) => {
      if (
        prev.hp === nextHud.hp &&
        prev.maxHp === nextHud.maxHp &&
        prev.energy === nextHud.energy &&
        prev.ghostEnergy === nextHud.ghostEnergy &&
        prev.isRecharging === nextHud.isRecharging &&
        prev.purificationPercent === nextHud.purificationPercent &&
        prev.activeZoneName === nextHud.activeZoneName &&
        prev.activeZonePurification === nextHud.activeZonePurification &&
        prev.enemiesRemaining === nextHud.enemiesRemaining &&
        prev.sectionIndex === nextHud.sectionIndex &&
        prev.crystalsCollected === nextHud.crystalsCollected &&
        prev.activeCheckpointName === nextHud.activeCheckpointName &&
        prev.checkpointBanner === nextHud.checkpointBanner &&
        prev.secretDiscovered === nextHud.secretDiscovered
      ) {
        return prev;
      }
      return nextHud;
    });
  }, []);

  const handleStartOrResume = useCallback(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    clearAllInputs();
    document.body.dataset.state = 'playing';
    screenStateRef.current = 'playing';
    setScreenState('playing');
    canvasRef.current?.focus();
  }, [clearAllInputs]);

  const handleRestartLevel = useCallback(() => {
    const freshWorld = createDemoLevel();
    worldRef.current = freshWorld;
    setSummarySnapshot(null);
    syncHudFromWorld(freshWorld);
    handleStartOrResume();
  }, [handleStartOrResume, syncHudFromWorld]);

  const handleRespawnCheckpoint = useCallback(() => {
    const w = worldRef.current;
    respawnAtCheckpoint(w);
    setSummarySnapshot(null);
    syncHudFromWorld(w);
    handleStartOrResume();
  }, [handleStartOrResume, syncHudFromWorld]);

  const handlePauseGame = useCallback(() => {
    clearAllInputs();
    setSummarySnapshot(createRunSummary(worldRef.current, 'none'));
    document.body.dataset.state = 'paused';
    screenStateRef.current = 'paused';
    setScreenState('paused');
  }, [clearAllInputs]);

  const handleReturnTitle = useCallback(() => {
    const freshWorld = createDemoLevel();
    worldRef.current = freshWorld;
    clearAllInputs();
    setSummarySnapshot(null);
    syncHudFromWorld(freshWorld);
    document.body.dataset.state = 'title';
    screenStateRef.current = 'title';
    setScreenState('title');
  }, [clearAllInputs, syncHudFromWorld]);

  const handleToggleMute = useCallback(() => {
    soundEngine.muted = !soundEngine.muted;
    setMuted(soundEngine.muted);
  }, []);

  // Unified Keyboard & Focus-Loss Listeners
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const code = e.code;

      // Title screen start shortcut
      if (screenStateRef.current === 'title' && (code === 'Enter' || code === 'Space')) {
        e.preventDefault();
        handleStartOrResume();
        return;
      }

      // Pause / Resume toggle
      if (code === 'Escape' || code === 'KeyP') {
        e.preventDefault();
        if (screenStateRef.current === 'playing') {
          handlePauseGame();
        } else if (screenStateRef.current === 'paused') {
          handleStartOrResume();
        }
        return;
      }

      if (code === 'KeyM') {
        handleToggleMute();
        return;
      }

      if (code === 'KeyR' && screenStateRef.current === 'playing') {
        handleRestartLevel();
        return;
      }

      if (screenStateRef.current !== 'playing') return;

      if (
        code === 'ArrowLeft' ||
        code === 'ArrowRight' ||
        code === 'ArrowUp' ||
        code === 'Space'
      ) {
        e.preventDefault();
      }

      if (!keysHeldRef.current.has(code)) {
        keysHeldRef.current.add(code);
        if (code === 'Space' || code === 'KeyW' || code === 'ArrowUp') {
          pendingEdgesRef.current.jumpJustPressed = true;
        }
        if (code === 'KeyJ' || code === 'KeyF' || code === 'Enter') {
          pendingEdgesRef.current.attackJustPressed = true;
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const code = e.code;
      if (keysHeldRef.current.has(code)) {
        keysHeldRef.current.delete(code);
        if (code === 'Space' || code === 'KeyW' || code === 'ArrowUp') {
          pendingEdgesRef.current.jumpJustReleased = true;
        }
      }
    };

    const onBlur = () => {
      clearAllInputs();
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        clearAllInputs();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [clearAllInputs, handlePauseGame, handleRestartLevel, handleStartOrResume, handleToggleMute]);

  // Main 60 FPS Simulation & Rendering Loop (mounted once)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId = 0;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    let lastTime = performance.now();
    let hudSyncAccumulator = 0;

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(320, Math.floor(rect.width || window.innerWidth || 1280));
      const h = Math.max(240, Math.floor(rect.height || window.innerHeight || 720));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };

    resizeCanvas();
    const observer = new ResizeObserver(resizeCanvas);
    observer.observe(canvas);
    window.addEventListener('resize', resizeCanvas);

    const frameDelay =
      typeof navigator !== 'undefined' && navigator.webdriver ? 34 : 16;

    const scheduleNext = () => {
      if (cancelled) return;
      timerId = setTimeout(() => {
        if (cancelled) return;
        animationFrameId = requestAnimationFrame(tick);
      }, frameDelay);
    };

    const tick = (now: number) => {
      if (cancelled) return;
      const rawDt = Math.max(0.001, (now - lastTime) / 1000);
      lastTime = now;
      const timeSec = now / 1000;

      const world = worldRef.current;
      const vw = canvas.width;
      const vh = canvas.height;

      const params = new URLSearchParams(window.location.search);
      const sceneParam = params.get('scene');
      const freezeScene = params.get('freeze') === '1';

      if (screenStateRef.current === 'playing') {
        if (freezeScene && sceneParam) {
          if (world.player.animController) {
            stepAnimationController(
              world.player.animController,
              world.player.animState,
              world.player.facing,
              rawDt
            );
          }
        } else {
          const keys = keysHeldRef.current;
          const touch = touchHeldRef.current;
          const edges = pendingEdgesRef.current;

          const rawLeft = keys.has('ArrowLeft') || keys.has('KeyA') || touch.left;
          const rawRight =
            keys.has('ArrowRight') ||
            keys.has('KeyD') ||
            touch.right ||
            sceneParam === 'run';
          const rawUp = keys.has('ArrowUp') || keys.has('KeyW') || touch.up;
          const rawDown = keys.has('ArrowDown') || keys.has('KeyS') || touch.down;

          // Prevent contradictory opposite directional inputs
          const input: InputState = {
            left: rawLeft && !rawRight,
            right: rawRight && !rawLeft,
            up: rawUp && !rawDown,
            down: rawDown && !rawUp,
            dpadDirection: touch.dpadDirection,
            jumpHeld:
              keys.has('Space') || keys.has('KeyW') || keys.has('ArrowUp') || touch.jump,
            jumpJustPressed: edges.jumpJustPressed,
            jumpJustReleased: edges.jumpJustReleased,
            attackJustPressed: edges.attackJustPressed,
            purifyHeld: keys.has('KeyE') || keys.has('KeyK') || touch.purify,
          };

          // Consume single-frame edge triggers
          const didAction = edges.attackJustPressed || edges.jumpJustPressed;
          edges.jumpJustPressed = false;
          edges.jumpJustReleased = false;
          edges.attackJustPressed = false;

          const stepResult = stepWorld(world, input, rawDt, vw, vh);

          // Throttle React HUD state reconciliation so DOM remains stable between ticks
          hudSyncAccumulator += rawDt;
          if (didAction || hudSyncAccumulator >= 0.45 || stepResult.outcome !== 'none') {
            hudSyncAccumulator = 0;
            syncHudFromWorld(world);
          }

          if (stepResult.outcome !== 'none' && stepResult.summary) {
            clearAllInputs();
            setSummarySnapshot(stepResult.summary);
            document.body.dataset.state = 'gameover';
            screenStateRef.current = 'gameover';
            setScreenState('gameover');
          }
        }
      } else if (screenStateRef.current === 'title') {
        // Diegetic In-World Awakening idle animation on Title screen
        world.player.animTimer += rawDt;
        if (world.player.animController) {
          stepAnimationController(
            world.player.animController,
            'idle',
            world.player.facing,
            rawDt
          );
        }
        world.camera.x = 0;
        world.camera.y = Math.max(0, world.player.y - vh * 0.62);
      }

      if (document.body.dataset.animState !== world.player.animState) {
        document.body.dataset.animState = world.player.animState;
      }

      renderWorld(ctx, world, vw, vh, timeSec);
      scheduleNext();
    };

    animationFrameId = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      if (timerId !== null) clearTimeout(timerId);
      cancelAnimationFrame(animationFrameId);
      observer.disconnect();
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [clearAllInputs, syncHudFromWorld]);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#050611] select-none">
      {/* Full-Viewport 2D Game Canvas */}
      <canvas
        ref={canvasRef}
        tabIndex={0}
        data-testid="game-canvas"
        aria-label="Mondo di gioco Luce contro Tenebre"
        className="block w-full h-full outline-none"
      />

      {/* Diegetic Title Screen Overlay */}
      {screenState === 'title' && (
        <TitleOverlay
          onStartGame={handleStartOrResume}
          onOpenInspector={() => setInspectorOpen(true)}
        />
      )}

      {/* Active Gameplay HUD & Touch Controls */}
      {screenState === 'playing' && (
        <>
          <HUD
            hud={hudState}
            muted={muted}
            onToggleMute={handleToggleMute}
            onPause={handlePauseGame}
            onRestart={handleRestartLevel}
            onOpenInspector={() => setInspectorOpen(true)}
          />
          <TouchControls
            onLeftChange={(pressed) => {
              touchHeldRef.current.left = pressed;
              if (pressed) touchHeldRef.current.right = false;
            }}
            onRightChange={(pressed) => {
              touchHeldRef.current.right = pressed;
              if (pressed) touchHeldRef.current.left = false;
            }}
            onUpChange={(pressed) => {
              touchHeldRef.current.up = pressed;
              if (pressed) touchHeldRef.current.down = false;
            }}
            onDownChange={(pressed) => {
              touchHeldRef.current.down = pressed;
              if (pressed) touchHeldRef.current.up = false;
            }}
            onDirectionChange={(direction, axes) => {
              touchHeldRef.current.dpadDirection = direction;
              touchHeldRef.current.left = axes.left;
              touchHeldRef.current.right = axes.right;
              touchHeldRef.current.up = axes.up;
              touchHeldRef.current.down = axes.down;
            }}
            onJumpPress={() => {
              touchHeldRef.current.jump = true;
              pendingEdgesRef.current.jumpJustPressed = true;
            }}
            onJumpRelease={() => {
              touchHeldRef.current.jump = false;
              pendingEdgesRef.current.jumpJustReleased = true;
            }}
            onAttackPress={() => {
              pendingEdgesRef.current.attackJustPressed = true;
            }}
            onPurifyChange={(pressed) => {
              touchHeldRef.current.purify = pressed;
            }}
          />
        </>
      )}

      {/* Pause / Victory / Game Over Modal */}
      {(screenState === 'paused' || screenState === 'gameover') && (
        <StatusModal
          mode={screenState}
          summary={summarySnapshot}
          onResume={screenState === 'paused' ? handleStartOrResume : undefined}
          onRespawnCheckpoint={handleRespawnCheckpoint}
          onRestart={handleRestartLevel}
          onReturnTitle={handleReturnTitle}
        />
      )}

      {/* Concept Art & Godot 4 Architecture Modal */}
      {inspectorOpen && (
        <ConceptInspectorModal onClose={() => setInspectorOpen(false)} />
      )}
    </main>
  );
}
