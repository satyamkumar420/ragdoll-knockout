import {
  Engine,
  Scene,
  Vector3,
  Color4,
  Color3,
  HemisphericLight,
  DirectionalLight,
  ArcRotateCamera,
  MeshBuilder,
  StandardMaterial,
  ShadowGenerator,
  PhysicsAggregate,
  PhysicsShapeType,
  AnimationGroup,
  Texture,
  MeshoptCompression,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

// Configure Meshopt decoder locally for YouTube Playables CSP compliance (Zero external network calls)
MeshoptCompression.Configuration = {
  decoder: {
    url: './meshopt_decoder.js',
  },
};
import { initPhysics, getPhysicsPlugin } from './physics';
import {
  calculateResponsiveCameraRadius,
  calculateDynamicGameplayRadius,
  type GameplayBounds,
} from './core/cameraResponsive';


export interface GameSceneContext {
  engine: Engine;
  scene: Scene;
  camera: ArcRotateCamera;
  shadowGenerator: ShadowGenerator;
  setStudioColor: (skyColor: Color4, grassColor?: Color3) => void;
  setCameraParams: (
    radius?: number,
    target?: Vector3,
    alpha?: number,
    beta?: number,
    bounds?: GameplayBounds
  ) => void;
  pause: () => void;
  resume: () => void;
  isPaused: () => boolean;
}

export async function createGameScene(canvas: HTMLCanvasElement): Promise<GameSceneContext> {
  const engine = new Engine(canvas, true, {
    preserveDrawingBuffer: false,
    stencil: false,
    antialias: true,
    powerPreference: 'high-performance',
    audioEngine: false,
  });

  // Enable high-DPI (Retina / OLED) rendering for crystal clear graphics on mobile
  // Clamped at 2.0 to provide ultra-sharp 1080p visuals without GPU thermal throttling or battery drain
  const getOptimalDpr = () => Math.min(window.devicePixelRatio || 1, 2.0);
  engine.setHardwareScalingLevel(1 / getOptimalDpr());

  // Enhance texture clarity for 3D props, obstacles and characters viewed at angles
  Texture.DEFAULT_ANISOTROPIC_FILTERING_LEVEL = 4;

  const scene = new Scene(engine);

  // Bright sunny park sky blue
  const defaultSky = new Color4(0.52, 0.78, 0.92, 1.0);
  scene.clearColor = defaultSky;

  // FIXED ACTION CAMERA — straight 2D side-view framing centered on gameplay action plane
  const camera = new ArcRotateCamera(
    'fixedCamera',
    -Math.PI / 2,
    1.53, // Straight 2D side view matching reference video
    9.8,
    new Vector3(0.35, 1.15, 0),
    scene
  );
  // (NO attachControl to keep camera completely locked)

  let baseRadius = 9.8;
  let currentBounds: GameplayBounds | undefined;
  let baseTarget = new Vector3(0.35, 1.15, 0);

  // Dynamic Responsive Camera Framing: Automatically scales camera distance so gun and all targets
  // remain 100% visible across any screen aspect ratio (mobile portrait, tablet, desktop)
  const updateCameraFraming = () => {
    const width = engine.getRenderWidth() || canvas.clientWidth || window.innerWidth || 800;
    const height = engine.getRenderHeight() || canvas.clientHeight || window.innerHeight || 600;
    const aspect = width / height;

    if (currentBounds) {
      // On mobile portrait, center target smoothly focused on gameplay action
      if (aspect < 1.0) {
        const midX = (currentBounds.minX + currentBounds.maxX) / 2;
        // Keep focus tightly on the main gameplay action
        camera.target.x = baseTarget.x * 0.2 + midX * 0.8;
        // Center vertically so content is comfortably framed
        const boundsMaxY = currentBounds.maxY ?? (baseTarget.y + 2.0);
        const boundsMinY = currentBounds.minY ?? 0;
        const midY = (boundsMinY + boundsMaxY) / 2;
        camera.target.y = baseTarget.y * 0.4 + midY * 0.6;
      } else {
        camera.target.x = baseTarget.x;
        camera.target.y = baseTarget.y;
      }

      camera.radius = calculateDynamicGameplayRadius(
        currentBounds,
        width,
        height,
        baseRadius,
        camera.fov,
        camera.target.x,
        camera.target.y
      );
    } else {
      camera.target.x = baseTarget.x;
      camera.target.y = baseTarget.y;
      camera.radius = calculateResponsiveCameraRadius(baseRadius, width, height, 1.48);
    }
    camera.computeWorldMatrix();
    camera.getViewMatrix(true);
  };

  const setCameraParams = (
    radius?: number,
    target?: Vector3,
    _alpha?: number,
    beta?: number,
    bounds?: GameplayBounds
  ) => {
    baseRadius = radius !== undefined && radius > 0 ? radius : 9.8;
    currentBounds = bounds;
    baseTarget = target ? new Vector3(target.x, target.y, 0) : new Vector3(0.35, 1.15, 0);
    camera.setTarget(baseTarget.clone());
    // Fixed 2D side-view perspective framing strictly aligned to the 2D gameplay action plane
    camera.alpha = -Math.PI / 2;
    camera.beta = beta !== undefined && beta > 0 ? beta : 1.53;
    updateCameraFraming();
  };

  // Initial calculation
  updateCameraFraming();

  // Warm sunlight ambient
  const hemiLight = new HemisphericLight('hemiLight', new Vector3(0, 1, 0), scene);
  hemiLight.intensity = 0.85;
  hemiLight.diffuse = new Color3(1.0, 0.98, 0.92);
  hemiLight.groundColor = new Color3(0.25, 0.55, 0.22); // Green grass bounce light

  // Key directional sun light with soft cartoon shadows
  const dirLight = new DirectionalLight('dirLight', new Vector3(-0.45, -1, 0.45), scene);
  dirLight.position = new Vector3(10, 22, -10);
  dirLight.intensity = 0.95;

  // Fast hardware-accelerated cartoon shadows (PCF)
  const shadowGenerator = new ShadowGenerator(1024, dirLight);
  shadowGenerator.usePercentageCloserFiltering = true;
  shadowGenerator.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
  shadowGenerator.setDarkness(0.28);

  // Initialize Havok Physics
  await initPhysics(scene);

  // Vibrant Park Grass Lawn (expands wide enough so mobile portrait zoom-out never clips the ground)
  const ground = MeshBuilder.CreateGround('parkLawn', { width: 300, height: 300 }, scene);
  const groundMat = new StandardMaterial('lawnMat', scene);
  const defaultGrass = new Color3(0.33, 0.67, 0.28); // Saturated cartoon park green
  groundMat.diffuseColor = defaultGrass;
  groundMat.specularColor = new Color3(0, 0, 0); // Zero specular shine
  groundMat.ambientColor = new Color3(0.18, 0.38, 0.15);
  ground.material = groundMat;
  ground.receiveShadows = true;
  ground.freezeWorldMatrix();

  // Thick solid physics floor underneath lawn so ragdolls and objects NEVER fall through
  const groundCollider = MeshBuilder.CreateBox('groundPhysicsBox', { width: 320, height: 4, depth: 320 }, scene);
  groundCollider.position.y = -2; // Top surface is at exactly y = 0
  groundCollider.isVisible = false;
  groundCollider.freezeWorldMatrix();
  new PhysicsAggregate(groundCollider, PhysicsShapeType.BOX, { mass: 0, restitution: 0.2, friction: 0.8 }, scene);

  const setStudioColor = (skyColor: Color4, grassColor?: Color3) => {
    scene.clearColor = skyColor;
    if (grassColor) {
      groundMat.diffuseColor = grassColor;
      groundMat.ambientColor = grassColor.scale(0.5);
      hemiLight.groundColor = grassColor.scale(0.8);
    }
  };

  const handleResize = () => {
    engine.setHardwareScalingLevel(1 / getOptimalDpr());
    engine.resize();
    updateCameraFraming();
  };

  window.addEventListener('resize', handleResize);
  window.addEventListener('orientationchange', () => {
    setTimeout(handleResize, 100);
  });
  engine.onResizeObservable.add(updateCameraFraming);

  let isScenePaused = false;
  const pausedAnimationGroups: Set<AnimationGroup> = new Set();

  const pause = () => {
    if (isScenePaused) return;
    isScenePaused = true;

    // Freeze Havok physics engine stepping
    if (scene.physicsEnabled) {
      scene.physicsEnabled = false;
    }
    const physicsPlugin = getPhysicsPlugin();
    if (physicsPlugin) {
      physicsPlugin.setTimeStep(0);
    }

    // Pause all currently playing animation groups
    pausedAnimationGroups.clear();
    scene.animationGroups?.forEach((ag) => {
      if (ag.isPlaying) {
        pausedAnimationGroups.add(ag);
        ag.pause();
      }
    });
  };

  const resume = () => {
    if (!isScenePaused) return;
    isScenePaused = false;

    // Resume Havok physics engine stepping
    scene.physicsEnabled = true;
    const physicsPlugin = getPhysicsPlugin();
    if (physicsPlugin) {
      physicsPlugin.setTimeStep(1 / 60);
    }

    // Resume previously playing animation groups
    pausedAnimationGroups.forEach((ag) => {
      try {
        ag.play();
      } catch {
        // Safe check if disposed
      }
    });
    pausedAnimationGroups.clear();
  };

  const isPaused = () => isScenePaused;

  return { engine, scene, camera, shadowGenerator, setStudioColor, setCameraParams, pause, resume, isPaused };
}
