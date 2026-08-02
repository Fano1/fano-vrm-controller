/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

import { createEffect, untrack, type JSX } from "solid-js";
import { createVRM } from "./create-vrm";
import type { VrmProps } from "./solid-type";

/**
 * Declarative avatar mount: load, attach, dispose — driven by JSX lifetime.
 *
 * Renders nothing to the DOM (the avatar lives in a three.js scene, not the
 * document), so this is a side-effect component in the mould of `<Title>` or
 * `<Route>`. What it buys you over calling {@link createVRM} directly is
 * Solid's own control flow as the lifecycle: a `<Show>` unmount disposes the
 * model, and `<For>` over a list of urls manages one avatar per entry.
 *
 * ```tsx
 * <Show when={visible()}>
 *   <Vrm url={url()} scene={scene} onLoad={(a) => setAvatar(a)} />
 * </Show>
 * ```
 *
 * It does not drive frames — nothing in a Solid tree owns a render loop. Pair
 * it with {@link createFrameLoop} and call `avatar.update(delta)` there.
 */
export function Vrm(props: VrmProps): JSX.Element {
	// Getters, not spread: `props` is reactive, and copying it here would
	// freeze `scene` / `url` at mount time.
	const vrm = createVRM(() => props.url, {
		get scene() {
			return props.scene;
		},
		get vrmLoadOptions() {
			return props.vrmLoadOptions;
		},
		get keepPrevious() {
			return props.keepPrevious;
		},
	});

	// Each handler is untracked so a signal written inside it can't re-enter
	// its own effect — a caller doing `onLoad={(a) => setAvatar(a)}` is the
	// normal case, not the exception.
	createEffect(() => {
		const avatar = vrm.avatar();
		if (avatar) untrack(() => props.onLoad?.(avatar));
	});

	createEffect(() => {
		const progress = vrm.progress();
		if (progress) untrack(() => props.onProgress?.(progress));
	});

	createEffect(() => {
		const error = vrm.error();
		if (error !== null && error !== undefined) {
			untrack(() => props.onError?.(error));
		}
	});

	return null;
}
