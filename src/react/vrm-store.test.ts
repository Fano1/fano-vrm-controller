/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { VRMAvatar, VRMLoadProgress } from "../core/feature/loader";
import { deferred, flush, makeAvatar, type FakeAvatar } from "./test-utils";

// `loadVRM` is the only thing stubbed — it needs a network and a GPU. The
// store is otherwise real, so what's under test is its own state machine.
const { loadVRMMock } = vi.hoisted(() => ({ loadVRMMock: vi.fn() }));

vi.mock("../core/feature/loader", () => ({ loadVRM: loadVRMMock }));

const { createVRMStore } = await import("./vrm-store");

type LoadCall = {
	url: string;
	options: { onProgress?: (p: VRMLoadProgress) => void };
	load: ReturnType<typeof deferred<VRMAvatar>>;
};

let calls: LoadCall[] = [];

beforeEach(() => {
	calls = [];
	loadVRMMock.mockReset();
	loadVRMMock.mockImplementation((url: string, options: LoadCall["options"]) => {
		const load = deferred<VRMAvatar>();
		calls.push({ url, options, load });
		return load.promise;
	});
});

const makeStore = (settings: Parameters<typeof createVRMStore>[0] = () => ({})) =>
	createVRMStore(settings);

describe("createVRMStore — loading", () => {
	it("starts idle with nothing loaded", () => {
		const store = makeStore();

		expect(store.status).toBe("idle");
		expect(store.avatar).toBeNull();
		expect(store.error).toBeUndefined();
		expect(store.progress).toBeNull();
		expect(loadVRMMock).not.toHaveBeenCalled();
	});

	it("goes idle → loading → ready", async () => {
		const store = makeStore();
		const seen: string[] = [];
		store.subscribe(() => seen.push(store.status));

		store.setSource("/a.vrm");
		expect(store.status).toBe("loading");

		const avatar = makeAvatar("/a.vrm");
		calls[0]!.load.resolve(avatar);
		await flush();

		expect(store.status).toBe("ready");
		expect(store.avatar).toBe(avatar);
		expect(seen).toEqual(["loading", "ready"]);
	});

	it("notifies once per transition, not once per read", async () => {
		const store = makeStore();
		const listener = vi.fn();
		store.subscribe(listener);

		store.setSource("/a.vrm");
		calls[0]!.load.resolve(makeAvatar("/a.vrm"));
		await flush();

		// Reads are free of side effects.
		void store.avatar;
		void store.status;
		void store.avatar;

		expect(listener).toHaveBeenCalledTimes(2);
	});

	it("treats the same source twice as a no-op", () => {
		const store = makeStore();

		store.setSource("/a.vrm");
		store.setSource("/a.vrm");

		expect(loadVRMMock).toHaveBeenCalledTimes(1);
	});

	it("loads nothing for a falsy source", () => {
		const store = makeStore();

		for (const falsy of [undefined, null, false, ""] as const) {
			store.setSource(falsy);
		}

		expect(loadVRMMock).not.toHaveBeenCalled();
		expect(store.status).toBe("idle");
	});

	it("update() drives the avatar, and is a no-op before one exists", async () => {
		const store = makeStore();
		expect(() => store.update(0.016)).not.toThrow();

		store.setSource("/a.vrm");
		const avatar = makeAvatar("/a.vrm");
		calls[0]!.load.resolve(avatar);
		await flush();

		store.update(0.016);
		expect(avatar.trace).toEqual(["vrm"]);
	});

	it("passes vrmLoadOptions read at load time", () => {
		const options = { helperRoot: undefined };
		const store = makeStore(() => ({ vrmLoadOptions: options }));

		store.setSource("/a.vrm");

		expect((calls[0]!.options as { vrmLoadOptions?: unknown }).vrmLoadOptions).toBe(options);
	});
});

describe("createVRMStore — progress", () => {
	it("notifies progress subscribers, never status subscribers", () => {
		const store = makeStore();
		const onStatus = vi.fn();
		const onProgress = vi.fn();
		store.subscribe(onStatus);
		store.subscribeProgress(onProgress);

		store.setSource("/a.vrm");
		onStatus.mockClear();

		const { onProgress: emit } = calls[0]!.options;
		for (let i = 1; i <= 50; i++) {
			emit!({ loaded: i, total: 50, progress: i / 50 });
		}

		expect(onProgress).toHaveBeenCalledTimes(50);
		expect(onStatus).not.toHaveBeenCalled();
		expect(store.progress).toEqual({ loaded: 50, total: 50, progress: 1 });
	});

	it("resets progress when the next load starts", () => {
		const store = makeStore();
		store.setSource("/a.vrm");
		calls[0]!.options.onProgress!({ loaded: 5, total: 10, progress: 0.5 });
		expect(store.progress?.progress).toBe(0.5);

		store.setSource("/b.vrm");

		expect(store.progress).toBeNull();
	});

	it("ignores progress from a superseded load", () => {
		const store = makeStore();
		store.setSource("/a.vrm");
		const stale = calls[0]!.options.onProgress!;

		store.setSource("/b.vrm");
		stale({ loaded: 9, total: 10, progress: 0.9 });

		expect(store.progress).toBeNull();
	});
});

describe("createVRMStore — swapping and races", () => {
	it("disposes the previous avatar when the source changes", async () => {
		const store = makeStore();

		store.setSource("/a.vrm");
		const first = makeAvatar("/a.vrm");
		calls[0]!.load.resolve(first);
		await flush();

		store.setSource("/b.vrm");

		expect(first.disposed).toBe(true);
		expect(store.avatar).toBeNull();
		expect(store.status).toBe("loading");

		const second = makeAvatar("/b.vrm");
		calls[1]!.load.resolve(second);
		await flush();

		expect(store.avatar).toBe(second);
		expect(second.disposed).toBe(false);
	});

	it("disposes a load that lands after the source changed again", async () => {
		const store = makeStore();

		store.setSource("/a.vrm");
		store.setSource("/b.vrm");

		const late = makeAvatar("/a.vrm");
		const current = makeAvatar("/b.vrm");

		// b resolves first, then a — which lost the race.
		calls[1]!.load.resolve(current);
		await flush();
		calls[0]!.load.resolve(late);
		await flush();

		expect(late.disposed).toBe(true);
		expect(current.disposed).toBe(false);
		expect(store.avatar).toBe(current);
	});

	it("ignores a failure from a superseded load", async () => {
		const store = makeStore();

		store.setSource("/a.vrm");
		store.setSource("/b.vrm");
		calls[0]!.load.reject(new Error("a failed"));
		await flush();

		expect(store.status).toBe("loading");
		expect(store.error).toBeUndefined();
	});

	it("runs listeners BEFORE disposing the avatar they are replacing", async () => {
		const store = makeStore();
		store.setSource("/a.vrm");
		const first = makeAvatar("/a.vrm");
		calls[0]!.load.resolve(first);
		await flush();

		let disposedWhenNotified: boolean | undefined;
		store.subscribe(() => {
			if (store.avatar === null) disposedWhenNotified = first.disposed;
		});

		store.setSource("/b.vrm");

		expect(disposedWhenNotified).toBe(false);
		expect(first.disposed).toBe(true);
	});

	it("still disposes the old avatar when a listener throws, and tells the others", async () => {
		const store = makeStore();
		store.setSource("/a.vrm");
		const first = makeAvatar("/a.vrm");
		calls[0]!.load.resolve(first);
		await flush();

		const survivor = vi.fn();
		store.subscribe(() => {
			throw new Error("boom");
		});
		store.subscribe(survivor);

		expect(() => store.setSource("/b.vrm")).toThrow("boom");
		expect(survivor).toHaveBeenCalled();
		expect(first.disposed).toBe(true);
	});

	describe("keepPrevious", () => {
		it("holds the old avatar through the swap, then disposes it", async () => {
			const store = makeStore(() => ({ keepPrevious: true }));

			store.setSource("/a.vrm");
			const first = makeAvatar("/a.vrm");
			calls[0]!.load.resolve(first);
			await flush();

			store.setSource("/b.vrm");

			expect(store.status).toBe("loading");
			expect(store.avatar).toBe(first);
			expect(first.disposed).toBe(false);

			const second = makeAvatar("/b.vrm");
			calls[1]!.load.resolve(second);
			await flush();

			expect(store.avatar).toBe(second);
			expect(first.disposed).toBe(true);
		});

		it("keeps the old avatar when the swap fails", async () => {
			const store = makeStore(() => ({ keepPrevious: true }));

			store.setSource("/a.vrm");
			const first = makeAvatar("/a.vrm");
			calls[0]!.load.resolve(first);
			await flush();

			store.setSource("/b.vrm");
			calls[1]!.load.reject(new Error("nope"));
			await flush();

			expect(store.status).toBe("error");
			expect(store.avatar).toBe(first);
			expect(first.disposed).toBe(false);
		});
	});
});

describe("createVRMStore — errors and refetch", () => {
	it("records a failed load and drops the avatar", async () => {
		const store = makeStore();
		const failure = new Error("404");

		store.setSource("/missing.vrm");
		calls[0]!.load.reject(failure);
		await flush();

		expect(store.status).toBe("error");
		expect(store.error).toBe(failure);
		expect(store.avatar).toBeNull();
	});

	it("retries through refetch, clearing the error", async () => {
		const store = makeStore();

		store.setSource("/a.vrm");
		calls[0]!.load.reject(new Error("flaky"));
		await flush();

		store.refetch();
		expect(store.status).toBe("loading");
		expect(store.error).toBeUndefined();

		const avatar = makeAvatar("/a.vrm");
		calls[1]!.load.resolve(avatar);
		await flush();

		expect(loadVRMMock).toHaveBeenCalledTimes(2);
		expect(store.avatar).toBe(avatar);
	});

	it("refetch with no source does nothing", () => {
		const store = makeStore();
		store.refetch();
		expect(loadVRMMock).not.toHaveBeenCalled();
	});
});

describe("createVRMStore — release (deferred teardown)", () => {
	it("tears down one microtask after release", async () => {
		const store = makeStore();
		store.setSource("/a.vrm");
		const avatar = makeAvatar("/a.vrm");
		calls[0]!.load.resolve(avatar);
		await flush();

		store.release();
		expect(avatar.disposed).toBe(false); // not yet

		await flush();

		expect(avatar.disposed).toBe(true);
		expect(store.status).toBe("idle");
		expect(store.avatar).toBeNull();
	});

	it("is cancelled by an immediate setSource of the same source (StrictMode)", async () => {
		const store = makeStore();
		store.setSource("/a.vrm");
		const avatar = makeAvatar("/a.vrm");
		calls[0]!.load.resolve(avatar);
		await flush();

		// StrictMode: cleanup, then the effect runs again — same tick.
		store.release();
		store.setSource("/a.vrm");
		await flush();

		expect(avatar.disposed).toBe(false);
		expect(store.avatar).toBe(avatar);
		expect(loadVRMMock).toHaveBeenCalledTimes(1);
	});

	it("does not throw away an in-flight download across a StrictMode remount", async () => {
		const store = makeStore();
		store.setSource("/a.vrm");

		store.release();
		store.setSource("/a.vrm");
		await flush();

		expect(loadVRMMock).toHaveBeenCalledTimes(1);

		const avatar = makeAvatar("/a.vrm");
		calls[0]!.load.resolve(avatar);
		await flush();

		expect(store.avatar).toBe(avatar);
		expect(avatar.disposed).toBe(false);
	});

	it("lets a url change win over the pending release", async () => {
		const store = makeStore();
		store.setSource("/a.vrm");
		const first = makeAvatar("/a.vrm");
		calls[0]!.load.resolve(first);
		await flush();

		store.release();
		store.setSource("/b.vrm");
		await flush();

		expect(first.disposed).toBe(true);
		expect(store.status).toBe("loading");
		expect(loadVRMMock).toHaveBeenCalledTimes(2);
	});

	it("drops an in-flight load that finishes after release", async () => {
		const store = makeStore();
		store.setSource("/a.vrm");

		store.release();
		await flush();

		const late: FakeAvatar = makeAvatar("/a.vrm");
		calls[0]!.load.resolve(late);
		await flush();

		expect(late.disposed).toBe(true);
		expect(store.avatar).toBeNull();
	});

	it("loads again if re-attached after a completed teardown", async () => {
		const store = makeStore();
		store.setSource("/a.vrm");
		store.release();
		await flush();

		store.setSource("/a.vrm");

		expect(loadVRMMock).toHaveBeenCalledTimes(2);
	});
});
