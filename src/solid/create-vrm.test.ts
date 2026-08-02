/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, createSignal } from "solid-js";
import * as THREE from "three";
import type { VRM } from "@pixiv/three-vrm";
import type { VRMAvatar, VRMUpdateFn } from "../core/feature/loader";

// --- Module mock -------------------------------------------------------
// `loadVRM` is the only thing stubbed out — it needs a network and a GPU.
// Everything else (scene graph, disposal bookkeeping, Solid's reactivity) is
// the real thing, so what's under test is the lifecycle wiring, not a mock of
// it. `vi.hoisted` because `vi.mock` is lifted above the imports.

const { loadVRMMock } = vi.hoisted(() => ({ loadVRMMock: vi.fn() }));

vi.mock("../core/feature/loader", () => ({ loadVRM: loadVRMMock }));

const { createVRM, createVRMUpdate } = await import("./create-vrm");

// --- Fakes -------------------------------------------------------------

type FakeAvatar = VRMAvatar & {
	url: string;
	disposed: boolean;
	updaterCount: () => number;
};

function makeAvatar(url: string): FakeAvatar {
	const scene = new THREE.Group();
	scene.name = url;
	const updaters = new Set<VRMUpdateFn>();

	const avatar: FakeAvatar = {
		url,
		disposed: false,
		vrm: { scene } as unknown as VRM,
		scene,
		updaterCount: () => updaters.size,

		registerUpdate(fn) {
			updaters.add(fn);
			return () => void updaters.delete(fn);
		},

		update(delta) {
			for (const fn of updaters) fn(delta);
		},

		dispose() {
			avatar.disposed = true;
			updaters.clear();
			scene.removeFromParent();
		},
	};

	return avatar;
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

/** Let queued microtasks (the resource fetcher) and Solid's effects settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
	// `isBrowser()` gates loading so SSR never downloads a model; the tests run
	// in vitest's node environment, so it has to be faked.
	vi.stubGlobal("window", {});
	vi.stubGlobal("document", {});
	loadVRMMock.mockReset();
	loadVRMMock.mockImplementation(async (url: string) => makeAvatar(url));
});

afterEach(() => {
	vi.unstubAllGlobals();
});

// --- Loading -----------------------------------------------------------

describe("createVRM — loading", () => {
	it("resolves an avatar and reports progress and loading state", async () => {
		loadVRMMock.mockImplementation(
			async (url: string, options: { onProgress?: (p: unknown) => void }) => {
				options.onProgress?.({ loaded: 50, total: 100, progress: 0.5 });
				return makeAvatar(url);
			},
		);

		const [api, dispose] = createRoot((d) => {
			return [createVRM("/a.vrm"), d] as const;
		});

		expect(api.loading()).toBe(true);
		expect(api.avatar()).toBeNull();

		await settle();

		expect(api.loading()).toBe(false);
		expect((api.avatar() as FakeAvatar | null)?.url).toBe("/a.vrm");
		expect(api.progress()).toEqual({ loaded: 50, total: 100, progress: 0.5 });
		expect(api.error()).toBeUndefined();

		dispose();
	});

	it("accepts an accessor and reloads when the url changes", async () => {
		const [url, setUrl] = createSignal("/a.vrm");

		const [api, dispose] = createRoot((d) => [createVRM(url), d] as const);
		await settle();

		const first = api.avatar() as FakeAvatar;
		expect(first.url).toBe("/a.vrm");

		setUrl("/b.vrm");
		await settle();

		const second = api.avatar() as FakeAvatar;
		expect(second.url).toBe("/b.vrm");
		expect(first.disposed).toBe(true);
		expect(loadVRMMock).toHaveBeenCalledTimes(2);

		dispose();
	});

	it("clears the avatar immediately on url change by default", async () => {
		const pending = deferred<FakeAvatar>();
		const [url, setUrl] = createSignal("/a.vrm");

		const [api, dispose] = createRoot((d) => [createVRM(url), d] as const);
		await settle();

		const first = api.avatar() as FakeAvatar;

		loadVRMMock.mockImplementation(() => pending.promise);
		setUrl("/b.vrm");
		await settle();

		// The old model is gone the moment the url no longer describes it.
		expect(api.avatar()).toBeNull();
		expect(first.disposed).toBe(true);

		pending.resolve(makeAvatar("/b.vrm"));
		await settle();
		expect((api.avatar() as FakeAvatar).url).toBe("/b.vrm");

		dispose();
	});

	it("keepPrevious holds the old avatar until the new one arrives", async () => {
		const pending = deferred<FakeAvatar>();
		const [url, setUrl] = createSignal("/a.vrm");

		const [api, dispose] = createRoot(
			(d) => [createVRM(url, { keepPrevious: true }), d] as const,
		);
		await settle();

		const first = api.avatar() as FakeAvatar;

		loadVRMMock.mockImplementation(() => pending.promise);
		setUrl("/b.vrm");
		await settle();

		expect(api.avatar()).toBe(first);
		expect(first.disposed).toBe(false);

		pending.resolve(makeAvatar("/b.vrm"));
		await settle();

		expect((api.avatar() as FakeAvatar).url).toBe("/b.vrm");
		expect(first.disposed).toBe(true);

		dispose();
	});
});

// --- Races and teardown ------------------------------------------------

describe("createVRM — disposal", () => {
	it("disposes an avatar that loses the race to a newer url", async () => {
		const slow = deferred<FakeAvatar>();
		const [url, setUrl] = createSignal("/slow.vrm");

		loadVRMMock.mockImplementationOnce(() => slow.promise);

		const [api, dispose] = createRoot((d) => [createVRM(url), d] as const);

		setUrl("/fast.vrm");
		await settle();

		expect((api.avatar() as FakeAvatar).url).toBe("/fast.vrm");

		// The superseded load finishes afterwards: it must not become visible,
		// and it must not leak.
		const stale = makeAvatar("/slow.vrm");
		slow.resolve(stale);
		await settle();

		expect(stale.disposed).toBe(true);
		expect((api.avatar() as FakeAvatar).url).toBe("/fast.vrm");

		dispose();
	});

	it("disposes on scope cleanup", async () => {
		const [api, dispose] = createRoot((d) => [createVRM("/a.vrm"), d] as const);
		await settle();

		const avatar = api.avatar() as FakeAvatar;
		expect(avatar.disposed).toBe(false);

		dispose();

		expect(avatar.disposed).toBe(true);
	});

	it("disposes an in-flight avatar that arrives after cleanup", async () => {
		const pending = deferred<FakeAvatar>();
		loadVRMMock.mockImplementation(() => pending.promise);

		const [, dispose] = createRoot((d) => [createVRM("/a.vrm"), d] as const);
		dispose();

		const late = makeAvatar("/a.vrm");
		pending.resolve(late);
		await settle();

		expect(late.disposed).toBe(true);
	});
});

// --- Conditional and failed loads --------------------------------------

describe("createVRM — non-loading states", () => {
	it("loads nothing for a falsy url, and releases when the url is cleared", async () => {
		const [url, setUrl] = createSignal<string | undefined>(undefined);

		const [api, dispose] = createRoot((d) => [createVRM(url), d] as const);
		await settle();

		expect(loadVRMMock).not.toHaveBeenCalled();
		expect(api.avatar()).toBeNull();
		expect(api.loading()).toBe(false);

		setUrl("/a.vrm");
		await settle();
		const avatar = api.avatar() as FakeAvatar;
		expect(avatar.url).toBe("/a.vrm");

		setUrl(undefined);
		await settle();

		expect(api.avatar()).toBeNull();
		expect(avatar.disposed).toBe(true);

		dispose();
	});

	it("surfaces a failure through error() without throwing from avatar()", async () => {
		const boom = new Error("no VRM data");
		loadVRMMock.mockImplementation(async () => {
			throw boom;
		});

		const [api, dispose] = createRoot((d) => [createVRM("/bad.vrm"), d] as const);
		await settle();

		expect(api.error()).toBe(boom);
		expect(api.avatar()).toBeNull();
		expect(api.loading()).toBe(false);

		dispose();
	});

	it("does not load outside a browser", async () => {
		vi.unstubAllGlobals();

		const [api, dispose] = createRoot((d) => [createVRM("/a.vrm"), d] as const);
		await settle();

		expect(loadVRMMock).not.toHaveBeenCalled();
		expect(api.avatar()).toBeNull();
		expect(api.loading()).toBe(false);

		dispose();
	});
});

// --- Scene attachment ---------------------------------------------------

describe("createVRM — scene attachment", () => {
	it("adds the avatar to the scene and removes it on cleanup", async () => {
		const scene = new THREE.Scene();

		const [api, dispose] = createRoot(
			(d) => [createVRM("/a.vrm", { scene }), d] as const,
		);
		await settle();

		const avatar = api.avatar() as FakeAvatar;
		expect(scene.children).toContain(avatar.scene);

		dispose();

		expect(scene.children).not.toContain(avatar.scene);
	});

	it("re-attaches to a scene that appears later", async () => {
		const [scene, setScene] = createSignal<THREE.Scene | null>(null);

		const [api, dispose] = createRoot(
			(d) => [createVRM("/a.vrm", { scene }), d] as const,
		);
		await settle();

		const avatar = api.avatar() as FakeAvatar;
		expect(avatar.scene.parent).toBeNull();

		const late = new THREE.Scene();
		setScene(late);

		expect(late.children).toContain(avatar.scene);

		dispose();
	});

	it("moves the avatar when the scene changes", async () => {
		const first = new THREE.Scene();
		const second = new THREE.Scene();
		const [scene, setScene] = createSignal<THREE.Scene>(first);

		const [api, dispose] = createRoot(
			(d) => [createVRM("/a.vrm", { scene }), d] as const,
		);
		await settle();

		const avatar = api.avatar() as FakeAvatar;
		expect(first.children).toContain(avatar.scene);

		setScene(second);

		expect(first.children).not.toContain(avatar.scene);
		expect(second.children).toContain(avatar.scene);

		dispose();
	});
});

// --- The per-frame seam -------------------------------------------------

describe("createVRMUpdate", () => {
	it("registers against the current avatar and follows url changes", async () => {
		const [url, setUrl] = createSignal("/a.vrm");
		const seen: string[] = [];

		const [api, dispose] = createRoot((d) => {
			const vrm = createVRM(url);
			createVRMUpdate(vrm.avatar, (delta) => {
				seen.push(`${(vrm.avatar() as FakeAvatar).url}:${delta}`);
			});
			return [vrm, d] as const;
		});
		await settle();

		const first = api.avatar() as FakeAvatar;
		expect(first.updaterCount()).toBe(1);
		first.update(0.5);
		expect(seen).toEqual(["/a.vrm:0.5"]);

		setUrl("/b.vrm");
		await settle();

		const second = api.avatar() as FakeAvatar;
		expect(second).not.toBe(first);
		expect(second.updaterCount()).toBe(1);

		second.update(0.25);
		expect(seen).toEqual(["/a.vrm:0.5", "/b.vrm:0.25"]);

		dispose();
	});

	it("accepts a plain avatar as well as an accessor, and unregisters on cleanup", async () => {
		const avatar = makeAvatar("/a.vrm");
		let ticks = 0;

		const dispose = createRoot((d) => {
			createVRMUpdate(avatar, () => ticks++);
			return d;
		});

		avatar.update(0.016);
		expect(ticks).toBe(1);

		dispose();
		avatar.update(0.016);
		expect(ticks).toBe(1);
	});
});
