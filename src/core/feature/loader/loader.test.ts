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