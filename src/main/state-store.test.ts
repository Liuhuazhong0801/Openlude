import test from "node:test";
import assert from "node:assert/strict";
import { StateStore } from "./state-store";
import { initialState } from "./model";
import { renderPixelRatio, RENDER_PIXEL_BUDGET } from "../shared/render-quality";

test("failed writes leave committed state unchanged and later changes do not persist failed edits", async () => {
  let state = initialState(false);
  const original = structuredClone(state);
  const writes: typeof state[] = [];
  let fail = true;
  const store = new StateStore(state, async next => {
    if (fail) { fail = false; throw new Error("Disk unavailable"); }
    writes.push(structuredClone(next));
  }, next => { state = next; });
  const failed = store.update(next => { next.targets.push({ id: "failed", name: "App", path: null, theme: "ink" }); });
  const succeeded = store.update(next => { next.preferences.duration = 2600; });
  await assert.rejects(failed, /Disk unavailable/);
  await succeeded;
  assert.deepEqual(state.targets, []);
  assert.equal(state.preferences.duration, 2600);
  assert.deepEqual(writes, [state]);
  assert.equal(original.preferences.duration, 1800);
});

test("queued transactions observe successful predecessors and commit only after persistence", async () => {
  let state = initialState(false);
  let complete!: () => void;
  const gate = new Promise<void>(resolve => { complete = resolve; });
  let writes = 0;
  const store = new StateStore(state, async () => { if (++writes === 1) await gate; }, next => { state = next; });
  const first = store.update(next => { next.targets.push({ id: "one", name: "App", path: null, theme: "ink" }); });
  const second = store.update(next => { assert.equal(next.targets.length, 1); next.targets[0].theme = "frog"; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(state.targets.length, 0);
  complete(); await Promise.all([first, second]);
  assert.equal(state.targets[0].theme, "frog");
});

test("failed settings persistence rolls system effects back to the committed settings", async () => {
  let state = initialState(false), systemLogin = false;
  const store = new StateStore(state, async () => { throw new Error("Read-only configuration"); }, next => { state = next; });
  await assert.rejects(store.update(next => { next.settings.autoStart = true; }, (previous, next) => {
    systemLogin = next.settings.autoStart;
    return () => { systemLogin = previous.settings.autoStart; };
  }));
  assert.equal(state.settings.autoStart, false);
  assert.equal(systemLogin, false);
});

test("Retina, 4K and ultrawide render buffers stay within the pixel budget", () => {
  for (const [width, height, dpr] of [[1920, 1080, 2], [2560, 1440, 2], [3840, 2160, 2], [5120, 1440, 2], [800, 450, 2]]) {
    const ratio = renderPixelRatio(width, height, dpr);
    assert.ok(Math.floor(width * ratio) * Math.floor(height * ratio) <= RENDER_PIXEL_BUDGET);
    assert.ok(ratio <= dpr);
  }
  assert.equal(renderPixelRatio(800, 450, 2), 2);
  assert.equal(renderPixelRatio(2560, 1440, 2), 1);
  assert.equal(renderPixelRatio(0, 0, NaN), 1);
});
