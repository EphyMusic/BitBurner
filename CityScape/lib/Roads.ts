import type { CityModel } from "./CityParser";
import { CELL_D, CELL_W, cellX, cellZ } from "./Grid";

export const ROAD_WIDTH = 0.5;
export const SIDEWALK_WIDTH = 0.95;

type Point = [number, number];

export interface RoadSegment {
	a: Point;
	b: Point;
	len: number;
	/** Unit direction (x, z). */
	ux: number;
	uz: number;
	yaw: number;
	diagonal: boolean;
}

export interface Roads {
	/** These legacy-named roads describe the ASCII map's monorail, not decorative streets. */
	segments: RoadSegment[];
	junctions: Point[];
}

export interface RoadHit {
	dist: number;
	/** Closest point on the road centerline. */
	qx: number;
	qz: number;
	seg: RoadSegment;
	/** True when the closest point is the end of a segment rather than its side. */
	atEnd: boolean;
}

const HORIZONTAL = new Set(["-", "_", "=", "~"]);
const VERTICAL = new Set(["|", "!", ":"]);
const JUNCTION = new Set(["o", "O", "x", "X", "+", "*", "@", "#"]);

function segment(a: Point, b: Point, diagonal: boolean): RoadSegment {
	const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
	const ux = (b[0] - a[0]) / len;
	const uz = (b[1] - a[1]) / len;
	return { a, b, len, ux, uz, yaw: Math.atan2(-uz, ux), diagonal };
}

/** Turns the path characters of the ASCII map into centerline segments. Other characters are ignored. */
export function extractRoads(city: CityModel): Roads {
	const segments: RoadSegment[] = [];
	const junctions: Point[] = [];
	const hw = CELL_W / 2;
	const hd = CELL_D / 2;
	for (const { ch, col, row } of city.paths) {
		const x = cellX(col);
		const z = cellZ(row);
		if (HORIZONTAL.has(ch)) segments.push(segment([x - hw, z], [x + hw, z], false));
		else if (VERTICAL.has(ch)) segments.push(segment([x, z - hd], [x, z + hd], false));
		else if (ch === "/") segments.push(segment([x - hw, z + hd], [x + hw, z - hd], true));
		else if (ch === "\\") segments.push(segment([x - hw, z - hd], [x + hw, z + hd], true));
		else if (JUNCTION.has(ch)) junctions.push([x, z]);
	}

	// Each occupied building cell connects only to its actual neighboring track cells.
	const at = new Map(city.paths.map(p => [`${p.col},${p.row}`, p.ch]));
	const has = (set: Set<string> | string[], col: number, row: number) => {
		const ch = at.get(`${col},${row}`);
		return ch !== undefined && (set instanceof Set ? set.has(ch) : set.includes(ch));
	};
	const horizontal = new Set([...HORIZONTAL, ...JUNCTION]);
	const vertical = new Set([...VERTICAL, ...JUNCTION]);
	for (const { col, row } of city.buildings) {
		const x = cellX(col);
		const z = cellZ(row);
		for (const side of [-1, 1]) {
			if (has(horizontal, col + side, row)) segments.push(segment([x, z], [x + side * hw, z], false));
			if (has(vertical, col, row + side)) segments.push(segment([x, z], [x, z + side * hd], false));
			if (has(["\\", ...JUNCTION], col + side, row + side)) segments.push(segment([x, z], [x + side * hw, z + side * hd], true));
			if (has(["/", ...JUNCTION], col + side, row - side)) segments.push(segment([x, z], [x + side * hw, z - side * hd], true));
		}
	}
	return { segments, junctions };
}

export function nearestRoad(x: number, z: number, roads: Roads): RoadHit | null {
	// Project onto each finite segment, clamping the closest point at its endpoints.
	let best: RoadHit | null = null;
	for (const seg of roads.segments) {
		const rel = (x - seg.a[0]) * seg.ux + (z - seg.a[1]) * seg.uz;
		const t = Math.min(seg.len, Math.max(0, rel));
		const qx = seg.a[0] + seg.ux * t;
		const qz = seg.a[1] + seg.uz * t;
		const dist = Math.hypot(x - qx, z - qz);
		if (!best || dist < best.dist) best = { dist, qx, qz, seg, atEnd: rel < 0.01 || rel > seg.len - 0.01 };
	}
	return best;
}
