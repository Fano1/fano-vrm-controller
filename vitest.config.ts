import { defineConfig } from "vitest/config";

export default defineConfig({
  // solid-js ships a separate SSR build and selects it under the "node"
  // export condition — which is exactly what vitest's node environment
  // resolves to, and where createSignal/createEffect are inert stubs. The
  // solid tests exercise real reactivity, so they need the client build.
  // Nothing else in the suite declares a "browser" condition, so this is
  // limited to solid in practice.
  resolve: {
    conditions: ["browser", "development"],
  },
  ssr: {
    resolve: {
      conditions: ["browser", "development"],
    },
  },
  test: {
    environment: "node",
    globals: false,
    include: ["src/**/*.test.ts"],
  },
});
