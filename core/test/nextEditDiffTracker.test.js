const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { applySnapshot, createDiffTrackerState } = require("../dist/index.js");

describe("nextEdit diff tracker", () => {
  it("ignores non-user changes while updating snapshot", () => {
    const state = createDiffTrackerState();
    applySnapshot(state, {
      key: "doc-1",
      label: "doc-1",
      text: "initial",
      timestampMs: 0,
      isUserChange: true,
    });

    applySnapshot(state, {
      key: "doc-1",
      label: "doc-1",
      text: "external change",
      timestampMs: 10,
      isUserChange: false,
    });

    assert.equal(state.trajectory.length, 0);
    assert.equal(state.snapshots.get("doc-1"), "external change");
  });

  it("merges edits within the window for the same document", () => {
    const state = createDiffTrackerState({ mergeWindowMs: 1000 });
    applySnapshot(state, {
      key: "doc-1",
      label: "doc-1",
      text: "hello",
      timestampMs: 0,
      isUserChange: true,
    });

    applySnapshot(state, {
      key: "doc-1",
      label: "doc-1",
      text: "hello world",
      timestampMs: 100,
      isUserChange: true,
    });

    applySnapshot(state, {
      key: "doc-1",
      label: "doc-1",
      text: "hello world!!",
      timestampMs: 200,
      isUserChange: true,
    });

    assert.equal(state.trajectory.length, 1);
    assert.match(state.trajectory[0].diff, /\+hello world!!/);
  });

  it("trims trajectory to the max length", () => {
    const state = createDiffTrackerState({ maxTrajectory: 2 });
    applySnapshot(state, {
      key: "doc-1",
      label: "doc-1",
      text: "one",
      timestampMs: 0,
      isUserChange: true,
    });
    applySnapshot(state, {
      key: "doc-1",
      label: "doc-1",
      text: "one!",
      timestampMs: 10,
      isUserChange: true,
    });
    applySnapshot(state, {
      key: "doc-2",
      label: "doc-2",
      text: "two",
      timestampMs: 20,
      isUserChange: true,
    });
    applySnapshot(state, {
      key: "doc-2",
      label: "doc-2",
      text: "two!",
      timestampMs: 30,
      isUserChange: true,
    });
    applySnapshot(state, {
      key: "doc-3",
      label: "doc-3",
      text: "three",
      timestampMs: 40,
      isUserChange: true,
    });
    applySnapshot(state, {
      key: "doc-3",
      label: "doc-3",
      text: "three!",
      timestampMs: 50,
      isUserChange: true,
    });

    assert.equal(state.trajectory.length, 2);
    assert.equal(state.byPath.size, 2);
    assert.equal(state.trajectory[0].path, "doc-3");
  });
});
