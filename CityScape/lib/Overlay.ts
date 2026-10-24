import { Label } from "./Label";
import type { LabelOption, LabelTheme, Rect } from "./Label";

export interface OverlayHandlers {
	orbit(dx: number, dy: number): void;
	pan(dx: number, dy: number): void;
	zoom(delta: number): void;
	/** x/y in CSS pixels relative to the canvas. */
	hover(x: number, y: number): void;
	leave(): void;
	click(x: number, y: number): void;
	reset(): void;
	close(): void;
	/** A pinned card's option was clicked. */
	option(index: number): void;
	/** The pinned card's close button was clicked. */
	collapse(): void;
}

export interface OverlayRect {
	left: number;
	top: number;
	width: number;
	height: number;
}

/** Fixed-position host with a canvas, title/hover label and input handling. */
export class Overlay {
	readonly canvas: HTMLCanvasElement;
	private host: HTMLElement;
	private title: HTMLElement;
	private hint: HTMLElement;
	private closeBtn: HTMLElement;
	private label: Label;
	private theme: LabelTheme;
	private win: any;
	private drag: { x: number; y: number; moved: number; button: number } | null = null;

	constructor(private doc: Document, private handlers: OverlayHandlers, theme: LabelTheme, id = "bb-cityscape") {
		this.theme = theme;
		this.win = eval("window");
		doc.getElementById(id)?.remove();

		this.host = doc.createElement("div");
		this.host.id = id;
		Object.assign(this.host.style, {
			position: "fixed", zIndex: "1200", display: "none", overflow: "hidden",
			background: "#14171c", fontFamily: "monospace", color: "#4a8333", userSelect: "none",
			boxSizing: "border-box", border: "1px solid #2c4a22",
		});

		this.canvas = doc.createElement("canvas");
		Object.assign(this.canvas.style, { width: "100%", height: "100%", display: "block" });
		this.canvas.addEventListener("contextmenu", e => e.preventDefault());
		this.canvas.addEventListener("mousedown", this.onDown);
		this.canvas.addEventListener("mouseleave", () => handlers.leave());
		this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
		this.canvas.addEventListener("dblclick", () => handlers.reset());
		this.win.addEventListener("mousemove", this.onMove);
		this.win.addEventListener("mouseup", this.onUp);

		this.title = doc.createElement("div");
		Object.assign(this.title.style, { position: "absolute", left: "10px", top: "8px", fontSize: "16px", pointerEvents: "none" });

		this.hint = doc.createElement("div");
		Object.assign(this.hint.style, { position: "absolute", left: "10px", bottom: "8px", fontSize: "11px", opacity: "0.6", pointerEvents: "none" });
		this.hint.textContent = "drag: orbit · right-drag: pan · wheel: zoom · double-click: reset · click building: open · click map: close";

		this.closeBtn = doc.createElement("div");
		this.closeBtn.textContent = "✕ exit CityScape";
		Object.assign(this.closeBtn.style, { position: "absolute", right: "10px", top: "8px", cursor: "pointer", fontSize: "12px", padding: "2px 6px", background: "#2c313c" });
		this.closeBtn.addEventListener("click", () => handlers.close());

		this.host.append(this.canvas, this.title, this.hint, this.closeBtn);
		this.label = new Label(doc, this.host, theme, { option: i => handlers.option(i), collapse: () => handlers.collapse() });
		doc.body.appendChild(this.host);
		this.setTheme(theme);
	}

	setTitle(text: string): void {
		this.title.textContent = text;
	}

	setTheme(theme: LabelTheme): void {
		this.theme = theme;
		Object.assign(this.host.style, { background: theme.background, color: theme.primary, fontFamily: theme.fontFamily, borderColor: theme.border });
		Object.assign(this.closeBtn.style, { background: theme.border, color: theme.primary });
		this.label.setTheme(theme);
	}

	setHovered(info: { name: string; kind: string } | null): void {
		this.canvas.style.cursor = info ? "pointer" : "default";
		if (info) this.label.setText(info.name, info.kind);
		else this.label.hide();
	}

	setCursor(pointer: boolean): void {
		this.canvas.style.cursor = pointer ? "pointer" : "default";
	}

	/** Turns the label into an interactive card (options + close button). */
	pin(info: { name: string; kind: string }, status: string): void {
		this.label.setText(info.name, info.kind);
		this.label.setPinned(true);
		this.label.setOptions([], status);
	}

	unpin(): void {
		this.label.setPinned(false);
		this.label.hide();
	}

	setOptions(options: LabelOption[], status: string): void {
		this.label.setOptions(options, status);
	}

	/** Mirrors the game page's heading and descriptive text into the pinned card. */
	setPageText(title: string, notes: string[]): void {
		this.label.setName(title);
		this.label.setNotes(notes);
	}

	optionRect(i: number): Rect | null {
		return this.label.optionRect(i);
	}

	/** Lights up (or clears) a card option, for options whose real button is laid over them. */
	highlightOption(i: number, on: boolean): void {
		this.label.highlight(on ? i : -1);
	}

	/** Hides the card without unpinning it (for example when its anchor is behind the camera). */
	hideLabel(): void {
		this.label.hide();
	}

	/** Anchors the hover label to a canvas-space point. */
	anchorLabel(x: number, y: number): void {
		this.label.place(x, y, this.canvas.clientWidth, this.canvas.clientHeight);
	}

	setRect(r: OverlayRect): void {
		Object.assign(this.host.style, {
			left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`,
		});
	}

	setVisible(visible: boolean): void {
		this.host.style.display = visible ? "block" : "none";
	}

	get visible(): boolean {
		return this.host.style.display !== "none";
	}

	dispose(): void {
		this.win.removeEventListener("mousemove", this.onMove);
		this.win.removeEventListener("mouseup", this.onUp);
		this.host.remove();
	}

	private local(e: MouseEvent): { x: number; y: number } {
		const r = this.canvas.getBoundingClientRect();
		return { x: e.clientX - r.left, y: e.clientY - r.top };
	}

	private onDown = (e: MouseEvent) => {
		e.preventDefault();
		this.drag = { x: e.clientX, y: e.clientY, moved: 0, button: e.button };
	};

	private onMove = (e: MouseEvent) => {
		if (!this.drag) {
			if (e.target === this.canvas) {
				const p = this.local(e);
				this.handlers.hover(p.x, p.y);
			}
			return;
		}
		const dx = e.clientX - this.drag.x;
		const dy = e.clientY - this.drag.y;
		this.drag.x = e.clientX;
		this.drag.y = e.clientY;
		this.drag.moved += Math.abs(dx) + Math.abs(dy);
		if (this.drag.button === 0) this.handlers.orbit(dx, dy);
		else this.handlers.pan(dx, dy);
	};

	private onUp = (e: MouseEvent) => {
		const d = this.drag;
		this.drag = null;
		if (d && d.button === 0 && d.moved < 5) {
			const p = this.local(e);
			this.handlers.click(p.x, p.y);
		}
	};

	private onWheel = (e: WheelEvent) => {
		e.preventDefault();
		this.handlers.zoom(e.deltaY);
	};
}
