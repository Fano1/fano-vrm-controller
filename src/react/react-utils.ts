/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

import { useInsertionEffect, useRef, type RefObject } from "react";

/**
 * A ref that always holds the value from the latest committed render.
 *
 * This is what lets every hook in this entry accept an inline closure
 * (`useVRMUpdate(vrm, (d) => ...)`) without that closure being a dependency:
 * the registration is made once and calls through `ref.current`, so a new
 * function identity every render costs nothing and re-registers nothing.
 *
 * Written in an insertion effect rather than during render — render can be
 * thrown away by concurrent React, and a ref mutated by a render that never
 * committed would leak its closure into the frame loop. Insertion effects run
 * before any layout or passive effect, so nothing reads a stale value.
 */
export function useLatest<T>(value: T): RefObject<T> {
	const ref = useRef(value);

	useInsertionEffect(() => {
		ref.current = value;
	});

	return ref;
}
