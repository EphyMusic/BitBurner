import type { Roads } from "./Roads";

type Point = [number, number];

export interface RailSpan {
	a: Point;
	b: Point;
	len: number;
	ux: number;
	uz: number;
	/** Identifies all segments belonging to the same complete turn through a junction. */
	interchange?: number;
}

interface Node {
	point: Point;
	links: number[];
	junction: boolean;
}

/** Builds centerlines with rounded bends and a route between every pair of interchange approaches. */
export function railPath(roads: Roads): { spans: RailSpan[]; supports: Point[]; hubs: Point[] } {
	const nodes: Node[] = [];
	const lookup = new Map<string, number>();
	const links: [number, number][] = [];
	const nodeAt = (point: Point, junction = false): number => {
		const key = `${Math.round(point[0] * 10000)},${Math.round(point[1] * 10000)}`;
		const found = lookup.get(key);
		if (found !== undefined) {
			nodes[found].junction ||= junction;
			return found;
		}
		const index = nodes.length;
		nodes.push({ point, links: [], junction });
		lookup.set(key, index);
		return index;
	};
	const addLink = (a: number, b: number) => {
		if (a === b || nodes[a].links.some(i => links[i][0] === b || links[i][1] === b)) return;
		const index = links.length;
		links.push([a, b]);
		nodes[a].links.push(index);
		nodes[b].links.push(index);
	};
	for (const segment of roads.segments) addLink(nodeAt(segment.a), nodeAt(segment.b));
	// Join junction centers only to nearby, aligned track ends; proximity alone creates false branches.
	const endpoints = nodes.length;
	for (const junction of roads.junctions) {
		const center = nodeAt(junction, true);
		for (let i = 0; i < endpoints; i++) {
			const n = nodes[i];
			const dx = junction[0] - n.point[0];
			const dz = junction[1] - n.point[1];
			const distance = Math.hypot(dx, dz);
			if (distance < 1e-4 || distance > 0.584) continue;
			if (n.links.some(link => {
				const other = nodes[links[link][0] === i ? links[link][1] : links[link][0]].point;
				const sx = n.point[0] - other[0];
				const sz = n.point[1] - other[1];
				return (dx * sx + dz * sz) / (distance * Math.hypot(sx, sz)) > 0.999;
			})) addLink(center, i);
		}
	}

	// Merge straight character-sized pieces before rounding, so bends have room to curve.
	let changed = true;
	while (changed) {
		changed = false;
		for (const [i, node] of nodes.entries()) {
			if (node.junction || node.links.length !== 2) continue;
			const [first, second] = node.links;
			const a = links[first][0] === i ? links[first][1] : links[first][0];
			const b = links[second][0] === i ? links[second][1] : links[second][0];
			if (a === b) continue;
			const av = [nodes[a].point[0] - node.point[0], nodes[a].point[1] - node.point[1]];
			const bv = [nodes[b].point[0] - node.point[0], nodes[b].point[1] - node.point[1]];
			if ((av[0] * bv[0] + av[1] * bv[1]) / (Math.hypot(...av) * Math.hypot(...bv)) > -0.99999) continue;
			nodes[a].links = nodes[a].links.filter(link => link !== first);
			nodes[b].links = nodes[b].links.filter(link => link !== second);
			node.links = [];
			links[first] = links[second] = [-1, -1];
			addLink(a, b);
			changed = true;
		}
	}

	const trim = new Map<string, Point>();
	const bends: { center: Point; a: Point; b: Point; interchange?: number }[] = [];
	const supports: Point[] = [];
	const hubs: Point[] = [];
	for (const [i, node] of nodes.entries()) {
		if (node.links.length !== 2) {
			if (node.junction || node.links.length > 2) supports.push(node.point);
			if (node.links.length > 2) {
				hubs.push(node.point);
				const approaches = node.links.map(link => {
					const other = nodes[links[link][0] === i ? links[link][1] : links[link][0]].point;
					const dx = other[0] - node.point[0];
					const dz = other[1] - node.point[1];
					const length = Math.hypot(dx, dz);
					const distance = Math.min(0.7, length * 0.4);
					const point: Point = [node.point[0] + dx * distance / length, node.point[1] + dz * distance / length];
					trim.set(`${i},${link}`, point);
					return point;
				});
				for (let a = 0; a < approaches.length; a++) {
					// Every pair of approaches gets its own tagged curve for route continuity.
					for (let b = a + 1; b < approaches.length; b++) {
						bends.push({ center: node.point, a: approaches[a], b: approaches[b], interchange: bends.length });
					}
				}
			}
			continue;
		}
		const neighbors = node.links.map(link => nodes[links[link][0] === i ? links[link][1] : links[link][0]].point);
		const vectors = neighbors.map(p => [p[0] - node.point[0], p[1] - node.point[1]] as Point);
		const lengths = vectors.map(v => Math.hypot(...v));
		const cosine = (vectors[0][0] * vectors[1][0] + vectors[0][1] * vectors[1][1]) / (lengths[0] * lengths[1]);
		if (cosine < -0.999 || cosine > 0.999) continue;
		const radius = Math.min(0.3, lengths[0] * 0.4, lengths[1] * 0.4);
		const points = vectors.map((v, j) => [
			node.point[0] + v[0] * radius / lengths[j],
			node.point[1] + v[1] * radius / lengths[j],
		] as Point);
		node.links.forEach((link, j) => trim.set(`${i},${link}`, points[j]));
		bends.push({ center: node.point, a: points[0], b: points[1] });
		supports.push(node.point);
	}
	const spans: RailSpan[] = [];
	const addSpan = (a: Point, b: Point, interchange?: number) => {
		const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
		if (len < 1e-5) return;
		spans.push({ a, b, len, ux: (b[0] - a[0]) / len, uz: (b[1] - a[1]) / len, interchange });
	};
	links.forEach(([a, b], i) => {
		if (a >= 0) addSpan(trim.get(`${a},${i}`) ?? nodes[a].point, trim.get(`${b},${i}`) ?? nodes[b].point);
	});
	for (const bend of bends) {
		// Approximate the quadratic Bezier with short straight spans for rendering and routing.
		let previous = bend.a;
		for (let i = 1; i <= 5; i++) {
			const t = i / 5;
			const s = 1 - t;
			const point: Point = [
				s * s * bend.a[0] + 2 * s * t * bend.center[0] + t * t * bend.b[0],
				s * s * bend.a[1] + 2 * s * t * bend.center[1] + t * t * bend.b[1],
			];
			addSpan(previous, point, bend.interchange);
			previous = point;
		}
	}
	return { spans, supports, hubs };
}
