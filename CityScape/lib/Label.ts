export interface LabelTheme {
	primary: string;
	secondary: string;
	background: string;
	border: string;
	button: string;
	buttonHover: string;
	disabled: string;
	fontFamily: string;
}

export interface LabelOption {
	label: string;
	disabled: boolean;
	/** The game ignores scripted clicks on this one, so a real button is laid over it instead. */
	trusted?: boolean;
}

export interface Rect {
	left: number;
	top: number;
	width: number;
	height: number;
}

export interface LabelHandlers {
	option(index: number): void;
	collapse(): void;
	/** The pointer is over option `index`, or -1 when it left. */
	optionHover(index: number): void;
}

const SVG_NS = "http://www.w3.org/2000/svg";
const RISE = 56;
const MARGIN = 8;

/**
 * A floating name card joined by a leader line to a point on screen.
 * Hover mode shows name and kind. Pinned mode also lists clickable options and a close button.
 */
export class Label {
	private card: HTMLElement;
	private nameEl: HTMLElement;
	private kindEl: HTMLElement;
	private closeEl: HTMLElement;
	private list: HTMLElement;
	private notesEl: HTMLElement;
	private notesKey = "";
	private tipEl: HTMLElement;
	private tipKey = "";
	private tipIdx = -1;
	private lastWidth = 0;
	private lastHeight = 0;
	private svg: SVGSVGElement;
	private line: SVGPolylineElement;
	private dot: SVGCircleElement;
	private shown = false;
	private pinned = false;
	private options: LabelOption[] = [];
	private optionEls: HTMLElement[] = [];
	private lit = -1;
	private status = "";

	constructor(private doc: Document, parent: HTMLElement, private theme: LabelTheme, private handlers: LabelHandlers) {
		this.svg = doc.createElementNS(SVG_NS, "svg") as SVGSVGElement;
		Object.assign(this.svg.style, { position: "absolute", left: "0", top: "0", width: "100%", height: "100%", pointerEvents: "none", overflow: "visible", display: "none" });
		this.line = doc.createElementNS(SVG_NS, "polyline") as SVGPolylineElement;
		this.line.setAttribute("fill", "none");
		this.line.setAttribute("stroke-width", "1.5");
		this.dot = doc.createElementNS(SVG_NS, "circle") as SVGCircleElement;
		this.dot.setAttribute("r", "3.5");
		this.svg.append(this.line, this.dot);

		this.card = doc.createElement("div");
		const header = doc.createElement("div");
		Object.assign(header.style, { display: "flex", alignItems: "flex-start", gap: "12px" });
		const titles = doc.createElement("div");
		Object.assign(titles.style, { flex: "1 1 auto" });
		this.nameEl = doc.createElement("div");
		this.kindEl = doc.createElement("div");
		titles.append(this.nameEl, this.kindEl);

		this.closeEl = doc.createElement("div");
		this.closeEl.textContent = "✕";
		Object.assign(this.closeEl.style, { cursor: "pointer", fontSize: "13px", padding: "0 2px", display: "none" });
		this.closeEl.addEventListener("click", () => handlers.collapse());
		header.append(titles, this.closeEl);

		this.list = doc.createElement("div");
		Object.assign(this.list.style, { display: "none", marginTop: "6px", overflowY: "auto", whiteSpace: "normal" });

		this.notesEl = doc.createElement("div");
		Object.assign(this.notesEl.style, { display: "none", marginTop: "6px", fontSize: "12px", lineHeight: "1.35", whiteSpace: "normal" });

		this.card.append(header, this.notesEl, this.list);
		Object.assign(this.card.style, {
			position: "absolute", display: "none", pointerEvents: "none", whiteSpace: "nowrap",
			padding: "6px 12px 7px", boxShadow: "0 4px 14px rgba(0,0,0,0.5)", maxWidth: "340px", boxSizing: "border-box",
		});
		Object.assign(this.nameEl.style, { fontSize: "15px", fontWeight: "bold", letterSpacing: "0.5px", textTransform: "uppercase" });
		Object.assign(this.kindEl.style, { fontSize: "11px", marginTop: "2px", opacity: "0.85" });

		this.tipEl = doc.createElement("div");
		Object.assign(this.tipEl.style, {
			position: "absolute", display: "none", pointerEvents: "none", padding: "6px 10px", maxWidth: "320px",
			boxSizing: "border-box", boxShadow: "0 4px 14px rgba(0,0,0,0.5)", fontSize: "12px", lineHeight: "1.35",
			whiteSpace: "normal", overflowWrap: "anywhere",
		});

		parent.append(this.svg, this.card, this.tipEl);
		this.setTheme(theme);
	}

	/**
	 * Secondary card beside the main one, for the game's own tooltip on option `index`. `content` is a
	 * detached copy of the tooltip; `key` identifies it so unchanged content isn't rebuilt. Null clears it.
	 */
	setTip(index: number, content: Node | null, key: string): void {
		if (!content) {
			this.tipIdx = -1;
			this.tipKey = "";
			this.tipEl.style.display = "none";
			return;
		}
		if (key !== this.tipKey) {
			this.tipKey = key;
			this.tipEl.textContent = "";
			this.tipEl.append(content);
		}
		this.tipIdx = index;
		this.tipEl.style.display = "block";
		this.placeTip();
	}

	private placeTip(): void {
		const opt = this.optionEls[this.tipIdx];
		if (!opt || !this.shown || this.tipEl.style.display === "none") return;
		const c = this.card.getBoundingClientRect();
		const o = opt.getBoundingClientRect();
		const w = this.tipEl.offsetWidth;
		const gap = 8;
		const right = this.card.offsetLeft + this.card.offsetWidth + gap;
		const left = right + w <= this.lastWidth - MARGIN ? right : Math.max(MARGIN, this.card.offsetLeft - gap - w);
		const top = this.card.offsetTop + (o.top - c.top);
		const maxTop = Math.max(MARGIN, this.lastHeight - this.tipEl.offsetHeight - MARGIN);
		this.tipEl.style.left = `${left}px`;
		this.tipEl.style.top = `${Math.min(Math.max(MARGIN, top), maxTop)}px`;
	}

	setTheme(t: LabelTheme): void {
		this.theme = t;
		Object.assign(this.card.style, {
			background: t.background, border: `1px solid ${t.border}`, borderLeft: `3px solid ${t.primary}`,
			color: t.primary, fontFamily: t.fontFamily,
		});
		this.kindEl.style.color = t.secondary;
		Object.assign(this.tipEl.style, { background: t.background, border: `1px solid ${t.border}`, borderLeft: `3px solid ${t.secondary}`, color: t.primary, fontFamily: t.fontFamily });
		this.line.setAttribute("stroke", t.primary);
		this.dot.setAttribute("fill", t.primary);
		this.renderList();
	}

	setText(name: string, kind: string): void {
		this.nameEl.textContent = name;
		this.kindEl.textContent = kind;
		this.kindEl.style.display = kind && kind.toLowerCase() !== name.toLowerCase() ? "block" : "none";
	}

	setPinned(pinned: boolean): void {
		this.pinned = pinned;
		this.card.style.pointerEvents = pinned ? "auto" : "none";
		this.closeEl.style.display = pinned ? "block" : "none";
		if (!pinned) {
			this.options = [];
			this.status = "";
			this.setNotes([]);
		}
		this.renderList();
	}

	setName(name: string): void {
		if (name && this.nameEl.textContent !== name) this.nameEl.textContent = name;
	}

	/** Descriptive text from the game's page, shown above the options. Only touches the DOM when it changes. */
	setNotes(notes: string[]): void {
		const key = notes.join("\n");
		if (key === this.notesKey) return;
		const hadNotes = this.notesKey !== "";
		this.notesKey = key;
		this.notesEl.textContent = "";
		this.notesEl.style.display = notes.length ? "block" : "none";
		notes.forEach((n, i) => {
			const el = this.doc.createElement("div");
			el.textContent = n;
			Object.assign(el.style, { marginTop: i ? "4px" : "0", color: this.theme.secondary });
			this.notesEl.append(el);
		});
		// The "nothing to do" fallback depends on whether there is any text.
		if (hadNotes !== notes.length > 0) this.renderList();
	}

	/** Replaces the option list. `status` is shown instead when there are no options. */
	setOptions(options: LabelOption[], status: string): void {
		this.options = options;
		this.status = status;
		this.renderList();
	}

	/** Anchors the leader line at (ax, ay); the card goes above it, or below if there is no room above. */
	place(ax: number, ay: number, width: number, height: number): void {
		this.setShown(true);
		this.list.style.maxHeight = `${Math.max(120, Math.min(height * 0.55, 360))}px`;
		const w = this.card.offsetWidth;
		const h = this.card.offsetHeight;
		const left = Math.min(Math.max(ax - w * 0.25, MARGIN), Math.max(MARGIN, width - w - MARGIN));
		const above = ay - RISE - h >= MARGIN;
		const top = above
			? ay - RISE - h
			: Math.min(ay + RISE, Math.max(MARGIN, height - h - MARGIN));
		this.card.style.left = `${left}px`;
		this.card.style.top = `${top}px`;

		// Straight out from the building, then an angled run to the nearest card edge.
		const joinX = Math.min(Math.max(ax, left + 8), left + w - 8);
		const edge = above ? top + h : top;
		const elbow = above ? Math.max(edge + 8, ay - 18) : Math.min(edge - 8, ay + 18);
		this.line.setAttribute("points", `${ax},${ay} ${ax},${elbow} ${joinX},${edge}`);
		this.dot.setAttribute("cx", String(ax));
		this.dot.setAttribute("cy", String(ay));
		this.lastWidth = width;
		this.lastHeight = height;
		this.placeTip();
	}

	/** Hides the card without changing pinned state. */
	hide(): void {
		this.setShown(false);
		this.tipEl.style.display = "none";
	}

	/** Highlights option `i` (-1 for none) like a hover, surviving re-renders of the list. */
	highlight(i: number): void {
		this.lit = i;
		this.optionEls.forEach((el, k) => { el.style.background = k === i ? this.theme.buttonHover : this.theme.button; });
		this.handlers.optionHover(i);
	}

	/** Viewport rect of an option, clipped to the visible part of the list. Null if hidden or scrolled out. */
	optionRect(i: number): Rect | null {
		const el = this.optionEls[i];
		if (!el || !this.shown || !this.pinned) return null;
		const r = el.getBoundingClientRect();
		const l = this.list.getBoundingClientRect();
		const top = Math.max(r.top, l.top);
		const bottom = Math.min(r.bottom, l.bottom);
		if (bottom - top < 4 || r.width < 4) return null;
		return { left: r.left, top, width: r.width, height: bottom - top };
	}

	private renderList(): void {
		const t = this.theme;
		this.list.textContent = "";
		this.optionEls = [];
		this.list.style.display = this.pinned ? "block" : "none";
		if (!this.pinned) return;

		if (!this.options.length) {
			// Page text (if any) already explains the location; only fall back to a message when there is none.
			if (this.notesKey) {
				this.list.style.display = "none";
				return;
			}
			const note = this.doc.createElement("div");
			note.textContent = this.status || "Nothing to do here.";
			Object.assign(note.style, { fontSize: "12px", color: t.secondary, padding: "4px 0" });
			this.list.append(note);
			return;
		}

		this.options.forEach((o, i) => {
			const el = this.doc.createElement("div");
			el.textContent = o.label;
			Object.assign(el.style, {
				marginTop: i ? "4px" : "0", padding: "5px 10px", fontSize: "12px", cursor: o.disabled ? "default" : "pointer",
				background: i === this.lit ? t.buttonHover : t.button, color: o.disabled ? t.disabled : t.primary, border: `1px solid ${t.border}`,
				userSelect: "none",
			});
			if (!o.disabled && !o.trusted) {
				el.addEventListener("mouseenter", () => { el.style.background = t.buttonHover; });
				el.addEventListener("mouseleave", () => { el.style.background = t.button; });
				el.addEventListener("click", () => this.handlers.option(i));
			}
			if (!o.trusted) {
				el.addEventListener("mouseenter", () => this.handlers.optionHover(i));
				el.addEventListener("mouseleave", () => this.handlers.optionHover(-1));
			}
			this.optionEls.push(el);
			this.list.append(el);
		});
	}

	private setShown(show: boolean): void {
		if (show === this.shown) return;
		this.shown = show;
		this.card.style.display = show ? "block" : "none";
		this.svg.style.display = show ? "block" : "none";
	}
}
