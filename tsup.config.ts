import { defineConfig } from "tsup";

export default defineConfig({
	// Named entries → dist/index.{js,cjs} and dist/r3f.{js,cjs} (+ .d.ts).
	// The r3f entry is kept separate so plain three.js consumers never pull in
	// react / @react-three/fiber types from the main entry.
	entry: {
		index: "index.ts",
		r3f: "src/r3f/index.ts",
	},
	format: ["esm", "cjs"],
	dts: true,
	clean: true,
	// peerDependencies (three, @pixiv/three-vrm, react, @react-three/fiber) are
	// externalized automatically by tsup and must stay out of the bundle.
});
