/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

import {
	createEffect,
	createResource,
	createSignal,
	onCleanup,
	untrack,
	type ResourceFetcherInfo,
} from "solid-js";
import {
	loadVRM,
	type VRMAvatar,
	type VRMLoadProgress,
	type VRMUpdateFn,
} from "../core/feature/loader";
import type {
	CreateVRMOptions,
	MaybeAccessor,
	VRMResource,
	VRMSource,
} from "./solid-type";
import { access, isBrowser } from "./solid-utils";

/**
 * Load a VRM inside a Solid scope, and dispose it automatically.
 *
 * Reloads whenever `url` changes, disposes the previous avatar, and disposes
 * the current one when the owning scope is cleaned up. A falsy `url` loads
 * nothing and releases whatever was loaded before.
 *
 * The avatar is not rendered anywhere by itself — pass `options.scene` to have
 * it attached to a `THREE.Object3D` for you, or add `avatar()!.scene` yourself.
 *
 * ```ts
 * const [url, setUrl] = createSignal("/avatar.vrm");
 * const vrm = createVRM(url, { scene });
 *
 * createFrameLoop((delta) => {
 *   vrm.avatar()?.update(delta);
 *   renderer.render(scene, camera);
 * });
 * ```
 */
export function createVRM(
	url: MaybeAccessor<VRMSource>,
	options: CreateVRMOptions = {},
): VRMResource {
	const [avatar, setAvatar] = createSignal<VRMAvatar | null>(null);
	const [progress, setProgress] = createSignal<VRMLoadProgress | null>(null);

	// Every load run takes a ticket. An avatar that finishes loading holding a
	// stale ticket lost a race (the url changed, or the scope was disposed) and
	// is thrown away instead of shown — otherwise it leaks GPU memory that
	// nothing holds a reference to any more.
	let generation = 0;
	let live: VRMAvatar | null = null;
	let torndown = false;

	/** Take ownership of `next`, disposing whatever we owned before it. */
	const claim = (next: VRMAvatar | null) => {
		if (live && live !== next) live.dispose();
		live = next;
		// Wrapped in a thunk: a bare object is fine, but this keeps the setter
		// honest if `VRMAvatar` ever becomes callable.
		setAvatar(() => next);
	};

	const source = () => {
		if (!isBrowser()) return false as const;
		return access(url) || (false as const);
	};

	const fetcher = async (
		src: string,
		info: ResourceFetcherInfo<VRMAvatar | undefined>,
	) => {
		const ticket = ++generation;
		setProgress(null);

		// Reading options inside the fetcher would otherwise subscribe the
		// resource to them (Solid props are getters), turning a `keepPrevious`
		// toggle into a full model reload.
		const { keepPrevious, vrmLoadOptions } = untrack(() => ({
			keepPrevious: access(options.keepPrevious ?? false),
			vrmLoadOptions: options.vrmLoadOptions,
		}));

		// Default: the old avatar goes the moment the url changes, so `avatar()`
		// never disagrees with the url that produced it.
		if (!keepPrevious) claim(null);

		const loaded = await loadVRM(src, {
			vrmLoadOptions,
			onProgress: (p) => {
				if (ticket === generation) setProgress(p);
			},
		});

		if (torndown || ticket !== generation) {
			loaded.dispose();
			// Solid discards results from superseded fetches, so this value never
			// reaches `resource()` — returning the previous one just keeps types
			// honest for the branch that can't happen.
			return info.value;
		}

		claim(loaded);
		return loaded;
	};

	const [resource, { refetch }] = createResource<VRMAvatar | undefined, string>(
		source,
		fetcher,
	);

	// The fetcher never runs for a falsy url, so clearing the avatar when the
	// url is unset has to happen out here.
	createEffect(() => {
		if (!source()) {
			generation++;
			claim(null);
		}
	});

	// Attach to the caller's scene, and re-attach if either side changes.
	createEffect(() => {
		const current = avatar();
		const parent = access(options.scene);
		if (!current || !parent) return;

		parent.add(current.scene);
		onCleanup(() => {
			parent.remove(current.scene);
		});
	});

	onCleanup(() => {
		torndown = true;
		generation++;
		claim(null);
	});

	return {
		avatar,
		progress,
		loading: () => resource.loading,
		// `.error` reads the failure without re-throwing it, unlike `resource()`.
		error: () => resource.error,
		resource,
		refetch: () => {
			void refetch();
		},
	};
}

/**
 * Register a per-frame callback against a possibly-changing avatar.
 *
 * This is the reactive form of `avatar.registerUpdate(fn)` — the seam every
 * feature in this package hooks into. The callback is re-registered whenever
 * the avatar changes identity and unregistered on cleanup, so a url swap can't
 * leave a driver bound to a disposed model.
 *
 * ```ts
 * const face = createMemo(() => {
 *   const a = vrm.avatar();
 *   return a ? createVRMFace(a.vrm) : null;
 * });
 *
 * createVRMUpdate(vrm.avatar, (delta) => face()?.update(delta));
 * ```
 */
export function createVRMUpdate(
	avatar: MaybeAccessor<VRMAvatar | null | undefined>,
	fn: VRMUpdateFn,
): void {
	createEffect(() => {
		const current = access(avatar);
		if (!current) return;

		// `untrack` so signals read per-frame inside `fn` can't accidentally
		// subscribe this effect and re-register the callback mid-flight.
		onCleanup(current.registerUpdate((delta) => untrack(() => fn(delta))));
	});
}
