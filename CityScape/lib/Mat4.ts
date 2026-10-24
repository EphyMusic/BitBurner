export type Vec3 = [number, number, number];
export type Mat4 = Float32Array;

export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
	a[1] * b[2] - a[2] * b[1],
	a[2] * b[0] - a[0] * b[2],
	a[0] * b[1] - a[1] * b[0],
];
export function normalize(a: Vec3): Vec3 {
	const l = Math.hypot(a[0], a[1], a[2]) || 1;
	return [a[0] / l, a[1] / l, a[2] / l];
}

export function perspective(fovy: number, aspect: number, near: number, far: number): Mat4 {
	const f = 1 / Math.tan(fovy / 2);
	const nf = 1 / (near - far);
	const o = new Float32Array(16);
	o[0] = f / aspect;
	o[5] = f;
	o[10] = (far + near) * nf;
	o[11] = -1;
	o[14] = 2 * far * near * nf;
	return o;
}

export function lookAt(eye: Vec3, center: Vec3, up: Vec3): Mat4 {
	const z = normalize(sub(eye, center));
	const x = normalize(cross(up, z));
	const y = cross(z, x);
	const o = new Float32Array(16);
	o[0] = x[0]; o[1] = y[0]; o[2] = z[0];
	o[4] = x[1]; o[5] = y[1]; o[6] = z[1];
	o[8] = x[2]; o[9] = y[2]; o[10] = z[2];
	o[12] = -dot(x, eye); o[13] = -dot(y, eye); o[14] = -dot(z, eye);
	o[15] = 1;
	return o;
}

/** Projects a world point to normalized device coordinates; null if behind the camera. */
export function project(m: Mat4, p: Vec3): [number, number] | null {
	const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
	if (w <= 1e-6) return null;
	return [
		(m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]) / w,
		(m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]) / w,
	];
}

/** Column-major a * b. */
export function multiply(a: Mat4, b: Mat4): Mat4 {
	const o = new Float32Array(16);
	for (let c = 0; c < 4; c++) {
		for (let r = 0; r < 4; r++) {
			let s = 0;
			for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
			o[c * 4 + r] = s;
		}
	}
	return o;
}
