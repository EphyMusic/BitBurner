import { SAND_COLUMNS, SAND_ROWS } from "./SandState";
import type { HourglassRecord } from "./SandState";

type SortMode = "active" | "fullest" | "emptiest" | "all";

interface SidebarSelection {
	element: HTMLElement;
	cssText: string;
}

interface TabHighlight {
	borderLeft: string;
	foregroundColors: string[];
}

const MODES: { value: SortMode; label: string }[] = [
	{ value: "active", label: "Most active" },
	{ value: "fullest", label: "Most full" },
	{ value: "emptiest", label: "Most empty" },
	{ value: "all", label: "All servers" },
];

const VERTEX_SHADER = `
attribute vec2 aPosition;
attribute vec3 aColor;
uniform float uPointSize;
varying vec3 vColor;
void main() {
	gl_Position = vec4(aPosition, 0.0, 1.0);
	gl_PointSize = uPointSize;
	vColor = aColor;
}`;

const FRAGMENT_SHADER = `
precision mediump float;
uniform float uParticle;
varying vec3 vColor;
void main() {
	if (uParticle > 0.5 && max(abs(gl_PointCoord.x - 0.5), abs(gl_PointCoord.y - 0.5)) > 0.49) discard;
	gl_FragColor = vec4(vColor, 1.0);
}`;

/** Sidebar tab and WebGL hourglass view, scoped to this running script. */
export class HourglassView {
	private pageDocument: Document;
	private browserWindow: Window;
	private root: HTMLDivElement;
	private sceneCanvas: HTMLCanvasElement;
	private cards: HTMLDivElement[] = [];
	private chooser: HTMLSelectElement;
	private backButton: HTMLButtonElement;
	private forwardButton: HTMLButtonElement;
	private pageLabel: HTMLSpanElement;
	private sidebarTab: HTMLElement | null = null;
	private inactiveTabStyle = "";
	private inactiveTabForegroundColors: string[] = [];
	private previousSidebarSelection: SidebarSelection[] = [];
	private activeTabHighlight: TabHighlight | null = null;
	private observer: MutationObserver;
	private graphics: WebGLRenderingContext;
	private shaderProgram: WebGLProgram;
	private vertexBuffer: WebGLBuffer;
	private mode: SortMode = "active";
	private page = 0;
	private records: HourglassRecord[] = [];
	private visibleRecords: HourglassRecord[] = [];
	private activityReady = false;
	private showing = false;
	private disposed = false;
	private frameRequest = 0;
	private lastFrameTime = 0;
	private simulationTime = 0;
	private pointSize: WebGLUniformLocation;
	private particleMode: WebGLUniformLocation;
	private positionAttribute: number;
	private colorAttribute: number;
	private readonly colors: readonly [number, number, number] = [0.88, 0.66, 0.31];
	private readonly fallingColors: readonly [number, number, number] = [1, 0.82, 0.49];
	private readonly particleVertices = new Float32Array(6 * SAND_COLUMNS * SAND_ROWS * 5);
	private resizeListener: () => void;

	constructor() {
		this.pageDocument = eval("document") as Document;
		this.browserWindow = eval("window") as Window;
		this.root = this.pageDocument.createElement("div");
		this.root.id = "bb-hourglass-view";
		Object.assign(this.root.style, {
			position: "fixed", top: "0", bottom: "0", right: "0", zIndex: "1200",
			display: "flex", flexDirection: "column", boxSizing: "border-box",
			padding: "12px", gap: "10px", background: "#111820", color: "#d8e6d3",
			fontFamily: "monospace", borderLeft: "1px solid #334535",
		});

		const toolbar = this.pageDocument.createElement("div");
		Object.assign(toolbar.style, { display: "flex", alignItems: "center", gap: "10px", minHeight: "34px" });
		const title = this.pageDocument.createElement("strong");
		title.textContent = "Hourglass";
		title.style.fontSize = "18px";
		this.chooser = this.pageDocument.createElement("select");
		Object.assign(this.chooser.style, this.controlStyle());
		for (const option of MODES) {
			const item = this.pageDocument.createElement("option");
			item.value = option.value;
			item.textContent = option.label;
			this.chooser.appendChild(item);
		}
		this.chooser.addEventListener("change", () => {
			this.mode = this.chooser.value as SortMode;
			this.page = 0;
			this.paintRecords();
		});

		this.backButton = this.makeButton("‹", () => {
			this.page = Math.max(0, this.page - 1);
			this.paintRecords();
		});
		this.pageLabel = this.pageDocument.createElement("span");
		this.pageLabel.style.opacity = "0.75";
		this.forwardButton = this.makeButton("›", () => {
			this.page++;
			this.paintRecords();
		});
		const closeButton = this.makeButton("×", () => this.dispose());
		closeButton.title = "Exit Hourglass script";
		closeButton.style.marginLeft = "auto";
		toolbar.append(title, this.chooser, this.backButton, this.pageLabel, this.forwardButton, closeButton);

		const stage = this.pageDocument.createElement("div");
		Object.assign(stage.style, { position: "relative", flex: "1", minHeight: "0" });
		this.sceneCanvas = this.pageDocument.createElement("canvas");
		Object.assign(this.sceneCanvas.style, { position: "absolute", inset: "0", width: "100%", height: "100%" });
		const cardGrid = this.pageDocument.createElement("div");
		Object.assign(cardGrid.style, {
			position: "absolute", inset: "0", display: "grid",
			gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
			gridTemplateRows: "repeat(2, minmax(0, 1fr))",
			gap: "8px", padding: "8px", boxSizing: "border-box", pointerEvents: "none",
		});
		for (let i = 0; i < 6; i++) {
			const card = this.pageDocument.createElement("div");
			Object.assign(card.style, {
				minWidth: "0", overflow: "hidden", padding: "9px 10px", boxSizing: "border-box",
				border: "1px solid rgba(103, 143, 92, 0.32)", background: "rgba(14, 21, 24, 0.35)",
				display: "flex", flexDirection: "column", gap: "5px",
			});
			const name = this.pageDocument.createElement("strong");
			name.style.cssText = "font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#c7e4ba";
			const money = this.pageDocument.createElement("span");
			money.style.cssText = "font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis";
			const fill = this.pageDocument.createElement("span");
			fill.style.cssText = "font-size:11px;opacity:.72";
			card.append(name, money, fill);
			cardGrid.appendChild(card);
			this.cards.push(card);
		}
		stage.append(this.sceneCanvas, cardGrid);
		this.root.append(toolbar, stage);

		const graphics = this.sceneCanvas.getContext("webgl", { antialias: true });
		if (!graphics) throw new Error("Hourglass requires WebGL support");
		this.graphics = graphics;
		this.shaderProgram = this.makeProgram(graphics, VERTEX_SHADER, FRAGMENT_SHADER);
		const vertexBuffer = graphics.createBuffer();
		if (!vertexBuffer) throw new Error("Could not create the Hourglass WebGL buffer");
		this.vertexBuffer = vertexBuffer;
		graphics.useProgram(this.shaderProgram);
		this.positionAttribute = graphics.getAttribLocation(this.shaderProgram, "aPosition");
		this.colorAttribute = graphics.getAttribLocation(this.shaderProgram, "aColor");
		const pointSize = graphics.getUniformLocation(this.shaderProgram, "uPointSize");
		const particleMode = graphics.getUniformLocation(this.shaderProgram, "uParticle");
		if (!pointSize || !particleMode) throw new Error("Could not initialize Hourglass shader uniforms");
		this.pointSize = pointSize;
		this.particleMode = particleMode;

		this.pageDocument.body.appendChild(this.root);
		this.resizeListener = () => this.schedulePaint();
		this.browserWindow.addEventListener("resize", this.resizeListener);
		this.observer = new this.browserWindow.MutationObserver(() => this.ensureSidebarTab());
		this.observer.observe(this.pageDocument.body, { childList: true, subtree: true });
		this.pageDocument.addEventListener("click", this.onSidebarClick, true);
		this.ensureSidebarTab();
		this.setVisible(true);
	}

	get active(): boolean {
		return !this.disposed;
	}

	setRecords(records: HourglassRecord[], activityReady: boolean): void {
		this.records = records;
		this.activityReady = activityReady;
		this.paintRecords();
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.observer.disconnect();
		this.browserWindow.removeEventListener("resize", this.resizeListener);
		this.pageDocument.removeEventListener("click", this.onSidebarClick, true);
		this.restoreSidebarSelection();
		if (this.frameRequest) this.browserWindow.cancelAnimationFrame(this.frameRequest);
		this.frameRequest = 0;
		this.lastFrameTime = 0;
		this.simulationTime = 0;
		this.sidebarTab?.remove();
		this.root.remove();
		this.graphics.deleteBuffer(this.vertexBuffer);
		this.graphics.deleteProgram(this.shaderProgram);
		this.graphics.getExtension("WEBGL_lose_context")?.loseContext();
	}

	private controlStyle(): Record<string, string> {
		return {
			padding: "5px 8px", border: "1px solid #455b42", borderRadius: "3px",
			background: "#1d2827", color: "#d8e6d3", fontFamily: "inherit", fontSize: "12px",
		};
	}

	private makeButton(label: string, action: () => void): HTMLButtonElement {
		const button = this.pageDocument.createElement("button");
		button.type = "button";
		button.textContent = label;
		Object.assign(button.style, this.controlStyle(), { cursor: "pointer", minWidth: "30px" });
		button.addEventListener("click", action);
		return button;
	}

	private makeProgram(gl: WebGLRenderingContext, vertexSource: string, fragmentSource: string): WebGLProgram {
		const compile = (kind: number, source: string): WebGLShader => {
			const shader = gl.createShader(kind);
			if (!shader) throw new Error("Could not create an Hourglass shader");
			gl.shaderSource(shader, source);
			gl.compileShader(shader);
			if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
				const message = gl.getShaderInfoLog(shader) ?? "unknown shader error";
				gl.deleteShader(shader);
				throw new Error(`Hourglass shader compilation failed: ${message}`);
			}
			return shader;
		};
		const shader = gl["create" + "Program"]();
		if (!shader) throw new Error("Could not create an Hourglass shader program");
		const vertex = compile(gl.VERTEX_SHADER, vertexSource);
		const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
		gl.attachShader(shader, vertex);
		gl.attachShader(shader, fragment);
		gl.linkProgram(shader);
		gl.deleteShader(vertex);
		gl.deleteShader(fragment);
		if (!gl.getProgramParameter(shader, gl.LINK_STATUS)) {
			const message = gl.getProgramInfoLog(shader) ?? "unknown link error";
			gl.deleteProgram(shader);
			throw new Error(`Hourglass shader linking failed: ${message}`);
		}
		return shader;
	}

	private ensureSidebarTab(): void {
		if (this.sidebarTab?.isConnected) return;
		this.sidebarTab = null;
		const candidates = Array.from(this.pageDocument.querySelectorAll<HTMLElement>("button, [role='button'], a"));
		const statsButton = candidates.find(item => (item.textContent ?? "").replace(/\s+/g, " ").trim() === "Stats");
		if (!statsButton) return;

		const tab = statsButton.cloneNode(true) as HTMLElement;
		tab.id = "bb-hourglass-sidebar-tab";
		tab.removeAttribute("aria-current");
		tab.removeAttribute("aria-selected");
		tab.removeAttribute("title");
		tab.classList.remove("Mui-selected");
		tab.querySelectorAll(".Mui-selected").forEach(element => element.classList.remove("Mui-selected"));
		tab.querySelectorAll("[aria-current], [aria-selected], [id]").forEach(element => {
			element.removeAttribute("aria-current");
			element.removeAttribute("aria-selected");
			element.removeAttribute("id");
		});
		tab.style.borderLeft = "3px solid transparent";
		const inactiveForeground = Array.from(tab.querySelectorAll<HTMLElement>("svg, .MuiTypography-root"));
		for (const element of inactiveForeground) {
			for (const className of Array.from(element.classList)) {
				if (className.includes("colorPrimary")) {
					element.classList.remove(className);
					element.classList.add(className.replace(/colorPrimary/g, "colorSecondary"));
				}
			}
		}
		this.inactiveTabForegroundColors = inactiveForeground.map(element => element.style.color);
		this.inactiveTabStyle = tab.style.cssText;
		const textNodes = this.pageDocument.createTreeWalker(tab, 4);
		for (let node = textNodes.nextNode(); node; node = textNodes.nextNode()) {
			if ((node.textContent ?? "").trim() === "Stats") node.textContent = (node.textContent ?? "").replace("Stats", "Hourglass");
		}
		const tabButton = tab.querySelector<HTMLElement>("button, [role='button'], a") ?? tab;
		tabButton.setAttribute("aria-label", "Hourglass");
		tabButton.setAttribute("title", "Hourglass");
		tabButton.addEventListener("click", event => {
			event.preventDefault();
			event.stopPropagation();
			this.setVisible(true);
		});
		statsButton.after(tab);
		this.sidebarTab = tab;
		this.positionView();
		if (this.showing) {
			this.suspendSidebarSelection();
			this.highlightTab();
		}
	}

	private setVisible(visible: boolean): void {
		if (visible && !this.showing) {
			this.root.style.display = "flex";
			this.positionView();
			this.suspendSidebarSelection();
		}
		this.showing = visible;
		this.root.style.display = visible ? "flex" : "none";
		if (visible) {
			this.sidebarTab?.setAttribute("aria-current", "page");
			this.positionView();
			this.highlightTab();
		} else {
			this.sidebarTab?.removeAttribute("aria-current");
			if (this.sidebarTab) {
				this.sidebarTab.style.cssText = this.inactiveTabStyle;
				Array.from(this.sidebarTab.querySelectorAll<HTMLElement>("svg, .MuiTypography-root"))
					.forEach((element, index) => {
						element.style.color = this.inactiveTabForegroundColors[index] ?? "";
					});
			}
			this.restoreSidebarSelection();
		}
		if (visible) {
			this.lastFrameTime = 0;
			this.simulationTime = 0;
			this.schedulePaint();
		} else if (this.frameRequest) {
			this.browserWindow.cancelAnimationFrame(this.frameRequest);
			this.frameRequest = 0;
			this.lastFrameTime = 0;
			this.simulationTime = 0;
		}
	}

	private onSidebarClick = (event: Event): void => {
		if (!this.showing) return;
		const target = event.target as Element | null;
		const item = target?.closest("button, [role='button'], a");
		if (!item || item === this.sidebarTab || this.sidebarTab?.contains(item)) return;
		if ((event as MouseEvent).clientX < this.root.getBoundingClientRect().left) this.setVisible(false);
	};

	private highlightTab(): void {
		const tab = this.sidebarTab;
		if (!tab?.isConnected) return;
		const activeStyle = this.activeTabHighlight;
		if (!activeStyle) {
			tab.style.borderLeft = "3px solid currentColor";
			return;
		}
		tab.style.borderLeft = activeStyle.borderLeft;
		Array.from(tab.querySelectorAll<HTMLElement>("svg, .MuiTypography-root")).forEach((element, index) => {
			element.style.color = activeStyle.foregroundColors[index] ?? activeStyle.foregroundColors[0] ?? "";
		});
	}

	private suspendSidebarSelection(): void {
		if (this.previousSidebarSelection.some(state => state.element.isConnected)) return;
		this.previousSidebarSelection = [];
		const edge = this.root.getBoundingClientRect().left;
		const active = Array.from(this.pageDocument.querySelectorAll<HTMLElement>("li.MuiListItem-root"))
			.find(row => {
				if (row === this.sidebarTab || row.getBoundingClientRect().right > edge + 1) return false;
				const style = this.browserWindow.getComputedStyle(row);
				return parseFloat(style.borderLeftWidth) > 0 && style.borderLeftStyle !== "none" && style.borderLeftColor !== "transparent";
			});
		this.activeTabHighlight = null;
		if (!active) return;
		const style = this.browserWindow.getComputedStyle(active);
		this.activeTabHighlight = {
			borderLeft: `${style.borderLeftWidth} ${style.borderLeftStyle} ${style.borderLeftColor}`,
			foregroundColors: Array.from(active.querySelectorAll<HTMLElement>("svg, .MuiTypography-root"))
				.map(element => this.browserWindow.getComputedStyle(element).color),
		};
		this.previousSidebarSelection = [{ element: active, cssText: active.style.cssText }];
		active.style.borderLeftColor = "transparent";
		active.style.opacity = "0.55";
	}

	private restoreSidebarSelection(): void {
		for (const state of this.previousSidebarSelection) {
			if (!state.element.isConnected) continue;
			state.element.style.cssText = state.cssText;
		}
		this.previousSidebarSelection = [];
		this.activeTabHighlight = null;
	}

	private positionView(): void {
		if (!this.sidebarTab?.isConnected) return;
		const nav = this.sidebarTab.closest("nav, aside, [role='navigation']");
		const bounds = (nav ?? this.sidebarTab.parentElement)?.getBoundingClientRect();
		const offset = Math.max(0, Math.min(this.browserWindow.innerWidth, bounds?.right ?? this.sidebarTab.getBoundingClientRect().right));
		this.root.style.left = `${offset}px`;
		this.root.style.width = `calc(100vw - ${offset}px)`;
	}

	private paintRecords(): void {
		const sorted = this.records.slice();
		if (this.mode === "active" && this.activityReady) sorted.sort((a, b) => b.activity - a.activity);
		else if (this.mode === "fullest") sorted.sort((a, b) => b.money / b.maxMoney - a.money / a.maxMoney);
		else if (this.mode === "emptiest") sorted.sort((a, b) => a.money / a.maxMoney - b.money / b.maxMoney);
		else sorted.sort((a, b) => a.hostname.localeCompare(b.hostname));

		const pages = Math.max(1, Math.ceil(sorted.length / 6));
		this.page = Math.min(this.page, pages - 1);
		this.visibleRecords = sorted.slice(this.page * 6, this.page * 6 + 6);
		this.cards.forEach((card, index) => {
			const name = card.children[0] as HTMLElement;
			const money = card.children[1] as HTMLElement;
			const fill = card.children[2] as HTMLElement;
			const record = this.visibleRecords[index];
			if (!record) {
				name.textContent = "";
				money.textContent = "";
				fill.textContent = "";
				card.style.visibility = "hidden";
				return;
			}
			const percent = Math.max(0, Math.min(100, record.money / record.maxMoney * 100));
			name.textContent = record.hostname;
			money.textContent = `${this.formatMoney(record.money)} / ${this.formatMoney(record.maxMoney)}`;
			fill.textContent = `${percent.toFixed(1)}% full · Δ1m ${this.formatMoney(record.activity)}`;
			card.style.visibility = "visible";
		});
		this.backButton.disabled = this.page === 0;
		this.forwardButton.disabled = this.page >= pages - 1;
		this.backButton.style.opacity = this.backButton.disabled ? "0.45" : "1";
		this.forwardButton.style.opacity = this.forwardButton.disabled ? "0.45" : "1";
		this.pageLabel.textContent = `${sorted.length === 0 ? 0 : this.page + 1} / ${pages}`;
		this.schedulePaint();
	}

	private formatMoney(value: number): string {
		return `$${new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 2 }).format(value)}`;
	}

	private schedulePaint(): void {
		if (!this.showing || this.disposed || this.frameRequest) return;
		this.frameRequest = this.browserWindow.requestAnimationFrame(this.animateFrame);
	}

	private animateFrame = (time: number): void => {
		this.frameRequest = 0;
		if (!this.showing || this.disposed) return;

		const elapsed = this.lastFrameTime === 0 ? 0 : Math.min(100, time - this.lastFrameTime);
		this.lastFrameTime = time;
		this.simulationTime += elapsed;
		const stepDuration = 1000 / 60;
		const steps = Math.min(6, Math.floor(this.simulationTime / stepDuration));
		if (steps > 0) {
			this.simulationTime -= steps * stepDuration;
			for (const record of this.visibleRecords) record.sand.settle(steps);
		}

		this.paintScene(this.visibleRecords);
		this.frameRequest = this.browserWindow.requestAnimationFrame(this.animateFrame);
	};

	private paintScene(records: HourglassRecord[]): void {
		if (!this.showing || this.disposed) return;
		const gl = this.graphics;
		const ratio = Math.min(this.browserWindow.devicePixelRatio || 1, 2);
		const width = Math.max(1, Math.floor(this.sceneCanvas.clientWidth * ratio));
		const height = Math.max(1, Math.floor(this.sceneCanvas.clientHeight * ratio));
		if (this.sceneCanvas.width !== width || this.sceneCanvas.height !== height) {
			this.sceneCanvas.width = width;
			this.sceneCanvas.height = height;
		}
		gl.viewport(0, 0, width, height);
		gl.clearColor(0.067, 0.094, 0.102, 1);
		gl.clear(gl.COLOR_BUFFER_BIT);
		gl.useProgram(this.shaderProgram);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
		gl.enableVertexAttribArray(this.positionAttribute);
		gl.enableVertexAttribArray(this.colorAttribute);
		gl.vertexAttribPointer(this.positionAttribute, 2, gl.FLOAT, false, 20, 0);
		gl.vertexAttribPointer(this.colorAttribute, 3, gl.FLOAT, false, 20, 8);

		const cellWidth = (width - 32) / 3;
		const cellHeight = (height - 24) / 2;
		const backgrounds: number[] = [];
		const outlines: number[] = [];
		let particleCount = 0;
		const addVertex = (target: number[], x: number, y: number, color: readonly number[]) => {
			target.push(x / width * 2 - 1, 1 - y / height * 2, color[0], color[1], color[2]);
		};
		const addParticle = (x: number, y: number, color: readonly number[]) => {
			const offset = particleCount * 5;
			this.particleVertices[offset] = x / width * 2 - 1;
			this.particleVertices[offset + 1] = 1 - y / height * 2;
			this.particleVertices[offset + 2] = color[0];
			this.particleVertices[offset + 3] = color[1];
			this.particleVertices[offset + 4] = color[2];
			particleCount++;
		};
		const rectangle = (target: number[], x: number, y: number, w: number, h: number, color: readonly number[]) => {
			addVertex(target, x, y, color);
			addVertex(target, x + w, y, color);
			addVertex(target, x + w, y + h, color);
			addVertex(target, x, y, color);
			addVertex(target, x + w, y + h, color);
			addVertex(target, x, y + h, color);
		};
		const line = (x1: number, y1: number, x2: number, y2: number) => {
			const tint = [0.27, 0.49, 0.3];
			addVertex(outlines, x1, y1, tint);
			addVertex(outlines, x2, y2, tint);
		};

		for (let slot = 0; slot < 6; slot++) {
			const x = 8 + slot % 3 * (cellWidth + 8);
			const y = 8 + Math.floor(slot / 3) * (cellHeight + 8);
			const glassX = x + cellWidth * 0.2;
			const glassY = y + 50 * ratio;
			const glassWidth = cellWidth * 0.6;
			const glassHeight = Math.max(1, cellHeight - 62 * ratio);
			rectangle(backgrounds, glassX, glassY, glassWidth, glassHeight, [0.035, 0.055, 0.055]);
			line(glassX, glassY, glassX + glassWidth, glassY);
			line(glassX, glassY, glassX, glassY + glassHeight);
			line(glassX + glassWidth, glassY, glassX + glassWidth, glassY + glassHeight);
			line(glassX, glassY + glassHeight, glassX + glassWidth, glassY + glassHeight);

			const record = records[slot];
			if (!record) continue;
			const dx = glassWidth / SAND_COLUMNS;
			const dy = glassHeight / SAND_ROWS;
			for (let index = 0; index < record.sand.particles.length; index++) {
				if (!record.sand.particles[index]) continue;
				const col = index % SAND_COLUMNS;
				const row = Math.floor(index / SAND_COLUMNS);
				const pointColor = record.sand.falling[index] ? this.fallingColors : this.colors;
				addParticle(glassX + (col + 0.5) * dx, glassY + (row + 0.5) * dy, pointColor);
			}
		}

		this.uploadAndDraw(gl, backgrounds, gl.TRIANGLES, 0);
		this.uploadAndDraw(gl, outlines, gl.LINES, 0);
		this.uploadAndDraw(
			gl, this.particleVertices, gl.POINTS,
			Math.max(1, Math.min(cellWidth * 0.6 / SAND_COLUMNS, (cellHeight - 62 * ratio) / SAND_ROWS) * 0.95),
			particleCount,
		);
	}

	private uploadAndDraw(
		gl: WebGLRenderingContext,
		data: number[] | Float32Array,
		primitive: number,
		size: number,
		vertexCount = data.length / 5,
	): void {
		if (vertexCount === 0) return;
		const vertices = data instanceof Float32Array ? data.subarray(0, vertexCount * 5) : new Float32Array(data);
		gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
		gl.uniform1f(this.pointSize, size);
		gl.uniform1f(this.particleMode, primitive === gl.POINTS ? 1 : 0);
		gl.drawArrays(primitive, 0, vertexCount);
	}
}
