import { rotate } from "./Grid";
import type { Vec3 } from "./Mat4";
import type { DrawRange } from "./MeshBuilder";
import type { Rgb } from "./Palette";

/** Screen-facing edge quads: position, opposite endpoint, color, side, and endpoint direction. */
export class EdgeBuilder {
	private data: number[] = [];

	get count(): number { return this.data.length / 11; }

	line(a: Vec3, b: Vec3, color: Rgb): void {
		// The shader expands these two triangles perpendicular to the projected line, in pixels.
		// Both endpoints carry the other endpoint and direction so their screen normals agree.
		const vertex = (p: Vec3, other: Vec3, side: number, direction: number) =>
			this.data.push(...p, ...other, ...color, side, direction);
		vertex(a, b, -1, 1); vertex(a, b, 1, 1); vertex(b, a, -1, -1);
		vertex(a, b, 1, 1); vertex(b, a, 1, -1); vertex(b, a, -1, -1);
	}

	box(cx: number, y: number, cz: number, w: number, h: number, d: number, color: Rgb, yaw = 0): void {
		const point = (x: number, z: number, top: boolean): Vec3 => {
			const [rx, rz] = rotate(x * w / 2, z * d / 2, yaw);
			return [cx + rx, y + (top ? h : 0), cz + rz];
		};
		const bottom = [point(-1, -1, false), point(1, -1, false), point(1, 1, false), point(-1, 1, false)];
		const top = [point(-1, -1, true), point(1, -1, true), point(1, 1, true), point(-1, 1, true)];
		for (let i = 0; i < 4; i++) {
			const next = (i + 1) % 4;
			this.line(bottom[i], bottom[next], color);
			this.line(top[i], top[next], color);
			this.line(bottom[i], top[i], color);
		}
	}

	pyramid(cx: number, y: number, cz: number, w: number, h: number, d: number, color: Rgb, yaw = 0): void {
		const corner = (x: number, z: number): Vec3 => {
			const [rx, rz] = rotate(x * w / 2, z * d / 2, yaw);
			return [cx + rx, y, cz + rz];
		};
		const corners = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
		const apex: Vec3 = [cx, y + h, cz];
		for (let i = 0; i < 4; i++) {
			this.line(corners[i], corners[(i + 1) % 4], color);
			this.line(corners[i], apex, color);
		}
	}

	/** Capture a vertex range after appending a logical group of edges. */
	range(first: number): DrawRange { return { first, count: this.count - first }; }
	build(): Float32Array { return new Float32Array(this.data); }
}
