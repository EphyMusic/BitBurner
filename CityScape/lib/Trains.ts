import { rotate } from "./Grid";
import { EdgeBuilder } from "./EdgeBuilder";
import type { Vec3 } from "./Mat4";
import { MeshBuilder } from "./MeshBuilder";
import type { RailSpan } from "./RailPath";
import { RAIL_Y, terminalClearance } from "./Monorail";

type Point = [number, number];
interface Stop { name: string; x: number; z: number }
interface Node { point: Point; edges: number[]; stations: string[] }
interface Edge { a: number; b: number; interchange: number | undefined; length: number }
// Distances are cumulative along a closed walk; stations and reversals are explicit braking points.
interface Route { points: Point[]; distances: number[]; stops: { distance: number; station: boolean }[]; length: number; stationCount: number }
interface Train { route: Route; distance: number; speed: number; nextStop: number; wait: number; visits: number }

const LANE_OFFSET = 0.12; // Keep opposing 0.2-wide trains on separate lanes.
const MAX_SPEED = 2.8;
const ACCELERATION = 1.8;
const WHITE: [number, number, number] = [1, 1, 1];
const DARK: [number, number, number] = [0.008, 0.012, 0.018];
const key = (p: Point) => `${Math.round(p[0] * 10000)},${Math.round(p[1] * 10000)}`;

/** Builds one closed station-to-station route per rail network with at least two stations. */
function routes(spans: RailSpan[], stops: Stop[]): { walks: Route[]; stationCount: number } {
	// Trim dead-end spans for nose clearance; routes ultimately visit stations rather than track ends.
	const degrees = new Map<string, number>();
	for (const span of spans) for (const point of [span.a, span.b]) {
		const k = key(point);
		degrees.set(k, (degrees.get(k) ?? 0) + 1);
	}
	const lines = spans.map(span => {
		const start = degrees.get(key(span.a)) === 1 ? terminalClearance(span.len) : 0;
		const end = degrees.get(key(span.b)) === 1 ? terminalClearance(span.len) : 0;
		return {
			a: [span.a[0] + span.ux * start, span.a[1] + span.uz * start] as Point,
			b: [span.b[0] - span.ux * end, span.b[1] - span.uz * end] as Point,
			interchange: span.interchange,
			stops: [] as { t: number; name: string }[],
		};
	});
	for (const stop of stops) {
		// Project each station onto its nearest span and split the graph there.
		let best = Infinity, bestLine = -1, bestT = 0;
		for (const [i, line] of lines.entries()) {
			const dx = line.b[0] - line.a[0], dz = line.b[1] - line.a[1];
			const t = Math.max(0, Math.min(1, ((stop.x - line.a[0]) * dx + (stop.z - line.a[1]) * dz) / (dx * dx + dz * dz)));
			const distance = Math.hypot(stop.x - line.a[0] - t * dx, stop.z - line.a[1] - t * dz);
			if (distance < best) { best = distance; bestLine = i; bestT = t; }
		}
		if (bestLine >= 0) lines[bestLine].stops.push({ t: bestT, name: stop.name });
	}
	const nodes: Node[] = [], edges: Edge[] = [];
	const lookup = new Map<string, number>();
	const node = (point: Point): number => {
		const k = key(point), found = lookup.get(k);
		if (found !== undefined) return found;
		const i = nodes.length;
		nodes.push({ point, edges: [], stations: [] });
		lookup.set(k, i);
		return i;
	};
	for (const line of lines) {
		const checkpoints = [{ t: 0, name: "" }, ...line.stops, { t: 1, name: "" }].sort((a, b) => a.t - b.t);
		let previous = -1;
		for (const checkpoint of checkpoints) {
			const p: Point = [line.a[0] + (line.b[0] - line.a[0]) * checkpoint.t, line.a[1] + (line.b[1] - line.a[1]) * checkpoint.t];
			const current = node(p);
			if (checkpoint.name) nodes[current].stations.push(checkpoint.name);
			if (previous >= 0 && current !== previous) {
				const i = edges.length;
				edges.push({ a: previous, b: current, interchange: line.interchange,
					length: Math.hypot(nodes[current].point[0] - nodes[previous].point[0], nodes[current].point[1] - nodes[previous].point[1]) });
				nodes[previous].edges.push(i);
				nodes[current].edges.push(i);
			}
			previous = current;
		}
	}
	const destination = (arc: number) => arc % 2 === 0 ? edges[arc >> 1].b : edges[arc >> 1].a;
	const origin = (arc: number) => destination(arc ^ 1);
	// Search in directed-edge states so a route cannot switch curves inside an interchange.
	const find = (startNode: number, from: number | null, goal: (node: number) => boolean): number[] | null => {
		const distance = new Array<number>(edges.length * 2).fill(Infinity);
		const previous = new Array<number>(edges.length * 2).fill(-1);
		const visited = new Set<number>();
		if (from === null) {
			for (const edge of nodes[startNode].edges) {
				const arc = edge * 2 + (edges[edge].a === startNode ? 0 : 1);
				distance[arc] = edges[edge].length;
			}
		} else distance[from] = 0;
		while (visited.size < distance.length) {
			// Dijkstra over directed arcs accounts for turn restrictions and prefers gentler turns.
			let current = -1;
			for (let i = 0; i < distance.length; i++) if (!visited.has(i) && (current < 0 || distance[i] < distance[current])) current = i;
			if (current < 0 || !Number.isFinite(distance[current])) return null;
			visited.add(current);
			if (current !== from && goal(destination(current))) {
				const result: number[] = [];
				for (let arc = current; arc !== from && arc !== -1; arc = previous[arc]) result.push(arc);
				return result.reverse();
			}
			const junction = destination(current);
			const incoming = nodes[origin(current)].point, center = nodes[junction].point;
			for (const edge of nodes[junction].edges) {
				const arc = edge * 2 + (edges[edge].a === junction ? 0 : 1);
				if (arc === (current ^ 1) && nodes[junction].stations.length === 0) continue;
				const incomingTurn = edges[current >> 1].interchange, outgoingTurn = edges[edge].interchange;
				// Crossing curves and shared approaches are not places to switch between turns.
				if (incomingTurn !== undefined && outgoingTurn !== undefined && incomingTurn !== outgoingTurn) continue;
				const target = nodes[destination(arc)].point;
				const ax = center[0] - incoming[0], az = center[1] - incoming[1];
				const bx = target[0] - center[0], bz = target[1] - center[1];
				const turn = 1 - (ax * bx + az * bz) / (Math.hypot(ax, az) * Math.hypot(bx, bz));
				const candidate = distance[current] + edges[edge].length + 0.15 * turn;
				if (candidate < distance[arc]) { distance[arc] = candidate; previous[arc] = current; }
			}
		}
		return null;
	};
	const walks: Route[] = [];
	const assigned = new Set<number>();
	for (let start = 0; start < nodes.length; start++) {
		// Process disconnected networks independently; a single station cannot sustain a route.
		if (assigned.has(start)) continue;
		const component: number[] = [], pending = [start];
		while (pending.length) {
			const n = pending.pop()!;
			if (assigned.has(n)) continue;
			assigned.add(n);
			component.push(n);
			for (const edge of nodes[n].edges) pending.push(edges[edge].a === n ? edges[edge].b : edges[edge].a);
		}
		const stations = component.filter(n => nodes[n].stations.length > 0);
		if (stations.length < 2) continue;
		const first = stations[0], remaining = new Set(stations.slice(1));
		const circuit = [first];
		// Visit the nearest reachable unvisited station, then close the walk back to its start.
		let current: number | null = null;
		const append = (path: number[]) => {
			for (const arc of path) {
				circuit.push(destination(arc));
				remaining.delete(destination(arc));
				current = arc;
			}
		};
		while (remaining.size) {
			const path = find(first, current, n => remaining.has(n));
			if (!path) throw new Error("CityScape could not route a train between all stations in a rail network");
			append(path);
		}
		const back = find(first, current, n => n === first);
		if (!back) throw new Error("CityScape could not return a train to its first station");
		append(back);
		const points = circuit.map(i => nodes[i].point);
		const distances = [0];
		for (let i = 1; i < points.length; i++) distances.push(distances[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
		const routeStops: Route["stops"] = [];
		// Reversals also require a brief stop even if no station is present.
		for (let i = 1; i < points.length; i++) {
			const prev = points[i - 1], p = points[i], next = points[(i + 1) % (points.length - 1)];
			const ax = p[0] - prev[0], az = p[1] - prev[1];
			const bx = next[0] - p[0], bz = next[1] - p[1];
			const reversal = (ax * bx + az * bz) / (Math.hypot(ax, az) * Math.hypot(bx, bz)) < -0.95;
			const station = nodes[circuit[i]].stations.length > 0;
			if (station || reversal) routeStops.push({ distance: distances[i], station });
		}
		walks.push({ points, distances, stops: routeStops, length: distances[distances.length - 1], stationCount: stations.length });
	}
	return { walks, stationCount: nodes.filter(n => n.stations.length > 0).length };
}

/** Runs up to four trains across the station-bearing rail networks. */
export class Trains {
	private trains: Train[];
	private lastTime: number | null = null;

	constructor(spans: RailSpan[], stops: Stop[]) {
		const { walks, stationCount } = routes(spans, stops);
		// Two to four stations get one train; each additional three adds one, capped at four.
		const count = stationCount < 2 ? 0 : Math.min(4, Math.floor((stationCount + 1) / 3));
		const allocation = walks.map(() => 0);
		for (let i = 0; i < count && walks.length; i++) {
			// Give unserved networks priority, then allocate according to stations per train.
			let best = 0;
			for (let j = 1; j < walks.length; j++) {
				if ((allocation[j] === 0 && allocation[best] !== 0)
					|| ((allocation[j] === 0) === (allocation[best] === 0)
						&& walks[j].stationCount / (allocation[j] + 1) > walks[best].stationCount / (allocation[best] + 1))) best = j;
			}
			allocation[best]++;
		}
		this.trains = [];
		for (const [index, route] of walks.entries()) {
			const candidates: { distance: number; point: Point }[] = [];
			for (let segment = 1; segment < route.points.length; segment++) {
				const a = route.points[segment - 1], b = route.points[segment];
				const length = route.distances[segment] - route.distances[segment - 1];
				const steps = Math.max(1, Math.ceil(length / 0.3));
				for (let j = 0; j < steps; j++) {
					const t = j / steps;
					candidates.push({ distance: route.distances[segment - 1] + t * length,
						point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] });
				}
			}
			const selected: Point[] = [];
			// Greedy spatial separation reduces initial overlap on routes that double back.
			for (let i = 0; i < allocation[index]; i++) {
				let start = candidates[0], separation = -1;
				for (const candidate of candidates) {
					const d = selected.length ? Math.min(...selected.map(p => Math.hypot(p[0] - candidate.point[0], p[1] - candidate.point[1]))) : 0;
					if (d > separation) { start = candidate; separation = d; }
				}
				selected.push(start.point);
				const next = route.stops.findIndex(stop => stop.distance > start.distance + 1e-6);
				this.trains.push({ route, distance: start.distance, speed: 0, nextStop: next < 0 ? route.stops.length : next, wait: 0, visits: 0 });
			}
		}
	}

	build(time: number): { vertices: Float32Array; edges: Float32Array } {
		// Limit elapsed time and integrate in small steps for stable braking after frame stalls.
		const dt = this.lastTime === null ? 0 : Math.min(Math.max(0, time - this.lastTime), 100) / 1000;
		this.lastTime = time;
		const mesh = new MeshBuilder(), edges = new EdgeBuilder();
		for (const train of this.trains) {
			const route = train.route;
			let remaining = dt;
			while (remaining > 0) {
				const step = Math.min(remaining, 0.025);
				remaining -= step;
				if (train.wait > 0) { train.wait = Math.max(0, train.wait - step); continue; }
				const stop = route.stops[train.nextStop];
				const until = stop ? stop.distance - train.distance : route.length - train.distance;
				// v² = 2ad provides the maximum speed that can still stop at the next waypoint.
				const target = Math.min(MAX_SPEED, Math.sqrt(2 * ACCELERATION * Math.max(0, until)));
				const nextSpeed = train.speed < target ? Math.min(target, train.speed + ACCELERATION * step) : Math.max(target, train.speed - ACCELERATION * step);
				const move = Math.min(until, (train.speed + nextSpeed) * step / 2);
				train.distance += move;
				train.speed = nextSpeed;
				if (until - move < 0.001) {
					train.distance += until - move;
					train.speed = 0;
					if (stop) {
						train.nextStop++;
						train.wait = stop.station ? 0.8 + (train.visits++ % 5) * 0.3 : 0.35;
					}
					if (train.distance >= route.length - 0.001) { train.distance = 0; train.nextStop = 0; }
				}
			}
			let i = 1;
			while (i < route.distances.length - 1 && route.distances[i] < train.distance) i++;
			const a = route.points[i - 1], b = route.points[i];
			const length = route.distances[i] - route.distances[i - 1];
			const t = (train.distance - route.distances[i - 1]) / length;
			const ux = (b[0] - a[0]) / length, uz = (b[1] - a[1]) / length;
			const vertexDirection = (vertex: number): Point => {
				// Blend adjacent segment tangents except at reversals, avoiding abrupt lane swaps.
				const count = route.points.length - 1;
				const current = vertex % count;
				const prev = route.points[(current + count - 1) % count];
				const center = route.points[current];
				const nextPoint = route.points[(current + 1) % count];
				const beforeLength = Math.hypot(center[0] - prev[0], center[1] - prev[1]);
				const afterLength = Math.hypot(nextPoint[0] - center[0], nextPoint[1] - center[1]);
				const ax = (center[0] - prev[0]) / beforeLength, az = (center[1] - prev[1]) / beforeLength;
				const bx = (nextPoint[0] - center[0]) / afterLength, bz = (nextPoint[1] - center[1]) / afterLength;
				const magnitude = Math.hypot(ax + bx, az + bz);
				return magnitude < 0.32 ? [ux, uz] : [(ax + bx) / magnitude, (az + bz) / magnitude];
			};
			const startDirection = vertexDirection(i - 1), endDirection = vertexDirection(i);
			const blendLength = Math.min(0.18, length / 2);
			const sw = Math.max(0, 1 - t * length / blendLength);
			const ew = Math.max(0, 1 - (1 - t) * length / blendLength);
			const dx = ux * (1 - sw - ew) + startDirection[0] * sw + endDirection[0] * ew;
			const dz = uz * (1 - sw - ew) + startDirection[1] * sw + endDirection[1] * ew;
			const magnitude = Math.hypot(dx, dz) || 1;
			const sx = dx / magnitude, sz = dz / magnitude;
			const x = a[0] + (b[0] - a[0]) * t - sz * LANE_OFFSET;
			const z = a[1] + (b[1] - a[1]) * t + sx * LANE_OFFSET;
			const yaw = Math.atan2(-sz, sx);
			const point = (px: number, py: number, pz: number): Vec3 => {
				const [rx, rz] = rotate(px, pz, yaw);
				return [x + rx, RAIL_Y + py, z + rz];
			};
			// A level bottom and descending roof form the broad, blunt bullet-train nose.
			const back = [point(-0.36, 0.03, -0.10), point(-0.36, 0.03, 0.10), point(-0.36, 0.34, 0.10), point(-0.36, 0.34, -0.10)];
			const front = [point(0.13, 0.03, -0.10), point(0.13, 0.03, 0.10), point(0.13, 0.34, 0.10), point(0.13, 0.34, -0.10)];
			const nose = [point(0.36, 0.03, -0.10), point(0.36, 0.03, 0.10), point(0.36, 0.10, 0.10), point(0.36, 0.10, -0.10)];
			for (let j = 0; j < 4; j++) {
				const next = (j + 1) % 4;
				mesh.quad(back[j], back[next], front[next], front[j], DARK);
				mesh.quad(front[j], front[next], nose[next], nose[j], DARK);
				edges.line(back[j], back[next], WHITE);
				edges.line(back[j], front[j], WHITE);
				edges.line(front[j], front[next], WHITE);
				edges.line(front[j], nose[j], WHITE);
				edges.line(nose[j], nose[next], WHITE);
			}
			mesh.quad(back[0], back[1], back[2], back[3], DARK);
			mesh.quad(nose[0], nose[1], nose[2], nose[3], DARK);
		}
		return { vertices: mesh.build(), edges: edges.build() };
	}
}
