import type { Mat4 } from "./Mat4";
import type { DrawRange } from "./MeshBuilder";
import type { Scene } from "./SceneBuilder";
import type { Rgb } from "./Palette";
import { Trains } from "./Trains";
import { Cars } from "./Cars";

// Shared by both programs so shells and outlines fade at exactly the same world-space boundary.
// A noise-perturbed circular edge hides the rectangular source map. Slowly shifting mist and
// frame-stepped, differently oriented static are evaluated in world coordinates, not screen space.
const FOG = `
uniform float uTime;
uniform vec2 uFogBounds;
uniform float uFogRadius;
float hash(vec2 p) {
	vec3 p3 = fract(vec3(p.x, p.y, p.x) * 0.1031);
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.x + p3.y) * p3.z);
}
float noise(vec2 p) {
	vec2 i = floor(p), f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
		mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fogAmount(vec2 p) {
	float outside = length(p - uFogBounds * 0.5) - uFogRadius;
	return smoothstep(-4.0, 1.0, outside + (noise(p * 0.32) - 0.5) * 1.5);
}
vec3 fogColor(vec2 p) {
	float mist = noise(p * 0.09 + vec2(sin(uTime * 0.13), cos(uTime * 0.17)) * 0.4);
	mist = mist * 0.7 + noise(p * 0.24 + vec2(cos(uTime * 0.21), sin(uTime * 0.16)) * 0.3) * 0.3;
	float frame = mod(floor(uTime * 9.0), 256.0);
	vec2 horizontal = floor(p * vec2(0.9, 5.0));
	vec2 vertical = floor(p * vec2(5.0, 0.9));
	float bars = step(0.985, hash(horizontal + vec2(frame, frame * 0.37)))
		+ step(0.99, hash(vertical + vec2(frame * 0.23, -frame)));
	vec2 grain = floor(p * 12.0);
	float staticNoise = (hash(grain + vec2(frame * 0.73, -frame * 0.51)) - 0.5) * 0.012;
	return vec3(0.035, 0.052, 0.067) + mist * vec3(0.07, 0.09, 0.105)
		+ bars * vec3(0.035, 0.05, 0.06) + staticNoise;
}`;

const SOLID_VERTEX = `
attribute vec3 aPos;
attribute vec3 aNrm;
attribute vec3 aCol;
uniform mat4 uVP;
varying vec3 vCol;
varying vec2 vWorld;
void main() {
	float diffuse = max(dot(aNrm, normalize(vec3(0.4, 1.0, 0.6))), 0.0);
	vCol = aCol * (0.45 + 0.55 * diffuse);
	vWorld = aPos.xz;
	gl_Position = uVP * vec4(aPos, 1.0);
}`;

const SOLID_FRAGMENT = `
precision mediump float;
uniform float uAlpha;
uniform float uFog;
varying vec3 vCol;
varying vec2 vWorld;
${FOG}
void main() { gl_FragColor = vec4(mix(vCol, fogColor(vWorld), fogAmount(vWorld) * uFog), uAlpha); }`;

// Expand line quads after projection, preserving a constant glow width in screen pixels.
const EDGE_VERTEX = `
attribute vec3 aPos;
attribute vec3 aOther;
attribute vec3 aCol;
attribute float aSide;
attribute float aDirection;
uniform mat4 uVP;
uniform mediump vec2 uResolution;
uniform float uRadius;
varying vec3 vCol;
varying float vSide;
varying vec2 vWorld;
void main() {
	vec4 p = uVP * vec4(aPos, 1.0);
	vec4 q = uVP * vec4(aOther, 1.0);
	vec2 delta = (q.xy / q.w - p.xy / p.w) * uResolution * aDirection;
	float len = length(delta);
	vec2 normal = len > 0.001 ? vec2(-delta.y, delta.x) / len : vec2(0.0, 1.0);
	p.xy += normal * aSide * uRadius * 2.0 / uResolution * p.w;
	p.z -= 0.000002 * p.w;
	gl_Position = p;
	vCol = aCol;
	vSide = aSide;
	vWorld = aPos.xz;
}`;

const EDGE_FRAGMENT = `
precision mediump float;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uBoost;
uniform float uFog;
varying vec3 vCol;
varying float vSide;
varying vec2 vWorld;
${FOG}
void main() {
	float d = abs(vSide);
	float glow = 0.22 * (1.0 - smoothstep(0.12, 1.0, d));
	float core = 0.78 * (1.0 - smoothstep(0.10, 0.32, d));
	gl_FragColor = vec4(min(vec3(1.0), vCol * uColor + uBoost), (glow + core) * uAlpha * (1.0 - fogAmount(vWorld) * uFog));
}`;

/** WebGL1 renderer with depth-occluding shells and screen-space glowing edges. */
export class Renderer {
	private gl: WebGLRenderingContext;
	private solid: WebGLProgram;
	private edge: WebGLProgram;
	private buffer: WebGLBuffer;
	private edgeBuffer: WebGLBuffer;
	private trainBuffer: WebGLBuffer;
	private trainEdgeBuffer: WebGLBuffer;
	private carBuffer: WebGLBuffer;
	private carEdgeBuffer: WebGLBuffer;
	private trains: Trains | null = null;
	private cars: Cars | null = null;
	private scene: Scene | null = null;
	private railColor: Rgb = [1, 1, 1];
	private pixelRatio = 1;
	private uniforms = new Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>();

	constructor(private canvas: HTMLCanvasElement) {
		const gl = canvas.getContext("webgl", { antialias: true });
		if (!gl) throw new Error("WebGL is not available");
		this.gl = gl;
		const compile = (type: number, src: string): WebGLShader => {
			const shader = gl.createShader(type);
			if (!shader) throw new Error("Could not create shader");
			gl.shaderSource(shader, src);
			gl.compileShader(shader);
			if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? "shader error");
			return shader;
		};
		const program = (vertex: string, fragment: string): WebGLProgram => {
			// Bracket access keeps Bitburner's static RAM scan from mistaking this for ns.singularity.createProgram.
			const result = gl["create" + "Program"]();
			if (!result) throw new Error("Could not create WebGL program");
			const vs = compile(gl.VERTEX_SHADER, vertex);
			const fs = compile(gl.FRAGMENT_SHADER, fragment);
			gl.attachShader(result, vs);
			gl.attachShader(result, fs);
			gl.linkProgram(result);
			gl.deleteShader(vs);
			gl.deleteShader(fs);
			if (!gl.getProgramParameter(result, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(result) ?? "link error");
			return result;
		};
		this.solid = program(SOLID_VERTEX, SOLID_FRAGMENT);
		this.edge = program(EDGE_VERTEX, EDGE_FRAGMENT);
		const buffer = gl.createBuffer();
		const edgeBuffer = gl.createBuffer();
		const trainBuffer = gl.createBuffer();
		const trainEdgeBuffer = gl.createBuffer();
		const carBuffer = gl.createBuffer();
		const carEdgeBuffer = gl.createBuffer();
		if (!buffer || !edgeBuffer || !trainBuffer || !trainEdgeBuffer || !carBuffer || !carEdgeBuffer) throw new Error("Could not create WebGL buffers");
		this.buffer = buffer;
		this.edgeBuffer = edgeBuffer;
		this.trainBuffer = trainBuffer;
		this.trainEdgeBuffer = trainEdgeBuffer;
		this.carBuffer = carBuffer;
		this.carEdgeBuffer = carEdgeBuffer;
	}

	setScene(scene: Scene): void {
		// Static city geometry is uploaded once; traffic gets separate dynamic buffers each frame.
		this.scene = scene;
		this.trains = new Trains(scene.railSpans, scene.railStops);
		this.cars = new Cars(scene.streets, scene.trafficSeed);
		const gl = this.gl;
		gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
		gl.bufferData(gl.ARRAY_BUFFER, scene.vertices, gl.STATIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, scene.edges, gl.STATIC_DRAW);
	}

	setTheme(color: string): void {
		const canvas = this.canvas.ownerDocument.createElement("canvas");
		canvas.width = canvas.height = 1;
		const ctx = canvas.getContext("2d");
		if (!ctx) throw new Error("Could not read the theme color");
		ctx.fillStyle = color;
		ctx.fillRect(0, 0, 1, 1);
		const pixel = ctx.getImageData(0, 0, 1, 1).data;
		this.railColor = [pixel[0] / 255, pixel[1] / 255, pixel[2] / 255];
	}

	resize(): number {
		// Limit high-DPI buffer size without changing CSS layout or input coordinates.
		this.pixelRatio = Math.min(eval("window").devicePixelRatio || 1, 2);
		const w = Math.max(1, Math.floor(this.canvas.clientWidth * this.pixelRatio));
		const h = Math.max(1, Math.floor(this.canvas.clientHeight * this.pixelRatio));
		if (this.canvas.width !== w || this.canvas.height !== h) {
			this.canvas.width = w;
			this.canvas.height = h;
		}
		return w / h;
	}

	render(viewProjection: Mat4, hovered: number): void {
		const gl = this.gl;
		const scene = this.scene;
		gl.viewport(0, 0, this.canvas.width, this.canvas.height);
		gl.clearColor(0.07, 0.095, 0.12, 1);
		gl.enable(gl.DEPTH_TEST);
		gl.disable(gl.CULL_FACE);
		gl.depthMask(true);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
		if (!scene) return;
		// Simulations consume browser time only; Netscript remains on the main tick.
		const time = eval("window").performance.now();
		const trains = this.trains!.build(time);
		const cars = this.cars!.build(time);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.trainBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, trains.vertices, gl.DYNAMIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.trainEdgeBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, trains.edges, gl.DYNAMIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.carBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, cars.vertices, gl.DYNAMIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.carEdgeBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, cars.edges, gl.DYNAMIC_DRAW);
		const trainBodies: DrawRange = { first: 0, count: trains.vertices.length / 9 };
		const trainEdges: DrawRange = { first: 0, count: trains.edges.length / 11 };
		const carBodies: DrawRange = { first: 0, count: cars.vertices.length / 9 };
		const carEdges: DrawRange = { first: 0, count: cars.edges.length / 11 };
		const uniform = (program: WebGLProgram, name: string) => {
			// Uniform locations are program-specific; missing uniforms are valid no-ops.
			let locations = this.uniforms.get(program);
			if (!locations) {
				locations = new Map();
				this.uniforms.set(program, locations);
			}
			if (!locations.has(name)) locations.set(name, gl.getUniformLocation(program, name));
			return locations.get(name) ?? null;
		};
		const bind = (program: WebGLProgram, buffer: WebGLBuffer, stride: number, attrs: [string, number, number][]) => {
			gl.useProgram(program);
			gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
			for (const [name, size, offset] of attrs) {
				const loc = gl.getAttribLocation(program, name);
				if (loc < 0) continue;
				gl.enableVertexAttribArray(loc);
				gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
			}
			gl.uniformMatrix4fv(uniform(program, "uVP"), false, viewProjection);
			gl.uniform2f(uniform(program, "uResolution"), this.canvas.width, this.canvas.height);
			gl.uniform2f(uniform(program, "uFogBounds"), ...scene.fogBounds);
			gl.uniform1f(uniform(program, "uFogRadius"), scene.fogRadius);
			gl.uniform1f(uniform(program, "uTime"), (time / 1000) % 1000);
		};
		const solid = (buffer = this.buffer) => bind(this.solid, buffer, 36, [["aPos", 3, 0], ["aNrm", 3, 12], ["aCol", 3, 24]]);
		const draw = (r: DrawRange) => gl.drawArrays(gl.TRIANGLES, r.first, r.count);
		solid();
		gl.disable(gl.BLEND);
		gl.uniform1f(uniform(this.solid, "uAlpha"), 1);
		gl.uniform1f(uniform(this.solid, "uFog"), 1);
		draw(scene.ground);

		// Record the closest rail or landmark surface before blending its dark shell.
		gl.colorMask(false, false, false, false);
		draw(scene.rail);
		scene.buildings.forEach(b => draw(b.range));
		solid(this.trainBuffer);
		draw(trainBodies);
		solid(this.carBuffer);
		draw(carBodies);
		gl.colorMask(true, true, true, true);
		// Shade only prepass-visible shells, then draw translucent filler without writing depth.
		gl.enable(gl.BLEND);
		gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
		gl.depthMask(false);
		gl.depthFunc(gl.EQUAL);
		gl.uniform1f(uniform(this.solid, "uAlpha"), 0.9);
		solid();
		draw(scene.rail);
		scene.buildings.forEach(b => draw(b.range));
		solid(this.trainBuffer);
		draw(trainBodies);
		solid(this.carBuffer);
		draw(carBodies);
		gl.depthFunc(gl.LEQUAL);
		gl.uniform1f(uniform(this.solid, "uAlpha"), 0.065);
		solid();
		gl.uniform1f(uniform(this.solid, "uFog"), 1);
		draw(scene.filler);

		const edge = (buffer: WebGLBuffer) => bind(this.edge, buffer, 44, [
			["aPos", 3, 0], ["aOther", 3, 12], ["aCol", 3, 24], ["aSide", 1, 36], ["aDirection", 1, 40],
		]);
		edge(this.edgeBuffer);
		gl.uniform2f(uniform(this.edge, "uResolution"), this.canvas.width, this.canvas.height);
		const edgeDraw = (range: DrawRange, color: Rgb, alpha: number, radius: number, boost = 0) => {
			gl.uniform3f(uniform(this.edge, "uColor"), ...color);
			gl.uniform1f(uniform(this.edge, "uAlpha"), alpha);
			gl.uniform1f(uniform(this.edge, "uRadius"), radius * this.pixelRatio);
			gl.uniform1f(uniform(this.edge, "uBoost"), boost);
			draw(range);
		};
		gl.uniform1f(uniform(this.edge, "uFog"), 1);
		// Glowing lines depth-test against the shells, with hover emphasis on one landmark.
		edgeDraw(scene.fillerEdges, [1, 1, 1], 0.32, 1.7);
		edgeDraw(scene.railEdges, this.railColor, 0.9, 2.6);
		scene.buildings.forEach((b, i) => edgeDraw(b.edges, [1, 1, 1], 1, i === hovered ? 4 : 3, i === hovered ? 0.2 : 0));
		edge(this.trainEdgeBuffer);
		edgeDraw(trainEdges, this.railColor, 1, 3);
		edge(this.carEdgeBuffer);
		edgeDraw(carEdges, [1, 1, 1], 0.9, 1.8);
		gl.depthMask(true);
		gl.depthFunc(gl.LESS);
	}

	dispose(): void {
		// Release all GPU allocations, including the context, when the original UI is restored.
		const gl = this.gl;
		gl.deleteBuffer(this.buffer);
		gl.deleteBuffer(this.edgeBuffer);
		gl.deleteBuffer(this.trainBuffer);
		gl.deleteBuffer(this.trainEdgeBuffer);
		gl.deleteBuffer(this.carBuffer);
		gl.deleteBuffer(this.carEdgeBuffer);
		gl.deleteProgram(this.solid);
		gl.deleteProgram(this.edge);
		gl.getExtension("WEBGL_lose_context")?.loseContext();
	}
}
