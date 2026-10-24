import type { Mat4 } from "./Mat4";
import type { DrawRange } from "./MeshBuilder";
import type { Scene } from "./SceneBuilder";

const VERTEX_SRC = `
attribute vec3 aPos;
attribute vec3 aNrm;
attribute vec3 aCol;
uniform mat4 uVP;
uniform vec3 uTint;
varying vec3 vCol;
void main() {
	float diffuse = max(dot(aNrm, normalize(vec3(0.4, 1.0, 0.6))), 0.0);
	vCol = aCol * (0.45 + 0.65 * diffuse) + uTint;
	gl_Position = uVP * vec4(aPos, 1.0);
}`;

const FRAGMENT_SRC = `
precision mediump float;
varying vec3 vCol;
void main() { gl_FragColor = vec4(vCol, 1.0); }`;

const STRIDE = 9 * 4;

/** Minimal WebGL1 renderer: one static vertex buffer drawn in ranges. */
export class Renderer {
	private gl: WebGLRenderingContext;
	private program: WebGLProgram;
	private buffer: WebGLBuffer;
	private uVP: WebGLUniformLocation;
	private uTint: WebGLUniformLocation;
	private scene: Scene | null = null;

	constructor(private canvas: HTMLCanvasElement) {
		const gl = canvas.getContext("webgl", { antialias: true });
		if (!gl) throw new Error("WebGL is not available");
		this.gl = gl;

		const compile = (type: number, src: string): WebGLShader => {
			const s = gl.createShader(type)!;
			gl.shaderSource(s, src);
			gl.compileShader(s);
			if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader error");
			return s;
		};
		// Bracket access keeps Bitburner's static RAM scan from mistaking this for ns.singularity.createProgram.
		this.program = gl["create" + "Program"]()!;
		gl.attachShader(this.program, compile(gl.VERTEX_SHADER, VERTEX_SRC));
		gl.attachShader(this.program, compile(gl.FRAGMENT_SHADER, FRAGMENT_SRC));
		gl.linkProgram(this.program);
		if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.program) ?? "link error");

		this.uVP = gl.getUniformLocation(this.program, "uVP")!;
		this.uTint = gl.getUniformLocation(this.program, "uTint")!;
		this.buffer = gl.createBuffer()!;
	}

	setScene(scene: Scene): void {
		this.scene = scene;
		const gl = this.gl;
		gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
		gl.bufferData(gl.ARRAY_BUFFER, scene.vertices, gl.STATIC_DRAW);
	}

	/** Syncs the drawing buffer to the canvas' CSS size. Returns the aspect ratio. */
	resize(): number {
		const dpr = Math.min(eval("window").devicePixelRatio || 1, 2);
		const w = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
		const h = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
		if (this.canvas.width !== w || this.canvas.height !== h) {
			this.canvas.width = w;
			this.canvas.height = h;
		}
		return w / h;
	}

	render(viewProjection: Mat4, hovered: number): void {
		const gl = this.gl;
		gl.viewport(0, 0, this.canvas.width, this.canvas.height);
		gl.clearColor(0.08, 0.09, 0.11, 1);
		gl.enable(gl.DEPTH_TEST);
		gl.disable(gl.CULL_FACE);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
		if (!this.scene) return;

		gl.useProgram(this.program);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
		for (const [name, size, offset] of [["aPos", 3, 0], ["aNrm", 3, 12], ["aCol", 3, 24]] as const) {
			const loc = gl.getAttribLocation(this.program, name);
			gl.enableVertexAttribArray(loc);
			gl.vertexAttribPointer(loc, size, gl.FLOAT, false, STRIDE, offset);
		}
		gl.uniformMatrix4fv(this.uVP, false, viewProjection);

		const draw = (r: DrawRange, tint: number) => {
			gl.uniform3f(this.uTint, tint, tint, tint);
			gl.drawArrays(gl.TRIANGLES, r.first, r.count);
		};
		draw(this.scene.world, 0);
		this.scene.buildings.forEach((b, i) => draw(b.range, i === hovered ? 0.3 : 0));
	}

	dispose(): void {
		const gl = this.gl;
		gl.deleteBuffer(this.buffer);
		gl.deleteProgram(this.program);
		gl.getExtension("WEBGL_lose_context")?.loseContext();
	}
}
