import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('Editor Chicken Selection & Picking Audit Tests', () => {
  const sceneRendererPath = path.resolve(process.cwd(), 'src/editor/editorSceneRenderer.ts');
  const levelEditorPath = path.resolve(process.cwd(), 'src/editor/levelEditor.ts');
  const gizmoControllerPath = path.resolve(process.cwd(), 'src/editor/gizmoController.ts');

  it('happy path: editorSceneRenderer registers all chicken meshes and bounding pick collider into meshMap', () => {
    assert.ok(fs.existsSync(sceneRendererPath), 'src/editor/editorSceneRenderer.ts must exist');
    const content = fs.readFileSync(sceneRendererPath, 'utf-8');

    // Verify pick collider creation
    assert.ok(content.includes('editor_chicken_pickBox_'), 'Pick collider box must be created for chicken');
    assert.ok(content.includes('pickCollider.isPickable = true'), 'Pick collider must be pickable');
    assert.ok(content.includes('pickCollider.visibility = 0'), 'Pick collider must be invisible (visibility = 0)');

    // Verify all chicken meshes are registered in meshMap
    assert.ok(content.includes('pug.allMeshes?.forEach((m) => register(m, pugRef));'), 'All chicken meshes must be registered');
    assert.ok(content.includes('pug.rootNode?.getChildMeshes?.().forEach((m) => register(m, pugRef));'), 'All root child meshes must be registered');
    assert.ok(content.includes('register(pickCollider, pugRef);'), 'Pick collider must be registered in meshMap');
  });

  it('happy path: levelEditor handleMeshPicked implements ancestor and entity fallback resolution', () => {
    assert.ok(fs.existsSync(levelEditorPath), 'src/editor/levelEditor.ts must exist');
    const content = fs.readFileSync(levelEditorPath, 'utf-8');

    // Verify ancestor traversal fallback
    assert.ok(content.includes('curr = curr.parent'), 'Must traverse parent hierarchy if child mesh is not direct key');

    // Verify pugs / chicken array check
    assert.ok(content.includes('pug.allMeshes?.includes(mesh)'), 'Must check pug.allMeshes in handleMeshPicked');
    assert.ok(content.includes('pug.rootNode?.getChildMeshes?.().includes(mesh)'), 'Must check pug rootNode children');

    // Verify name-based heuristic fallback
    assert.ok(content.includes("nameLower.includes('chicken')"), 'Must have name-based fallback for chicken meshes');
  });

  it('happy path: gizmoController safely resolves active target mesh during drag', () => {
    assert.ok(fs.existsSync(gizmoControllerPath), 'src/editor/gizmoController.ts must exist');
    const content = fs.readFileSync(gizmoControllerPath, 'utf-8');

    assert.ok(
      content.includes('this.gizmoManager.attachedMesh || this.activeTargetMesh'),
      'handleDrag must support fallback to activeTargetMesh'
    );
  });

  it('failure path: levelEditor correctly handles unmapped meshes and sets null selection', () => {
    const content = fs.readFileSync(levelEditorPath, 'utf-8');
    assert.ok(content.includes('this.state.setSelection(ref || null);'), 'Must set selection to null when no match found');
  });
});
