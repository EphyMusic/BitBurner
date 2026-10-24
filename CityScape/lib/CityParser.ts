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
		let col = 0;
		let inLabel = false;
		for (const node of Array.from(line.childNodes)) {
			if (node.nodeType === Node.TEXT_NODE) {
				for (const ch of node.textContent ?? "") {
					// "[name]" captions and node numbers are decoration, not roads.
					if (ch === "[") inLabel = true;
					const decoration = inLabel || /[0-9]/.test(ch);
					if (ch === "]") inLabel = false;
					if (ch !== " " && !decoration) paths.push({ ch, col, row });
					col++;
				}
			} else if (node instanceof HTMLElement && node.hasAttribute("aria-label")) {
				const glyph = (node.textContent ?? "X").trim() || "X";
				buildings.push({ name: node.getAttribute("aria-label")!, glyph, col, row });
				col++;
			} else {
				col += (node.textContent ?? "").length;
			}
		}
		cols = Math.max(cols, col);
	});

	const name = lines[0]?.previousElementSibling?.textContent?.trim() ?? "";
	const signature = `${name}|${lines.map(l => l.textContent).join("\n")}`;
	return { name, cols, rows: lines.length, buildings, paths, container, lines, signature };
}
