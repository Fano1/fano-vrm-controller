/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

import {
	createElement,
	forwardRef,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from "react";
import { useFrame, type ThreeElements } from "@react-three/fiber";
import {
	loadVRM,
	type LoadVRMOptions,
	type VRMAvatar,
	type VRMLoadProgress,
} from "../core";

export type UseVRMResult = {
	/** The loaded avatar, or null while loading / on error. */
	avatar: VRMAvatar | null;
	/** True from mount (or url change) until the avatar resolves or fails. */
	loading: boolean;
	/** Latest load progress event, or null before the first one arrives. */
	progress: VRMLoadProgress | null;
	/** The rejection reason if the load failed, otherwise null. */
	error: unknown;
};

export type UseVRMOptions = {
	/** Extra plugin options forwarded to the VRM loader. Read fresh on each load. */
	vrmLoadOptions?: LoadVRMOptions["vrmLoadOptions"];
};

/**
 * Load a VRM inside an R3F tree and dispose it automatically.
 *
 * Reloads whenever `url` changes; disposes the previous avatar on url change
 * and on unmount. The avatar is NOT added to any scene here — render
 * `avatar.scene` yourself (that is what {@link Vrm} does).
 */
export function useVRM(url: string, options: UseVRMOptions = {}): UseVRMResult {
	const [avatar, setAvatar] = useState<VRMAvatar | null>(null);
	const [progress, setProgress] = useState<VRMLoadProgress | null>(null);
	const [error, setError] = useState<unknown>(null);
	const [loading, setLoading] = useState(true);

	// Read the latest options without making them a load trigger — an inline
	// `vrmLoadOptions={{}}` would otherwise reload every render.
	const optionsRef = useRef(options);
	optionsRef.current = options;

	useEffect(() => {
		let cancelled = false;
		let loaded: VRMAvatar | null = null;

		setLoading(true);
		setError(null);
		setProgress(null);

		loadVRM(url, {
			vrmLoadOptions: optionsRef.current.vrmLoadOptions,
			onProgress: (p) => {
				if (!cancelled) setProgress(p);
			},
		})
			.then((a) => {
				if (cancelled) {
					// Unmounted / url changed mid-flight — don't leak the GPU resources.
					a.dispose();
					return;
				}
				loaded = a;
				setAvatar(a);
				setLoading(false);
			})
			.catch((err) => {
				if (cancelled) return;
				setError(err);
				setLoading(false);
			});

		return () => {
			cancelled = true;
			setAvatar(null);
			loaded?.dispose();
		};
	}, [url]);

	return { avatar, loading, progress, error };
}

export type VrmProps = ThreeElements["group"] & {
	/** URL (or object URL / data URL) of the .vrm file to load. */
	url: string;
	/** Called once the avatar has loaded. */
	onLoad?: (avatar: VRMAvatar) => void;
	/** Called with each progress event while loading. */
	onProgress?: (progress: VRMLoadProgress) => void;
	/** Called if the load fails. */
	onError?: (error: unknown) => void;
	/** Set false to pause the per-frame `vrm.update(delta)` call. Default true. */
	update?: boolean;
	/** Extra plugin options forwarded to the VRM loader. */
	vrmLoadOptions?: LoadVRMOptions["vrmLoadOptions"];
};

/**
 * Declarative VRM avatar for React Three Fiber.
 *
 * Drops into a `<Canvas>`, loads the model, drives `vrm.update(delta)` every
 * frame, and disposes on unmount / url change. Any extra props
 * (`position`, `rotation`, `scale`, …) apply to the wrapping group. The
 * forwarded ref resolves to the {@link VRMAvatar} (null until loaded).
 *
 * ```tsx
 * <Canvas>
 *   <Vrm url="/avatar.vrm" position={[0, -1, 0]} onLoad={(a) => console.log(a.vrm)} />
 * </Canvas>
 * ```
 */
export const Vrm = forwardRef<VRMAvatar | null, VrmProps>(function Vrm(
	{ url, onLoad, onProgress, onError, update = true, vrmLoadOptions, ...groupProps },
	ref,
) {
	const { avatar, progress, error } = useVRM(url, { vrmLoadOptions });

	// Keep callbacks in a ref so firing them never depends on referential
	// stability of the props the caller passes.
	const callbacks = useRef({ onLoad, onProgress, onError });
	callbacks.current = { onLoad, onProgress, onError };

	useEffect(() => {
		if (avatar) callbacks.current.onLoad?.(avatar);
	}, [avatar]);

	useEffect(() => {
		if (progress) callbacks.current.onProgress?.(progress);
	}, [progress]);

	useEffect(() => {
		if (error !== null && error !== undefined) callbacks.current.onError?.(error);
	}, [error]);

	useImperativeHandle<VRMAvatar | null, VRMAvatar | null>(
		ref,
		() => avatar,
		[avatar],
	);

	useFrame((_, delta) => {
		if (update && avatar) avatar.update(delta);
	});

	if (!avatar) return null;

	// Wrap in a group so transform props apply cleanly and the primitive keeps
	// a stable identity tied to the loaded scene.
	return createElement(
		"group",
		groupProps,
		createElement("primitive", { object: avatar.scene }),
	);
});
