import type { Vec3 } from "./Mat4";
import type { CityModel } from "./CityParser";
import { CELL_D, CELL_W } from "./Grid";
import { FOOTPRINT, STREET_WIDTH, cityRadius, cityStreets, fillerLots, placeBuildings } from "./Layout";
import type { Street } from "./Layout";
import { EdgeBuilder } from "./EdgeBuilder";
import { MeshBuilder } from "./MeshBuilder";
import type { DrawRange } from "./MeshBuilder";
import { GROUND_COLOR, styleFor } from "./Palette";
import { extractRoads } from "./Roads";
import { addMonorail } from "./Monorail";
import type { RailSpan } from "./RailPath";

export interface BuildingMesh {
	name: string;
	glyph: string;
	range: DrawRange;
	edges: DrawRange;
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
	edges: Float32Array;
	ground: DrawRange;
	filler: DrawRange;
	rail: DrawRange;
	fillerEdges: DrawRange;
	railEdges: DrawRange;
	railSpans: RailSpan[];
	railStops: { name: string; x: number; z: number }[];
	streets: Street[];
	trafficSeed: string;
	buildings: BuildingMesh[];
	center: Vec3;
	radius: number;
	fogBounds: [number, number]; // Source-map dimensions and fog center.
	fogRadius: number; // Circular footprint in world units.
}

const HEIGHT_SCALE = 1.5;

/** Turns a parsed city map into one static vertex buffer plus a draw range per clickable building. */
export function buildScene(city: CityModel): Scene {
	const mb = new MeshBuilder();
	const edges = new EdgeBuilder();
	const width = city.cols * CELL_W;
	const depth = city.rows * CELL_D;

	// The large ground carries world-space fog well beyond the city's visible perimeter.
	const margin = Math.max(width, depth) * 8 + 100;
	mb.quad(
		[-margin, 0, -margin],
		[-margin, 0, depth + margin],
		[width + margin, 0, depth + margin],
		[width + margin, 0, -margin],
		GROUND_COLOR, [0, 1, 0],
	);
	const roads = extractRoads(city);
	const placed = placeBuildings(city, roads);
	const streetColor: [number, number, number] = [0.09, 0.105, 0.12];
	const laneColor: [number, number, number] = [0.2, 0.2, 0.18];
	const streets = cityStreets(city, placed);
	for (const street of streets) {
		// Slightly raised strips and intersection caps prevent z-fighting with the ground.
		const dx = street.b[0] - street.a[0], dz = street.b[1] - street.a[1];
		const length = Math.hypot(dx, dz), ux = dx / length, uz = dz / length;
		const strip = (from: number, to: number, halfWidth: number, height: number, color: [number, number, number]) => {
			const point = (along: number, side: number): Vec3 => [
				street.a[0] + ux * along - uz * side * halfWidth,
				height,
				street.a[1] + uz * along + ux * side * halfWidth,
			];
			mb.quad(point(from, -1), point(from, 1), point(to, 1), point(to, -1), color, [0, 1, 0]);
		};
		strip(0, length, STREET_WIDTH / 2, 0.005, streetColor);
		for (const end of [street.a, street.b]) {
			const center: Vec3 = [end[0], 0.005, end[1]];
			for (let i = 0; i < 8; i++) {
				const angle = i * Math.PI / 4, next = (i + 1) * Math.PI / 4;
				mb.tri(center,
					[end[0] + Math.cos(angle) * STREET_WIDTH / 2, 0.005, end[1] + Math.sin(angle) * STREET_WIDTH / 2],
					[end[0] + Math.cos(next) * STREET_WIDTH / 2, 0.005, end[1] + Math.sin(next) * STREET_WIDTH / 2],
					streetColor, [0, 1, 0]);
			}
		}
		for (let p = 0.3; p + 0.3 < length; p += 0.65) strip(p, p + 0.18, 0.01, 0.008, laneColor);
	}
	const ground: DrawRange = { first: 0, count: mb.count };
	const railFirst = edges.count;
	// Build platforms before filler so their reserved areas stay free of background buildings.
	const railSolidFirst = mb.count;
	const rail = addMonorail(mb, edges, roads, placed, city.buildings, streets);
	const railEdges = edges.range(railFirst);
	const railRange: DrawRange = { first: railSolidFirst, count: mb.count - railSolidFirst };
	const fillerFirst = mb.count;
	const fillerEdgeFirst = edges.count;
	for (const l of fillerLots(city, roads, placed, streets, rail.stops)) {
		mb.box(l.x, 0, l.z, l.w, l.h, l.d, l.color, l.yaw);
		edges.box(l.x, 0, l.z, l.w, l.h, l.d, l.color, l.yaw);
	}
	const filler: DrawRange = { first: fillerFirst, count: mb.count - fillerFirst };
	const fillerEdges = edges.range(fillerEdgeFirst);
	const buildings: BuildingMesh[] = [];
	for (const b of placed) {
		// Dark shells provide occlusion; glyph-colored edges supply the holographic appearance.
		const style = styleFor(b.glyph);
		const h = style.height * HEIGHT_SCALE;
		const f = FOOTPRINT;
		const first = mb.count;
		const edgeFirst = edges.count;
		const black: [number, number, number] = [0.005, 0.008, 0.012];
		if (style.shape === "pyramid") {
			const baseH = h * 0.55;
			mb.box(b.x, 0, b.z, f, baseH, f, black, b.yaw);
			mb.pyramid(b.x, baseH, b.z, f * 1.1, h - baseH, f * 1.1, black, b.yaw);
			edges.box(b.x, 0, b.z, f, baseH, f, style.color, b.yaw);
			edges.pyramid(b.x, baseH, b.z, f * 1.1, h - baseH, f * 1.1, style.color, b.yaw);
		} else if (style.shape === "tower") {
			mb.box(b.x, 0, b.z, f * 0.7, h, f * 0.7, black, b.yaw);
			mb.box(b.x, 0, b.z, f, h * 0.3, f, black, b.yaw);
			edges.box(b.x, 0, b.z, f * 0.7, h, f * 0.7, style.color, b.yaw);
			edges.box(b.x, 0, b.z, f, h * 0.3, f, style.color, b.yaw);
		} else {
			mb.box(b.x, 0, b.z, f, h, f, black, b.yaw);
			edges.box(b.x, 0, b.z, f, h, f, style.color, b.yaw);
		}
		buildings.push({
			name: b.name,
			glyph: b.glyph,
			range: { first, count: mb.count - first },
			edges: edges.range(edgeFirst),
			center: [b.x, 0, b.z],
			yaw: b.yaw,
			min: [-f * (style.shape === "pyramid" ? 0.55 : 0.5), 0, -f * (style.shape === "pyramid" ? 0.55 : 0.5)],
			max: [f * (style.shape === "pyramid" ? 0.55 : 0.5), h, f * (style.shape === "pyramid" ? 0.55 : 0.5)],
		});
	}

	return {
		vertices: mb.build(),
		edges: edges.build(),
		ground,
		filler,
		rail: railRange,
		fillerEdges,
		railEdges,
		railSpans: rail.spans,
		railStops: rail.stops,
		streets,
		trafficSeed: city.name || "city",
		buildings,
		center: [width / 2, 0, depth / 2],
		radius: cityRadius(city, placed),
		fogBounds: [width, depth],
		fogRadius: cityRadius(city, placed),
	};
}
