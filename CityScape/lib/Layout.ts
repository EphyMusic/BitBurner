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

/** Fills the empty space around roads and landmarks with small, unclickable buildings. */
export function fillerLots(city: CityModel, roads: Roads, placed: PlacedBuilding[]): Lot[] {
	const rng = seededRandom(city.name || "city");
	const width = city.cols * CELL_W;
	const depth = city.rows * CELL_D;
	const pitch = 1.1;
	const margin = 2;
	const cx = width / 2;
	const cz = depth / 2;
	const reach = Math.hypot(cx, cz) + margin;
	const lots: Lot[] = [];

	for (let x = -margin; x <= width + margin; x += pitch) {
		for (let z = -margin; z <= depth + margin; z += pitch) {
			const w = 0.5 + rng() * 0.25;
			const d = 0.5 + rng() * 0.25;
			const px = x + (rng() - 0.5) * 0.2;
			const pz = z + (rng() - 0.5) * 0.2;
			const h = (0.35 + rng() * rng() * 1.8) * (1 - 0.45 * (Math.hypot(px - cx, pz - cz) / reach));
			const color = FILLER_COLORS[Math.floor(rng() * FILLER_COLORS.length)];
			const skip = rng() < 0.12;

			if (skip || placed.some(b => Math.hypot(b.x - px, b.z - pz) < FOOTPRINT / 2 + 0.55 + 0.15)) continue;
			const hit = nearestRoad(px, pz, roads);
			if (hit && hit.dist < SIDEWALK_HALF + 0.1 + Math.max(w, d) / 2 + 0.15) continue;
			lots.push({ x: px, z: pz, w, d, h, yaw: hit && hit.dist < 2.5 ? hit.seg.yaw : 0, color });
		}
	}
	return lots;
}
