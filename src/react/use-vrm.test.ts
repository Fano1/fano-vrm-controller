// @vitest-environment happy-dom

/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

// The point of this entry is what it does NOT do — re-render. So these tests
// count renders. Real React, real DOM (happy-dom), real hooks; only `loadVRM`
// is stubbed, because it needs a network and a GPU.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { StrictMode, act, createElement, createRef, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import * as THREE from "three";
import type { VRMAvatar, VRMLoadProgress } from "../core/feature/loader";
import type { VRMHandle } from "./react-type";
import { deferred, flush, makeAvatar, type FakeAvatar } from "./test-utils";

const { loadVRMMock } = vi.hoisted(() => ({ loadVRMMock: vi.fn() }));

vi.mock("../core/feature/loader", () => ({ loadVRM: loadVRMMock }));

const {
	useVRM,
	useVRMAvatar,
	useVRMStatus,
	useVRMError,
	useVRMProgress,
	useVRMEffect,
	useVRMUpdate,
	useFrameLoop,
	Vrm,
} = await import("./index");

// --- Harness -----------------------------------------------------------

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type LoadCall = {
	url: string;
	options: { onProgress?: (p: VRMLoadProgress) => void };
	load: ReturnType<typeof deferred<VRMAvatar>>;
};

let calls: LoadCall[] = [];
let roots: Root[] = [];

beforeEach(() => {
	calls = [];
	roots = [];
	loadVRMMock.mockReset();
	loadVRMMock.mockImplementation((url: string, options: LoadCall["options"]) => {
		const load = deferred<VRMAvatar>();
		calls.push({ url, options, load });
		return load.promise;
	});
});

afterEach(() => {
	for (const root of roots) act(() => root.unmount());
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

function mount(element: ReactNode) {
	const root = createRoot(document.createElement("div"));
	roots.push(root);
	act(() => root.render(element));

	return {
		rerender: (next: ReactNode) => act(() => root.render(next)),
		unmount: () => act(() => root.unmount()),
	};
}

/** Resolve call `index` with a fresh avatar and let React settle. */
async function finish(index: number, url = calls[index]!.url): Promise<FakeAvatar> {
	const avatar = makeAvatar(url);
	await act(async () => {
		calls[index]!.load.resolve(avatar);
		await flush();
	});
	return avatar;
}

const Probe = (props: { onRender: () => void }) => {
	props.onRender();
	return null;
};

// --- useVRM: the caller never renders for load state --------------------

describe("useVRM", () => {
	it("renders its caller exactly once across the whole load", async () => {
		let renders = 0;
		let handle!: VRMHandle;

		function Host() {
			renders++;
			handle = useVRM("/a.vrm");
			return null;
		}

		mount(createElement(Host));
		expect(calls).toHaveLength(1);

		// A flood of progress, then the avatar arriving.
		act(() => {
			for (let i = 1; i <= 200; i++) {
				calls[0]!.options.onProgress!({ loaded: i, total: 200, progress: i / 200 });
			}
		});
		const avatar = await finish(0);

		expect(handle.status).toBe("ready");
		expect(handle.avatar).toBe(avatar);
		expect(renders).toBe(1);
	});

	it("returns the same handle on every render", () => {
		const seen = new Set<VRMHandle>();

		function Host(props: { tick: number }) {
			void props.tick;
			seen.add(useVRM("/a.vrm"));
			return null;
		}

		const view = mount(createElement(Host, { tick: 0 }));
		for (let tick = 1; tick <= 5; tick++) view.rerender(createElement(Host, { tick }));

		expect(seen.size).toBe(1);
	});

	it("does not reload when an inline options object changes identity", () => {
		function Host(props: { tick: number }) {
			void props.tick;
			useVRM("/a.vrm", { vrmLoadOptions: {}, keepPrevious: false });
			return null;
		}

		const view = mount(createElement(Host, { tick: 0 }));
		for (let tick = 1; tick <= 5; tick++) view.rerender(createElement(Host, { tick }));

		expect(loadVRMMock).toHaveBeenCalledTimes(1);
	});

	it("reloads and disposes the previous avatar when the url changes", async () => {
		function Host(props: { url: string }) {
			useVRM(props.url);
			return null;
		}

		const view = mount(createElement(Host, { url: "/a.vrm" }));
		const first = await finish(0);

		view.rerender(createElement(Host, { url: "/b.vrm" }));
		expect(first.disposed).toBe(true);
		expect(calls.map((c) => c.url)).toEqual(["/a.vrm", "/b.vrm"]);
	});

	it("loads nothing for a falsy url", () => {
		function Host() {
			useVRM(undefined);
			return null;
		}

		mount(createElement(Host));
		expect(loadVRMMock).not.toHaveBeenCalled();
	});

	it("disposes the avatar on unmount", async () => {
		function Host() {
			useVRM("/a.vrm");
			return null;
		}

		const view = mount(createElement(Host));
		const avatar = await finish(0);

		view.unmount();
		await act(async () => void (await flush()));

		expect(avatar.disposed).toBe(true);
	});

	it("disposes a load that finishes after unmount", async () => {
		function Host() {
			useVRM("/a.vrm");
			return null;
		}

		const view = mount(createElement(Host));
		view.unmount();
		await act(async () => void (await flush()));

		const late = await finish(0);
		expect(late.disposed).toBe(true);
	});

	it("loads once under StrictMode and keeps the avatar alive", async () => {
		let handle!: VRMHandle;

		function Host() {
			handle = useVRM("/a.vrm");
			return null;
		}

		mount(createElement(StrictMode, null, createElement(Host)));
		await act(async () => void (await flush()));

		// Mount → simulated unmount → mount: the download is not thrown away.
		expect(loadVRMMock).toHaveBeenCalledTimes(1);

		const avatar = await finish(0);
		expect(avatar.disposed).toBe(false);
		expect(handle.avatar).toBe(avatar);
	});

	it("attaches to the scene, detaches on swap, and follows a scene change", async () => {
		const sceneA = new THREE.Scene();
		const sceneB = new THREE.Scene();

		function Host(props: { url: string; scene: THREE.Scene }) {
			useVRM(props.url, { scene: props.scene });
			return null;
		}

		const view = mount(createElement(Host, { url: "/a.vrm", scene: sceneA }));
		const first = await finish(0);
		expect(first.scene.parent).toBe(sceneA);

		view.rerender(createElement(Host, { url: "/a.vrm", scene: sceneB }));
		expect(first.scene.parent).toBe(sceneB);
		expect(sceneA.children).toHaveLength(0);
		expect(loadVRMMock).toHaveBeenCalledTimes(1); // moving scenes is not a reload

		view.rerender(createElement(Host, { url: "/b.vrm", scene: sceneB }));
		expect(sceneB.children).toHaveLength(0);
	});

	it("update() flows through to the avatar", async () => {
		let handle!: VRMHandle;

		function Host() {
			handle = useVRM("/a.vrm");
			return null;
		}

		mount(createElement(Host));
		const avatar = await finish(0);

		handle.update(0.016);
		expect(avatar.trace).toEqual(["vrm"]);
	});
});

// --- Opt-in subscriptions ------------------------------------------------

describe("opt-in subscription hooks", () => {
	it("useVRMStatus renders on each transition and nothing else", async () => {
		const statuses: string[] = [];
		let hostRenders = 0;

		function Status(props: { vrm: VRMHandle }) {
			statuses.push(useVRMStatus(props.vrm));
			return null;
		}
		function Host() {
			hostRenders++;
			const vrm = useVRM("/a.vrm");
			return createElement(Status, { vrm });
		}

		mount(createElement(Host));
		act(() => {
			for (let i = 1; i <= 100; i++) {
				calls[0]!.options.onProgress!({ loaded: i, total: 100, progress: i / 100 });
			}
		});
		await finish(0);

		// Progress events never woke the status subscriber.
		expect(statuses).toEqual(["idle", "loading", "ready"]);
		expect(hostRenders).toBe(1);
	});

	it("useVRMProgress renders once per whole percent, not once per event", async () => {
		const seen: Array<number | null> = [];
		let hostRenders = 0;

		function Progress(props: { vrm: VRMHandle }) {
			seen.push(useVRMProgress(props.vrm));
			return null;
		}
		function Host() {
			hostRenders++;
			const vrm = useVRM("/a.vrm");
			return createElement(Progress, { vrm });
		}

		mount(createElement(Host));

		// 2000 network chunks, 100 visible steps. Each chunk gets its own `act`,
		// like a real download where every chunk is a separate task — dispatching
		// them all in one `act` would let React batch them into a single render
		// and prove nothing about the quantizing.
		for (let i = 1; i <= 2000; i++) {
			act(() => {
				calls[0]!.options.onProgress!({ loaded: i, total: 2000, progress: i / 2000 });
			});
		}

		expect(seen[0]).toBeNull();
		expect(seen.at(-1)).toBe(1);
		// null, then 0.00 … 1.00 — never one render per chunk.
		expect(seen.length).toBeLessThanOrEqual(102);
		expect(seen.length).toBeGreaterThan(90);
		// No two consecutive renders ever showed the same value.
		expect(seen.every((value, i) => i === 0 || value !== seen[i - 1])).toBe(true);
		expect(hostRenders).toBe(1);
	});

	it("useVRMAvatar renders null, then the avatar", async () => {
		const seen: Array<VRMAvatar | null> = [];

		function Reader(props: { vrm: VRMHandle }) {
			seen.push(useVRMAvatar(props.vrm));
			return null;
		}
		function Host() {
			return createElement(Reader, { vrm: useVRM("/a.vrm") });
		}

		mount(createElement(Host));
		const avatar = await finish(0);

		expect(seen).toEqual([null, avatar]);
	});

	it("useVRMError renders the failure", async () => {
		const seen: unknown[] = [];
		const failure = new Error("404");

		function Reader(props: { vrm: VRMHandle }) {
			seen.push(useVRMError(props.vrm));
			return null;
		}
		function Host() {
			return createElement(Reader, { vrm: useVRM("/missing.vrm") });
		}

		mount(createElement(Host));
		await act(async () => {
			calls[0]!.load.reject(failure);
			await flush();
		});

		expect(seen.at(-1)).toBe(failure);
	});

	it("a sibling that asks for nothing never renders", async () => {
		let bystander = 0;

		function Host() {
			useVRM("/a.vrm");
			return createElement(Probe, { onRender: () => bystander++ });
		}

		mount(createElement(Host));
		await finish(0);

		expect(bystander).toBe(1);
	});
});

// --- useVRMUpdate / useVRMEffect ----------------------------------------

describe("useVRMUpdate", () => {
	it("runs every frame with zero renders", async () => {
		let renders = 0;
		const deltas: number[] = [];

		function Host() {
			renders++;
			const vrm = useVRM("/a.vrm");
			useVRMUpdate(vrm, (delta) => deltas.push(delta));
			return null;
		}

		mount(createElement(Host));
		const avatar = await finish(0);

		for (let i = 0; i < 120; i++) avatar.update(1 / 60);

		expect(deltas).toHaveLength(120);
		expect(renders).toBe(1);
	});

	it("hands the callback the avatar, and runs before vrm.update", async () => {
		let received: VRMAvatar | undefined;

		function Host() {
			const vrm = useVRM("/a.vrm");
			useVRMUpdate(vrm, (_delta, avatar) => {
				received = avatar;
				avatar.trace.push("driver");
			});
			return null;
		}

		mount(createElement(Host));
		const avatar = await finish(0);
		avatar.update(0.016);

		expect(received).toBe(avatar);
		expect(avatar.trace).toEqual(["driver", "vrm"]);
	});

	it("places itself among other drivers by `order`, however they register", async () => {
		function Host(props: { driver: boolean }) {
			const vrm = useVRM("/a.vrm");
			useVRMUpdate(vrm, (_d, avatar) => avatar.trace.push("late"), { order: 100 });
			// The rig driver mounts and unmounts with a mode switch — after the late
			// one is already registered.
			return props.driver ? createElement(Driver, { vrm }) : null;
		}

		function Driver(props: { vrm: VRMHandle }) {
			useVRMUpdate(props.vrm, (_d, avatar) => avatar.trace.push("driver"));
			return null;
		}

		const view = mount(createElement(Host, { driver: false }));
		const avatar = await finish(0);

		view.rerender(createElement(Host, { driver: true }));
		avatar.update(0.016);

		expect(avatar.trace).toEqual(["driver", "late", "vrm"]);
	});

	it("sees fresh props through an inline closure without re-registering", async () => {
		const seen: number[] = [];
		let avatar!: FakeAvatar;

		function Host(props: { gain: number }) {
			const vrm = useVRM("/a.vrm");
			useVRMUpdate(vrm, () => seen.push(props.gain));
			return null;
		}

		const view = mount(createElement(Host, { gain: 1 }));
		avatar = await finish(0);

		avatar.update(0.016);
		view.rerender(createElement(Host, { gain: 2 }));
		view.rerender(createElement(Host, { gain: 3 }));
		avatar.update(0.016);

		expect(seen).toEqual([1, 3]);
		expect(avatar.updaterCount()).toBe(1); // never re-registered
	});

	it("moves to the new avatar on a url swap and leaves the old one clean", async () => {
		function Host(props: { url: string }) {
			const vrm = useVRM(props.url);
			useVRMUpdate(vrm, () => {});
			return null;
		}

		const view = mount(createElement(Host, { url: "/a.vrm" }));
		const first = await finish(0);
		expect(first.updaterCount()).toBe(1);

		view.rerender(createElement(Host, { url: "/b.vrm" }));
		const second = await finish(1);

		expect(first.updaterCount()).toBe(0);
		expect(second.updaterCount()).toBe(1);
	});

	it("stops on unmount", async () => {
		function Host() {
			useVRMUpdate(useVRM("/a.vrm"), () => {});
			return null;
		}

		const view = mount(createElement(Host));
		const avatar = await finish(0);

		view.unmount();
		expect(avatar.updaterCount()).toBe(0);
	});
});

describe("useVRMEffect", () => {
	it("runs once per avatar, with no renders", async () => {
		let renders = 0;
		const setup = vi.fn();

		function Host() {
			renders++;
			const vrm = useVRM("/a.vrm");
			useVRMEffect(vrm, (avatar) => void setup(avatar));
			return null;
		}

		mount(createElement(Host));
		expect(setup).not.toHaveBeenCalled(); // nothing to run against yet

		const avatar = await finish(0);

		expect(setup).toHaveBeenCalledTimes(1);
		expect(setup).toHaveBeenCalledWith(avatar);
		expect(renders).toBe(1);
	});

	it("runs its cleanup BEFORE the avatar is disposed", async () => {
		let disposedAtCleanup: boolean | undefined;

		function Host(props: { url: string }) {
			const vrm = useVRM(props.url);
			useVRMEffect(vrm, (avatar) => () => {
				disposedAtCleanup = (avatar as FakeAvatar).disposed;
			});
			return null;
		}

		const view = mount(createElement(Host, { url: "/a.vrm" }));
		const first = await finish(0);

		view.rerender(createElement(Host, { url: "/b.vrm" }));

		expect(disposedAtCleanup).toBe(false);
		expect(first.disposed).toBe(true);
	});

	it("re-runs against the next avatar", async () => {
		const log: string[] = [];

		function Host(props: { url: string }) {
			const vrm = useVRM(props.url);
			useVRMEffect(vrm, (avatar) => {
				log.push(`up:${(avatar as FakeAvatar).url}`);
				return () => log.push(`down:${(avatar as FakeAvatar).url}`);
			});
			return null;
		}

		const view = mount(createElement(Host, { url: "/a.vrm" }));
		await finish(0);
		view.rerender(createElement(Host, { url: "/b.vrm" }));
		await finish(1);
		view.unmount();

		expect(log).toEqual(["up:/a.vrm", "down:/a.vrm", "up:/b.vrm", "down:/b.vrm"]);
	});

	it("re-applies when deps change, without a reload", async () => {
		const applied: string[] = [];

		function Host(props: { mood: string }) {
			const vrm = useVRM("/a.vrm");
			useVRMEffect(vrm, () => void applied.push(props.mood), [props.mood]);
			return null;
		}

		const view = mount(createElement(Host, { mood: "happy" }));
		await finish(0);

		view.rerender(createElement(Host, { mood: "sad" }));
		view.rerender(createElement(Host, { mood: "sad" })); // unchanged: no re-run

		expect(applied).toEqual(["happy", "sad"]);
		expect(loadVRMMock).toHaveBeenCalledTimes(1);
	});

	it("runs immediately if the avatar already exists when it mounts", async () => {
		const setup = vi.fn();

		function Late(props: { vrm: VRMHandle }) {
			useVRMEffect(props.vrm, (avatar) => void setup(avatar));
			return null;
		}
		function Host(props: { showLate: boolean }) {
			const vrm = useVRM("/a.vrm");
			return props.showLate ? createElement(Late, { vrm }) : null;
		}

		const view = mount(createElement(Host, { showLate: false }));
		const avatar = await finish(0);

		view.rerender(createElement(Host, { showLate: true }));

		expect(setup).toHaveBeenCalledWith(avatar);
	});
});

// --- useFrameLoop --------------------------------------------------------

describe("useFrameLoop", () => {
	let rafPending = new Map<number, FrameRequestCallback>();
	let rafRequests = 0;
	let nextHandle = 1;
	let clock = 0;

	function step(advanceMs: number) {
		clock += advanceMs;
		const due = [...rafPending.values()];
		rafPending.clear();
		act(() => {
			for (const cb of due) cb(clock);
		});
	}

	beforeEach(() => {
		rafPending = new Map();
		rafRequests = 0;
		nextHandle = 1;
		clock = 1000;

		vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
			const handle = nextHandle++;
			rafRequests++;
			rafPending.set(handle, cb);
			return handle;
		});
		vi.stubGlobal("cancelAnimationFrame", (handle: number) => {
			rafPending.delete(handle);
		});
		vi.spyOn(performance, "now").mockImplementation(() => clock);
	});

	it("ticks without ever re-rendering its owner", () => {
		let renders = 0;
		const deltas: number[] = [];

		function Host() {
			renders++;
			useFrameLoop((delta) => deltas.push(delta));
			return null;
		}

		mount(createElement(Host));
		for (let i = 0; i < 60; i++) step(16);

		expect(deltas).toHaveLength(60);
		expect(renders).toBe(1);
	});

	it("sees the latest closure and never restarts for a new one", () => {
		const seen: number[] = [];

		function Host(props: { gain: number }) {
			useFrameLoop(() => seen.push(props.gain));
			return null;
		}

		const view = mount(createElement(Host, { gain: 1 }));
		step(16);
		const requestsBefore = rafRequests;

		view.rerender(createElement(Host, { gain: 2 }));
		view.rerender(createElement(Host, { gain: 3 }));
		step(16);

		expect(seen).toEqual([1, 3]);
		// One more request from the tick itself — none from re-renders.
		expect(rafRequests).toBe(requestsBefore + 1);
	});

	it("cancels on unmount", () => {
		const frame = vi.fn();

		function Host() {
			useFrameLoop(frame);
			return null;
		}

		const view = mount(createElement(Host));
		step(16);
		view.unmount();
		step(16);

		expect(frame).toHaveBeenCalledTimes(1);
		expect(rafPending.size).toBe(0);
	});

	it("pauses and resumes on the paused option", () => {
		const frame = vi.fn();

		function Host(props: { paused: boolean }) {
			useFrameLoop(frame, { paused: props.paused });
			return null;
		}

		const view = mount(createElement(Host, { paused: true }));
		step(16);
		expect(frame).not.toHaveBeenCalled();

		view.rerender(createElement(Host, { paused: false }));
		step(16);
		expect(frame).toHaveBeenCalledTimes(1);

		view.rerender(createElement(Host, { paused: true }));
		step(16);
		expect(frame).toHaveBeenCalledTimes(1);
	});

	it("returns a stable controller that start/stop drive", () => {
		const frame = vi.fn();
		const seen = new Set<unknown>();
		let loop!: ReturnType<typeof useFrameLoop>;

		function Host(props: { tick: number }) {
			void props.tick;
			loop = useFrameLoop(frame, { autoStart: false });
			seen.add(loop);
			return null;
		}

		const view = mount(createElement(Host, { tick: 0 }));
		view.rerender(createElement(Host, { tick: 1 }));
		expect(seen.size).toBe(1);

		expect(loop.running).toBe(false);
		act(() => loop.start());
		step(16);
		expect(frame).toHaveBeenCalledTimes(1);
		expect(loop.running).toBe(true);

		act(() => loop.stop());
		expect(loop.running).toBe(false);
	});

	it("keeps running through a StrictMode remount", () => {
		const frame = vi.fn();

		function Host() {
			useFrameLoop(frame);
			return null;
		}

		mount(createElement(StrictMode, null, createElement(Host)));
		step(16);

		expect(frame).toHaveBeenCalledTimes(1);
		expect(rafPending.size).toBe(1);
	});
});

// --- <Vrm> ---------------------------------------------------------------

describe("<Vrm>", () => {
	it("calls onLoad by subscription and never re-renders itself or its parent", async () => {
		let parentRenders = 0;
		const onLoad = vi.fn();

		function Parent() {
			parentRenders++;
			// Inline arrow, new identity every render: must be harmless.
			return createElement(Vrm, { url: "/a.vrm", onLoad: (a) => onLoad(a) });
		}

		mount(createElement(Parent));
		act(() => {
			for (let i = 1; i <= 50; i++) {
				calls[0]!.options.onProgress!({ loaded: i, total: 50, progress: i / 50 });
			}
		});
		const avatar = await finish(0);

		expect(onLoad).toHaveBeenCalledTimes(1);
		expect(onLoad).toHaveBeenCalledWith(avatar);
		expect(parentRenders).toBe(1);
	});

	it("forwards progress events", () => {
		const onProgress = vi.fn();
		mount(createElement(Vrm, { url: "/a.vrm", onProgress }));

		act(() => {
			calls[0]!.options.onProgress!({ loaded: 1, total: 2, progress: 0.5 });
		});

		expect(onProgress).toHaveBeenCalledWith({ loaded: 1, total: 2, progress: 0.5 });
	});

	it("reports a failure exactly once", async () => {
		const onError = vi.fn();
		const failure = new Error("404");

		mount(createElement(Vrm, { url: "/missing.vrm", onError }));
		await act(async () => {
			calls[0]!.load.reject(failure);
			await flush();
		});

		expect(onError).toHaveBeenCalledTimes(1);
		expect(onError).toHaveBeenCalledWith(failure);
	});

	it("reports again after a refetch fails again", async () => {
		const onError = vi.fn();
		const ref = createRef<VRMHandle>();

		mount(createElement(Vrm, { ref, url: "/flaky.vrm", onError }));
		await act(async () => {
			calls[0]!.load.reject(new Error("first"));
			await flush();
		});

		act(() => ref.current!.refetch());
		await act(async () => {
			calls[1]!.load.reject(new Error("second"));
			await flush();
		});

		expect(onError).toHaveBeenCalledTimes(2);
	});

	it("hands the stable handle to its ref as soon as it mounts", async () => {
		const ref = createRef<VRMHandle>();

		mount(createElement(Vrm, { ref, url: "/a.vrm" }));

		// Not null-until-loaded: the handle is there, the avatar isn't yet.
		expect(ref.current).not.toBeNull();
		expect(ref.current!.avatar).toBeNull();

		const avatar = await finish(0);
		expect(ref.current!.avatar).toBe(avatar);
	});

	it("attaches to the scene and disposes on unmount", async () => {
		const scene = new THREE.Scene();

		const view = mount(createElement(Vrm, { url: "/a.vrm", scene }));
		const avatar = await finish(0);
		expect(avatar.scene.parent).toBe(scene);

		view.unmount();
		await act(async () => void (await flush()));

		expect(avatar.disposed).toBe(true);
		expect(scene.children).toHaveLength(0);
	});

	it("renders nothing to the DOM", () => {
		const host = document.createElement("div");
		const root = createRoot(host);
		roots.push(root);

		act(() => root.render(createElement(Vrm, { url: "/a.vrm" })));

		expect(host.innerHTML).toBe("");
	});
});
