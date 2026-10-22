import type { DashModule, CreateElement } from "./Dashboard";

export interface GraphOptions {
	title: string;
	category?: string;
	/** Max samples kept per series. */
	maxPoints?: number;
	/** Formats Y-axis labels and legend values. */
	format?: (v: number) => string;
	logScale?: boolean;
}

interface Series {
	name: string;
	color: string;
	hidden: boolean;
	pts: { t: number; v: number }[];
}

const PALETTE = ["#4a8333", "#e5c07b", "#61afef", "#e06c75", "#c678dd", "#56b6c2", "#d19a66", "#98c379", "#be5046", "#abb2bf"];

export function compact(v: number): string {
	const a = Math.abs(v);
	const units = [[1e15, "q"], [1e12, "t"], [1e9, "b"], [1e6, "m"], [1e3, "k"]] as const;
	for (const [n, s] of units) if (a >= n) return (v / n).toFixed(2) + s;
	return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

/**
 * Multi-series line graph. Call push(series, value) as often as you like;
 * it only stores data. Drawing happens when the owning Dashboard renders.
 * Keys (while the dashboard is focused): 1-9 toggle series, P pause, L log scale, R reset.
 */
export class Graph implements DashModule {
	title: string;
	category: string;
	maxPoints: number;
	format: (v: number) => string;
	logScale: boolean;
	paused = false;
	private series = new Map<string, Series>();

	constructor(opts: GraphOptions) {
		this.title = opts.title;
		this.category = opts.category ?? "General";
		this.maxPoints = opts.maxPoints ?? 120;
		this.format = opts.format ?? compact;
		this.logScale = opts.logScale ?? false;
	}

	push(seriesName: string, value: number, t: number = Date.now()): void {
		if (this.paused || !Number.isFinite(value)) return;
		let s = this.series.get(seriesName);
		if (!s) {
			s = { name: seriesName, color: PALETTE[this.series.size % PALETTE.length], hidden: false, pts: [] };
			this.series.set(seriesName, s);
		}
		s.pts.push({ t, v: value });
		if (s.pts.length > this.maxPoints) s.pts.shift();
	}

	clear(): void {
		this.series.clear();
	}

	onKey(e: KeyboardEvent): boolean {
		const k = e.key.toLowerCase();
		if (k >= "1" && k <= "9") {
			const s = [...this.series.values()][Number(k) - 1];
			if (s) s.hidden = !s.hidden;
			return true;
		}
		if (k === "p") { this.paused = !this.paused; return true; }
		if (k === "l") { this.logScale = !this.logScale; return true; }
		if (k === "r") { this.clear(); return true; }
		return false;
	}

	render(h: CreateElement): unknown {
		const all = [...this.series.values()];
		const vis = all.filter(s => !s.hidden && s.pts.length);
		const tf = (v: number) => (this.logScale ? Math.log10(Math.max(v, 1e-9)) : v);

		let tMin = Infinity, tMax = -Infinity, vMin = Infinity, vMax = -Infinity;
		for (const s of vis) {
			tMin = Math.min(tMin, s.pts[0].t);
			tMax = Math.max(tMax, s.pts[s.pts.length - 1].t);
			for (const p of s.pts) {
				vMin = Math.min(vMin, tf(p.v));
				vMax = Math.max(vMax, tf(p.v));
			}
		}
		const tSpan = tMax - tMin || 1;
		const vSpan = vMax - vMin || 1;
		const back = (y: number) => (this.logScale ? 10 ** y : y);

		// Fixed 1000x1000 coordinate space stretched to the container, so resizing needs no measuring.
		const lines = vis.map(s =>
			h("polyline", {
				key: s.name,
				fill: "none",
				stroke: s.color,
				strokeWidth: 2,
				vectorEffect: "non-scaling-stroke",
				points: s.pts.map(p => `${((p.t - tMin) / tSpan) * 1000},${1000 - ((tf(p.v) - vMin) / vSpan) * 1000}`).join(" "),
			}));

		const label = (text: string, pos: object) =>
			h("div", { style: { position: "absolute", left: 4, fontSize: 10, opacity: 0.7, pointerEvents: "none", ...pos } }, text);

		const legend = all.map((s, i) =>
			h("span", {
				key: s.name,
				onClick: () => { s.hidden = !s.hidden; },
				style: { marginRight: 10, cursor: "pointer", opacity: s.hidden ? 0.35 : 1, whiteSpace: "nowrap" },
			},
			h("span", { style: { color: s.color } }, "■ "),
			`${i < 9 ? i + 1 + ":" : ""}${s.name}`,
			s.pts.length ? ` ${this.format(s.pts[s.pts.length - 1].v)}` : ""));

		return h("div", { style: { display: "flex", flexDirection: "column", height: "100%", minHeight: 0 } },
			h("div", { style: { fontSize: 12, marginBottom: 2 } },
				this.title, this.paused ? " [paused]" : "", this.logScale ? " [log]" : ""),
			h("div", { style: { position: "relative", flex: "1 1 0", minHeight: 40, background: "#111" } },
				h("svg", { width: "100%", height: "100%", viewBox: "0 0 1000 1000", preserveAspectRatio: "none", style: { display: "block" } }, ...lines),
				vis.length ? label(this.format(back(vMax)), { top: 2 }) : null,
				vis.length ? label(this.format(back(vMin)), { bottom: 2 }) : null),
			h("div", { style: { fontSize: 11, marginTop: 2, lineHeight: 1.4 } }, ...legend));
	}
}
