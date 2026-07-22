import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  containedImageLayout,
  cropFrameToPixels,
  initialCropFrame,
  moveCropFrame,
  resizeCropFrame,
  turnQuarter,
} from "../src/artwork-crop";

describe("mobile artwork crop geometry", () => {
  it("starts with the largest centered square", () => {
    assert.deepEqual(initialCropFrame({ height: 1_200, width: 2_000 }), {
      size: 1_200,
      x: 400,
      y: 0,
    });
    assert.deepEqual(initialCropFrame({ height: 2_000, width: 1_200 }), {
      size: 1_200,
      x: 0,
      y: 400,
    });
  });

  it("moves a crop in source pixels and clamps every edge", () => {
    const frame = { size: 400, x: 300, y: 200 };
    assert.deepEqual(
      moveCropFrame(frame, 2_000, -2_000, { height: 1_000, width: 1_200 }),
      { size: 400, x: 800, y: 0 },
    );
  });

  it("resizes around the center without escaping the source", () => {
    const shrunk = resizeCropFrame({ size: 800, x: 0, y: 100 }, 0.5, {
      height: 1_000,
      width: 800,
    });
    assert.deepEqual(shrunk, { size: 400, x: 200, y: 300 });
    assert.deepEqual(
      resizeCropFrame(shrunk, 10, { height: 1_000, width: 800 }),
      { size: 800, x: 0, y: 100 },
    );
  });

  it("maps a contained source image into a square canvas", () => {
    assert.deepEqual(
      containedImageLayout(
        { height: 1_000, width: 2_000 },
        { height: 320, width: 320 },
      ),
      { height: 160, left: 0, scale: 0.16, top: 80, width: 320 },
    );
  });

  it("rounds a square crop while preserving source bounds", () => {
    assert.deepEqual(
      cropFrameToPixels(
        { size: 500.8, x: 700.9, y: 650.4 },
        { height: 1_000, width: 1_200 },
      ),
      { height: 350, originX: 700, originY: 650, width: 350 },
    );
  });

  it("normalizes clockwise and counter-clockwise quarter turns", () => {
    assert.equal(turnQuarter(0, -1), 270);
    assert.equal(turnQuarter(270, 1), 0);
    assert.equal(turnQuarter(90, 1), 180);
  });
});
