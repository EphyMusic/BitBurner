import type { EdgeBuilder } from "./EdgeBuilder";
import type { BuildingCell } from "./CityParser";
import { CELL_D, CELL_W, cellX, cellZ } from "./Grid";
import { FOOTPRINT } from "./Layout";
import type { PlacedBuilding, Street } from "./Layout";
import type { Vec3 } from "./Mat4";
import type { MeshBuilder } from "./MeshBuilder";
import { nearestRoad } from "./Roads";
import type { Roads } from "./Roads";
import { railPath } from "./RailPath";
import type { RailSpan } from "./RailPath";

const WHITE: [number, number, number] = [1, 1, 1];
export const RAIL_Y = 1.65;
const BEAM_WIDTH = 0.34;
const BEAM_DEPTH = 0.22;
const END_STOP_LENGTH = 0.18;
const END_STOP_WIDTH = 0.48;
const END_STOP_HEIGHT = 0.32;
const STOP_REACH = Math.hypot(CELL_W, CELL_D) / 2 + 0.001;
const PLATFORM_WIDTH = 0.65;
const PLATFORM_LENGTH = 1.2;
const PLATFORM_Y = RAIL_Y - 0.1;
const PLATFORM_HEIGHT = 0.12;
const STAIR_COUNT = 12;
const STAIR_RADIUS = 0.17;
const STAIR_LENGTH = 0.3;
const STAIR_WIDTH = 0.14;
const STAIR_THICKNESS = 0.035;
const STATION_SPACING = 3.2;
const STATION_REACH = 4;
const DARK: [number, number, number] = [0.008, 0.012, 0.018];

/** Space for a train to reverse without its nose extending beyond a buffer stop. */
export const terminalClearance = (length: number): number => Math.min(0.56, length * 0.45);

/** A raised guideway with regularly spaced piers, junction supports, and a platform for each stop. */
export function addMonorail(mesh: MeshBuilder, edges: EdgeBuilder, roads: Roads, buildings: PlacedBuilding[], cells: BuildingCell[], streets: Street[] = []): { spans: RailSpan[]; stops: { name: string; x: number; z: number }[] } {
	/** A polygonal tapered column with matching shell and outline. */
	const prism = (bottom: Vec3[], top: Vec3[]) => {
		const center = (points: Vec3[]): Vec3 => [
			points.reduce((s, p) => s + p[0], 0) / points.length,
			points.reduce((s, p) => s + p[1], 0) / points.length,
			points.reduce((s, p) => s + p[2], 0) / points.length,
		];
		const upper = center(top);
		const lower = center(bottom);
		for (let i = 0; i < top.length; i++) {
			const j = (i + 1) % top.length;
			mesh.quad(bottom[i], bottom[j], top[j], top[i], DARK);
			mesh.tri(upper, top[i], top[j], DARK, [0, 1, 0]);
			mesh.tri(lower, bottom[j], bottom[i], DARK, [0, -1, 0]);
			edges.line(top[i], top[j], WHITE);
			edges.line(bottom[i], bottom[j], WHITE);
			if (i % 2 === 0) edges.line(bottom[i], top[i], WHITE);
		}
	};
	const ring = (x: number, y: number, z: number, rx: number, rz: number, yaw = 0): Vec3[] => {
		const points: Vec3[] = [];
		for (let i = 0; i < 8; i++) {
			const angle = i * Math.PI / 4;
			const dx = Math.cos(angle) * rx;
			const dz = Math.sin(angle) * rz;
			points.push([x + dx * Math.cos(yaw) + dz * Math.sin(yaw), y, z - dx * Math.sin(yaw) + dz * Math.cos(yaw)]);
		}
		return points;
	};
	const supported: [number, number][] = [];
	const support = (x: number, z: number) => {
		// Avoid overlapping piers where curved spans and junctions meet.
		if (supported.some(p => Math.hypot(p[0] - x, p[1] - z) < 0.45)) return;
		supported.push([x, z]);
		prism(ring(x, 0, z, 0.12, 0.12), ring(x, RAIL_Y - 0.2, z, 0.19, 0.19));
		prism(ring(x, RAIL_Y - 0.3, z, 0.19, 0.19), ring(x, RAIL_Y - 0.2, z, 0.31, 0.31));
	};
	const box = (x: number, y: number, z: number, w: number, h: number, d: number, yaw: number) => {
		mesh.box(x, y, z, w, h, d, DARK, yaw);
		edges.box(x, y, z, w, h, d, WHITE, yaw);
	};
	const platform = (x: number, z: number, ux: number, uz: number, side: number) => {
		const nx = -uz * side, nz = ux * side;
		const offset = BEAM_WIDTH / 2 + PLATFORM_WIDTH / 2;
		const px = x + nx * offset, pz = z + nz * offset;
		const yaw = Math.atan2(-uz, ux);
		box(px, PLATFORM_Y, pz, PLATFORM_LENGTH, PLATFORM_HEIGHT, PLATFORM_WIDTH, yaw);
		box(px, PLATFORM_Y + 0.9, pz, PLATFORM_LENGTH, 0.08, PLATFORM_WIDTH, yaw);
		for (const end of [-1, 1]) {
			const ex = px + ux * end * (PLATFORM_LENGTH / 2 - 0.08);
			const ez = pz + uz * end * (PLATFORM_LENGTH / 2 - 0.08);
			box(ex, 0, ez, 0.08, PLATFORM_Y, 0.08, yaw);
			box(ex, PLATFORM_Y + PLATFORM_HEIGHT, ez, 0.07, 0.78, 0.07, yaw);
		}
		const stairHeight = PLATFORM_Y + PLATFORM_HEIGHT;
		// Separate thin treads spiral around a central pole, from the deck toward ground level.
		const stairOffset = BEAM_WIDTH / 2 + PLATFORM_WIDTH + 0.29;
		const sx = x + nx * stairOffset, sz = z + nz * stairOffset;
		box(sx, 0, sz, 0.07, stairHeight, 0.07, yaw);
		const startAngle = Math.atan2(-nz, -nx);
		for (let i = 0; i < STAIR_COUNT; i++) {
			const height = stairHeight * (STAIR_COUNT - i) / (STAIR_COUNT + 1);
			const angle = startAngle + i * Math.PI * 2 / 10;
			const dx = Math.cos(angle), dz = Math.sin(angle);
			box(sx + dx * STAIR_RADIUS, height - STAIR_THICKNESS, sz + dz * STAIR_RADIUS,
				STAIR_LENGTH, STAIR_THICKNESS, STAIR_WIDTH, Math.atan2(-dz, dx));
		}
	};

	const path = railPath(roads);
	const key = (p: [number, number]) => `${Math.round(p[0] * 10000)},${Math.round(p[1] * 10000)}`;
	const touching = new Map<string, RailSpan[]>();
	for (const span of path.spans) for (const point of [span.a, span.b]) {
		const k = key(point);
		const list = touching.get(k) ?? [];
		list.push(span);
		touching.set(k, list);
	}
	const normal = (point: [number, number], span: RailSpan): [number, number] => {
		// Miter adjacent span edges at bends so the beam does not visibly split at joins.
		const nx = -span.uz;
		const nz = span.ux;
		const adjacent = touching.get(key(point));
		if (!adjacent || adjacent.length !== 2) return [nx, nz];
		const other = adjacent[0] === span ? adjacent[1] : adjacent[0];
		const sign = span.ux * other.ux + span.uz * other.uz < 0 ? -1 : 1;
		const mx = nx - other.uz * sign;
		const mz = nz + other.ux * sign;
		const divisor = mx * nx + mz * nz;
		if (divisor < 0.1) return [nx, nz];
		return [mx / divisor, mz / divisor];
	};
	for (const [x, z] of path.supports) support(x, z);
	for (const s of path.spans) {
		const point = (p: [number, number], side: number, y: number): Vec3 => {
			const [nx, nz] = normal(p, s);
			return [p[0] + nx * BEAM_WIDTH * side / 2, y, p[1] + nz * BEAM_WIDTH * side / 2];
		};
		const a = [point(s.a, -1, RAIL_Y), point(s.a, 1, RAIL_Y), point(s.a, -0.65, RAIL_Y - BEAM_DEPTH), point(s.a, 0.65, RAIL_Y - BEAM_DEPTH)];
		const b = [point(s.b, -1, RAIL_Y), point(s.b, 1, RAIL_Y), point(s.b, -0.65, RAIL_Y - BEAM_DEPTH), point(s.b, 0.65, RAIL_Y - BEAM_DEPTH)];
		for (const [i, j] of [[0, 1], [1, 3], [3, 2], [2, 0]]) {
			mesh.quad(a[i], b[i], b[j], a[j], DARK);
		}
		for (let i = 0; i < 4; i++) edges.line(a[i], b[i], WHITE);
		const count = Math.max(1, Math.ceil(s.len / 2.5));
		for (let i = 0; i < count; i++) {
			const t = (i + 0.5) / count;
			const x = s.a[0] + (s.b[0] - s.a[0]) * t;
			const z = s.a[1] + (s.b[1] - s.a[1]) * t;
			if (!supported.some(p => Math.hypot(p[0] - x, p[1] - z) < 2)) support(x, z);
		}
	}
	// True track ends receive buffer stops, not passenger platforms.
	for (const [endpointKey, spans] of touching) {
		if (spans.length !== 1) continue;
		const span = spans[0];
		const atStart = key(span.a) === endpointKey;
		const endpoint = atStart ? span.a : span.b;
		const direction = atStart ? 1 : -1;
		const x = endpoint[0] + span.ux * direction * END_STOP_LENGTH / 2;
		const z = endpoint[1] + span.uz * direction * END_STOP_LENGTH / 2;
		const yaw = Math.atan2(-span.uz, span.ux);
		mesh.box(x, RAIL_Y - BEAM_DEPTH, z, END_STOP_LENGTH, BEAM_DEPTH + END_STOP_HEIGHT, END_STOP_WIDTH, DARK, yaw);
		edges.box(x, RAIL_Y - BEAM_DEPTH, z, END_STOP_LENGTH, BEAM_DEPTH + END_STOP_HEIGHT, END_STOP_WIDTH, WHITE, yaw);
	}
	// Stations may only serve landmarks on the same connected rail component.
	const components = new Map<RailSpan, number>();
	for (const span of path.spans) {
		if (components.has(span)) continue;
		const id = components.size;
		const pending = [span];
		while (pending.length) {
			const current = pending.pop()!;
			if (components.has(current)) continue;
			components.set(current, id);
			for (const point of [current.a, current.b]) pending.push(...(touching.get(key(point)) ?? []).filter(s => !components.has(s)));
		}
	}
	// Only buildings whose original map cells were near track create station demand.
	const demand: { building: PlacedBuilding; component: number }[] = [];
	for (const [index, building] of buildings.entries()) {
		const cell = cells[index];
		const hit = nearestRoad(cellX(cell.col), cellZ(cell.row), roads);
		if (!hit || hit.dist > STOP_REACH) continue;
		let nearest: RailSpan | null = null, distance = Infinity;
		for (const span of path.spans) {
			const along = Math.max(0, Math.min(span.len, (hit.qx - span.a[0]) * span.ux + (hit.qz - span.a[1]) * span.uz));
			const d = Math.hypot(hit.qx - span.a[0] - span.ux * along, hit.qz - span.a[1] - span.uz * along);
			if (d < distance) { distance = d; nearest = span; }
		}
		if (nearest) demand.push({ building, component: components.get(nearest)! });
	}
	type Candidate = { x: number; z: number; ux: number; uz: number; side: number; streetDistance: number; component: number };
	const candidates: Candidate[] = [];
	for (const span of path.spans) {
		// Use straight stretches with room for a deck, stairs, and clearance from landmarks.
		if (span.interchange !== undefined || span.len < PLATFORM_LENGTH + 0.4) continue;
		const margin = PLATFORM_LENGTH / 2 + 0.2;
		const count = Math.ceil((span.len - 2 * margin) / 0.55);
		for (let i = 0; i <= count; i++) {
			const along = margin + (span.len - 2 * margin) * (count ? i / count : 0);
			const x = span.a[0] + span.ux * along, z = span.a[1] + span.uz * along;
			if (buildings.some(b => Math.abs((b.x - x) * span.ux + (b.z - z) * span.uz) < 0.9
				&& Math.abs((b.x - x) * span.uz - (b.z - z) * span.ux) < 2.5)) continue;
			for (const side of [-1, 1]) {
				const nx = -span.uz * side, nz = span.ux * side;
				const deckOffset = BEAM_WIDTH / 2 + PLATFORM_WIDTH / 2;
				const stairOffset = BEAM_WIDTH / 2 + PLATFORM_WIDTH + 0.29;
				const deckX = x + nx * deckOffset, deckZ = z + nz * deckOffset;
				const stairX = x + nx * stairOffset, stairZ = z + nz * stairOffset;
				if (buildings.some(b => Math.hypot(b.x - deckX, b.z - deckZ) < FOOTPRINT * 0.78 + 0.72
					|| Math.hypot(b.x - stairX, b.z - stairZ) < FOOTPRINT * 0.78 + 0.36)) continue;
				let streetDistance = 0;
				if (streets.length) streetDistance = Math.min(...streets.map(s => {
					const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1];
					const t = Math.max(0, Math.min(1, ((stairX - s.a[0]) * dx + (stairZ - s.a[1]) * dz) / (dx * dx + dz * dz)));
					return Math.hypot(stairX - s.a[0] - t * dx, stairZ - s.a[1] - t * dz);
				}));
				candidates.push({ x, z, ux: span.ux, uz: span.uz, side, streetDistance, component: components.get(span)! });
			}
		}
	}
	const stops: { name: string; x: number; z: number }[] = [];
	const uncovered = new Set(demand);
	// Greedily cover nearby landmarks while favoring street access and spacing platforms apart.
	while (uncovered.size) {
		let best: Candidate | null = null, bestScore = -Infinity;
		for (const candidate of candidates) {
			if (stops.some(stop => Math.hypot(stop.x - candidate.x, stop.z - candidate.z) < STATION_SPACING)) continue;
			let covered = 0, distance = 0;
			for (const { building: b, component } of uncovered) {
				if (component !== candidate.component) continue;
				const d = Math.hypot(b.x - candidate.x, b.z - candidate.z);
				if (d <= STATION_REACH) { covered++; distance += d; }
			}
			if (!covered) continue;
			const score = covered * 10 - distance * 0.2 - Math.min(candidate.streetDistance, 4) * 0.3;
			if (score > bestScore) { best = candidate; bestScore = score; }
		}
		if (!best) break;
		platform(best.x, best.z, best.ux, best.uz, best.side);
		stops.push({ name: `Station ${stops.length + 1}`, x: best.x, z: best.z });
		for (const item of uncovered) if (item.component === best.component && Math.hypot(item.building.x - best.x, item.building.z - best.z) <= STATION_REACH) uncovered.delete(item);
	}
	return { spans: path.spans, stops };
}
