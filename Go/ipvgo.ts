// Types
type Point = [number, number];

type Chain = {
	color: "X" | "O";
	stones: Point[];
	liberties: Set<number>;
	secureEyes: Set<number>;
};

type MoveChoice = {
	point: Point;
	score: number;
	tiedBestMoves: number;
	capturedStones: number;
	opponentReply: Point | null;
	evaluationAfterOpponentReply: number;
};

type SimulatedMove = {
	board: string[][];
	analysis: ReturnType<typeof analyze>;
	captured: number;
};

//Buffer class
class Buffer {
	log:string[] = []
	limit:number = 10
	persistent:string[] = []
	constructor(limit:number = 10) {
		this.limit = limit;
		this.log = Array(this.limit).fill("");
	}

	printout() {
		const output = [this.persistent.join("\n")];
		output.push(this.log.join("\n"));

		return output.join("\n\n");
	}

	trimLog() {
		if (this.log.length > this.limit) {
			this.log = this.log.slice(this.log.length - this.limit);
		}
	}

	alterPersistent(data:string[]) {
		this.persistent = data;
	}

	newEntry(entry:string) {
		this.log.push(entry);
		this.trimLog();
	}
}

// Color util
export function colorize(text: string, r: number, g: number, b: number) {
    return `${rgbToAnsiFg(r, g, b)}${text}${ANSI.reset}`;
}

function infoText(text: string): string {
	return colorize(text, 0, 100, 255);
}

function persistentText(text: string): string {
	return colorize(text, 255, 255, 0);
}

function winText(text: string): string {
	return colorize(text, 0, 255, 100);
}

function lossText(text: string): string {
	return colorize(text, 255, 50, 75);
}

export function colorizeBg(text: string, bgR: number, bgG: number, bgB: number, fgR: number = 255, fgG: number = 255, fgB: number = 255) {
    return `${rgbToAnsiBg(bgR, bgG, bgB)}${rgbToAnsiFg(fgR, fgG, fgB)}${text}${ANSI.reset}`;
}

export function tag(text: string, bgR: number, bgG: number, bgB: number, fgR: number = 0, fgG: number = 0, fgB: number = 0) {
    return colorizeBg(` ${text} `, bgR, bgG, bgB, fgR, fgG, fgB);
}

const ANSI = {
    reset: "\x1b[0m",
    fgRgb: (r: number, g: number, b: number) => `\x1b[38;2;${r};${g};${b}m`,
    bgRgb: (r: number, g: number, b: number) => `\x1b[48;2;${r};${g};${b}m`,
};

function clampByte(n: number) {
    return Math.max(0, Math.min(255, Math.round(n)));
}

function rgbToAnsiFg(r: number, g: number, b: number) {
    return ANSI.fgRgb(clampByte(r), clampByte(g), clampByte(b));
}

function rgbToAnsiBg(r: number, g: number, b: number) {
    return ANSI.bgRgb(clampByte(r), clampByte(g), clampByte(b));
}

// Constants
const OPPONENTS = [
	"No AI",
	"Netburners",
	"Slum Snakes",
	"The Black Hand",
	"Tetrads",
	"Daedalus",
	"Illuminati",
	"????????????",
] as const;

const buffer = new Buffer();
const BOARD_SIZES = [5, 7, 9, 13] as const;
const LOG_FILE = "Go/log/log.txt";
const MAX_LOG_CHARS = 2_000_000;
const KEEP_LOG_CHARS = 500_000;
const LIMIT_RUNS = false;

// All functions
export async function main(ns: NS): Promise<void> {
	ns.ui.setTailTitle("IPvGO - Init")
	ns.ui.openTail();
	ns.disableLog("ALL");
	ns.clearLog();
	// const opponentArg = ns.args[0] ?? "Netburners";
	const opponentArg = await ns.prompt("Select an opponent:", { type: "select", choices: OPPONENTS.map(String) })
	if (typeof opponentArg !== "string" || !OPPONENTS.includes(opponentArg as (typeof OPPONENTS)[number])) {
		throw new Error(`Unknown IPvGO opponent: ${String(opponentArg)}`);
	}
	const opponent = opponentArg as GoOpponent;

	const sizeArg = Number(await ns.prompt("Select a board size:", { type: "select", choices: BOARD_SIZES.map(String) }));
	if (!BOARD_SIZES.includes(sizeArg as (typeof BOARD_SIZES)[number])) {
		throw new Error(`IPvGO board size must be one of ${BOARD_SIZES.join(", ")}.`);
	}
	const boardSize = sizeArg as (typeof BOARD_SIZES)[number];
	const log = createLogger(ns, new Date().toISOString());

	let wins = 0;
	let losses = 0;
	let draws = 0;
	let game = 0;

	buffer.newEntry(infoText(`[IPvGO] Playing ${opponent} on a ${boardSize}x${boardSize} board.`));
	buffer.newEntry(infoText(`[IPvGO] JSONL log: ${LOG_FILE}`));
	log({
		event: "session-start",
		opponent,
		boardSize,
		coordinateConvention: "(0,0) is bottom-left; board arrays are columns",
	});
	while (LIMIT_RUNS?game < 10:true) {
		ns.ui.setTailTitle(`IPvGO | ${opponent} R${game + 1} | ${wins} - ${losses} | S: ${ns.go.analysis.getStats()[opponent]?.winStreak}`);
		const initialBoard = ns.go.resetBoardState(opponent, boardSize);
		if (!initialBoard) {
			throw new Error("Could not reset the IPvGO board. Start an IPvGO subnet first.");
		}

		game++;
		let turn = 0;
		let result: Awaited<ReturnType<NS["go"]["passTurn"]>> | undefined;
		log({
			event: "game-start",
			game,
			opponent,
			boardSize,
			board: initialBoard,
			gameState: ns.go.getGameState(),
		});

		while (result?.type !== "gameOver") {
			const board = ns.go.getBoardState();
			const validMoves = ns.go.analysis.getValidMoves();
			const currentAnalysis = analyze(board.map((column) => column.split("")));
			const ownAtari = currentAnalysis.chains.filter((chain) => chain.color === "X" && chain.liberties.size === 1);
			const opponentAtari = currentAnalysis.chains.filter((chain) => chain.color === "O" && chain.liberties.size === 1);

			for (const chain of ownAtari) {
				const liberty = Array.from(chain.liberties)[0];
				buffer.newEntry(infoText(`[IPvGO] Defend ${chain.stones.length}-node chain; last liberty (${Math.floor(liberty / board.length)}, ${liberty % board.length}).`));
			}
			for (const chain of opponentAtari) {
				const liberty = Array.from(chain.liberties)[0];
				buffer.newEntry(infoText(`[IPvGO] Attack ${chain.stones.length}-node opponent chain; capture at (${Math.floor(liberty / board.length)}, ${liberty % board.length}).`));
			}

			const gameStateBefore = ns.go.getGameState();
			const move = chooseMove(board, validMoves, currentAnalysis, gameStateBefore.komi);
			turn++;
			const legalMoveCount = validMoves.reduce((count, column) => count + column.filter(Boolean).length, 0);
			log({
				event: "player-action",
				game,
				turn,
				player: "Black",
				action: move ? "move" : "pass",
				reason: move
					? null
					: legalMoveCount === 0
						? "no legal moves"
						: "no legal move passed the local rules simulation",
				x: move?.point[0] ?? null,
				y: move?.point[1] ?? null,
				moveScore: move?.score ?? null,
				tiedBestMoves: move?.tiedBestMoves ?? 0,
				predictedCapturedStones: move?.capturedStones ?? 0,
				opponentReply: move?.opponentReply ?? null,
				evaluationAfterOpponentReply: move?.evaluationAfterOpponentReply ?? null,
				komi: gameStateBefore.komi,
				legalMoveCount,
				boardBefore: board,
				nodesBefore: countOwnedNodes(board),
				gameStateBefore,
				lowLibertyChains: summarizeLowLibertyChains(currentAnalysis, board.length),
			});

			result = move
				? await ns.go.makeMove(move.point[0], move.point[1])
				: await ns.go.passTurn();

			let boardAfter = ns.go.getBoardState();
			let nodesAfter = countOwnedNodes(boardAfter);
			log({
				event: "opponent-response",
				game,
				turn,
				actor: result.type === "gameOver" ? "game" : "opponent",
				player: result.type === "gameOver" ? null : opponent,
				opponent,
				action: result.type,
				x: result.type === "move" ? result.x : null,
				y: result.type === "move" ? result.y : null,
				boardAfter,
				nodesAfter,
				gameStateAfter: ns.go.getGameState(),
			});

			const scoreAfterResponse = ns.go.getGameState();
			if (result.type === "pass" && scoreAfterResponse.blackScore > scoreAfterResponse.whiteScore) {
				buffer.newEntry(
					infoText(`[IPvGO] Passing to end the game: Black leads ${scoreAfterResponse.blackScore - scoreAfterResponse.whiteScore} after komi (${scoreAfterResponse.komi}).`),
				);
				turn++;
				log({
					event: "player-action",
					game,
					turn,
					player: "Black",
					action: "pass",
					reason: "opponent passed while Black leads after komi",
					scoreLead: scoreAfterResponse.blackScore - scoreAfterResponse.whiteScore,
					komi: scoreAfterResponse.komi,
					boardBefore: boardAfter,
					nodesBefore: nodesAfter,
					gameStateBefore: ns.go.getGameState(),
				});
				result = await ns.go.passTurn();
				boardAfter = ns.go.getBoardState();
				nodesAfter = countOwnedNodes(boardAfter);
				log({
					event: "opponent-response",
					game,
					turn,
					actor: result.type === "gameOver" ? "game" : "opponent",
					player: result.type === "gameOver" ? null : opponent,
					opponent,
					action: result.type,
					x: result.type === "move" ? result.x : null,
					y: result.type === "move" ? result.y : null,
					boardAfter,
					nodesAfter,
					gameStateAfter: ns.go.getGameState(),
				});
			}

			if (result.type === "gameOver") {
				const finalState = ns.go.getGameState();
				const finalBoard = ns.go.getBoardState();
				const finalNodes = countOwnedNodes(finalBoard);
				const scoreLeadAfterKomi = finalState.blackScore - finalState.whiteScore;
				const outcome = scoreLeadAfterKomi > 0 ? "win" : scoreLeadAfterKomi < 0 ? "loss" : "draw";
				const winner = outcome === "win" ? "Black" : outcome === "loss" ? "White" : "Neither";
				const resultLabel = outcome === "draw" ? "Draw" : `${winner} wins`;

				if (outcome === "win") wins++;
				else if (outcome === "loss") losses++;
				else draws++;

				buffer.newEntry(
					infoText(`[IPvGO] Game ${game} over: `) +
						(outcome === "win" ? winText(resultLabel) : outcome === "loss" ? lossText(resultLabel) : infoText(resultLabel)) +
						infoText(` ${finalState.blackScore}-${finalState.whiteScore} after ${finalState.komi} komi (lead ${scoreLeadAfterKomi}).`),
				);
				buffer.newEntry(
					infoText(`[IPvGO] Final nodes: Black ${finalNodes.x}, White ${finalNodes.o}; last move: ` +
						`${finalState.previousMove ? `(${finalState.previousMove[0]}, ${finalState.previousMove[1]})` : "pass or none"}.`),
				);
				log({
					event: "game-end",
					game,
					turn,
					opponent,
					outcome,
					winner,
					blackScore: finalState.blackScore,
					whiteScore: finalState.whiteScore,
					komi: finalState.komi,
					scoreLeadAfterKomi,
					previousMove: finalState.previousMove,
					board: finalBoard,
					nodes: finalNodes,
					record: { wins, losses, draws },
				});
			}

			const persist:string[] = [];
			const state = ns.go.getGameState();
			persist.push(persistentText(`Current Opponent: ${opponent}`));
			persist.push(persistentText(`Score: Black: ${state.blackScore}, White: ${state.whiteScore}`));
			persist.push(persistentText(`Komi: ${state.komi}; lead after komi: ${state.blackScore - state.whiteScore}`));
			const stats = ns.go.analysis.getStats();
			persist.push(persistentText(`Wins: ${wins}, Losses: ${losses}, Draws: ${draws}`));
			persist.push(persistentText(`Bonus: ${ns.format.number(stats[opponent]?.bonusPercent ?? 0, 2)}%`))
			persist.push(persistentText(`Win Streak: ${stats[opponent]?.winStreak ?? 0}`));
			buffer.alterPersistent(persist);
			display(ns);
			if (result.type !== "gameOver") await ns.sleep(100);
		}

		display(ns);
		await ns.sleep(10);
	}
}

function display(ns:NS): void {
	ns.clearLog();
	ns.print(buffer.printout());
	ns.ui.renderTail();

}

function countOwnedNodes(board: string[]): { x: number; o: number } {
	const size = board.length;
	let xNodes = 0;
	let oNodes = 0;
	const seen = new Set<number>();

	for (let x = 0; x < size; x++) {
		for (let y = 0; y < size; y++) {
			if (board[x][y] === "X") xNodes++;
			else if (board[x][y] === "O") oNodes++;
			else if (board[x][y] === "." && !seen.has(x * size + y)) {
				let touchesX = false;
				let touchesO = false;
				const region: Point[] = [];
				const pending: Point[] = [[x, y]];
				seen.add(x * size + y);

				while (pending.length > 0) {
					const [cx, cy] = pending.pop()!;
					region.push([cx, cy]);
					for (const [nx, ny] of neighbors(cx, cy, size)) {
						if (board[nx][ny] === "X") touchesX = true;
						else if (board[nx][ny] === "O") touchesO = true;
						else if (board[nx][ny] === "." && !seen.has(nx * size + ny)) {
							seen.add(nx * size + ny);
							pending.push([nx, ny]);
						}
					}
				}

				if (touchesX && !touchesO) xNodes += region.length;
				else if (touchesO && !touchesX) oNodes += region.length;
			}
		}
	}

	return { x: xNodes, o: oNodes };
}

function chooseMove(
	board: string[],
	validMoves: boolean[][],
	currentAnalysis: ReturnType<typeof analyze>,
	komi: number,
): MoveChoice | null {
	const size = board.length;
	const position = board.map((column) => column.split(""));
	const currentBoardKey = boardKey(position);
	const currentScore = evaluate(position, currentAnalysis, komi);
	let bestScore = -Infinity;
	let bestMoves: MoveChoice[] = [];

	for (let x = 0; x < size; x++) {
		for (let y = 0; y < size; y++) {
			if (!validMoves[x]?.[y]) continue;

			const afterPlayer = simulateMove(position, x, y, "X", currentBoardKey);
			if (!afterPlayer) continue;

			const playerAnalysis = afterPlayer.analysis;
			const worstReply = findWorstOpponentReply(afterPlayer.board, playerAnalysis, currentBoardKey, komi);
			const score = worstReply.score - currentScore;
			const choice: MoveChoice = {
				point: [x, y],
				score,
				tiedBestMoves: 1,
				capturedStones: afterPlayer.captured,
				opponentReply: worstReply.point,
				evaluationAfterOpponentReply: worstReply.score,
			};

			if (score > bestScore + 0.001) {
				bestScore = score;
				bestMoves = [choice];
			} else if (Math.abs(score - bestScore) <= 0.001) {
				bestMoves.push(choice);
			}
		}
	}

	if (bestMoves.length === 0) return null;
	const chosen = bestMoves[Math.floor(Math.random() * bestMoves.length)];
	return { ...chosen, tiedBestMoves: bestMoves.length };
}

function findWorstOpponentReply(
	board: string[][],
	analysis: ReturnType<typeof analyze>,
	forbiddenBoardKey: string,
	komi: number,
): { score: number; point: Point | null } {
	const size = board.length;
	let worstScore = evaluate(board, analysis, komi);
	let worstPoint: Point | null = null;

	for (let x = 0; x < size; x++) {
		for (let y = 0; y < size; y++) {
			const response = simulateMove(board, x, y, "O", forbiddenBoardKey);
			if (!response) continue;
			const score = evaluate(response.board, response.analysis, komi);
			if (score < worstScore) {
				worstScore = score;
				worstPoint = [x, y];
			}
		}
	}

	return { score: worstScore, point: worstPoint };
}

function simulateMove(
	board: string[][],
	x: number,
	y: number,
	color: "X" | "O",
	forbiddenBoardKey: string,
): SimulatedMove | null {
	const size = board.length;
	if (board[x]?.[y] !== ".") return null;

	const next = board.map((column) => [...column]);
	next[x][y] = color;
	const opponent = color === "X" ? "O" : "X";
	const placedAnalysis = analyze(next);
	const capturedChains = new Set<number>();
	for (const [nx, ny] of neighbors(x, y, size)) {
		if (next[nx][ny] !== opponent) continue;
		const chainId = placedAnalysis.chainAt[nx][ny];
		if (placedAnalysis.chains[chainId].liberties.size === 0) capturedChains.add(chainId);
	}

	let captured = 0;
	for (const chainId of capturedChains) {
		for (const [cx, cy] of placedAnalysis.chains[chainId].stones) {
			next[cx][cy] = ".";
			captured++;
		}
	}

	const nextAnalysis = captured === 0 ? placedAnalysis : analyze(next);
	const ownChainId = nextAnalysis.chainAt[x][y];
	if (ownChainId < 0 || nextAnalysis.chains[ownChainId].liberties.size === 0) return null;
	if (boardKey(next) === forbiddenBoardKey) return null;
	return { board: next, analysis: nextAnalysis, captured };
}

function boardKey(board: string[][]): string {
	return board.map((column) => column.join("")).join("|");
}

function createLogger(ns: NS, runId: string): (entry: Record<string, unknown>) => void {
	let logLength = ns.read(LOG_FILE).length;

	return (entry) => {
		const serialized = JSON.stringify({
			timestamp: new Date().toISOString(),
			runId,
			...entry,
		});
		if (serialized === undefined) throw new Error("Could not serialize IPvGO log event.");

		const line = `${serialized}\n`;
		if (logLength + line.length > MAX_LOG_CHARS) {
			const existing = ns.read(LOG_FILE);
			const cutoff = Math.max(0, existing.length - KEEP_LOG_CHARS);
			const nextLine = existing.indexOf("\n", cutoff);
			const retained = nextLine < 0 ? "" : existing.slice(nextLine + 1);
			const retainedWithNewline = retained && !retained.endsWith("\n") ? `${retained}\n` : retained;
			const marker = `${JSON.stringify({
				timestamp: new Date().toISOString(),
				runId,
				event: "log-truncated",
				retainedChars: retained.length,
			})}\n`;
			ns.write(LOG_FILE, `${retainedWithNewline}${marker}`, "w");
			logLength = retainedWithNewline.length + marker.length;
		}

		ns.write(LOG_FILE, line, "a");
		logLength += line.length;
	};
}

function summarizeLowLibertyChains(
	analysis: ReturnType<typeof analyze>,
	size: number,
): Array<{ color: "X" | "O"; stones: Point[]; liberties: Point[]; secureEyes: number }> {
	return analysis.chains
		.filter((chain) => chain.liberties.size <= 2)
		.map((chain) => ({
			color: chain.color,
			stones: chain.stones,
			liberties: Array.from(chain.liberties, (point) => [Math.floor(point / size), point % size] as Point),
			secureEyes: chain.secureEyes.size,
		}));
}

function analyze(board: string[][]): { chains: Chain[]; chainAt: number[][] } {
	const size = board.length;
	const chains: Chain[] = [];
	const chainAt = Array.from({ length: size }, () => Array<number>(size).fill(-1));

	for (let x = 0; x < size; x++) {
		for (let y = 0; y < size; y++) {
			const color = board[x][y];
			if ((color !== "X" && color !== "O") || chainAt[x][y] !== -1) continue;

			const chainId = chains.length;
			const chain: Chain = { color, stones: [], liberties: new Set<number>(), secureEyes: new Set<number>() };
			const pending: Point[] = [[x, y]];
			chainAt[x][y] = chainId;

			while (pending.length > 0) {
				const [cx, cy] = pending.pop()!;
				chain.stones.push([cx, cy]);
				for (const [nx, ny] of neighbors(cx, cy, size)) {
					if (board[nx][ny] === ".") {
						chain.liberties.add(nx * size + ny);
					} else if (board[nx][ny] === color && chainAt[nx][ny] === -1) {
						chainAt[nx][ny] = chainId;
						pending.push([nx, ny]);
					}
				}
			}
			chains.push(chain);
		}
	}

	for (let x = 0; x < size; x++) {
		for (let y = 0; y < size; y++) {
			if (board[x][y] !== ".") continue;
			const adjacent = neighbors(x, y, size);
			const eyeColor = adjacent
				.map(([nx, ny]) => board[nx][ny])
				.find((color) => color === "X" || color === "O");
			if (!eyeColor || !adjacent.every(([nx, ny]) => board[nx][ny] === eyeColor || board[nx][ny] === "#")) continue;

			const pointId = x * size + y;
			const adjacentChains = new Set(
				adjacent
					.filter(([nx, ny]) => board[nx][ny] === eyeColor)
					.map(([nx, ny]) => chainAt[nx][ny]),
			);
			if (Array.from(adjacentChains).some((chainId) => chains[chainId].liberties.size <= 1)) continue;
			for (const chainId of adjacentChains) {
				chains[chainId].secureEyes.add(pointId);
			}
		}
	}

	return { chains, chainAt };
}

function evaluate(board: string[][], analysis: ReturnType<typeof analyze>, komi: number): number {
	const size = board.length;
	let score = 0;

	for (const chain of analysis.chains) {
		const sign = chain.color === "X" ? 1 : -1;
		const survivalFactor = chain.secureEyes.size >= 2
			? 1
			: chain.secureEyes.size === 1
				? 0.95
				: chain.liberties.size === 1
					? 0.5
					: chain.liberties.size === 2
						? 0.8
						: 1;
		score += sign * chain.stones.length * survivalFactor;
		score += sign * Math.sqrt(chain.stones.length) * Math.min(chain.liberties.size, 5) * 0.6;
		score += sign * Math.sqrt(chain.stones.length) * Math.min(chain.secureEyes.size, 2) * 1.25;
	}

	const seen = new Set<number>();
	for (let x = 0; x < size; x++) {
		for (let y = 0; y < size; y++) {
			if (board[x][y] !== ".") continue;
			const pointId = x * size + y;
			if (seen.has(pointId)) continue;

			let touchesX = false;
			let touchesO = false;
			const region: Point[] = [];
			const pending: Point[] = [[x, y]];
			seen.add(pointId);

			while (pending.length > 0) {
				const [cx, cy] = pending.pop()!;
				region.push([cx, cy]);
				for (const [nx, ny] of neighbors(cx, cy, size)) {
					if (board[nx][ny] === "X") touchesX = true;
					else if (board[nx][ny] === "O") touchesO = true;
					else if (board[nx][ny] === "." && !seen.has(nx * size + ny)) {
						seen.add(nx * size + ny);
						pending.push([nx, ny]);
					}
				}
			}

			if (touchesX !== touchesO) score += (touchesX ? 1 : -1) * region.length * 2;
		}
	}

	const xDistance = distancesTo(board, "X");
	const oDistance = distancesTo(board, "O");
	for (let x = 0; x < size; x++) {
		for (let y = 0; y < size; y++) {
			if (board[x][y] !== ".") continue;
			if (xDistance[x][y] < Infinity) score += 1 / (xDistance[x][y] + 1);
			if (oDistance[x][y] < Infinity) score -= 1 / (oDistance[x][y] + 1);
		}
	}

	return score - komi;
}

function distancesTo(board: string[][], color: "X" | "O"): number[][] {
	const size = board.length;
	const distance = Array.from({ length: size }, () => Array<number>(size).fill(Infinity));
	const pending: Point[] = [];

	for (let x = 0; x < size; x++) {
		for (let y = 0; y < size; y++) {
			if (board[x][y] === color) {
				distance[x][y] = 0;
				pending.push([x, y]);
			}
		}
	}

	for (let index = 0; index < pending.length; index++) {
		const [x, y] = pending[index];
		for (const [nx, ny] of neighbors(x, y, size)) {
			if (distance[nx][ny] !== Infinity) continue;
			distance[nx][ny] = distance[x][y] + 1;
			pending.push([nx, ny]);
		}
	}

	return distance;
}

function neighbors(x: number, y: number, size: number): Point[] {
	const points: Point[] = [];
	if (x > 0) points.push([x - 1, y]);
	if (x + 1 < size) points.push([x + 1, y]);
	if (y > 0) points.push([x, y - 1]);
	if (y + 1 < size) points.push([x, y + 1]);
	return points;
}
