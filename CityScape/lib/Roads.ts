import type { CityModel } from "./CityParser";
import { CELL_D, CELL_W, cellX, cellZ } from "./Grid";
import type { MeshBuilder } from "./MeshBuilder";
import { ASPHALT_COLOR, LANE_COLOR, SIDEWALK_COLOR } from "./Palette";

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

	// Building letters replace road characters on the map, so carry the road through them.
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
		if (has(horizontal, col - 1, row) || has(horizontal, col + 1, row)) segments.push(segment([x - hw, z], [x + hw, z], false));
		if (has(vertical, col, row - 1) || has(vertical, col, row + 1)) segments.push(segment([x, z - hd], [x, z + hd], false));
		if (has(["\\"], col - 1, row - 1) || has(["\\"], col + 1, row + 1)) segments.push(segment([x - hw, z - hd], [x + hw, z + hd], true));
		if (has(["/"], col + 1, row - 1) || has(["/"], col - 1, row + 1)) segments.push(segment([x - hw, z + hd], [x + hw, z - hd], true));
	}
	return { segments, junctions };
}

export function nearestRoad(x: number, z: number, roads: Roads): RoadHit | null {
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

/** Sidewalks, asphalt and a center line for every segment, plus pads that close gaps at bends. */
export function addRoadMesh(mb: MeshBuilder, roads: Roads): void {
	const layer =  (width: number, height: number, color: [number, number, number], lineOnly = false) => {
		for (const s of roads.segments) {
			const cx = (s.a[0] + s.b[0]) / 2;
			const cz = (s.a[1] + s.b[1]) / 2;
			mb.box(cx, 0, cz, s.len + (lineOnly ? -0.1 : 0.12), height, width, color, s.yaw);
			if (s.diagonal && !lineOnly) {
				mb.box(s.a[0], 0, s.a[1], width, height, width, color);
				mb.box(s.b[0], 0, s.b[1], width, height, width, color);
			}
		}
		if (lineOnly) return;
		for (const [x, z] of roads.junctions) mb.box(x, 0, z, width * 1.2, height, width * 1.2, color);
	};

	layer(SIDEWALK_WIDTH, 0.03, SIDEWALK_COLOR);
	layer(ROAD_WIDTH, 0.06, ASPHALT_COLOR);
	layer(0.05, 0.075, LANE_COLOR, true);
}
