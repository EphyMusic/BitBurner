export type CreateElement = (type: any, props?: any, ...children: any[]) => any;

export interface DashModule {
	title: string;
	category: string;
	render(h: CreateElement): unknown;
	/** Return true if the key was handled. */
	onKey?(e: KeyboardEvent): boolean | void;
}

export interface DashboardOptions {
	title?: string;
	x?: number;
	y?: number;
	width?: number;
	height?: number;
	id?: string;
}

const ALL = "All";

const exitList: (() => void)[] = [];

/** Queue a cleanup task to run when the script exits. */
export function onExit(task: () => void): void {
	exitList.push(task);
}

/** Pass this to ns.atExit once per script: ns.atExit(exitTasks). Runs queued tasks in reverse order, then clears them. */
export function exitTasks(): void {
	while (exitList.length) {
		try { exitList.pop()!(); } catch { /* keep going so one failure doesn't block the rest */ }
	}
}

/**
 * A draggable, resizable floating window hosting modules (e.g. Graph) grouped by category.
 * One React render per tick covers every module, so data pushes are cheap.
 *
 *   const dash = new Dashboard(ns, { title: "Monitor" });
 *   const money = dash.add(new Graph({ title: "Money", category: "Servers" }));
 *   while (await dash.tick(1000)) money.push("n00dles", ns.getServerMoneyAvailable("n00dles"));
 *
 * Click the window to capture keyboard input; click elsewhere or press Esc to release.
 * Built-in keys: [ and ] switch category. Other keys go to the visible modules.
 * Call ns.atExit(exitTasks) once in your script; the dashboard queues its close() there.
 */
export class Dashboard {
	private modules: DashModule[] = [];
	private category = ALL;
	private title: string;
	private host: HTMLElement;
	private doc: Document;
	private win: any;
	private RD: any;
	private h: CreateElement;
	private captured = false;
	private closed = false;
	private drag: { x: number; y: number } | null = null;

	constructor(private ns: NS, opts: DashboardOptions = {}) {
		const id = opts.id ?? "bb-dashboard";
		this.title = opts.title ?? "Dashboard";
		this.doc = eval("document");
		this.win = eval("window");
		this.RD = this.win.ReactDOM;
		this.h = this.win.React.createElement;

		this.doc.getElementById(id)?.remove();
		this.host = this.doc.createElement("div");
		this.host.id = id;
		Object.assign(this.host.style, {
			position: "fixed", left: `${opts.x ?? 100}px`, top: `${opts.y ?? 100}px`,
			width: `${opts.width ?? 420}px`, height: `${opts.height ?? 320}px`,
			minWidth: "240px", minHeight: "160px", resize: "both", overflow: "hidden",
			zIndex: "9999", background: "#20242c", color: "#4a8333",
			border: "1px solid #2c4a22", fontFamily: "monospace", boxSizing: "border-box",
		});
		this.doc.body.appendChild(this.host);

		this.doc.addEventListener("mousedown", this.onDocDown);
		this.doc.addEventListener("mousemove", this.onMove);
		this.doc.addEventListener("mouseup", this.onUp);
		onExit(() => this.close());
	}

	get open(): boolean { return !this.closed; }

	add<T extends DashModule>(module: T): T {
		this.modules.push(module);
		return module;
	}

	remove(module: DashModule): void {
		this.modules = this.modules.filter(m => m !== module);
	}

	get categories(): string[] {
		return [ALL, ...new Set(this.modules.map(m => m.category))];
	}

	setCategory(c: string): void {
		this.category = this.categories.includes(c) ? c : ALL;
	}

	/** Renders, sleeps, and returns false once the window has been closed. */
	async tick(ms = 1000): Promise<boolean> {
		this.render();
		await this.ns.sleep(ms);
		return !this.closed;
	}

	render(): void {
		if (this.closed) return;
		const h = this.h;
		if (!this.categories.includes(this.category)) this.category = ALL;
		const shown = this.modules.filter(m => this.category === ALL || m.category === this.category);

		const tab = (c: string) =>
			h("span", {
				key: c,
				onClick: () => { this.category = c; this.render(); },
				style: {
					padding: "2px 8px", cursor: "pointer", marginRight: 2,
					background: c === this.category ? "#4a8333" : "#2c313c",
					color: c === this.category ? "#111" : "#4a8333",
				},
			}, c);

		const ui = h("div", { style: { display: "flex", flexDirection: "column", height: "100%" } },
			h("div", {
				onMouseDown: this.onHeaderDown,
				style: { cursor: "move", padding: "4px 8px", background: "#2c313c", display: "flex", justifyContent: "space-between", userSelect: "none" },
			},
			h("span", null, this.title + (this.captured ? "  [keys]" : "")),
			h("span", { onClick: () => this.close(), onMouseDown: (e: Event) => e.stopPropagation(), style: { cursor: "pointer" } }, "✕")),
			h("div", { style: { padding: "4px 4px 0", fontSize: 12, userSelect: "none" } }, ...this.categories.map(tab)),
			h("div", { style: { flex: "1 1 0", minHeight: 0, overflowY: "auto", padding: 8, display: "flex", flexDirection: "column", gap: 8 } },
				...shown.map((m, i) =>
					h("div", { key: `${m.category}/${m.title}/${i}`, style: { flex: "1 1 0", minHeight: 120 } }, m.render(h)))),
			this.captured ? h("div", { style: { fontSize: 10, padding: "2px 8px", opacity: 0.6 } }, "keys captured · Esc to release · [ ] categories") : null);

		this.RD.render(ui, this.host);
	}

	close(): void {
		if (this.closed) return;
		this.closed = true;
		this.release();
		this.doc.removeEventListener("mousedown", this.onDocDown);
		this.doc.removeEventListener("mousemove", this.onMove);
		this.doc.removeEventListener("mouseup", this.onUp);
		this.RD.unmountComponentAtNode(this.host);
		this.host.remove();
	}

	private onHeaderDown = (e: MouseEvent) => {
		this.drag = { x: e.clientX - this.host.offsetLeft, y: e.clientY - this.host.offsetTop };
	};
	private onMove = (e: MouseEvent) => {
		if (!this.drag) return;
		this.host.style.left = `${e.clientX - this.drag.x}px`;
		this.host.style.top = `${e.clientY - this.drag.y}px`;
	};
	private onUp = () => { this.drag = null; };

	// Keyboard capture: click inside to grab, click outside (or Esc) to release.
	private onDocDown = (e: MouseEvent) => {
		if (this.host.contains(e.target as Node)) this.capture();
		else this.release();
	};

	private capture(): void {
		if (this.captured) return;
		this.captured = true;
		this.host.style.borderColor = "#4a8333";
		this.win.addEventListener("keydown", this.onKey, true);
		this.render();
	}

	private release(): void {
		if (!this.captured) return;
		this.captured = false;
		this.host.style.borderColor = "#2c4a22";
		this.win.removeEventListener("keydown", this.onKey, true);
		if (!this.closed) this.render();
	}

	private onKey = (e: KeyboardEvent) => {
		// Let browser shortcuts through.
		if (e.ctrlKey || e.metaKey || /^F\d+$/.test(e.key)) return;
		e.preventDefault();
		e.stopImmediatePropagation();
		if (e.key === "Escape") return this.release();

		const cats = this.categories;
		const idx = cats.indexOf(this.category);
		if (e.key === "[") this.category = cats[(idx - 1 + cats.length) % cats.length];
		else if (e.key === "]") this.category = cats[(idx + 1) % cats.length];
		else {
			for (const m of this.modules) {
				if (this.category === ALL || m.category === this.category) m.onKey?.(e);
			}
		}
		this.render();
	};
}
