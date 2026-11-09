import { seededRandom } from "./Grid";
import { EdgeBuilder } from "./EdgeBuilder";
import type { Street } from "./Layout";
import { MeshBuilder } from "./MeshBuilder";
import type { Rgb } from "./Palette";

type Point = [number, number];
interface Junction { point: Point; links: number[] }
interface Link { a: number; b: number; length: number }
// An arc packs a link index and direction: even travels a -> b, odd travels b -> a.
interface Car { arc: number; along: number; speed: number; color: Rgb }

const COLORS: Rgb[] = [[0.35, 0.8, 0.95], [0.95, 0.65, 0.3], [0.86, 0.4, 0.4], [0.72, 0.85, 0.72]];
const BODY: Rgb = [0.02, 0.025, 0.03];
const LANE_OFFSET = 0.075;

/** Lightweight decorative traffic using connected street segments, not a traffic simulation. */
export class Cars {
	private junctions: Junction[] = [];
	private links: Link[] = [];
	private cars: Car[] = [];
	private rng: () => number;
	private lastTime: number | null = null;

	constructor(streets: Street[], seed: string) {
		this.rng = seededRandom(`${seed}:traffic`);
		// Merge numerically equivalent street endpoints into a connected traffic graph.
		const lookup = new Map<string, number>();
		const node = (point: Point) => {
			const key = `${Math.round(point[0] * 10000)},${Math.round(point[1] * 10000)}`;
			const existing = lookup.get(key);
			if (existing !== undefined) return existing;
			const index = this.junctions.length;
			this.junctions.push({ point, links: [] });
			lookup.set(key, index);
			return index;
		};
		for (const street of streets) {
			const length = Math.hypot(street.b[0] - street.a[0], street.b[1] - street.a[1]);
			if (length < 0.18) continue;
			const a = node(street.a), b = node(street.b);
			if (a === b) continue;
			const index = this.links.length;
			this.links.push({ a, b, length });
			this.junctions[a].links.push(index);
			this.junctions[b].links.push(index);
		}
		// Longer networks get more cars; sampling without replacement spreads their initial positions.
		const count = Math.min(36, Math.floor(this.links.reduce((sum, link) => sum + link.length, 0) / 8));
		const available = this.links.map((link, index) => ({ index, length: link.length })).filter(link => link.length >= 0.5);
		for (let i = 0; i < count && available.length; i++) {
			const index = Math.floor(this.rng() * available.length);
			const link = available.splice(index, 1)[0];
			this.cars.push({ arc: link.index * 2 + (this.rng() < 0.5 ? 0 : 1), along: 0.2 + this.rng() * (link.length - 0.4),
				speed: 0.35 + this.rng() * 0.25, color: COLORS[Math.floor(this.rng() * COLORS.length)] });
		}
	}

	/** Advance the decorative cars and rebuild their small dynamic meshes for this frame. */
	build(time: number): { vertices: Float32Array; edges: Float32Array } {
		// Clamp long pauses so returning to the tab does not teleport cars through the network.
		const dt = this.lastTime === null ? 0 : Math.min(Math.max(0, time - this.lastTime), 100) / 1000;
		this.lastTime = time;
		const mesh = new MeshBuilder(), edges = new EdgeBuilder();
		for (const car of this.cars) {
			car.along += dt * car.speed;
			let link = this.links[car.arc >> 1];
			while (car.along >= link.length) {
				// Preserve overshoot across short links; reverse only when there is no other exit.
				car.along -= link.length;
				const at = car.arc % 2 === 0 ? link.b : link.a;
				const choices = this.junctions[at].links.filter(i => i !== (car.arc >> 1));
				const next = choices.length ? choices[Math.floor(this.rng() * choices.length)] : car.arc >> 1;
				link = this.links[next];
				car.arc = next * 2 + (link.a === at ? 0 : 1);
			}
			const a = this.junctions[car.arc % 2 === 0 ? link.a : link.b].point;
			const b = this.junctions[car.arc % 2 === 0 ? link.b : link.a].point;
			const ux = (b[0] - a[0]) / link.length, uz = (b[1] - a[1]) / link.length;
			// Offset relative to direction of travel, so opposing cars use opposite sides.
			const x = a[0] + ux * car.along - uz * LANE_OFFSET;
			const z = a[1] + uz * car.along + ux * LANE_OFFSET;
			const yaw = Math.atan2(-uz, ux);
			mesh.box(x, 0.012, z, 0.18, 0.055, 0.07, BODY, yaw);
			edges.box(x, 0.012, z, 0.18, 0.055, 0.07, car.color, yaw);
		}
		return { vertices: mesh.build(), edges: edges.build() };
	}
}
