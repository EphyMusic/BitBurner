/** World size of one map character. Monospace glyphs are taller than they are wide. */
export const CELL_W = 0.6;
export const CELL_D = 1;

export const cellX = (col: number): number => (col + 0.5) * CELL_W;
export const cellZ = (row: number): number => (row + 0.5) * CELL_D;

/** Rotates a local (x, z) offset by yaw. Matches the rotation used by MeshBuilder. */
export function rotate(lx: number, lz: number, yaw: number): [number, number] {
	const c = Math.cos(yaw);
	const s = Math.sin(yaw);
	return [lx * c + lz * s, -lx * s + lz * c];
}

/** Small deterministic PRNG so a city always generates the same filler. */
export function seededRandom(seed: string): () => number {
	let h = 1779033703 ^ seed.length;
	for (let i = 0; i < seed.length; i++) {
		h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
		h = (h << 13) | (h >>> 19);
	}
	let a = h >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
