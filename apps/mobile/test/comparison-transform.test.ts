import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  adjustComparisonRotation,
  adjustComparisonScale,
  beginComparisonGesture,
  defaultComparisonTransform,
  updateComparisonGesture,
} from "../src/comparison-transform";

describe("comparison transform", () => {
  it("moves one-finger gestures without changing scale or rotation", () => {
    const snapshot = beginComparisonGesture(defaultComparisonTransform, [
      { x: 20, y: 30 },
    ]);
    assert.ok(snapshot);
    assert.deepEqual(updateComparisonGesture(snapshot, [{ x: 45, y: 10 }]), {
      rotation: 0,
      scale: 1,
      translateX: 25,
      translateY: -20,
    });
  });

  it("combines two-finger translation, scale and rotation", () => {
    const snapshot = beginComparisonGesture(defaultComparisonTransform, [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]);
    assert.ok(snapshot);
    const result = updateComparisonGesture(snapshot, [
      { x: 10, y: 10 },
      { x: 10, y: 210 },
    ]);
    assert.equal(result?.translateX, -40);
    assert.equal(result?.translateY, 110);
    assert.equal(result?.scale, 2);
    assert.equal(result?.rotation, 90);
  });

  it("clamps scale and translation to recoverable bounds", () => {
    const snapshot = beginComparisonGesture(defaultComparisonTransform, [
      { x: 0, y: 0 },
    ]);
    assert.ok(snapshot);
    assert.equal(
      updateComparisonGesture(snapshot, [{ x: 1_000, y: -1_000 }])?.translateX,
      240,
    );
    assert.equal(adjustComparisonScale(3, 0.5), 3);
    assert.equal(adjustComparisonScale(0.5, -0.5), 0.5);
  });

  it("requires a new snapshot when the touch count changes", () => {
    const snapshot = beginComparisonGesture(defaultComparisonTransform, [
      { x: 0, y: 0 },
    ]);
    assert.ok(snapshot);
    assert.equal(
      updateComparisonGesture(snapshot, [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ]),
      null,
    );
  });

  it("normalizes button-driven rotation to a recoverable range", () => {
    assert.equal(adjustComparisonRotation(175, 15), -170);
    assert.equal(adjustComparisonRotation(-175, -15), 170);
  });
});
