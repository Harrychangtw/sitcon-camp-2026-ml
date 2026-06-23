import { StubFrame } from "./_StubFrame";

export interface Scatter3DPoint {
  x: number;
  y: number;
  z: number;
  category?: string;
  label?: string;
}

export interface Scatter3DProps {
  data: Scatter3DPoint[];
  /** Color points by `category`. Default true. */
  colorBy?: boolean;
  /** Pixel height; width is responsive. Default 360. */
  height?: number;
  /** Slowly auto-rotate the camera. Default false. */
  autoRotate?: boolean;
}

/**
 * STUB — typed signature only.
 *
 * The real version renders a rotatable 3D point cloud with three.js. Used by the
 * embedding station to show high-dimensional token embeddings projected to 3D
 * (e.g. UMAP/PCA output baked by precompute).
 *
 * IMPLEMENTATION RULES when fleshing this out:
 *   - three.js is heavy and touches `window`/WebGL. Import it lazily INSIDE an
 *     effect (`const THREE = await import("three")`) so it never runs during
 *     SSR and never bloats the initial bundle.
 *   - Add `three` to THIS package's dependencies at that point (not before).
 *   - Dispose geometries/materials/renderer on unmount.
 *   - Size with useResizeObserver, like Scatter2D.
 */
export function Scatter3D(props: Scatter3DProps) {
  return (
    <StubFrame
      name="Scatter3D"
      summary="Real version: three.js rotatable 3D point cloud (lazy-imported, client-only)."
      props={{ ...props, points: props.data.length }}
      height={props.height}
    />
  );
}
