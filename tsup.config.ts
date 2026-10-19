import { defineConfig } from "tsup";

export default defineConfig({
	// Named entries → dist/index.{js,cjs}, dist/r3f.{js,cjs}, dist/react.{js,cjs},
	// dist/solid.{js,cjs} (+ .d.ts). Each framework entry is kept separate so
	// plain three.js consumers never pull in react / solid types from the main
	// entry, and so a Solid app never resolves react at all.
	entry: {
		index: "index.ts",
		r3f: "src/r3f/index.ts",
		react: "src/react/index.ts",
		solid: "src/solid/index.ts",
	},
	format: ["esm", "cjs"],
	dts: true,
	clean: true,
	// peerDependencies (three, @pixiv/three-vrm, react, @react-three/fiber,
	// solid-js) are externalized automatically by tsup and must stay out of the
	// bundle. The solid entry ships no JSX on purpose — it is plain function
	// calls, so consumers need no babel-preset-solid pass over our dist.
});
