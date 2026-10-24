import type { Vec3 } from "./Mat4";
import type { CityModel } from "./CityParser";
import { CELL_D, CELL_W } from "./Grid";
import { FOOTPRINT, fillerLots, placeBuildings } from "./Layout";
import { MeshBuilder } from "./MeshBuilder";
import type { DrawRange } from "./MeshBuilder";
import { GROUND_COLOR, styleFor } from "./Palette";
import { addRoadMesh, extractRoads } from "./Roads";

export interface BuildingMesh {
	name: string;
	glyph: string;
	range: DrawRange;
	/** Ground-level center (x, 0, z) and yaw of the building. */
	center: Vec3;
	yaw: number;
	/** Bounds in the building's own (unrotated) space, relative to center. */
	min: Vec3;
	max: Vec3;
}

export interface Scene {
	/** Interleaved position(3) normal(3) color(3). */
	vertices: Float32Array;
	/** Everything that isn't a clickable building. */
	world: DrawRange;
	buildings: BuildingMesh[];
	center: Vec3;
	radius: number;
}

const HEIGHT_SCALE = 1.5;

/** Turns a parsed city map into one static vertex buffer plus a draw range per clickable building. */
export function buildScene(city: CityModel): Scene {
	const mb = new MeshBuilder();
	const width = city.cols * CELL_W;
	const depth = city.rows * CELL_D;

	const margin = 4;
	mb.quad(
		[-margin, 0, -margin],
		[-margin, 0, depth + margin],
		[width + margin, 0, depth + margin],
		[width + margin, 0, -margin],
		GROUND_COLOR, [0, 1, 0],
	);

	const roads = extractRoads(city);
	addRoadMesh(mb, roads);

	const placed = placeBuildings(city, roads);
	for (const l of fillerLots(city, roads, placed)) mb.box(l.x, 0, l.z, l.w, l.h, l.d, l.color, l.yaw);
	const world: DrawRange = { first: 0, count: mb.count };

	const buildings: BuildingMesh[] = [];
	for (const b of placed) {
		const style = styleFor(b.glyph);
		const h = style.height * HEIGHT_SCALE;
		const f = FOOTPRINT;
		const first = mb.count;
		if (style.shape === "pyramid") {
			const baseH = h * 0.55;
			mb.box(b.x, 0, b.z, f, baseH, f, style.color, b.yaw);
			mb.pyramid(b.x, baseH, b.z, f * 1.1, h - baseH, f * 1.1, style.color, b.yaw);
		} else if (style.shape === "tower") {
			mb.box(b.x, 0, b.z, f * 0.7, h, f * 0.7, style.color, b.yaw);
			mb.box(b.x, 0, b.z, f, h * 0.3, f, style.color, b.yaw);
		} else {
			mb.box(b.x, 0, b.z, f, h, f, style.color, b.yaw);
		}
		buildings.push({
			name: b.name,
			glyph: b.glyph,
			range: { first, count: mb.count - first },
			center: [b.x, 0, b.z],
			yaw: b.yaw,
			min: [-f / 2, 0, -f / 2],
			max: [f / 2, h, f / 2],
		});
	}

	return {
		vertices: mb.build(),
		world,
		buildings,
		center: [width / 2, 0, depth / 2],
		radius: Math.max(width, depth) / 2,
	};
}
