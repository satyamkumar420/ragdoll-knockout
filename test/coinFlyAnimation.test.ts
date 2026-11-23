import { describe, it } from 'node:test';
import assert from 'node:assert';
import { triggerCoinCollectionAnimation } from '../src/core/coinFlyAnimation';

describe('Coin Fly Animation Tests', () => {
  // Happy-path test
  it('happy path: triggers collection animation and resolves onComplete for valid mock elements', async () => {
    let completed = false;
    let coinsCountLanded = 0;

    const mockFromEl = {
      getBoundingClientRect: () => ({ left: 100, top: 200, width: 80, height: 40 }),
    } as unknown as HTMLElement;

    const mockToEl = {
      getBoundingClientRect: () => ({ left: 20, top: 20, width: 60, height: 30 }),
    } as unknown as HTMLElement;

    // Simulate DOM environment if document is not defined
    const originalDocument = globalThis.document;
    const originalWindow = globalThis.window;

    globalThis.document = {
      body: {
        appendChild: () => {},
      },
      createElement: () => ({
        className: '',
        innerHTML: '',
        remove: () => {},
        animate: (_keyframes: any, _options: any) => {
          const anim = {
            onfinish: null as any,
          };
          setTimeout(() => {
            if (anim.onfinish) anim.onfinish();
          }, 5);
          return anim;
        },
      }),
    } as any;

    globalThis.window = {
      setTimeout: (fn: Function, _ms: number) => {
        fn();
        return 1;
      },
    } as any;

    try {
      await triggerCoinCollectionAnimation({
        fromElement: mockFromEl,
        toElement: mockToEl,
        coinCount: 3,
        onCoinLand: () => {
          coinsCountLanded++;
        },
        onComplete: () => {
          completed = true;
        },
      });

      assert.strictEqual(completed, true, 'onComplete must be called');
      assert.strictEqual(coinsCountLanded, 3, 'all 3 coins must land');
    } finally {
      globalThis.document = originalDocument;
      globalThis.window = originalWindow;
    }
  });

  // Failure-path / edge-case test
  it('failure path: handles null/missing elements gracefully and resolves immediately', async () => {
    let completed = false;

    await triggerCoinCollectionAnimation({
      fromElement: null as any,
      toElement: null as any,
      onComplete: () => {
        completed = true;
      },
    });

    assert.strictEqual(completed, true, 'Must gracefully resolve on missing elements');
  });

  it('failure path: handles zero-dimension elements without throwing', async () => {
    let completed = false;

    const zeroEl = {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }),
    } as unknown as HTMLElement;

    await triggerCoinCollectionAnimation({
      fromElement: zeroEl,
      toElement: zeroEl,
      onComplete: () => {
        completed = true;
      },
    });

    assert.strictEqual(completed, true, 'Must gracefully resolve on zero-dimension elements');
  });
});
