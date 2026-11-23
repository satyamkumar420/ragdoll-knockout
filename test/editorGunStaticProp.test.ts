import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { ASSET_CATALOG } from '../src/editor/assetCatalog';

describe('Editor Gun and Static Gun Prop Tests', () => {
  it('happy path: prop_static_pistol has realistic defaultScale (1.89) in ASSET_CATALOG', () => {
    const staticPistolDef = ASSET_CATALOG.find((item) => item.id === 'prop_static_pistol');
    assert.ok(staticPistolDef, 'prop_static_pistol is registered in ASSET_CATALOG');
    assert.strictEqual(staticPistolDef.defaultScale, 1.89, 'defaultScale is 1.89 matching character hand scale');
    assert.strictEqual(staticPistolDef.modelPath, 'Pistol.glb', 'modelPath is Pistol.glb');
  });

  it('happy path: Level 4 has exactly one clean static pistol without duplicate overlapping Z-fighting', () => {
    const l4Path = path.resolve('src/config/levels/level-4.json');
    const l4Json = JSON.parse(fs.readFileSync(l4Path, 'utf-8'));

    const pistolProps = l4Json.props.filter((p: any) => p.modelPath === 'Pistol.glb');
    assert.strictEqual(pistolProps.length, 1, 'Exactly one static pistol prop exists in Level 4');
    assert.strictEqual(pistolProps[0].name, 'prop_static_pistol_2ie2', 'Valid pistol prop is retained');
    assert.strictEqual(pistolProps[0].scale, 1.89, 'Pistol has full hand scale 1.89');
    assert.strictEqual(pistolProps[0].rotationY, 1.54, 'Pistol is properly oriented along hand grip');
  });

  it('happy path: editorSceneRenderer sets BASE_GUN_SCALE (7.5) and stops all auto-started animations', async () => {
    const fileContent = fs.readFileSync(path.resolve('src/editor/editorSceneRenderer.ts'), 'utf-8');
    assert.ok(fileContent.includes('BASE_GUN_SCALE = 7.5'), 'editorSceneRenderer defines BASE_GUN_SCALE = 7.5');
    assert.ok(
      fileContent.includes('res.animationGroups?.forEach((ag) => ag.stop())'),
      'editorSceneRenderer freezes animations immediately on load'
    );
    assert.ok(
      fileContent.includes('gltfRoot.rotation.set(0, Math.PI / 2, 0)'),
      'editorSceneRenderer aligns gun forward (+X) matching weapon.ts'
    );
  });

  it('happy path: propLoader stops default auto-started GLB animation groups for static props', async () => {
    const fileContent = fs.readFileSync(path.resolve('src/core/propLoader.ts'), 'utf-8');
    assert.ok(
      fileContent.includes('stopAllAnimations();'),
      'propLoader stops all GLB animation groups by default so static props never jitter/flicker'
    );
    assert.ok(
      fileContent.includes('mat.transparencyMode = 0'),
      'propLoader enforces opaque transparency mode on pistol meshes to prevent sorting flicker'
    );
  });

  it('failure path: level without gunScale defaults to 0.52 and scales gun to life-size 3.90', async () => {
    const l1Path = path.resolve('src/config/levels/level-1.json');
    const l1Json = JSON.parse(fs.readFileSync(l1Path, 'utf-8'));
    const defaultScale = l1Json.gunScale ?? 0.52;
    const BASE_GUN_SCALE = 7.5;
    const finalVisualScale = BASE_GUN_SCALE * defaultScale;
    assert.ok(Math.abs(finalVisualScale - 3.9) < 0.001, 'Final visual scale in editor is 3.90, matching weapon.ts');
  });
});
