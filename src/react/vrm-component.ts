/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

import { forwardRef, useEffect, useImperativeHandle } from "react";
import type { VRMHandle, VrmProps } from "./react-type";
import { useLatest } from "./react-utils";
import { useVRM } from "./use-vrm";
import { useVRMEffect } from "./use-vrm-effect";

/**
 * Declarative avatar mount: load, attach, dispose — driven by JSX lifetime.
 *
 * Renders nothing to the DOM (the avatar lives in a three.js scene, not the
 * document), so this is a side-effect component in the mould of `<Helmet>`.
 * What it buys over calling {@link useVRM} directly is React's own tree as the
 * lifecycle: unmounting it disposes the model, and mapping a list of urls to
 * `<Vrm key={url}>` manages one avatar per entry.
 *
 * ```tsx
 * const handle = useRef<VRMHandle>(null);
 *
 * {visible && (
 *   <Vrm ref={handle} url={url} scene={scene} onLoad={(a) => console.log(a.vrm)} />
 * )}
 * ```
 *
 * **It never re-renders itself for load state.** `onLoad`, `onProgress` and
 * `onError` are delivered by subscription, not through state, so a parent doing
 * `onLoad={(a) => setAvatar(a)}` is the only thing that renders — and only when
 * it chooses to. The callbacks are read through a ref: inline arrows are fine.
 *
 * The forwarded `ref` resolves to the stable {@link VRMHandle} as soon as the
 * component mounts — not `null` until loaded — so `handle.current.avatar` is
 * the null-until-ready read. It does not drive frames; pair it with
 * {@link useFrameLoop} and call `handle.current?.update(delta)` there.
 */
export const Vrm = forwardRef<VRMHandle, VrmProps>(function Vrm(
	{ url, scene, vrmLoadOptions, keepPrevious, onLoad, onProgress, onError },
	ref,
) {
	const handle = useVRM(url, { scene, vrmLoadOptions, keepPrevious });
	const callbacks = useLatest({ onLoad, onProgress, onError });

	useImperativeHandle(ref, () => handle, [handle]);

	useVRMEffect(handle, (avatar) => {
		callbacks.current.onLoad?.(avatar);
	});

	useEffect(
		() =>
			handle.subscribeProgress(() => {
				const event = handle.progress;
				if (event) callbacks.current.onProgress?.(event);
			}),
		[handle, callbacks],
	);

	useEffect(() => {
		// Fire once per failure: a failed load that is refetched passes through
		// `loading` first, which re-arms this.
		let reported = false;

		return handle.subscribe(() => {
			if (handle.status !== "error") {
				reported = false;
			} else if (!reported) {
				reported = true;
				callbacks.current.onError?.(handle.error);
			}
		});
	}, [handle, callbacks]);

	return null;
});
