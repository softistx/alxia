import DataLoader from "dataloader";
import { findUsers } from "./store";

// The loaders of ONE request: `context` in src/app.ts calls this per request.
// A loader batches the `load` calls made in the same tick into one call of
// its function, and caches each key it has seen, so it must never outlive the
// request: a loader shared between requests would serve one user's data to
// another, and never see a change.
export function createLoaders() {
  return { user: new DataLoader(findUsers) };
}

export type Loaders = ReturnType<typeof createLoaders>;
