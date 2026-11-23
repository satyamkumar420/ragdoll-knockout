import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('Level Selection System Tests', () => {
  // Test level unlocking and state classification logic
  function classifyLevel(levelId: number, currentLevelId: number, highestUnlockedLevel: number): 'current' | 'completed' | 'unlocked' | 'locked' {
    if (levelId === currentLevelId) {
      return 'current';
    }
    if (levelId <= highestUnlockedLevel) {
      if (levelId < highestUnlockedLevel) {
        return 'completed';
      }
      return 'unlocked';
    }
    return 'locked';
  }

  // Happy-path tests
  it('happy path: correctly identifies completed, current, unlocked frontier, and locked levels', () => {
    const highestUnlocked = 5;
    const currentLevel = 3;

    // Past cleared level
    assert.strictEqual(classifyLevel(1, currentLevel, highestUnlocked), 'completed');
    assert.strictEqual(classifyLevel(2, currentLevel, highestUnlocked), 'completed');

    // Current playing level
    assert.strictEqual(classifyLevel(3, currentLevel, highestUnlocked), 'current');

    // Cleared level between current and highest
    assert.strictEqual(classifyLevel(4, currentLevel, highestUnlocked), 'completed');

    // Frontier unlocked level
    assert.strictEqual(classifyLevel(5, currentLevel, highestUnlocked), 'unlocked');

    // Future locked levels
    assert.strictEqual(classifyLevel(6, currentLevel, highestUnlocked), 'locked');
    assert.strictEqual(classifyLevel(120, currentLevel, highestUnlocked), 'locked');
  });

  // Failure / edge case tests
  it('failure / edge case: boundary level 1 on fresh game', () => {
    const highestUnlocked = 1;
    const currentLevel = 1;

    // Level 1 is current
    assert.strictEqual(classifyLevel(1, currentLevel, highestUnlocked), 'current');

    // Level 2..120 are locked
    assert.strictEqual(classifyLevel(2, currentLevel, highestUnlocked), 'locked');
  });

  it('failure / edge case: all 120 levels completed', () => {
    const highestUnlocked = 120;
    const currentLevel = 120;

    assert.strictEqual(classifyLevel(1, currentLevel, highestUnlocked), 'completed');
    assert.strictEqual(classifyLevel(119, currentLevel, highestUnlocked), 'completed');
    assert.strictEqual(classifyLevel(120, currentLevel, highestUnlocked), 'current');
  });
});
