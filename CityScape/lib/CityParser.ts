export interface BuildingCell {
	name: string;
	glyph: string;
	col: number;
	row: number;
}

export interface PathCell {
	ch: string;
	col: number;
	row: number;
}

export interface CityModel {
	name: string;
	cols: number;
	rows: number;
	buildings: BuildingCell[];
	paths: PathCell[];
	/** Element holding the ASCII lines; the original city container. */
	container: HTMLElement;
	lines: HTMLElement[];
	/** Changes whenever the map or city changes. */
	signature: string;
}

const isPreLine = (el: Element): boolean =>
	el.tagName === "P" && getComputedStyle(el).whiteSpace === "pre";

/**
 * Reads the game's ASCII city map out of the live DOM (the game renders each map line as a <p>,
 * with every building as a <span aria-label="Location Name"><b>X</b></span>).
 * Returns null if the City page isn't showing (or the player uses list mode).
 */
export function parseCity(doc: Document): CityModel | null {
	let container: HTMLElement | null = null;
	for (const s of Array.from(doc.querySelectorAll("span[aria-label]"))) {
		const p = s.parentElement;
		if (p && s.firstElementChild?.tagName === "B" && isPreLine(p)) {
			container = p.parentElement;
			break;
		}
	}
	if (!container) return null;

	const lines = Array.from(container.children).filter(isPreLine) as HTMLElement[];
	const buildings: BuildingCell[] = [];
	const paths: PathCell[] = [];
	let cols = 0;

	lines.forEach((line, row) => {
		// Track columns across text and nested landmark spans without flattening their aria-labels.
		let col = 0;
		let inLabel = false;
		const chars = new Map<number, string>();
		const candidates: PathCell[] = [];
		for (const node of Array.from(line.childNodes)) {
			if (node.nodeType === Node.TEXT_NODE) {
				for (const ch of node.textContent ?? "") {
					chars.set(col, ch);
					if (ch === "[") inLabel = true;
					// Bracketed station annotations and digits are labels, not track geometry.
					const decoration = inLabel || /[0-9]/.test(ch);
					if (ch === "]") inLabel = false;
					if (ch !== " " && !decoration) candidates.push({ ch, col, row });
					col++;
				}
			} else if (node instanceof HTMLElement && node.hasAttribute("aria-label")) {
				const glyph = (node.textContent ?? "X").trim() || "X";
				buildings.push({ name: node.getAttribute("aria-label")!, glyph, col, row });
				chars.set(col, glyph);
				col++;
			} else {
				col += (node.textContent ?? "").length;
			}
		}
		// A slash between node numbers is an annotation, not a diagonal path.
		paths.push(...candidates.filter(p => p.ch !== "/" ||
			!(/^\d$/.test(chars.get(p.col - 1) ?? "") && /^\d$/.test(chars.get(p.col + 1) ?? ""))));
		cols = Math.max(cols, col);
	});

	const name = lines[0]?.previousElementSibling?.textContent?.trim() ?? "";
	const signature = `${name}|${lines.map(l => l.textContent).join("\n")}`;
	return { name, cols, rows: lines.length, buildings, paths, container, lines, signature };
}
