import type { Vec3 } from "./Mat4";
import { cross, dot, normalize, sub } from "./Mat4";
import type { Rgb } from "./Palette";
import { rotate } from "./Grid";

export interface DrawRange {
	first: number;
	count: number;
}

/** Accumulates interleaved position(3) normal(3) color(3) triangles. */
export class MeshBuilder {
	private data: number[] = [];

	get count(): number { return this.data.length / 9; }

	tri(a: Vec3, b: Vec3, c: Vec3, color: Rgb, outward?: Vec3): void {
		let n = normalize(cross(sub(b, a), sub(c, a)));
		if (outward && dot(n, outward) < 0) n = [-n[0], -n[1], -n[2]];
		for (const p of [a, b, c]) this.data.push(...p, ...n, ...color);
	}

	quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, color: Rgb, outward?: Vec3): void {
		this.tri(a, b, c, color, outward);
		this.tri(a, c, d, color, outward);
	}

	/** Box sitting on y0, rotated by yaw around its own vertical axis. */
	box(cx: number, y0: number, cz: number, w: number, h: number, d: number, color: Rgb, yaw = 0): void {
		const p = (sx: number, sy: number, sz: number): Vec3 => {
			const [x, z] = rotate((sx - 0.5) * w, (sz - 0.5) * d, yaw);
			return [cx + x, y0 + sy * h, cz + z];
		};
		const center: Vec3 = [cx, y0 + h / 2, cz];
		const faces: Vec3[][] = [
			[p(0, 1, 0), p(0, 1, 1), p(1, 1, 1), p(1, 1, 0)],
			[p(1, 0, 0), p(1, 1, 0), p(1, 1, 1), p(1, 0, 1)],
			[p(0, 0, 0), p(0, 0, 1), p(0, 1, 1), p(0, 1, 0)],
			[p(0, 0, 1), p(1, 0, 1), p(1, 1, 1), p(0, 1, 1)],
			[p(0, 0, 0), p(0, 1, 0), p(1, 1, 0), p(1, 0, 0)],
		];
		for (const f of faces) this.quad(f[0], f[1], f[2], f[3], color, sub(f[0], center));
	}

	/** Square-based pyramid with its base on y0. */
	pyramid(cx: number, y0: number, cz: number, w: number, h: number, d: number, color: Rgb, yaw = 0): void {
		const corner = (sx: number, sz: number): Vec3 => {
			const [x, z] = rotate(sx * w / 2, sz * d / 2, yaw);
			return [cx + x, y0, cz + z];
		};
		const base = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
		const apex: Vec3 = [cx, y0 + h, cz];
		const center: Vec3 = [cx, y0 + h / 3, cz];
		for (let i = 0; i < 4; i++) {
			const p = base[i];
			const q = base[(i + 1) % 4];
			const mid: Vec3 = [(p[0] + q[0] + apex[0]) / 3, (p[1] + q[1] + apex[1]) / 3, (p[2] + q[2] + apex[2]) / 3];
			this.tri(p, q, apex, color, sub(mid, center));
		}
	}

	build(): Float32Array { return new Float32Array(this.data); }
}
