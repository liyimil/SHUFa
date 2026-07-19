import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { toggleHistoricalAttempt } from "../src/history-comparison";

const first = { artworkId: "first", character: "永", label: "第一次" };
const second = { artworkId: "second", character: "永", label: "第二次" };
const third = { artworkId: "third", character: "永", label: "第三次" };

describe("history comparison selection", () => {
  it("selects at most the two most recent choices", () => {
    const firstResult = toggleHistoricalAttempt([], first);
    const secondResult = toggleHistoricalAttempt(firstResult.selected, second);
    const thirdResult = toggleHistoricalAttempt(secondResult.selected, third);

    assert.deepEqual(thirdResult.selected, [second, third]);
  });

  it("toggles an already selected attempt off", () => {
    const result = toggleHistoricalAttempt([first, second], first);
    assert.deepEqual(result.selected, [second]);
  });

  it("rejects a comparison between different characters", () => {
    const result = toggleHistoricalAttempt([first], {
      artworkId: "other",
      character: "九",
      label: "其他字",
    });
    assert.equal(result.error, "CHARACTER_MISMATCH");
    assert.deepEqual(result.selected, [first]);
  });
});
