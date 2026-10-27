import { Camera, rayOrientedBox } from "./Camera";
import { CityDom } from "./CityDom";
import type { LocationOption } from "./CityDom";
import { onExit } from "./Cleanup";
import type { LabelOption, LabelTheme } from "./Label";
import { project } from "./Mat4";
import type { Mat4 } from "./Mat4";
import { kindFor } from "./Palette";
import { Overlay } from "./Overlay";
import { Renderer } from "./Renderer";
import { buildScene } from "./SceneBuilder";
import type { Scene } from "./SceneBuilder";

/** Locations the game sends to their own page instead of a location page. Handled as the game intends. */
const OWN_PAGE = new Set(["travel agency", "world stock exchange"]);

/** Buttons the game only accepts real (trusted) mouse clicks on. */
const TRUSTED_ONLY = /^(work|infiltrate company)$|chance of success\)$|^get treatment for wounds/i;

/** How long to wait for the game to finish a page change we triggered. */
const NAV_GRACE_MS = 1500;

interface Pin {
	index: number;
	/** True once the game's location page has been seen. */
	opened: boolean;
}

/**
 * Replaces the game's ASCII City page with a WebGL 3D view while the script runs.
 * The original map stays in the DOM (hidden) and is the source of truth for layout and clicks.
 *
 * Clicking a building opens the game's real location page underneath (hidden by our overlay) and
 * mirrors its buttons into a pinned card; card clicks are forwarded to the real buttons.
 *
 *   const cs = new CityScape(ns);
 *   while (await cs.tick(250)) { }
 */
export class CityScape {
	private win: any;
	private dom: CityDom;
	private overlay: Overlay;
	private renderer: Renderer;
	private camera = new Camera();
	private scene: Scene | null = null;
	private signature = "";
	private hovered = -1;
	private pin: Pin | null = null;
	/** Building to open as soon as the City page is back after collapsing another card. */
	private pending = -1;
	private graceUntil = 0;
	private options: LabelOption[] = [];
	private real: HTMLButtonElement[] = [];
	private proxied = new Map<HTMLElement, string>();
	private proxyListeners = new Map<HTMLElement, [() => void, () => void]>();
	private optionsKey = "";
	private hoverOpt = -1;
	private fakeHover: HTMLElement | null = null;
	private tipKey = "";
	private themeKey = "";
	private closed = false;
	private failure: Error | null = null;
	private raf = 0;

	constructor(private ns: NS) {
		const doc: Document = eval("document");
		this.win = eval("window");
		this.dom = new CityDom(doc);
		this.overlay = new Overlay(doc, {
			orbit: (dx, dy) => this.camera.orbit(dx, dy),
			pan: (dx, dy) => this.camera.pan(dx, dy),
			zoom: d => this.camera.zoom(d),
			hover: (x, y) => this.setHover(this.pick(x, y)),
			leave: () => this.setHover(-1),
			click: (x, y) => this.onClick(x, y),
			reset: () => this.camera.reset(),
			close: () => this.close(),
			option: i => this.onOption(i),
			collapse: () => this.collapse(),
			optionHover: i => this.setOptionHover(i),
		}, this.readTheme());
		this.renderer = new Renderer(this.overlay.canvas);
		onExit(() => this.close());
		this.raf = this.win.requestAnimationFrame(this.frame);
	}

	get open(): boolean { return !this.closed; }

	/** Syncs with the game's pages, sleeps, and returns false once closed. */
	async tick(ms = 250): Promise<boolean> {
		// ns calls must stay on this loop; timers and event handlers run while it sleeps.
		this.guard(() => { this.syncTheme(); this.sync(); });
		await this.ns.sleep(ms);
		if (this.failure) {
			this.ns.tprint(`CityScape error: ${this.failure.stack ?? this.failure}`);
			this.failure = null;
		}
		return !this.closed;
	}

	close(): void {
		if (this.closed) return;
		this.closed = true;
		this.win.cancelAnimationFrame(this.raf);
		if (this.pin) this.dom.back();
		this.dom.restore();
		this.releaseProxies();
		this.overlay.dispose();
		this.renderer.dispose();
	}

	private sync(): void {
		if (this.closed) return;
		const now = Date.now();
		const { city } = this.dom.poll();

		if (city) {
			if (!this.scene || city.signature !== this.signature) {
				this.signature = city.signature;
				this.scene = buildScene(city);
				this.renderer.setScene(this.scene);
				this.camera.frame(this.scene.center, this.scene.radius);
				this.dropPin();
			}
			// A pin with the City page showing means the game left the location page (unless it's still opening).
			if (this.pin && (this.pin.opened || now > this.graceUntil)) this.dropPin();
			this.placeOverlay(city.container);
			this.overlay.setVisible(true);
			if (!this.pin) this.graceUntil = 0;
			if (this.pending >= 0) {
				const next = this.pending;
				this.pending = -1;
				this.openBuilding(next);
			}
			return;
		}

		const page = this.pin ? this.dom.locationPage() : null;
		if (this.pin && page) {
			this.pin.opened = true;
			this.graceUntil = 0;
			this.placeOverlay(page.root);
			this.overlay.setVisible(true);
			this.updateOptions(page.options);
		} else if (now < this.graceUntil) {
			this.overlay.setVisible(true);
		} else {
			this.dropPin();
			this.pending = -1;
			this.overlay.setVisible(false);
		}
	}

	private placeOverlay(el: HTMLElement): void {
		const r = el.getBoundingClientRect();
		const height = Math.max(r.height, this.win.innerHeight - r.top - 4);
		this.overlay.setRect({ left: r.left, top: r.top, width: r.width, height });
	}

	/** Re-checks the game's pages a few times shortly after we trigger a navigation. */
	private pump(): void {
		for (const ms of [40, 120, 300, 700]) this.win.setTimeout(() => this.guard(() => this.sync()), ms);
	}

	/** Errors in timer, frame and click callbacks never reach Bitburner's error modal; tick() reports them. */
	private guard(fn: () => void): void {
		try {
			fn();
		} catch (e) {
			this.failure = e as Error;
			console.error("CityScape error:", e);
			this.close();
		}
	}

	private openBuilding(i: number): void {
		const b = this.scene?.buildings[i];
		if (!b) return;
		if (OWN_PAGE.has(b.name.toLowerCase())) {
			if (this.dom.visit(b.name)) this.overlay.setVisible(false);
			return;
		}
		if (!this.dom.visit(b.name)) return;
		this.pin = { index: i, opened: false };
		this.hovered = i;
		this.graceUntil = Date.now() + NAV_GRACE_MS;
		this.options = [];
		this.optionsKey = "";
		this.overlay.pin({ name: b.name, kind: kindFor(b.glyph, b.name) }, "Opening…");
		this.pump();
	}

	/** Unpins the card, and returns the game to the City page. `next` is a building to open once it's back. */
	private collapse(next = -1): void {
		if (!this.pin) return;
		this.dropPin();
		this.pending = next;
		this.graceUntil = Date.now() + NAV_GRACE_MS;
		this.dom.back();
		this.pump();
	}

	private dropPin(): void {
		this.setOptionHover(-1);
		this.releaseProxies();
		if (!this.pin) return;
		this.pin = null;
		this.hovered = -1;
		this.overlay.unpin();
	}

	private updateOptions(options: LocationOption[]): void {
		this.real = options.map(o => o.el);
		const list: LabelOption[] = options.map(o => ({ label: o.label, disabled: o.disabled, trusted: TRUSTED_ONLY.test(o.label) }));
		const key = JSON.stringify(list);
		if (key === this.optionsKey) return;
		this.optionsKey = key;
		this.options = list;
		this.overlay.setOptions(list, "Nothing to do here.");
	}

	/**
	 * The game ignores scripted clicks on some buttons (e.isTrusted). For those, the real button is laid over
	 * the card's option, invisible, so the player's own click lands on it.
	 */
	private syncProxies(): void {
		if (!this.pin) {
			this.releaseProxies();
			return;
		}
		const live = new Set<HTMLElement>();
		this.options.forEach((o, i) => {
			const el = this.real[i];
			if (!o.trusted || o.disabled || !el?.isConnected) return;
			const rect = this.overlay.optionRect(i);
			if (!rect) return;
			live.add(el);
			if (!this.proxied.has(el)) {
				this.proxied.set(el, el.style.cssText);
				const enter = () => this.overlay.highlightOption(this.real.indexOf(el), true);
				const leave = () => this.overlay.highlightOption(this.real.indexOf(el), false);
				el.addEventListener("mouseenter", enter);
				el.addEventListener("mouseleave", leave);
				this.proxyListeners.set(el, [enter, leave]);
			}
			Object.assign(el.style, {
				position: "fixed", left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`,
				margin: "0", padding: "0", minWidth: "0", transform: "none", opacity: "0", cursor: "pointer",
				zIndex: "2147483000", boxSizing: "border-box", display: "block",
			});
			// An ancestor with a transform would shift fixed positioning; correct for any offset.
			const got = el.getBoundingClientRect();
			if (Math.abs(got.left - rect.left) > 0.5) el.style.left = `${rect.left - (got.left - rect.left)}px`;
			if (Math.abs(got.top - rect.top) > 0.5) el.style.top = `${rect.top - (got.top - rect.top)}px`;
		});
		for (const el of Array.from(this.proxied.keys())) {
			if (!live.has(el)) this.unproxy(el);
		}
	}

	private unproxy(el: HTMLElement): void {
		const css = this.proxied.get(el);
		if (css !== undefined) el.style.cssText = css;
		this.proxied.delete(el);
		const fns = this.proxyListeners.get(el);
		if (fns) {
			el.removeEventListener("mouseenter", fns[0]);
			el.removeEventListener("mouseleave", fns[1]);
			this.proxyListeners.delete(el);
			this.overlay.highlightOption(-1, false);
		}
	}

	private releaseProxies(): void {
		for (const el of Array.from(this.proxied.keys())) this.unproxy(el);
	}

	/**
	 * Hovering a card option mirrors the pointer onto the game's real button so its tooltip opens; the frame
	 * loop then copies that tooltip into the secondary card. Trusted options already get the real pointer.
	 */
	private setOptionHover(i: number): void {
		if (i === this.hoverOpt) return;
		if (this.fakeHover) {
			this.dom.hoverOption(this.fakeHover, false);
			this.fakeHover = null;
		}
		this.hoverOpt = i;
		this.tipKey = "";
		this.overlay.setTip(-1, null, "");
		const el = this.real[i];
		if (i >= 0 && el?.isConnected && !this.options[i]?.trusted) {
			this.dom.hoverOption(el, true);
			this.fakeHover = el;
		}
	}

	private syncTip(): void {
		if (!this.pin || this.hoverOpt < 0) return;
		const t = this.dom.tooltip(this.tipKey);
		if (!t) {
			if (this.tipKey) this.overlay.setTip(-1, null, "");
			this.tipKey = "";
			return;
		}
		if (t.node) {
			this.tipKey = t.key;
			this.overlay.setTip(this.hoverOpt, t.node, t.key);
		}
	}

	private onOption(i: number): void {
		this.guard(() => {
			const o = this.options[i];
			if (!o || o.disabled || o.trusted) return;
			this.dom.press(i, o.label);
			this.pump();
		});
	}

	private readTheme(): LabelTheme {
		const t = this.ns.ui.getTheme();
		return {
			primary: t.primary,
			secondary: t.secondary,
			background: t.backgroundsecondary,
			border: t.well,
			button: t.button,
			buttonHover: t.welllight,
			disabled: t.disabled,
			fontFamily: this.ns.ui.getStyles().fontFamily,
		};
	}

	/** Follows live theme changes. */
	private syncTheme(): void {
		const theme = this.readTheme();
		const key = JSON.stringify(theme);
		if (key === this.themeKey) return;
		this.themeKey = key;
		this.overlay.setTheme(theme);
	}

	private frame = () => {
		if (this.closed) return;
		this.guard(() => {
			if (this.overlay.visible && this.scene) {
				const aspect = this.renderer.resize();
				const vp = this.camera.viewProjection(aspect);
				this.syncProxies();
				this.syncTip();
				if (this.pin?.opened) {
					const text = this.dom.locationText();
					if (text) this.overlay.setPageText(text.title, text.notes);
				}
				this.renderer.render(vp, this.hovered);
				this.updateLabel(vp);
			}
		});
		if (!this.closed) this.raf = this.win.requestAnimationFrame(this.frame);
	};

	/** Keeps the label's leader line pinned to the building's rooftop, whatever the camera does. */
	private updateLabel(vp: Mat4): void {
		const b = this.hovered >= 0 ? this.scene?.buildings[this.hovered] : undefined;
		const ndc = b && project(vp, [b.center[0], b.max[1], b.center[2]]);
		if (!b || !ndc) {
			this.overlay.hideLabel();
			return;
		}
		const w = this.overlay.canvas.clientWidth;
		const h = this.overlay.canvas.clientHeight;
		this.overlay.anchorLabel((ndc[0] * 0.5 + 0.5) * w, (0.5 - ndc[1] * 0.5) * h);
	}

	private pick(x: number, y: number): number {
		if (!this.scene) return -1;
		const w = this.overlay.canvas.clientWidth;
		const h = this.overlay.canvas.clientHeight;
		if (!w || !h) return -1;
		const { origin, dir } = this.camera.ray((x / w) * 2 - 1, 1 - (y / h) * 2, w / h);
		let best = -1;
		let bestT = Infinity;
		this.scene.buildings.forEach((b, i) => {
			const t = rayOrientedBox(origin, dir, b.center, b.yaw, b.min, b.max);
			if (t !== null && t < bestT) { bestT = t; best = i; }
		});
		return best;
	}

	private setHover(i: number): void {
		this.overlay.setCursor(i >= 0);
		// A pinned card keeps the spotlight; hovering elsewhere shouldn't replace it.
		if (this.pin || i === this.hovered) return;
		this.hovered = i;
		const b = i >= 0 ? this.scene!.buildings[i] : null;
		this.overlay.setHovered(b && { name: b.name, kind: kindFor(b.glyph, b.name) });
	}

	/** Called for clicks that weren't drags. */
	private onClick(x: number, y: number): void {
		this.guard(() => {
			const i = this.pick(x, y);
			if (this.pin) {
				if (i !== this.pin.index) this.collapse(i);
				return;
			}
			if (i >= 0) this.openBuilding(i);
		});
	}
}
