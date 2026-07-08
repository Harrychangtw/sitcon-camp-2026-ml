// Minimal ambient types for @mkkellogg/gaussian-splats-3d, which ships no
// .d.ts. Only the surface SplatViewer actually uses is declared; extend here
// if a primitive needs more of the API.
declare module "@mkkellogg/gaussian-splats-3d" {
  import type { Group } from "three";

  export const SceneFormat: {
    Splat: number;
    KSplat: number;
    Ply: number;
    Spz: number;
  };

  export const SceneRevealMode: {
    Default: number;
    Gradual: number;
    Instant: number;
  };

  export interface DropInViewerOptions {
    /** SharedArrayBuffer needs cross-origin isolation headers — keep false. */
    sharedMemoryForWorkers?: boolean;
    gpuAcceleratedSort?: boolean;
    integerBasedSort?: boolean;
    dynamicScene?: boolean;
    freeIntermediateSplatData?: boolean;
    sceneRevealMode?: number;
  }

  export interface AddSplatSceneOptions {
    format?: number;
    showLoadingUI?: boolean;
    /** 0-255; splats below this alpha are dropped at load time. */
    splatAlphaRemovalThreshold?: number;
    progressiveLoad?: boolean;
    position?: [number, number, number];
    rotation?: [number, number, number, number];
    scale?: [number, number, number];
    onProgress?: (percent: number, label: string, status: number) => void;
  }

  /**
   * A self-contained splat renderer that plugs into an existing three.js
   * scene as a Group; sorting runs in its own worker, rendering happens via
   * onBeforeRender with the host's camera.
   */
  export class DropInViewer extends Group {
    constructor(options?: DropInViewerOptions);
    addSplatScene(path: string, options?: AddSplatSceneOptions): Promise<void>;
    dispose(): Promise<void>;
  }
}
