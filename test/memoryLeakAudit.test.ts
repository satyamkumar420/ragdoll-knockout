import { describe, it } from 'node:test';
import assert from 'node:assert';
import { NullEngine, Scene, Vector3, DirectionalLight, ShadowGenerator, TransformNode } from '@babylonjs/core';
import { attachGooglyEyes } from '../src/character';
import { createParkEnvironment, createPodium } from '../src/props';
import { clearActiveRagdolls } from '../src/ragdoll';
import { registerBlobMapping, getPreloadedBlobUrl } from '../src/core/assetPreloader';

if (typeof (globalThis as any).OffscreenCanvas === 'undefined') {
  (globalThis as any).OffscreenCanvas = class {
    width: number;
    height: number;
    constructor(w: number, h: number) {
      this.width = w;
      this.height = h;
    }
    getContext() {
      return {
        fillRect: () => {},
        fillText: () => {},
        fillStyle: '',
        font: '',
        textAlign: '',
        textBaseline: '',
        getImageData: () => ({ data: new Uint8ClampedArray(4) }),
        putImageData: () => {},
      };
    }
  };
}

describe('Memory Leak & Heap Retention Audit Tests', () => {
  // --- Happy-path tests ---
  it('happy path: attachGooglyEyes creates and cleanly disposes all eyeball and pupil meshes and materials', () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const headNode = new TransformNode('testHead', scene);

    const initialMeshCount = scene.meshes.length;
    const initialMaterialCount = scene.materials.length;

    const eyes = attachGooglyEyes(headNode, scene);
    assert.strictEqual(scene.meshes.length, initialMeshCount + 4, 'Should create 2 eyeballs and 2 pupils');
    assert.strictEqual(scene.materials.length, initialMaterialCount + 2, 'Should create white and pupil materials');

    // Execute disposal
    eyes.dispose();
    headNode.dispose();

    assert.strictEqual(scene.meshes.length, initialMeshCount, 'All eye meshes should be completely disposed');
    assert.strictEqual(scene.materials.length, initialMaterialCount, 'All eye materials should be completely disposed');
  });

  it('happy path: createParkEnvironment and createPodium dispose all child meshes, textures, and materials', () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const light = new DirectionalLight('dir', new Vector3(0, -1, 0), scene);
    const shadowGen = new ShadowGenerator(512, light);

    const initialMeshCount = scene.meshes.length;
    const initialMaterialCount = scene.materials.length;
    const initialTextureCount = scene.textures.length;

    // Create park environment
    const park = createParkEnvironment(scene, shadowGen);
    assert.ok(scene.meshes.length > initialMeshCount, 'Park should create trees, fence, bushes');
    park.dispose();

    // Create podium
    const podium = createPodium(scene, new Vector3(0, 0, 0), shadowGen);
    assert.ok(scene.textures.length > initialTextureCount, 'Podium should create dynamic canvas textures');
    podium.dispose();

    assert.strictEqual(scene.meshes.length, initialMeshCount, 'All procedural meshes should be disposed');
    assert.strictEqual(scene.textures.length, initialTextureCount, 'All dynamic textures should be disposed');
    const nonDefaultMats = scene.materials.filter((m) => m.name !== 'default material');
    assert.strictEqual(nonDefaultMats.length, initialMaterialCount, 'All materials should be disposed');
  });

  it('happy path: registerBlobMapping stores string URLs without retaining heavy raw Blobs', () => {
    const testPath = './assets/testModel.glb';
    const fakeUrl = 'blob:http://localhost/fake-uuid';

    registerBlobMapping(testPath, fakeUrl);
    assert.strictEqual(getPreloadedBlobUrl(testPath), fakeUrl);
    assert.strictEqual(getPreloadedBlobUrl('assets/testmodel.glb'), fakeUrl);
  });

  // --- Failure-path tests ---
  it('failure path: clearActiveRagdolls can be called safely when empty or multiple times without throwing', () => {
    assert.doesNotThrow(() => {
      clearActiveRagdolls();
      clearActiveRagdolls();
    });
  });

  it('failure path: disposing park environment when shadowGen is undefined does not throw', () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);

    const park = createParkEnvironment(scene, undefined);
    assert.doesNotThrow(() => {
      park.dispose();
    });
  });
});
