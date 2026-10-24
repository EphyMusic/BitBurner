import type { Mat4, Vec3 } from "./Mat4";
import { rotate } from "./Grid";
import { add, cross, lookAt, multiply, normalize, perspective, scale, sub } from "./Mat4";

const FOV = Math.PI / 4;

/** Orbit camera around a ground-level target. */
export class Camera {
	target: Vec3 = [0, 0, 0];
	yaw = 0.6;
	pitch = 0.95;
	distance = 30;
	private homeTarget: Vec3 = [0, 0, 0];
	private homeDistance = 30;

	frame(center: Vec3, radius: number): void {
		this.target = [...center];
		this.homeTarget = [...center];
		this.distance = this.homeDistance = Math.max(radius * 2.4, 6);
		this.yaw = 0.6;
		this.pitch = 0.95;
	}

	reset(): void {
		this.target = [...this.homeTarget];
		this.distance = this.homeDistance;
		this.yaw = 0.6;
		this.pitch = 0.95;
	}

	orbit(dx: number, dy: number): void {
		this.yaw -= dx * 0.008;
		this.pitch = Math.min(1.5, Math.max(0.15, this.pitch + dy * 0.008));
	}

	pan(dx: number, dy: number): void {
		const { right } = this.basis();
		const flat = normalize([-Math.sin(this.yaw), 0, -Math.cos(this.yaw)]);
		const k = this.distance * 0.0018;
		this.target = add(this.target, add(scale(right, -dx * k), scale(flat, dy * k)));
	}

	zoom(delta: number): void {
		this.distance = Math.min(this.homeDistance * 3, Math.max(3, this.distance * Math.exp(delta * 0.001)));
	}

	get eye(): Vec3 {
		const c = Math.cos(this.pitch);
		return add(this.target, [
			this.distance * c * Math.sin(this.yaw),
			this.distance * Math.sin(this.pitch),
			this.distance * c * Math.cos(this.yaw),
		]);
	}

	viewProjection(aspect: number): Mat4 {
		const proj = perspective(FOV, aspect, 0.1, this.distance * 6 + 100);
		return multiply(proj, lookAt(this.eye, this.target, [0, 1, 0]));
	}

	/** World-space ray through a point in normalized device coordinates (-1..1). */
	ray(ndcX: number, ndcY: number, aspect: number): { origin: Vec3; dir: Vec3 } {
		const { forward, right, up } = this.basis();
		const t = Math.tan(FOV / 2);
		const dir = normalize(add(forward, add(scale(right, ndcX * t * aspect), scale(up, ndcY * t))));
		return { origin: this.eye, dir };
	}

	private basis(): { forward: Vec3; right: Vec3; up: Vec3 } {
		const forward = normalize(sub(this.target, this.eye));
		const right = normalize(cross(forward, [0, 1, 0]));
		const up = cross(right, forward);
		return { forward, right, up };
	}
}

/** Ray vs. a yaw-rotated box; min/max are relative to center. Returns the hit distance or null. */
export function rayOrientedBox(origin: Vec3, dir: Vec3, center: Vec3, yaw: number, min: Vec3, max: Vec3): number | null {
	const [ox, oz] = rotate(origin[0] - center[0], origin[2] - center[2], -yaw);
	const [dx, dz] = rotate(dir[0], dir[2], -yaw);
	return rayBox([ox, origin[1], oz], [dx, dir[1], dz], min, max);
}

/** Slab test. Returns the hit distance or null. */
export function rayBox(origin: Vec3, dir: Vec3, min: Vec3, max: Vec3): number | null {
	let tMin = 0;
	let tMax = Infinity;
	for (let i = 0; i < 3; i++) {
		if (Math.abs(dir[i]) < 1e-9) {
			if (origin[i] < min[i] || origin[i] > max[i]) return null;
			continue;
		}
		let t1 = (min[i] - origin[i]) / dir[i];
		let t2 = (max[i] - origin[i]) / dir[i];
		if (t1 > t2) [t1, t2] = [t2, t1];
		tMin = Math.max(tMin, t1);
		tMax = Math.min(tMax, t2);
		if (tMin > tMax) return null;
	}
	return tMin;
}
