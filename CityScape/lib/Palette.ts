export type Rgb = [number, number, number];
export type Shape = "box" | "tower" | "pyramid";

export interface BuildingStyle {
	color: Rgb;
	height: number;
	shape: Shape;
}

const hex = (h: string): Rgb => [
	parseInt(h.slice(1, 3), 16) / 255,
	parseInt(h.slice(3, 5), 16) / 255,
	parseInt(h.slice(5, 7), 16) / 255,
];

/** Keyed by the glyph the game draws on its ASCII city map. */
const STYLES: Record<string, BuildingStyle> = {
	G: { color: hex("#3fb950"), height: 1.6, shape: "box" },
	C: { color: hex("#388bfd"), height: 3.2, shape: "tower" },
	H: { color: hex("#f85149"), height: 2.0, shape: "box" },
	S: { color: hex("#8957e5"), height: 1.0, shape: "pyramid" },
	"$": { color: hex("#e3b341"), height: 3.6, shape: "tower" },
	T: { color: hex("#39c5cf"), height: 2.4, shape: "box" },
	U: { color: hex("#f0883e"), height: 2.2, shape: "pyramid" },
	"¢": { color: hex("#f778ba"), height: 1.4, shape: "box" },
	"?": { color: hex("#e6edf3"), height: 1.8, shape: "pyramid" },
};

const FALLBACK: BuildingStyle = { color: hex("#8b949e"), height: 1.2, shape: "box" };

export const ROAD_COLOR = hex("#3b4048");
export const ASPHALT_COLOR = hex("#2b2f35");
export const SIDEWALK_COLOR = hex("#5d636b");
export const LANE_COLOR = hex("#b8a038");
export const GROUND_COLOR = hex("#1a2418");

/** Muted tones for the unclickable background buildings. */
export const FILLER_COLORS: Rgb[] = ["#4b5563", "#556070", "#475569", "#5b5f6b", "#3f4a5a", "#645a52"].map(hex);

export function styleFor(glyph: string): BuildingStyle {
	return STYLES[glyph] ?? FALLBACK;
}

const KINDS: Record<string, string> = {
	G: "Gym", C: "Company", H: "Hospital", S: "Slums", "$": "Stock Exchange",
	T: "Tech Vendor", U: "University", "¢": "Casino", "?": "Special",
};

/** The map uses "T" for both tech vendors and the travel agency, so the name decides. */
export function kindFor(glyph: string, name = ""): string {
	if (name.toLowerCase() === "travel agency") return "Travel Agency";
	return KINDS[glyph] ?? "Location";
}
