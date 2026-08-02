/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

import type { Accessor, MaybeAccessor } from "./solid-type";

/**
 * Unwrap a value that may or may not be an accessor.
 *
 * Reading happens *here*, at the call site — so calling `access()` inside a
 * `createEffect` / `createMemo` subscribes to the accessor exactly as reading
 * it directly would. Solid's props getters unwrap through this too, which is
 * what lets `{ get scene() { return props.scene } }` stay reactive.
 */
export function access<T>(value: MaybeAccessor<T>): T {
	return typeof value === "function" ? (value as Accessor<T>)() : value;
}

/**
 * Whether we're running somewhere a VRM can actually be loaded and rendered.
 *
 * Checked lazily (not captured at module load) so it stays correct under test
 * stubs and under SolidStart, where the same bundle evaluates on both sides.
 * three's loaders decode textures through DOM image APIs, so a load attempted
 * during SSR would either crash or waste a full model download on the server.
 */
export function isBrowser(): boolean {
	return typeof window !== "undefined" && typeof document !== "undefined";
}
