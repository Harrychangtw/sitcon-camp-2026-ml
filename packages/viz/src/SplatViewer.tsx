// The splat library ships no types; the sibling .d.ts declares the surface we
// use. It's an AMBIENT `declare module`, so an `import` can't pull it in — the
// reference directive is the one mechanism that carries it into every app that
// compiles @camp/viz straight from TS source (Vite workspace style).
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./gaussian-splats-3d.d.ts" />
import { useEffect, useRef } from "react";
import { useResizeObserver } from "./useResizeObserver";

/** One camera placement: where the eye is and what it looks at. */
export interface SplatPose {
  position: [number, number, number];
  lookAt: [number, number, number];
}

/** Camera state reported by `onPoseChange` (throttled). */
export interface SplatPoseReport {
  position: [number, number, number];
  /** Unit view direction — hosts derive altitude/heading from this + position. */
  direction: [number, number, number];
}

export interface SplatViewerProps {
  /** URL of the ACTIVE splat scene (.splat / .ksplat / .ply / .spz). */
  src: string;
  /**
   * URLs to keep loaded alongside `src` (hidden). Swapping `src` to one of
   * these is instant and flicker-free — the camera is simply never touched —
   * which is how an A/B pair compares the exact same view.
   */
  keepLoaded?: string[];
  /** "fly": WASD/arrows + drag-look + scroll altitude. "orbit": turntable. */
  controls?: "fly" | "orbit";
  /** The scene's natural up vector. Default [0, 1, 0]. */
  up?: [number, number, number];
  /** Camera placement on mount. Later changes are ignored — use `jumpTo`. */
  initialPose: SplatPose;
  /**
   * Jump the camera to this pose. Keyed on OBJECT IDENTITY: pass a fresh
   * object to re-trigger the same viewpoint.
   */
  jumpTo?: SplatPose | null;
  /** Axis-aligned flight box the fly camera is clamped inside. */
  bounds?: [[number, number, number], [number, number, number]];
  /**
   * Fly mode: double-clicking a spot glides the camera there — the click ray
   * is intersected with the plane at `planeHeight` (along `up`) and the eye
   * settles `eyeHeight` above it, keeping the current heading.
   */
  doubleClickFly?: { planeHeight: number; eyeHeight: number };
  /** Download/parse progress of the active `src`, 0..1. */
  onProgress?: (frac: number) => void;
  /** The active `src` is displayable (fires again per `src` change). */
  onReady?: () => void;
  /** A scene failed to load; `src` says which one (it may be a hidden
   * `keepLoaded` preload, not the displayed scene — hosts should degrade,
   * not tear down). */
  onError?: (error: Error, src: string) => void;
  /** Throttled (~200 ms) camera report while the student moves. */
  onPoseChange?: (pose: SplatPoseReport) => void;
  /** Pixel height; width is responsive. Default 480. Ignored when `fill`. */
  height?: number;
  /** Fill the parent's box instead of using `height`. */
  fill?: boolean;
  className?: string;
}

interface LoadedScene {
  viewer: import("@mkkellogg/gaussian-splats-3d").DropInViewer;
  ready: boolean;
  failed: boolean;
  promise: Promise<void>;
}

// The live GL/lib objects, created once per mount by the async setup effect.
interface Engine {
  THREE: typeof import("three");
  GS: typeof import("@mkkellogg/gaussian-splats-3d");
  renderer: import("three").WebGLRenderer;
  scene: import("three").Scene;
  camera: import("three").PerspectiveCamera;
  upV: import("three").Vector3;
  /** Rotates the Y-up reference frame onto the scene's `up`. */
  frameQ: import("three").Quaternion;
  invFrameQ: import("three").Quaternion;
  /** Scene scale unit — drives fly speed, near/far, wheel step. */
  diag: number;
  boundsLo: import("three").Vector3 | null;
  boundsHi: import("three").Vector3 | null;
  fly: FlyState | null;
  orbit: { update: () => void; dispose: () => void; target: import("three").Vector3 } | null;
  loaded: Map<string, LoadedScene>;
  /** The url that should be visible — checked by late-resolving loads. */
  desired: string;
  /** The desired url whose readiness was last announced to the host; reset
   * whenever `desired` changes so re-selecting a warm scene re-fires onReady. */
  lastAnnounced: string | null;
  setPose: (pose: SplatPose, animate?: boolean) => void;
}

interface FlyState {
  /** Rendered look angles — eased toward the drag targets each frame. */
  yaw: number;
  pitch: number;
  targetYaw: number;
  targetPitch: number;
  /** Smoothed movement velocity (world units/s). */
  vel: import("three").Vector3;
  keys: Set<string>;
  boost: boolean;
  /** An in-flight viewpoint glide (jumpTo); cancelled by any user input. */
  transition: {
    t0: number;
    dur: number;
    fromPos: import("three").Vector3;
    toPos: import("three").Vector3;
    fromYaw: number;
    toYaw: number;
    fromPitch: number;
    toPitch: number;
  } | null;
}

/** Shortest signed angular distance a→b. */
function angleDelta(a: number, b: number): number {
  const d = (b - a) % (Math.PI * 2);
  return d > Math.PI ? d - Math.PI * 2 : d < -Math.PI ? d + Math.PI * 2 : d;
}

const easeInOut = (u: number) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);

function formatOf(
  GS: typeof import("@mkkellogg/gaussian-splats-3d"),
  url: string,
): number {
  const path = url.split("?")[0]!.toLowerCase();
  if (path.endsWith(".ksplat")) return GS.SceneFormat.KSplat;
  if (path.endsWith(".ply")) return GS.SceneFormat.Ply;
  if (path.endsWith(".spz")) return GS.SceneFormat.Spz;
  return GS.SceneFormat.Splat;
}

/** True when a key event belongs to a form field, not the canvas. */
function isTypingTarget(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return (
    !!t &&
    (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)
  );
}

/**
 * A 3D Gaussian Splatting scene viewer (three.js + @mkkellogg/gaussian-
 * splats-3d). Prop-driven and resize-aware; splat rendering is PLAYBACK
 * (sorting + drawing a precomputed scene) — nothing is optimized here.
 *
 * SSR-safe: three and the splat library are lazy-imported INSIDE the effect,
 * never at module scope. The GL context is created once per mount; `src`
 * swaps only toggle scene visibility (with `keepLoaded` warm, an A/B flip is
 * instant and never moves the camera), and everything is disposed on unmount
 * — renderer, splat buffers, and the library's sort workers.
 *
 * Fly mode: drag to look, WASD/arrows to move (horizontal, drone-style),
 * scroll/pinch for altitude, Shift to go faster, clamped inside `bounds`.
 * Orbit mode: standard damped turntable around `initialPose.lookAt`.
 */
export function SplatViewer({
  src,
  keepLoaded,
  controls = "orbit",
  up = [0, 1, 0],
  initialPose,
  jumpTo = null,
  bounds,
  doubleClickFly,
  onProgress,
  onReady,
  onError,
  onPoseChange,
  height = 480,
  fill = false,
  className,
}: SplatViewerProps) {
  const { ref: containerRef, size } = useResizeObserver<HTMLDivElement>();
  const mountRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const enginePromiseRef = useRef<Promise<Engine | null> | null>(null);

  // Callback props live in refs so the setup effect (keyed once) and the
  // async loaders always see the latest without rebuilding the GL context.
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const onPoseChangeRef = useRef(onPoseChange);
  onPoseChangeRef.current = onPoseChange;

  // Mount-time-only configuration (documented on the props): a station that
  // needs a different scene/mode remounts with a `key`.
  const initialRef = useRef({ controls, up, initialPose, bounds, doubleClickFly });

  const width = size.width;
  const h = fill ? size.height : height;

  // ENGINE SETUP — once per mount. Async (lazy imports), so dependents await
  // enginePromiseRef. Cleanup tears down GL, workers, and listeners.
  useEffect(() => {
    const container = containerRef.current;
    const mount = mountRef.current;
    if (!container || !mount) return;

    let disposed = false;
    let frame = 0;
    let detach: (() => void) | null = null;

    const promise = (async (): Promise<Engine | null> => {
      const THREE = await import("three");
      const GS = await import("@mkkellogg/gaussian-splats-3d");
      const cfg = initialRef.current;
      const useOrbit = cfg.controls === "orbit";
      const orbitCtor = useOrbit
        ? (await import("three/examples/jsm/controls/OrbitControls.js"))
            .OrbitControls
        : null;
      if (disposed || !containerRef.current) return null;

      const scene = new THREE.Scene();
      const upV = new THREE.Vector3(...cfg.up).normalize();
      const frameQ = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        upV,
      );
      const invFrameQ = frameQ.clone().invert();

      const boundsLo = cfg.bounds ? new THREE.Vector3(...cfg.bounds[0]) : null;
      const boundsHi = cfg.bounds ? new THREE.Vector3(...cfg.bounds[1]) : null;
      const diag =
        boundsLo && boundsHi
          ? boundsHi.clone().sub(boundsLo).length()
          : new THREE.Vector3(...cfg.initialPose.lookAt)
              .sub(new THREE.Vector3(...cfg.initialPose.position))
              .length() * 4 || 100;

      const camera = new THREE.PerspectiveCamera(
        60,
        1,
        Math.max(diag / 1000, 0.01),
        diag * 8,
      );
      camera.up.copy(upV);

      const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.domElement.style.display = "block";
      mount.appendChild(renderer.domElement);

      const engine: Engine = {
        THREE,
        GS,
        renderer,
        scene,
        camera,
        upV,
        frameQ,
        invFrameQ,
        diag,
        boundsLo,
        boundsHi,
        fly: useOrbit
          ? null
          : {
              yaw: 0,
              pitch: 0,
              targetYaw: 0,
              targetPitch: 0,
              vel: new THREE.Vector3(),
              keys: new Set(),
              boost: false,
              transition: null,
            },
        orbit: null,
        loaded: new Map(),
        desired: "",
        lastAnnounced: null,
        setPose: () => {},
      };

      // Direction math in the scene's up-frame: yaw/pitch are standard Y-up
      // FPS angles, rotated into the real frame by frameQ.
      const dirFromYawPitch = (yaw: number, pitch: number) =>
        new THREE.Vector3(
          Math.sin(yaw) * Math.cos(pitch),
          Math.sin(pitch),
          -Math.cos(yaw) * Math.cos(pitch),
        ).applyQuaternion(frameQ);
      const anglesFromDir = (d: import("three").Vector3) => {
        const l = d.clone().applyQuaternion(invFrameQ).normalize();
        return {
          pitch: Math.asin(Math.min(1, Math.max(-1, l.y))),
          yaw: Math.atan2(l.x, -l.z),
        };
      };

      const clamp = (p: import("three").Vector3) => {
        if (boundsLo && boundsHi) p.clamp(boundsLo, boundsHi);
      };

      engine.setPose = (pose: SplatPose, animate = false) => {
        const eye = new THREE.Vector3(...pose.position);
        const at = new THREE.Vector3(...pose.lookAt);
        clamp(eye);
        const fly = engine.fly;
        if (fly) {
          const a = anglesFromDir(at.clone().sub(eye));
          const toPitch = Math.min(1.45, Math.max(-1.45, a.pitch));
          if (animate) {
            // Glide instead of teleporting — the cut is disorienting and the
            // motion itself shows WHERE the new viewpoint sits in the scene.
            fly.transition = {
              t0: performance.now(),
              dur: 1100,
              fromPos: camera.position.clone(),
              toPos: eye,
              fromYaw: fly.yaw,
              toYaw: fly.yaw + angleDelta(fly.yaw, a.yaw),
              fromPitch: fly.pitch,
              toPitch,
            };
            fly.vel.set(0, 0, 0);
            return;
          }
          fly.transition = null;
          fly.yaw = fly.targetYaw = a.yaw;
          fly.pitch = fly.targetPitch = toPitch;
          fly.vel.set(0, 0, 0);
        }
        camera.position.copy(eye);
        if (engine.orbit) engine.orbit.target.copy(at);
        camera.lookAt(at);
      };

      if (orbitCtor) {
        const orbit = new orbitCtor(camera, renderer.domElement);
        orbit.enableDamping = true;
        orbit.rotateSpeed = 0.5;
        orbit.zoomSpeed = 0.6;
        orbit.panSpeed = 0.6;
        engine.orbit = orbit;
      }
      engine.setPose(cfg.initialPose);

      // Initial size from the live container (fill mode reads the real box).
      const w0 = container.clientWidth || 1;
      const h0 = container.clientHeight || height;
      renderer.setSize(w0, h0, false);
      renderer.domElement.style.width = `${w0}px`;
      renderer.domElement.style.height = `${h0}px`;
      camera.aspect = w0 / h0;
      camera.updateProjectionMatrix();

      // FLY INPUT — drag-look + WASD/arrows + wheel altitude + pinch dolly.
      const dom = renderer.domElement;
      const detachFns: Array<() => void> = [];
      if (engine.fly) {
        const fly = engine.fly;
        dom.style.cursor = "grab";
        dom.style.touchAction = "none";
        const cancelGlide = () => {
          fly.transition = null;
        };

        // Pointers: 1 active → look; 2 active → pinch-dolly along the view.
        const pointers = new Map<number, { x: number; y: number }>();
        let pinchDist = 0;
        const onPointerDown = (e: PointerEvent) => {
          dom.setPointerCapture(e.pointerId);
          pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (pointers.size === 2) {
            const [a, b] = [...pointers.values()];
            pinchDist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
          }
          cancelGlide();
          dom.style.cursor = "grabbing";
        };
        const onPointerMove = (e: PointerEvent) => {
          const prev = pointers.get(e.pointerId);
          if (!prev) return;
          const dx = e.clientX - prev.x;
          const dy = e.clientY - prev.y;
          pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (pointers.size === 1) {
            // GRAB the world (street-view style): drag right pulls the scene
            // right, i.e. you turn LEFT; drag down pulls it down → look up.
            // The drag writes TARGET angles; the render loop eases toward
            // them, so the tail of each flick lands softly.
            fly.targetYaw -= dx * 0.0024;
            fly.targetPitch = Math.min(
              1.45,
              Math.max(-1.45, fly.targetPitch + dy * 0.0024),
            );
          } else if (pointers.size === 2) {
            const [a, b] = [...pointers.values()];
            const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
            const delta = dist - pinchDist;
            pinchDist = dist;
            // Pinch out → dolly forward along the current view direction.
            const dir = dirFromYawPitch(fly.yaw, fly.pitch);
            camera.position.addScaledVector(dir, delta * diag * 0.0012);
            clamp(camera.position);
          }
        };
        const onPointerUp = (e: PointerEvent) => {
          pointers.delete(e.pointerId);
          if (pointers.size === 0) dom.style.cursor = "grab";
        };
        const onWheel = (e: WheelEvent) => {
          e.preventDefault();
          cancelGlide();
          // Scroll = altitude, the drone-style third axis.
          camera.position.addScaledVector(upV, -e.deltaY * diag * 0.0004);
          clamp(camera.position);
        };
        // Double-click a spot → glide there at eye height, keeping heading.
        const dcf = cfg.doubleClickFly;
        const onDoubleClick = (e: MouseEvent) => {
          if (!dcf) return;
          const r = dom.getBoundingClientRect();
          const ndc = new THREE.Vector2(
            ((e.clientX - r.left) / r.width) * 2 - 1,
            -((e.clientY - r.top) / r.height) * 2 + 1,
          );
          const ray = new THREE.Raycaster();
          ray.setFromCamera(ndc, camera);
          // Plane up·x = planeHeight → THREE.Plane(normal, -planeHeight).
          const plane = new THREE.Plane(upV.clone(), -dcf.planeHeight);
          const hit = new THREE.Vector3();
          if (!ray.ray.intersectPlane(plane, hit)) return;
          const eye = hit.clone().addScaledVector(upV, dcf.eyeHeight);
          clamp(eye);
          const dir = dirFromYawPitch(fly.targetYaw, fly.targetPitch);
          engine.setPose(
            {
              position: [eye.x, eye.y, eye.z],
              lookAt: [eye.x + dir.x, eye.y + dir.y, eye.z + dir.z],
            },
            true,
          );
        };
        const KEYS = new Set([
          "KeyW", "KeyA", "KeyS", "KeyD",
          "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
        ]);
        const onKeyDown = (e: KeyboardEvent) => {
          if (isTypingTarget(e)) return;
          fly.boost = e.shiftKey;
          if (!KEYS.has(e.code)) return;
          if (e.code.startsWith("Arrow")) e.preventDefault();
          cancelGlide();
          fly.keys.add(e.code);
        };
        const onKeyUp = (e: KeyboardEvent) => {
          fly.boost = e.shiftKey;
          fly.keys.delete(e.code);
        };
        const onBlur = () => fly.keys.clear();

        dom.addEventListener("pointerdown", onPointerDown);
        dom.addEventListener("pointermove", onPointerMove);
        dom.addEventListener("pointerup", onPointerUp);
        dom.addEventListener("pointercancel", onPointerUp);
        dom.addEventListener("wheel", onWheel, { passive: false });
        dom.addEventListener("dblclick", onDoubleClick);
        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("keyup", onKeyUp);
        window.addEventListener("blur", onBlur);
        detachFns.push(() => {
          dom.removeEventListener("pointerdown", onPointerDown);
          dom.removeEventListener("pointermove", onPointerMove);
          dom.removeEventListener("pointerup", onPointerUp);
          dom.removeEventListener("pointercancel", onPointerUp);
          dom.removeEventListener("wheel", onWheel);
          dom.removeEventListener("dblclick", onDoubleClick);
          window.removeEventListener("keydown", onKeyDown);
          window.removeEventListener("keyup", onKeyUp);
          window.removeEventListener("blur", onBlur);
        });
      }
      detach = () => detachFns.forEach((fn) => fn());

      // RENDER LOOP — fly integration, damped orbit, throttled pose reports.
      const scratchF = new THREE.Vector3();
      const scratchR = new THREE.Vector3();
      const scratchD = new THREE.Vector3();
      let lastT = performance.now();
      let lastReport = 0;
      const lastPos = camera.position.clone();
      const lastQuat = camera.quaternion.clone();
      const loop = (t: number) => {
        frame = requestAnimationFrame(loop);
        const dt = Math.min(0.05, (t - lastT) / 1000);
        lastT = t;

        const fly = engine.fly;
        if (fly) {
          const glide = fly.transition;
          if (glide) {
            // Viewpoint glide (jumpTo / double-click) — ease position and the
            // shortest-path angles together; input handlers cancel it.
            const u = Math.min(1, (t - glide.t0) / glide.dur);
            const s = easeInOut(u);
            camera.position.lerpVectors(glide.fromPos, glide.toPos, s);
            fly.yaw = fly.targetYaw = glide.fromYaw + (glide.toYaw - glide.fromYaw) * s;
            fly.pitch = fly.targetPitch =
              glide.fromPitch + (glide.toPitch - glide.fromPitch) * s;
            if (u >= 1) fly.transition = null;
          } else {
            // Damped look: ease the rendered angles toward the drag targets so
            // each flick has a soft tail instead of a hard stop.
            const look = 1 - Math.exp(-16 * dt);
            fly.yaw += angleDelta(fly.yaw, fly.targetYaw) * look;
            fly.pitch += (fly.targetPitch - fly.pitch) * look;

            // Horizontal (drone) movement basis: forward = look direction
            // flattened against `up`; falls back to frame-forward when the
            // student looks straight down.
            const dirNow = dirFromYawPitch(fly.yaw, fly.pitch);
            scratchF.copy(dirNow).addScaledVector(upV, -dirNow.dot(upV));
            if (scratchF.lengthSq() < 1e-6) {
              scratchF.set(0, 0, -1).applyQuaternion(frameQ);
            }
            scratchF.normalize();
            scratchR.crossVectors(scratchF, upV).normalize();
            scratchD.set(0, 0, 0);
            const k = fly.keys;
            if (k.has("KeyW") || k.has("ArrowUp")) scratchD.add(scratchF);
            if (k.has("KeyS") || k.has("ArrowDown")) scratchD.sub(scratchF);
            if (k.has("KeyA") || k.has("ArrowLeft")) scratchD.sub(scratchR);
            if (k.has("KeyD") || k.has("ArrowRight")) scratchD.add(scratchR);
            // Velocity smoothing: accelerate toward the desired velocity and
            // coast to a stop on release, instead of stop-start jerks.
            const speed = diag * 0.16 * (fly.boost ? 3 : 1);
            if (scratchD.lengthSq() > 0) scratchD.normalize().multiplyScalar(speed);
            fly.vel.lerp(scratchD, 1 - Math.exp(-8 * dt));
            if (fly.vel.lengthSq() > 1e-8) {
              camera.position.addScaledVector(fly.vel, dt);
              clamp(camera.position);
            }
          }
          const dir = dirFromYawPitch(fly.yaw, fly.pitch);
          camera.up.copy(upV);
          scratchD.copy(camera.position).add(dir);
          camera.lookAt(scratchD);
        } else {
          engine.orbit?.update();
        }

        if (onPoseChangeRef.current && t - lastReport > 200) {
          const moved =
            camera.position.distanceToSquared(lastPos) > 1e-8 ||
            Math.abs(1 - Math.abs(camera.quaternion.dot(lastQuat))) > 1e-7;
          if (moved) {
            lastPos.copy(camera.position);
            lastQuat.copy(camera.quaternion);
            lastReport = t;
            camera.getWorldDirection(scratchD);
            onPoseChangeRef.current({
              position: [camera.position.x, camera.position.y, camera.position.z],
              direction: [scratchD.x, scratchD.y, scratchD.z],
            });
          }
        }

        renderer.render(scene, camera);
      };
      frame = requestAnimationFrame(loop);

      engineRef.current = engine;
      return engine;
    })();
    enginePromiseRef.current = promise;

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      detach?.();
      void promise.then((engine) => {
        // frame may have been re-assigned after the first cancel ran.
        cancelAnimationFrame(frame);
        if (!engine) return;
        for (const s of engine.loaded.values()) {
          engine.scene.remove(s.viewer);
          void Promise.resolve()
            .then(() => s.viewer.dispose())
            .catch(() => {});
        }
        engine.loaded.clear();
        engine.orbit?.dispose();
        engine.renderer.dispose();
        // Hosts remount this component per scene (key=…); without an explicit
        // context loss each orphaned canvas keeps a live WebGL context until
        // GC, and browsers evict the oldest past ~16 with a black canvas.
        engine.renderer.forceContextLoss();
        const canvas = engine.renderer.domElement;
        canvas.parentNode?.removeChild(canvas);
        engineRef.current = null;
      });
    };
    // Created once per mount; scene/config changes remount via the host's key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // SCENE SYNC — ensure {src ∪ keepLoaded} are loaded, show exactly `src`.
  // While a newly-selected src is still loading, the previous scene stays up
  // (no flash to empty); with keepLoaded warm the swap is a same-frame flip.
  const keepKey = (keepLoaded ?? []).join("|");
  useEffect(() => {
    let cancelled = false;
    const wanted = new Set([src, ...(keepLoaded ?? [])]);
    void enginePromiseRef.current?.then((engine) => {
      if (cancelled || !engine || engineRef.current !== engine) return;
      if (engine.desired !== src) {
        engine.desired = src;
        // A change of the active scene re-arms the announcement, so flipping
        // BACK to an already-warm scene still fires onReady (the host clears
        // its "switching" state on it).
        engine.lastAnnounced = null;
      }

      // Drop scenes no longer wanted (frees splat buffers + sort workers).
      for (const [url, s] of engine.loaded) {
        if (!wanted.has(url)) {
          engine.loaded.delete(url);
          engine.scene.remove(s.viewer);
          void Promise.resolve()
            .then(() => s.viewer.dispose())
            .catch(() => {});
        }
      }

      const applyVisibility = () => {
        const active = engine.loaded.get(engine.desired);
        if (!active?.ready) return; // keep showing the old scene until ready
        for (const [url, s] of engine.loaded) {
          s.viewer.visible = url === engine.desired && s.ready;
        }
      };
      const announce = (url: string) => {
        if (url !== engine.desired || engine.lastAnnounced === url) return;
        engine.lastAnnounced = url;
        onProgressRef.current?.(1);
        onReadyRef.current?.();
      };

      const ensure = (url: string): LoadedScene => {
        const s = engine.loaded.get(url);
        if (s) return s;
        const viewer = new engine.GS.DropInViewer({
          sharedMemoryForWorkers: false,
          freeIntermediateSplatData: true,
          sceneRevealMode: engine.GS.SceneRevealMode.Instant,
        });
        viewer.visible = false;
        engine.scene.add(viewer);
        const entry: LoadedScene = {
          viewer,
          ready: false,
          failed: false,
          promise: Promise.resolve(),
        };
        entry.promise = viewer
          .addSplatScene(url, {
            format: formatOf(engine.GS, url),
            showLoadingUI: false,
            splatAlphaRemovalThreshold: 1,
            onProgress: (percent) => {
              if (url === engine.desired && !entry.ready) {
                onProgressRef.current?.(Math.min(1, percent / 100));
              }
            },
          })
          .then(() => {
            // Guard against a late resolve of an entry the sync effect
            // already evicted (or a disposed engine) — announcing then would
            // leak a stale onReady into the host.
            if (engine.loaded.get(url) !== entry) return;
            entry.ready = true;
            applyVisibility();
            announce(url);
          })
          .catch((err: unknown) => {
            entry.failed = true;
            if (engine.loaded.get(url) === entry) {
              onErrorRef.current?.(
                err instanceof Error ? err : new Error(String(err)),
                url,
              );
            }
          });
        engine.loaded.set(url, entry);
        return entry;
      };

      // The ACTIVE scene loads first; hidden keepLoaded partners start only
      // once it resolves, so the first paint never shares bandwidth with a
      // preload the student can't see yet.
      const preloadRest = () => {
        if (engineRef.current !== engine) return;
        for (const url of wanted) {
          if (url !== engine.desired) ensure(url);
        }
      };
      const active = ensure(src);
      if (active.ready) {
        applyVisibility();
        announce(src);
        preloadRest();
      } else {
        void active.promise.then(preloadRest);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, keepKey]);

  // JUMP — object identity keyed, so the host can re-fire the same viewpoint.
  // Fly mode glides there; orbit mode snaps (its damping covers the cut).
  useEffect(() => {
    if (!jumpTo) return;
    let cancelled = false;
    void enginePromiseRef.current?.then((engine) => {
      if (cancelled || !engine || engineRef.current !== engine) return;
      engine.setPose(jumpTo, true);
    });
    return () => {
      cancelled = true;
    };
  }, [jumpTo]);

  // RESIZE — in place, tracking measured (fill) or fixed height.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || width === 0 || !h) return;
    engine.renderer.setSize(width, h, false);
    engine.renderer.domElement.style.width = `${width}px`;
    engine.renderer.domElement.style.height = `${h}px`;
    engine.camera.aspect = width / h;
    engine.camera.updateProjectionMatrix();
  }, [width, h]);

  return (
    <div
      ref={containerRef}
      className={`relative ${fill ? "h-full w-full" : "w-full"} ${className ?? ""}`}
      style={fill ? undefined : { height }}
    >
      <div ref={mountRef} className="absolute inset-0" />
    </div>
  );
}
