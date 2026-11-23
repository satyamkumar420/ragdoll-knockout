import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';

describe('Chicken Mascot Companion System Tests', () => {
  const glbPath = path.resolve('public/assets/chicken.glb');
  const chickenTsPath = path.resolve('src/chicken.ts');
  const animCatalogPath = path.resolve('src/editor/catalog/animationCatalog.ts');
  const inspectorPath = path.resolve('src/editor/ui/inspectorSections.ts');

  // --- Happy-path tests ---
  it('happy path: chicken.glb exists and is a valid glTF binary containing 14 animations and ChickenMesh', () => {
    assert.ok(fs.existsSync(glbPath), 'chicken.glb must exist in public/assets/');
    const stat = fs.statSync(glbPath);
    assert.ok(stat.size > 200000, 'GLB file must be at least 200KB');

    const buf = fs.readFileSync(glbPath);
    const magic = buf.subarray(0, 4).toString('ascii');
    const version = buf.readUInt32LE(4);
    assert.strictEqual(magic, 'glTF', 'File magic must be glTF');
    assert.strictEqual(version, 2, 'glTF version must be 2');

    // Parse JSON chunk
    const jsonLen = buf.readUInt32LE(12);
    const jsonStr = buf.subarray(20, 20 + jsonLen).toString('utf-8');
    const gltf = JSON.parse(jsonStr);

    assert.ok(Array.isArray(gltf.animations), 'GLTF must contain animations array');
    const animNames = gltf.animations.map((a: { name: string }) => a.name);
    const expected = [
      'idle',
      'walk',
      'run',
      'jump',
      'fall',
      'beak_speak',
      'blink',
      'butt_slide',
      'butt_slide_lean.L',
      'butt_slide_lean.R',
      'walk_lean.L',
      'walk_lean.R',
      'walk_strafe.L',
      'walk_strafe.R',
    ];
    assert.strictEqual(animNames.length, 14, 'GLTF must have exactly 14 animations');
    for (const name of expected) {
      assert.ok(animNames.includes(name), `GLB must contain animation '${name}'`);
    }

    assert.ok(Array.isArray(gltf.meshes), 'GLTF must contain meshes');
    assert.strictEqual(gltf.meshes[0].name, 'ChickenMesh', 'Mesh must be ChickenMesh');
    const prim = gltf.meshes[0].primitives[0];
    assert.ok(prim.attributes.COLOR_0 !== undefined, 'ChickenMesh must have COLOR_0 vertex color mask attribute');
  });

  it('happy path: src/chicken.ts defines all 3 color variants matching the visual image', () => {
    assert.ok(fs.existsSync(chickenTsPath), 'src/chicken.ts must exist');
    const content = fs.readFileSync(chickenTsPath, 'utf-8');

    // Check all 3 variants exist
    assert.ok(content.includes('yellow:'), 'Yellow variant must be defined');
    assert.ok(content.includes('white:'), 'White variant must be defined');
    assert.ok(content.includes('green:'), 'Green variant must be defined');

    // Check variant names
    assert.ok(content.includes("'Classic Yellow'"), 'Classic Yellow label must be present');
    assert.ok(content.includes("'Snow White'"), 'Snow White label must be present');
    assert.ok(content.includes("'Forest Green'"), 'Forest Green label must be present');

    // Check preview hexes
    assert.ok(content.includes('#ffd147'), 'Yellow body hex must match');
    assert.ok(content.includes('#f5f7ff'), 'White body hex must match');
    assert.ok(content.includes('#5cd13d'), 'Green body hex must match');

    // Check realtime apply function
    assert.ok(content.includes('function applyChickenVariant'), 'applyChickenVariant must be defined');
    assert.ok(content.includes('function loadChicken'), 'loadChicken must be defined');
  });

  it('happy path: animationCatalog lists all 14 chicken animations', () => {
    assert.ok(fs.existsSync(animCatalogPath), 'animationCatalog.ts must exist');
    const content = fs.readFileSync(animCatalogPath, 'utf-8');

    assert.ok(content.includes('CHICKEN_ANIMATIONS'), 'CHICKEN_ANIMATIONS must be exported');
    const animKeys = [
      'idle',
      'walk',
      'run',
      'jump',
      'fall',
      'beak_speak',
      'blink',
      'butt_slide',
      'butt_slide_lean.L',
      'butt_slide_lean.R',
      'walk_lean.L',
      'walk_lean.R',
      'walk_strafe.L',
      'walk_strafe.R',
    ];
    for (const key of animKeys) {
      assert.ok(content.includes(`id: '${key}'`), `animationCatalog must list animation ${key}`);
    }
  });

  it('happy path: inspectorSections renders chicken variant selector and animations', () => {
    assert.ok(fs.existsSync(inspectorPath), 'inspectorSections.ts must exist');
    const content = fs.readFileSync(inspectorPath, 'utf-8');

    assert.ok(content.includes('CHICKEN VARIANT'), 'Must render CHICKEN VARIANT section');
    assert.ok(content.includes('chicken-variant-card'), 'Must render chicken-variant-card classes');
    assert.ok(content.includes('data-variant'), 'Must have data-variant binding');
    assert.ok(content.includes('CHICKEN BEHAVIOR'), 'Must render CHICKEN BEHAVIOR label');
    assert.ok(content.includes('CHICKEN ANIMATIONS'), 'Must render CHICKEN ANIMATIONS label');
  });

  it('happy path: pug.ts re-exports chicken for backward compatibility', () => {
    const pugPath = path.resolve('src/pug.ts');
    assert.ok(fs.existsSync(pugPath), 'src/pug.ts must exist');
    const content = fs.readFileSync(pugPath, 'utf-8');
    assert.ok(content.includes("export * from './chicken'"), 'pug.ts must re-export chicken');
  });

  // --- Failure-path / edge-case tests ---
  it('happy path: src/chicken.ts implements knockback tumble physics and ground dead pose on bullet hit', () => {
    const content = fs.readFileSync(chickenTsPath, 'utf-8');
    assert.ok(content.includes('rotVelZ'), 'Must track rotational tumble velocity around Z');
    assert.ok(content.includes('rotVelX'), 'Must track rotational tumble velocity around X');
    assert.ok(content.includes('targetRotZ'), 'Must have target tumble angle for lying on side');
    assert.ok(content.includes('deadFloorY'), 'Must settle at lowered floor position when lying flat');
    assert.ok(content.includes('isDefeated = true'), 'triggerHit must mark chicken defeated');
  });

  it('failure path: level configs handle missing or default companion variant safely', () => {
    const level1Path = path.resolve('src/config/levels/level-1.json');
    const lvl1 = JSON.parse(fs.readFileSync(level1Path, 'utf-8'));
    assert.ok(Array.isArray(lvl1.pugs), 'Level 1 must have pugs array');

    // Level companion variant defaults to white mascot
    const resolvedVariant = lvl1.pugs[0].variant || 'white';
    assert.strictEqual(resolvedVariant, 'white', 'Default companion variant must safely resolve to white');
  });
});
