import { useEffect, useRef } from "react";
import { useResizeObserver } from "./useResizeObserver";
import {
  categoryColorMap,
  mix,
  useThemeColors,
  type RGB,
  type ThemeColors,
} from "./theme";

export interface Scatter3DPoint {
  x: number;
  y: number;
  z: number;
  category?: string;
  /** Optional label; also the id matched against `highlight`. */
  label?: string;
}

export interface Scatter3DProps {
  data: Scatter3DPoint[];
  /** Color points by `category`. Default true. */
  colorBy?: boolean;
  /**
   * Labels to spotlight in the focus accent (lime); the rest are dimmed toward
   * the background. Precedence: highlight > category > greyscale base.
   */
  highlight?: string[];
  /** Pixel height; width is responsive. Default 360. */
  height?: number;
  /** Slowly auto-rotate the camera. Default false. */
  autoRotate?: boolean;
}

// three.js is loaded lazily, so we can't name its types at module scope. This
// bag holds the live GL objects between effects (created once, mutated after).
interface Engine {
  THREE: typeof import("three");
  renderer: import("three").WebGLRenderer;
  scene: import("three").Scene;
  camera: import("three").PerspectiveCamera;
  controls: { update: () => void; dispose: () => void; autoRotate: boolean };
  geometry: import("three").BufferGeometry;
  material: import("three").PointsMaterial;
  points: import("three").Points;
}

/** Repaint the per-vertex color attribute in place (no GL context churn). */
function paintColors(
  engine: Engine,
  data: Scatter3DPoint[],
  colorBy: boolean,
  highlight: string[] | undefined,
  colors: ThemeColors,
) {
  const { THREE, geometry } = engine;
  const hot = new Set(highlight ?? []);
  const hasHighlight = hot.size > 0;
  const categories = Array.from(new Set(data.map((d) => d.category ?? "•")));
  const catColors = categoryColorMap(colors, categories);

  const attr = geometry.getAttribute("color");
  const arr = attr.array as Float32Array;
  const scratch = new THREE.Color();

  for (let i = 0; i < data.length; i++) {
    const d = data[i];
    if (!d) continue;
    const isHot = hasHighlight && d.label != null && hot.has(d.label);
    let rgb: RGB;
    if (isHot) {
      rgb = colors.accent;
    } else {
      const base: RGB = colorBy
        ? catColors.get(d.category ?? "•") ?? colors.muted
        : colors.muted;
      // Dim the field toward the background when a focus set is active.
      rgb = hasHighlight ? mix(base, colors.bg, 0.82) : base;
    }
    // Interpret the token RGB as sRGB so the renderer's color management shows
    // it faithfully (matches how the CSS vars look in the browser).
    scratch.setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, THREE.SRGBColorSpace);
    arr[i * 3] = scratch.r;
    arr[i * 3 + 1] = scratch.g;
    arr[i * 3 + 2] = scratch.b;
  }
  attr.needsUpdate = true;
}

/**
 * A rotatable 3D point cloud (three.js), used to show high-dimensional token
 * embeddings projected to 3D. Prop-driven and resize-aware; reads all colors
 * from the @camp/ui theme (no hard-coded hues). SSR-safe: three is lazy-imported
 * INSIDE the effect, never at module scope or during render.
 *
 * The GL context is created once (keyed on `data`); highlight/colorBy changes
 * only repaint the color buffer, so searching never tears down the renderer.
 */
export function Scatter3D({
  data,
  colorBy = true,
  highlight,
  height = 360,
  autoRotate = false,
}: Scatter3DProps) {
  const { ref: containerRef, size } = useResizeObserver<HTMLDivElement>();
  const engineRef = useRef<Engine | null>(null);
  const width = size.width;

  // Latest theme colors, reachable from the async setup closure without making
  // setup depend on (and rebuild for) color changes.
  const colors = useThemeColors();
  const latestColors = useRef(colors);
  latestColors.current = colors;

  // GL SETUP — created once per `data` (data loads once, so ~2-3 times total,
  // NOT per keystroke). Highlight/colorBy live in the repaint effect below.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || data.length === 0) return;

    let disposed = false;
    let frame = 0;

    (async () => {
      const THREE = await import("three");
      const { OrbitControls } = await import(
        "three/examples/jsm/controls/OrbitControls.js"
      );
      if (disposed || !containerRef.current) return;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 2000);
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.domElement.style.display = "block";
      container.appendChild(renderer.domElement);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.autoRotate = autoRotate;
      controls.autoRotateSpeed = 0.6;

      // Geometry: positions + a color buffer (filled by paintColors).
      const n = data.length;
      const positions = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const d = data[i];
        if (!d) continue;
        positions[i * 3] = d.x;
        positions[i * 3 + 1] = d.y;
        positions[i * 3 + 2] = d.z;
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute(
        "color",
        new THREE.BufferAttribute(new Float32Array(n * 3), 3),
      );
      const material = new THREE.PointsMaterial({
        size: 0.16,
        vertexColors: true,
        sizeAttenuation: true,
      });
      const points = new THREE.Points(geometry, material);
      scene.add(points);

      // Frame the camera to the cloud's bounding sphere.
      geometry.computeBoundingSphere();
      const sphere = geometry.boundingSphere;
      const radius = sphere && sphere.radius > 0 ? sphere.radius : 5;
      const center = sphere ? sphere.center : new THREE.Vector3();
      controls.target.copy(center);
      camera.position.set(
        center.x + radius * 1.5,
        center.y + radius * 1.1,
        center.z + radius * 1.9,
      );
      camera.near = radius / 100;
      camera.far = radius * 30;

      const engine: Engine = {
        THREE,
        renderer,
        scene,
        camera,
        controls,
        geometry,
        material,
        points,
      };
      engineRef.current = engine;

      // Initial paint + size using the container's live width.
      paintColors(engine, data, colorBy, highlight, latestColors.current);
      const w = container.clientWidth || 1;
      renderer.setSize(w, height, false);
      renderer.domElement.style.width = `${w}px`;
      renderer.domElement.style.height = `${height}px`;
      camera.aspect = w / height;
      camera.updateProjectionMatrix();

      const loop = () => {
        frame = requestAnimationFrame(loop);
        controls.update();
        renderer.render(scene, camera);
      };
      loop();
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      const e = engineRef.current;
      if (e) {
        e.controls.dispose();
        e.geometry.dispose();
        e.material.dispose();
        e.renderer.dispose();
        const canvas = e.renderer.domElement;
        canvas.parentNode?.removeChild(canvas);
      }
      engineRef.current = null;
    };
    // Rebuild only when the point set itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // REPAINT — cheap color-buffer update on focus/category/theme changes.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    paintColors(engine, data, colorBy, highlight, colors);
  }, [data, colorBy, highlight, colors]);

  // Auto-rotate toggles without rebuilding the context.
  useEffect(() => {
    if (engineRef.current) engineRef.current.controls.autoRotate = autoRotate;
  }, [autoRotate]);

  // RESIZE — resize the renderer/camera in place.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || width === 0) return;
    engine.renderer.setSize(width, height, false);
    engine.renderer.domElement.style.width = `${width}px`;
    engine.renderer.domElement.style.height = `${height}px`;
    engine.camera.aspect = width / height;
    engine.camera.updateProjectionMatrix();
  }, [width, height]);

  return <div ref={containerRef} className="relative w-full" style={{ height }} />;
}
