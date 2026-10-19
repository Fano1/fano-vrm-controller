/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

// Runs in the plain Node environment on purpose: no `window`, no `document`,
// exactly what a server render has.

import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";

const { loadVRMMock } = vi.hoisted(() => ({ loadVRMMock: vi.fn() }));

vi.mock("../core/feature/loader", () => ({ loadVRM: loadVRMMock }));

const { useVRM, useVRMStatus, useVRMAvatar, useVRMProgress, useVRMError, useFrameLoop, Vrm } =
	await import("./index");

describe("server rendering", () => {
	it("renders every hook's server snapshot and loads nothing", () => {
		const frame = vi.fn();

		function Probe(props: { vrm: ReturnType<typeof useVRM> }) {
			const { vrm } = props;
			return createElement(
				"p",
				null,
				[
					useVRMStatus(vrm),
					useVRMAvatar(vrm) === null ? "no-avatar" : "avatar",
					String(useVRMProgress(vrm)),
					String(useVRMError(vrm)),
				].join("|"),
			);
		}

		function Page() {
			const vrm = useVRM("/avatar.vrm");
			useFrameLoop(frame);
			return createElement("div", null, createElement(Vrm, { url: "/b.vrm" }), createElement(Probe, { vrm }));
		}

		expect(typeof window).toBe("undefined");

		const html = renderToString(createElement(Page));

		expect(html).toContain("idle|no-avatar|null|undefined");
		expect(loadVRMMock).not.toHaveBeenCalled();
		expect(frame).not.toHaveBeenCalled();
	});
});
