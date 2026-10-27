import { parseCity } from "./CityParser";
import type { CityModel } from "./CityParser";
import { onExit } from "./Cleanup";

export interface LocationOption {
	el: HTMLButtonElement;
	label: string;
	disabled: boolean;
}

export interface LocationPage {
	root: HTMLElement;
	back: HTMLButtonElement;
	options: LocationOption[];
}

const BACK_LABEL = "Return to World";
const clean = (s: string | null): string => (s ?? "").replace(/\s+/g, " ").trim();

export interface CitySync {
	/** Current city, or null when the City page isn't showing. */
	city: CityModel | null;
	/** True when `city` is new since the previous poll. */
	changed: boolean;
}

/**
 * Bridge to the game's own City page. Hides the original map lines (visibility only, so layout and
 * React state stay intact), forwards building clicks to the original elements, and restores everything.
 */
export class CityDom {
	private current: CityModel | null = null;
	private saved = new Map<HTMLElement, string>();

	constructor(private doc: Document) {
		onExit(() => this.restore());
	}

	poll(): CitySync {
		const next = parseCity(this.doc);
		if (!next) {
			this.restore();
			return { city: null, changed: false };
		}
		const cur = this.current;
		if (cur && cur.container === next.container && cur.container.isConnected && cur.signature === next.signature) {
			// Keep hiding any lines React may have re-created.
			this.hide(next.lines);
			this.current = { ...next };
			return { city: this.current, changed: false };
		}
		this.restore();
		this.hide(next.lines);
		this.current = next;
		return { city: next, changed: true };
	}

	/** Same as clicking the building letter on the original map. */
	visit(name: string): boolean {
		const city = this.current;
		if (!city) return false;
		for (const s of Array.from(city.container.querySelectorAll("span[aria-label]"))) {
			if (s.getAttribute("aria-label") === name) {
				(s as HTMLElement).click();
				return true;
			}
		}
		return false;
	}

	/**
	 * The game's location page (the one a map click opens): a "Return to World" button, then a heading and
	 * the location's own buttons. Returns null if it isn't showing.
	 */
	locationPage(): LocationPage | null {
		const back = Array.from(this.doc.querySelectorAll("button")).find(b => clean(b.textContent) === BACK_LABEL);
		const root = back?.parentElement;
		if (!back || !root) return null;
		const options = Array.from(root.querySelectorAll("button"))
			.filter(b => b !== back && clean(b.textContent))
			.map(el => ({
				el,
				label: clean(el.textContent),
				disabled: el.disabled || el.classList.contains("Mui-disabled"),
			}));
		return { root, back, options };
	}

	/** Presses the option at `index`, falling back to a label match if the page re-rendered in between. */
	press(index: number, label: string): boolean {
		const page = this.locationPage();
		if (!page) return false;
		const target = page.options[index]?.label === label ? page.options[index] : page.options.find(o => o.label === label);
		if (!target || target.disabled) return false;
		target.el.click();
		return true;
	}

	/** Same as the game's own "Return to World" button. */
	back(): boolean {
		const page = this.locationPage();
		if (!page) return false;
		page.back.click();
		return true;
	}

	/**
	 * Heading and descriptive text of the open location page. Cheap enough to call every frame, which is how
	 * the game's flickering "corrupted" text carries over: we just re-read whatever the page currently shows.
	 */
	locationText(): { title: string; notes: string[] } | null {
		const back = Array.from(this.doc.querySelectorAll("button")).find(b => clean(b.textContent) === BACK_LABEL);
		const root = back?.parentElement;
		if (!root) return null;
		const title = clean(root.querySelector("h1,h2,h3,h4,h5,h6")?.textContent ?? "");
		const notes: string[] = [];
		for (const p of Array.from(root.querySelectorAll("p"))) {
			if (p.closest("button") || p.querySelector("p")) continue;
			const text = clean(p.textContent);
			if (!text) continue;
			// Skip ASCII art, which needs its whitespace and is too big for the card.
			if (getComputedStyle(p).whiteSpace === "pre") continue;
			notes.push(text);
		}
		return { title, notes };
	}

	/**
	 * Fakes the pointer entering (or leaving) an option's real button so the game shows (or closes) its own
	 * tooltip. For a disabled button, which gets no events, its wrapper is used instead.
	 */
	hoverOption(el: HTMLElement, on: boolean): void {
		const target = el.matches(":disabled") && el.parentElement ? el.parentElement : el;
		const init = { bubbles: true, cancelable: true, view: this.doc.defaultView, relatedTarget: on ? null : this.doc.body };
		const View = (this.doc.defaultView as any) ?? {};
		const Mouse = View.MouseEvent ?? MouseEvent;
		target.dispatchEvent(new Mouse(on ? "mouseover" : "mouseout", init));
	}

	/** The game's open tooltip (hidden from view, since we show our own). `node` is a detached copy, null if `key` equals `prevKey`. */
	tooltip(prevKey: string): { node: HTMLElement | null; key: string } | null {
		const all = Array.from(this.doc.querySelectorAll<HTMLElement>('[role="tooltip"]'));
		const pop = all[all.length - 1];
		if (!pop || !clean(pop.textContent)) return null;
		pop.style.visibility = "hidden";
		pop.style.pointerEvents = "none";
		const key = pop.innerHTML;
		if (key === prevKey) return { node: null, key };
		const node = pop.cloneNode(true) as HTMLElement;
		node.removeAttribute("id");
		node.removeAttribute("role");
		node.removeAttribute("style");
		node.querySelectorAll("[id]").forEach(e => e.removeAttribute("id"));
		return { node, key };
	}

	restore(): void {
		for (const [el, prev] of this.saved) el.style.visibility = prev;
		this.saved.clear();
		this.current = null;
	}

	private hide(lines: HTMLElement[]): void {
		for (const el of lines) {
			if (this.saved.has(el)) continue;
			this.saved.set(el, el.style.visibility);
			el.style.visibility = "hidden";
		}
	}
}
