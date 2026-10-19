import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadVRM } from "./loader";

const mocks = vi.hoisted(() => {
  const fakeGeometry = {
    dispose: vi.fn(),
  };

  const fakeMaterial = {
    dispose: vi.fn(),
  };

  const fakeMesh = {
    geometry: fakeGeometry,
    material: fakeMaterial,
  };

  const fakeVrmScene = {
    removeFromParent: vi.fn(),
    traverse: vi.fn((callback: (object: unknown) => void) => {
      callback(fakeMesh);
    }),
  };

  const fakeVRM = {
    scene: fakeVrmScene,
    update: vi.fn(),
  };

  return {
    fakeGeometry,
    fakeMaterial,
    fakeMesh,
    fakeVrmScene,
    fakeVRM,

    registerMock: vi.fn(),
    loadMock: vi.fn(),
    VRMLoaderPluginMock: vi.fn(),
  };
});

vi.mock("three/addons/loaders/GLTFLoader.js", () => {
  function GLTFLoaderMock(this: {
    register: typeof mocks.registerMock;
    load: typeof mocks.loadMock;
  }) {
    this.register = mocks.registerMock;
    this.load = mocks.loadMock;
  }

  return {
    GLTFLoader: vi.fn(GLTFLoaderMock),
  };
});

vi.mock("@pixiv/three-vrm", () => {
  function VRMLoaderPluginMock(
    this: unknown,
    parser?: unknown,
    options?: unknown
  ) {
    mocks.VRMLoaderPluginMock(parser, options);
  }

  return {
    VRMLoaderPlugin: vi.fn(VRMLoaderPluginMock),
  };
});

describe("loadVRM", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.fakeVrmScene.traverse.mockImplementation(
      (callback: (object: unknown) => void) => {
        callback(mocks.fakeMesh);
      }
    );

    mocks.loadMock.mockImplementation(
      (
        _url: string,
        onLoad: (gltf: unknown) => void,
        onProgress?: (event: { loaded: number; total: number }) => void,
        _onError?: (error: Error) => void
      ) => {
        onProgress?.({
          loaded: 50,
          total: 100,
        });

        onLoad({
          userData: {
            vrm: mocks.fakeVRM,
          },
        });
      }
    );
  });

  it("loads a VRM and returns a clean avatar object", async () => {
    const parentScene = {
      add: vi.fn(),
    };

    const onProgress = vi.fn();

    const avatar = await loadVRM("./normalModel.vrm", {
      scene: parentScene as never,
      onProgress,
    });

    expect(mocks.registerMock).toHaveBeenCalledTimes(1);

    expect(mocks.loadMock).toHaveBeenCalledTimes(1);
    expect(mocks.loadMock).toHaveBeenCalledWith(
      "./normalModel.vrm",
      expect.any(Function),
      expect.any(Function),
      expect.any(Function)
    );

    expect(parentScene.add).toHaveBeenCalledWith(mocks.fakeVRM.scene);

    expect(onProgress).toHaveBeenCalledWith({
      loaded: 50,
      total: 100,
      progress: 0.5,
    });

    expect(avatar.vrm).toBe(mocks.fakeVRM);
    expect(avatar.scene).toBe(mocks.fakeVRM.scene);
    expect(typeof avatar.update).toBe("function");
    expect(typeof avatar.dispose).toBe("function");
  });

  it("updates the underlying VRM", async () => {
    const avatar = await loadVRM("/avatar.vrm");

    avatar.update(0.016);

    expect(mocks.fakeVRM.update).toHaveBeenCalledWith(0.016);
  });

  it("runs registered updaters (in order) BEFORE vrm.update each frame", async () => {
    const avatar = await loadVRM("/avatar.vrm");
    const order: string[] = [];

    avatar.registerUpdate(() => order.push("a"));
    avatar.registerUpdate(() => order.push("b"));
    mocks.fakeVRM.update.mockImplementation(() => order.push("vrm"));

    avatar.update(0.016);

    // This is the animation-engine seam: a future Mixamo mixer registered here
    // always runs before vrm.update so spring-bones / look-at see the final pose.
    expect(order).toEqual(["a", "b", "vrm"]);
    expect(mocks.fakeVRM.update).toHaveBeenCalledWith(0.016);
  });

  it("runs updaters by `order` (lower first), ties in registration order", async () => {
    const avatar = await loadVRM("/avatar.vrm");
    const order: string[] = [];

    avatar.registerUpdate(() => order.push("late"), { order: 100 });
    avatar.registerUpdate(() => order.push("a"));
    avatar.registerUpdate(() => order.push("first"), { order: -10 });
    avatar.registerUpdate(() => order.push("b"), { order: 0 });
    avatar.registerUpdate(() => order.push("late2"), { order: 100 });
    mocks.fakeVRM.update.mockImplementation(() => order.push("vrm"));

    avatar.update(0.016);

    expect(order).toEqual(["first", "a", "b", "late", "late2", "vrm"]);
  });

  it("keeps a late updater last even when a driver registers after it", async () => {
    const avatar = await loadVRM("/avatar.vrm");
    const order: string[] = [];

    // The React mode-switch case: jiggle registered first, then the rig driver
    // is torn down and re-registered afterwards.
    avatar.registerUpdate(() => order.push("jiggle"), { order: 100 });
    const stopOld = avatar.registerUpdate(() => order.push("driver-old"));
    stopOld();
    avatar.registerUpdate(() => order.push("driver-new"));

    avatar.update(0.016);

    expect(order).toEqual(["driver-new", "jiggle"]);
  });

  it("treats each registration independently, even for the same function", async () => {
    const avatar = await loadVRM("/avatar.vrm");
    const updater = vi.fn();

    const stopFirst = avatar.registerUpdate(updater);
    avatar.registerUpdate(updater);
    avatar.update(0.016);
    expect(updater).toHaveBeenCalledTimes(2);

    stopFirst();
    avatar.update(0.016);
    expect(updater).toHaveBeenCalledTimes(3);
  });

  it("is safe to register and unregister from inside an updater", async () => {
    const avatar = await loadVRM("/avatar.vrm");
    const calls: string[] = [];
    let stopB = () => {};

    avatar.registerUpdate(() => {
      calls.push("a");
      stopB();
      avatar.registerUpdate(() => calls.push("added"));
    });
    stopB = avatar.registerUpdate(() => calls.push("b"));

    // An updater unregistered before its turn is skipped, not given a last tick,
    // and one added mid-frame waits for the next frame.
    avatar.update(0.016);
    expect(calls).toEqual(["a"]);

    // The next frame sees both changes.
    calls.length = 0;
    avatar.update(0.016);
    expect(calls).toEqual(["a", "added"]);
  });

  it("unregisters an updater via its returned disposer", async () => {
    const avatar = await loadVRM("/avatar.vrm");
    const updater = vi.fn();

    const stop = avatar.registerUpdate(updater);
    avatar.update(0.016);
    expect(updater).toHaveBeenCalledTimes(1);

    stop();
    avatar.update(0.016);
    expect(updater).toHaveBeenCalledTimes(1);
  });

  it("clears updaters on dispose", async () => {
    const avatar = await loadVRM("/avatar.vrm");
    const updater = vi.fn();

    avatar.registerUpdate(updater);
    avatar.dispose();
    avatar.update(0.016);

    expect(updater).not.toHaveBeenCalled();
  });

  it("disposes the VRM scene, geometry, and material", async () => {
    const avatar = await loadVRM("/avatar.vrm");

    avatar.dispose();

    expect(mocks.fakeVrmScene.removeFromParent).toHaveBeenCalledTimes(1);
    expect(mocks.fakeVrmScene.traverse).toHaveBeenCalledTimes(1);
    expect(mocks.fakeGeometry.dispose).toHaveBeenCalledTimes(1);
    expect(mocks.fakeMaterial.dispose).toHaveBeenCalledTimes(1);
  });

  it("throws when the loaded GLTF has no VRM data", async () => {
    mocks.loadMock.mockImplementation(
      (
        _url: string,
        onLoad: (gltf: unknown) => void,
        _onProgress?: (event: { loaded: number; total: number }) => void,
        _onError?: (error: Error) => void
      ) => {
        onLoad({
          userData: {},
        });
      }
    );

    await expect(loadVRM("/broken.vrm")).rejects.toThrow(
      "[fano-vrmkit] Failed to load VRM"
    );
  });

  it("rejects when GLTFLoader fails", async () => {
    const error = new Error("Loader exploded. Funeral at 5.");

    mocks.loadMock.mockImplementation(
      (
        _url: string,
        _onLoad: (gltf: unknown) => void,
        _onProgress: ((event: { loaded: number; total: number }) => void) | undefined,
        onError: (error: Error) => void
      ) => {
        onError(error);
      }
    );

    await expect(loadVRM("/missing.vrm")).rejects.toThrow(
      "Loader exploded. Funeral at 5."
    );
  });
});