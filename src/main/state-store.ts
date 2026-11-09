import type { SavedState } from "../shared/types";

type Prepare = (previous: SavedState, next: SavedState) => void | (() => void);

/** Serialize changes against the last successfully persisted state. */
export class StateStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private current: SavedState,
    private persist: (next: SavedState) => Promise<void>,
    private committed: (next: SavedState) => void,
  ) {}

  update(change: (draft: SavedState) => void, prepare?: Prepare): Promise<SavedState> {
    const operation = this.queue.catch(() => {}).then(async () => {
      const next = structuredClone(this.current);
      change(next);
      const rollback = prepare?.(this.current, next);
      try {
        await this.persist(next);
      } catch (error) {
        rollback?.();
        throw error;
      }
      this.current = next;
      this.committed(next);
      return next;
    });
    this.queue = operation;
    return operation;
  }
}
