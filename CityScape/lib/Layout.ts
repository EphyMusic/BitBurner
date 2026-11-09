import type { CityModel } from "./CityParser";
import { CELL_D, CELL_W, cellX, cellZ, seededRandom } from "./Grid";
import { FILLER_COLORS } from "./Palette";
import type { Rgb } from "./Palette";
import { nearestRoad, SIDEWALK_WIDTH } from "./Roads";
import type { Roads } from "./Roads";

/** Side length of a clickable building. */
export const FOOTPRINT = 1.3;
const BUILDING_GAP = 1.6;
const SIDEWALK_HALF = SIDEWALK_WIDTH / 2;
export const CITY_MARGIN = 2;
export const STREET_WIDTH = 0.34;

export interface PlacedBuilding {
	name: string;
	glyph: string;
	x: number;
	z: number;
	yaw: number;
}

export interface Lot {
	x: number;
	z: number;
	w: number;
	d: number;
	h: number;
	yaw: number;
	color: Rgb;
}

export interface Street {
	a: [number, number];
	b: [number, number];
}

/** Encloses the original map and any landmarks moved beyond it. */
export function cityRadius(city: CityModel, placed: PlacedBuilding[]): number {
	const width = city.cols * CELL_W, depth = city.rows * CELL_D;
	// Enclose the rectangular source map and keep even displaced landmarks inside the clear area.
	const fogMargin = CITY_MARGIN + 3;
	return Math.max(Math.hypot(width / 2, depth / 2) + fogMargin,
		...placed.map(b => Math.hypot(b.x - width / 2, b.z - depth / 2) + FOOTPRINT + fogMargin));
}

/** Irregular blocks: later sites subdivide the larger blocks formed by the original settlement. */
export function cityStreets(city: CityModel, placed: PlacedBuilding[]): Street[] {
	const cx = city.cols * CELL_W / 2, cz = city.rows * CELL_D / 2;
	const radius = cityRadius(city, placed);
	const rng = seededRandom(`${city.name || "city"}:streets`);
	type Point = [number, number];
	const sites: Point[] = [];
	const area = Math.PI * radius * radius;
	// Spread early sites farther apart, then fill gaps for varied block sizes.
	const target = Math.min(180, Math.max(12, Math.round(area / 11)));
	for (let attmpt = 0; attmpt < target * 35 && sites.length < target; attmpt++) {
		const p: Point = [cx + (rng() * 2 - 1) * radius, cz + (rng() * 2 - 1) * radius];
		if (Math.hypot(p[0] - cx, p[1] - cz) > radius) continue;
		const separation = sites.length < target * 0.5 ? 2.8 : 1.55;
		if (sites.every(q => Math.hypot(p[0] - q[0], p[1] - q[1]) >= separation)) sites.push(p);
	}
	const boundary: Point[] = Array.from({ length: 48 }, (_, i) => {
		const angle = i * Math.PI * 2 / 48;
		return [cx + Math.cos(angle) * radius, cz + Math.sin(angle) * radius];
	});
	const polygons: Point[][] = [];
	for (const site of sites) {
		// Clip the circular boundary against every perpendicular bisector (a Voronoi cell).
		let polygon: Point[] = boundary;
		for (const other of sites) {
			if (site === other || !polygon.length) continue;
			const nx = other[0] - site[0], nz = other[1] - site[1];
			const limit = (other[0] ** 2 + other[1] ** 2 - site[0] ** 2 - site[1] ** 2) / 2;
			const clipped: Point[] = [];
			for (let i = 0; i < polygon.length; i++) {
				const a = polygon[i], b = polygon[(i + 1) % polygon.length];
				const da = a[0] * nx + a[1] * nz - limit, db = b[0] * nx + b[1] * nz - limit;
				if (da <= 0) clipped.push(a);
				if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
					const t = da / (da - db);
					clipped.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
				}
			}
			polygon = clipped;
		}
		polygons.push(polygon);
	}
	const streets: Street[] = [];
	const seen = new Set<string>();
	const pointKey = (p: Point) => `${Math.round(p[0] * 10000)},${Math.round(p[1] * 10000)}`;
	const add = (a: Point, b: Point) => {
		const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
		if (length < 0.001) return;
		let intervals: [number, number][] = [[0, 1]];
		for (const b of placed) {
			// Cut out intervals crossing a landmark's clearance circle rather than moving the landmark.
			const radius = FOOTPRINT * 0.78 + STREET_WIDTH / 2;
			const along = ((b.x - a[0]) * dx + (b.z - a[1]) * dz) / length;
			const perpendicular = ((b.x - a[0]) * dz - (b.z - a[1]) * dx) / length;
			if (Math.abs(perpendicular) >= radius) continue;
			const reach = Math.sqrt(radius * radius - perpendicular * perpendicular);
			const left = (along - reach) / length, right = (along + reach) / length;
			intervals = intervals.flatMap(([start, end]): [number, number][] => {
				if (right <= start || left >= end) return [[start, end]];
				const remaining: [number, number][] = [];
				if (left > start) remaining.push([start, left]);
				if (right < end) remaining.push([right, end]);
				return remaining;
			});
		}
		for (const [start, end] of intervals) {
			if ((end - start) * length < 0.001) continue;
			streets.push({ a: [a[0] + dx * start, a[1] + dz * start], b: [a[0] + dx * end, a[1] + dz * end] });
		}
	};
	for (const polygon of polygons) for (let i = 0; i < polygon.length; i++) {
		// Neighboring cells share edges; retain each street segment only once.
		const a = polygon[i], b = polygon[(i + 1) % polygon.length];
		const edgeKey = [pointKey(a), pointKey(b)].sort().join("|");
		if (seen.has(edgeKey)) continue;
		seen.add(edgeKey);
		add(a, b);
	}
	return streets;
}

/**
 * Moves each clickable building off the road it sits on, beside the sidewalk, and turns it to face the road.
 * Buildings are then nudged apart and re-cleared from roads a few times.
 */
export function placeBuildings(city: CityModel, roads: Roads): PlacedBuilding[] {
	const placed: PlacedBuilding[] = city.buildings.map(b => ({
		name: b.name, glyph: b.glyph, x: cellX(b.col), z: cellZ(b.row), yaw: 0,
	}));

	const clearFromRoads = (b: PlacedBuilding): void => {
		const hit = nearestRoad(b.x, b.z, roads);
		if (!hit) return;
		const clear = SIDEWALK_HALF + 0.1 + (hit.atEnd ? FOOTPRINT * 0.4 : FOOTPRINT / 2);
		b.yaw = hit.seg.yaw;
		if (hit.dist >= clear) return;

		let dx: number;
		let dz: number;
		if (hit.dist > 1e-4) {
			dx = (b.x - hit.qx) / hit.dist;
			dz = (b.z - hit.qz) / hit.dist;
		} else {
			// Sitting right on the road: pick whichever side has more room.
			const side = (s: number) => {
				const px = hit.qx - hit.seg.uz * s * clear;
				const pz = hit.qz + hit.seg.ux * s * clear;
				return { px, pz, room: nearestRoad(px, pz, roads)?.dist ?? Infinity };
			};
			const left = side(1);
			const right = side(-1);
			const pick = right.room > left.room ? -1 : 1;
			dx = -hit.seg.uz * pick;
			dz = hit.seg.ux * pick;
		}
		b.x = hit.qx + dx * clear;
		b.z = hit.qz + dz * clear;
	};

	for (let pass = 0; pass < 4; pass++) {
		// Separating one landmark may push it toward a rail, so repeat both constraints.
		for (let i = 0; i < placed.length; i++) {
			for (let j = i + 1; j < placed.length; j++) {
				const a = placed[i];
				const b = placed[j];
				const d = Math.hypot(b.x - a.x, b.z - a.z);
				if (d >= BUILDING_GAP) continue;
				const nx = d > 1e-4 ? (b.x - a.x) / d : 1;
				const nz = d > 1e-4 ? (b.z - a.z) / d : 0;
				const push = (BUILDING_GAP - d) / 2;
				a.x -= nx * push; a.z -= nz * push;
				b.x += nx * push; b.z += nz * push;
			}
		}
		placed.forEach(clearFromRoads);
	}
	return placed;
}

/** Grows small buildings along both sides of the streets, then fills deeper lots. */
export function fillerLots(city: CityModel, roads: Roads, placed: PlacedBuilding[], streets = cityStreets(city, placed), stations: { x: number; z: number }[] = []): Lot[] {
	const rng = seededRandom(city.name || "city");
	const width = city.cols * CELL_W;
	const depth = city.rows * CELL_D;
	const cityLimit = cityRadius(city, placed);
	const lots: Lot[] = [];
	const buckets = new Map<string, Lot[]>();
	// Unit-size spatial buckets limit overlap checks to nearby lots.
	const bucket = (x: number, z: number) => `${Math.floor(x)},${Math.floor(z)}`;
	for (const street of streets) {
		const dx = street.b[0] - street.a[0], dz = street.b[1] - street.a[1];
		const length = Math.hypot(dx, dz), ux = dx / length, uz = dz / length;
		for (let along = 0.2 + rng() * 0.3; along < length; along += 0.7 + rng() * 0.35) {
			for (const side of [-1, 1]) for (let row = 0; row < 2; row++) {
				const w = 0.32 + rng() * 0.34;
				const d = 0.3 + rng() * 0.32;
				const radius = Math.hypot(w, d) / 2;
				const offset = STREET_WIDTH / 2 + radius + 0.07 + row * 0.85 + rng() * 0.1;
				const px = street.a[0] + ux * along - uz * side * offset;
				const pz = street.a[1] + uz * along + ux * side * offset;
				const downtown = Math.exp(-(((px - width * 0.55) / Math.max(width * 0.27, 1)) ** 2
					+ ((pz - depth * 0.45) / Math.max(depth * 0.27, 1)) ** 2));
				// Favor occasional taller buildings around the city center, with variety elsewhere.
				const heightRoll = rng();
				const h = heightRoll < 0.9 - downtown * 0.35 ? 0.3 + rng() * 0.75 : 1.05 + rng() * 1.25;
				const color = FILLER_COLORS[Math.floor(rng() * FILLER_COLORS.length)];
				const skip = rng() < (row ? 0.22 : 0.08) || Math.hypot(px - width / 2, pz - depth / 2) + radius > cityLimit;
				if (skip || placed.some(b => Math.hypot(b.x - px, b.z - pz) < FOOTPRINT * 0.78 + Math.hypot(w, d) / 2 + 0.1)) continue;
				if (stations.some(s => Math.hypot(s.x - px, s.z - pz) < 1.45 + radius)) continue;
				// Keep background buildings clear of rail, stations, streets, and landmarks.
				const hit = nearestRoad(px, pz, roads);
				if (hit && hit.dist < 1.25 + Math.hypot(w, d) / 2) continue;
				if (streets.some(s => {
					const x = s.b[0] - s.a[0], z = s.b[1] - s.a[1];
					const t = Math.max(0, Math.min(1, ((px - s.a[0]) * x + (pz - s.a[1]) * z) / (x * x + z * z)));
					return Math.hypot(px - s.a[0] - t * x, pz - s.a[1] - t * z) < STREET_WIDTH / 2 + radius + 0.03;
				})) continue;
				let occupied = false;
				for (let bx = Math.floor(px) - 1; bx <= Math.floor(px) + 1; bx++) for (let bz = Math.floor(pz) - 1; bz <= Math.floor(pz) + 1; bz++) {
					if ((buckets.get(`${bx},${bz}`) ?? []).some(lot => Math.hypot(lot.x - px, lot.z - pz) < radius + Math.hypot(lot.w, lot.d) / 2 + 0.08)) occupied = true;
				}
				if (occupied) continue;
				const lot = { x: px, z: pz, w, d, h, yaw: Math.atan2(-uz, ux), color };
				lots.push(lot);
				const k = bucket(px, pz), neighbors = buckets.get(k) ?? [];
				neighbors.push(lot);
				buckets.set(k, neighbors);
			}
		}
	}
	return lots;
}
