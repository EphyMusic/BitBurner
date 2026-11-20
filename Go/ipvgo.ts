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
	predictedBlackNodesAfterOpponentReply: number;
	predictedOwnLoss: number;
	spentSecureEye: boolean;
	blockingBonus: number;
	captureBonus: number;
	atariCaptureStones: number;
	atariDefenseStones: number;
	attackPlan: AttackPlan;
	wallDefensePlan: DefensePlan;
};

type AttackPlan = {
	chains: number;
	libertiesReduced: number;
	atariStones: number;
	bonus: number;
};

type DefensePlan = {
	chains: number;
	libertiesAdded: number;
	eyesAdded: number;
	bonus: number;
};

type MoveDecision = {
	move: MoveChoice | null;
	passReason: string | null;
};

type SimulatedMove = {
	board: string[][];
	analysis: ReturnType<typeof analyze>;
	captured: number;
};

//Buffer class
class Buffer {
	log:string[]
	limit:number
	persistent:string[] = []
	constructor(limit:number = 15) {
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
		this.log.push(...wrapAnsiText("-" + entry, 62));
		this.trimLog();
	}
}

function wrapAnsiText(text: string, width: number): string[] {
	const tokens: string[] = [];
	for (let index = 0; index < text.length;) {
		if (text.charCodeAt(index) === 0x1b && text[index + 1] === "[") {
			let end = index + 2;
			while (end < text.length) {
				const code = text.charCodeAt(end);
				end++;
				if (code >= 0x40 && code <= 0x7e) break;
			}
			if (end > index + 2 && text.charCodeAt(end - 1) >= 0x40 && text.charCodeAt(end - 1) <= 0x7e) {
				tokens.push(text.slice(index, end));
				index = end;
				continue;
			}
		}

		const codePoint = text.codePointAt(index)!;
		const character = String.fromCodePoint(codePoint);
		tokens.push(character);
		index += character.length;
	}

	const lines: string[] = [];
	let remaining = tokens;
	let activeAnsi: string[] = [];
	while (remaining.filter((token) => !isAnsiToken(token)).length > width) {
		let visibleCount = 0;
		let lastSpace = -1;
		let hardBreak = -1;
		for (let index = 0; index < remaining.length; index++) {
			const token = remaining[index];
			if (isAnsiToken(token)) continue;

			visibleCount++;
			if (token === " " && visibleCount <= width) lastSpace = index;
			if (visibleCount === width) hardBreak = index + 1;
			if (visibleCount > width) break;
		}

		const hasBreakSpace = lastSpace > 0;
		const breakIndex = hasBreakSpace ? lastSpace : hardBreak;
		if (breakIndex <= 0) break;
		lines.push(activeAnsi.join("") + remaining.slice(0, breakIndex).join(""));

		const consumed = breakIndex + (hasBreakSpace ? 1 : 0);
		for (const token of remaining.slice(0, consumed)) activeAnsi = updateActiveAnsi(activeAnsi, token);
		remaining = remaining.slice(consumed);
		while (remaining.length > 0 && (isAnsiToken(remaining[0]) || /^\s$/u.test(remaining[0]))) {
			activeAnsi = updateActiveAnsi(activeAnsi, remaining[0]);
			remaining = remaining.slice(1);
		}
	}

	lines.push(activeAnsi.join("") + remaining.join(""));
	return lines;
}

function isAnsiToken(token: string): boolean {
	return token.charCodeAt(0) === 0x1b;
}

function updateActiveAnsi(active: string[], token: string): string[] {
	if (!isAnsiToken(token) || !token.endsWith("m")) return active;
	const parameters = token.slice(2, -1);
	const codes = parameters.split(";");
	for (let index = 0; index < codes.length; index++) {
		const code = Number(codes[index]);
		if (code === 0) return [];
		if (code === 38 || code === 48) {
			index += Number(codes[index + 1]) === 2 ? 4 : Number(codes[index + 1]) === 5 ? 2 : 1;
		}
	}
	return [...active, token];
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
const BOARD_SIZES = [5, 7, 9, 13] as const;

const LOG_FILE = "Go/log/log.txt";
const MAX_LOG_CHARS = 2_000_000;
const KEEP_LOG_CHARS = 500_000;
const LIMIT_RUNS = false;
const RUN_LIMIT = 40;
const buffer = new Buffer();

// All functions
export async function main(ns: NS): Promise<void> {
	ns.ui.setTailTitle("IPvGO - Init");
	ns.ui.setTailFontSize(14);
	ns.ui.openTail();
	ns.disableLog("ALL");
	ns.clearLog();
	const opponentArg = ns.args[0] ?? await ns.prompt("Select an opponent:", { type: "select", choices: OPPONENTS.map(String) })
	if (opponentArg == "") {
		ns.print("No opponent selected. Exiting.");
		ns.exit();
	}
	if (typeof opponentArg !== "string" || !OPPONENTS.includes(opponentArg as (typeof OPPONENTS)[number])) {
		throw new Error(`Unknown IPvGO opponent: ${String(opponentArg)}`);
	}
	const opponent = opponentArg as GoOpponent;

	const sizeArg = Number(ns.args[1] ?? await ns.prompt("Select a board size:", { type: "select", choices: BOARD_SIZES.map(String) }));
	if (!BOARD_SIZES.includes(sizeArg as (typeof BOARD_SIZES)[number])) {
		throw new Error(`IPvGO board size must be one of ${BOARD_SIZES.join(", ")}.`);
	}
	const boardSize = sizeArg as (typeof BOARD_SIZES)[number];
	// const territoryFirst = opponent !== "Netburners";
	const territoryFirst = true;
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
		strategy: territoryFirst ? "territory-first" : "baseline",
		coordinateConvention: "(0,0) is bottom-left; board arrays are columns",
	});
	while (LIMIT_RUNS?game < RUN_LIMIT:true) {
		ns.ui.setTailTitle(`IPvGO | ${opponent} R${game + 1}${LIMIT_RUNS ? `/${RUN_LIMIT}` : ""} | ${wins} - ${losses} | S: ${ns.go.analysis.getStats()[opponent]?.winStreak ?? 0}`);
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
			strategy: territoryFirst ? "territory-first" : "baseline",
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
				const [x, y] = [Math.floor(liberty / board.length), liberty % board.length];
				buffer.newEntry(infoText(
					`[IPvGO] Own atari threat: ${chain.stones.length}-node chain; defense point (${x}, ${y})${validMoves[x]?.[y] ? "" : " is not currently legal"}.`,
				));
			}
			for (const chain of opponentAtari) {
				const liberty = Array.from(chain.liberties)[0];
				const [x, y] = [Math.floor(liberty / board.length), liberty % board.length];
				buffer.newEntry(infoText(
					`[IPvGO] Opponent atari opportunity: capture ${chain.stones.length}-node chain at (${x}, ${y})${validMoves[x]?.[y] ? "" : " is not currently legal"}.`,
				));
			}

			const gameStateBefore = ns.go.getGameState();
			const decision = chooseMove(board, validMoves, currentAnalysis, gameStateBefore.komi, territoryFirst, result?.type === "pass");
			const move = decision.move;
			const moveIntent = move
				? describeMoveIntent(move, ownAtari, opponentAtari, validMoves, board.length)
				: decision.passReason;
			if (move) {
				buffer.newEntry(infoText(
					`[IPvGO] Chose (${move.point[0]}, ${move.point[1]}): ${moveIntent}.`,
				));
			} else {
				buffer.newEntry(infoText(`[IPvGO] Passing: ${moveIntent}.`));
			}
			turn++;
			const legalMoveCount = validMoves.reduce((count, column) => count + column.filter(Boolean).length, 0);
			log({
				event: "player-action",
				game,
				turn,
				player: "Black",
				action: move ? "move" : "pass",
				reason: decision.passReason,
				intent: moveIntent,
				x: move?.point[0] ?? null,
				y: move?.point[1] ?? null,
				moveScore: move?.score ?? null,
				tiedBestMoves: move?.tiedBestMoves ?? 0,
				predictedCapturedStones: move?.capturedStones ?? 0,
				opponentReply: move?.opponentReply ?? null,
				evaluationAfterOpponentReply: move?.evaluationAfterOpponentReply ?? null,
				predictedBlackNodesAfterOpponentReply: move?.predictedBlackNodesAfterOpponentReply ?? null,
				predictedOwnLoss: move?.predictedOwnLoss ?? null,
				spentSecureEye: move?.spentSecureEye ?? false,
				blockingBonus: move?.blockingBonus ?? 0,
				captureBonus: move?.captureBonus ?? 0,
				atariCaptureStones: move?.atariCaptureStones ?? 0,
				atariDefenseStones: move?.atariDefenseStones ?? 0,
				attackPlan: move?.attackPlan ?? null,
				wallDefensePlan: move?.wallDefensePlan ?? null,
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
			let shouldPassAfterOpponentPass = false;
			if (result.type === "pass") {
				if (territoryFirst) {
					const postPassBoard = boardAfter.map((column) => column.split(""));
					const postPassAnalysis = analyze(postPassBoard);
					const postPassValidMoves = ns.go.analysis.getValidMoves();
					const hasCaptureMove = hasImmediateCapture(postPassAnalysis, postPassValidMoves, boardAfter.length);
					const followUpDecision = hasCaptureMove
						? null
						: chooseMove(boardAfter, postPassValidMoves, postPassAnalysis, scoreAfterResponse.komi, territoryFirst, true);
					const followUpMove = followUpDecision?.move ?? null;
					const blackNodes = countColorStones(postPassAnalysis, "X");
					const hasSafeScoringMove = followUpMove !== null
						&& followUpMove.score > 0
						&& !followUpMove.spentSecureEye
						&& followUpMove.predictedOwnLoss < Math.max(5, Math.ceil(blackNodes * 0.2));
					shouldPassAfterOpponentPass = !hasCaptureMove && !hasSafeScoringMove;
				} else {
					shouldPassAfterOpponentPass = scoreAfterResponse.blackScore > scoreAfterResponse.whiteScore;
				}
			}
			if (shouldPassAfterOpponentPass) {
				const scoreLead = scoreAfterResponse.blackScore - scoreAfterResponse.whiteScore;
				const passReason = territoryFirst
					? "opponent passed and no capture or safe scoring move is available"
					: "opponent passed while Black leads after komi";
				buffer.newEntry(
					infoText(territoryFirst
						? `[IPvGO] Passing after opponent pass; no safe scoring move is available (lead ${scoreLead} after komi).`
						: `[IPvGO] Passing to end the game: Black leads ${scoreLead} after komi (${scoreAfterResponse.komi}).`),
				);
				turn++;
				log({
					event: "player-action",
					game,
					turn,
					player: "Black",
					action: "pass",
					reason: passReason,
					scoreLead,
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
	territoryFirst: boolean,
	opponentPassed = false,
): MoveDecision {
	const size = board.length;
	const legalMoveCount = validMoves.reduce((count, column) => count + column.filter(Boolean).length, 0);
	if (legalMoveCount === 0) return { move: null, passReason: "no legal moves" };

	const position = board.map((column) => column.split(""));
	const currentScore = evaluate(position, currentAnalysis, komi, territoryFirst);
	const currentBlackNodes = countColorStones(currentAnalysis, "X");
	let bestScore = -Infinity;
	let bestMoves: MoveChoice[] = [];
	let candidateMoves: MoveChoice[] = [];

	for (let x = 0; x < size; x++) {
		for (let y = 0; y < size; y++) {
			if (!validMoves[x]?.[y]) continue;

			const afterPlayer = simulateMove(position, x, y, "X", position);
			if (!afterPlayer) continue;

			const playerAnalysis = afterPlayer.analysis;
			const worstReply = findWorstOpponentReply(
				afterPlayer.board,
				playerAnalysis,
				position,
				komi,
				territoryFirst,
				currentAnalysis,
			);
			const predictedOwnLoss = Math.max(0, countColorStones(playerAnalysis, "X") - worstReply.blackNodes);
			const pointId = x * size + y;
			const spentSecureEye = currentAnalysis.chains.some(
				(chain) => chain.color === "X" && chain.secureEyes.has(pointId),
			);
			const atariCaptureStones = currentAnalysis.chains
				.filter((chain) => chain.color === "O" && chain.liberties.size === 1 && chain.liberties.has(pointId))
				.filter((chain) => chain.stones.every(([sx, sy]) => afterPlayer.board[sx][sy] === "."))
				.reduce((count, chain) => count + chain.stones.length, 0);
			const atariDefenseStones = currentAnalysis.chains
				.filter((chain) => chain.color === "X" && chain.liberties.size === 1 && chain.liberties.has(pointId))
				.filter((chain) => chain.stones.every(([sx, sy]) => afterPlayer.board[sx][sy] === "X"))
				.reduce((count, chain) => count + chain.stones.length, 0);
			const blockingBonus = territoryFirst ? getBlockingMoveBonus(position, currentAnalysis, x, y) : 0;
			const captureBonus = atariCaptureStones * 2.5;
			const score = worstReply.score + worstReply.attackPlan.bonus + worstReply.wallDefensePlan.bonus
				+ captureBonus - currentScore + blockingBonus;
			const choice: MoveChoice = {
				point: [x, y],
				score,
				tiedBestMoves: 1,
				capturedStones: afterPlayer.captured,
				opponentReply: worstReply.point,
				evaluationAfterOpponentReply: worstReply.score,
				predictedBlackNodesAfterOpponentReply: worstReply.blackNodes,
				predictedOwnLoss,
				spentSecureEye,
				blockingBonus,
				captureBonus,
				atariCaptureStones,
				atariDefenseStones,
				attackPlan: worstReply.attackPlan,
				wallDefensePlan: worstReply.wallDefensePlan,
			};
			candidateMoves.push(choice);
		}
	}

	if (candidateMoves.length === 0) {
		return { move: null, passReason: "no legal move passed the local rules simulation" };
	}

	if (opponentPassed) {
		const captureMoves = candidateMoves.filter((choice) => choice.atariCaptureStones > 0);
		if (captureMoves.length > 0) candidateMoves = captureMoves;
	}

	if (
		territoryFirst
		&& candidateMoves.length === legalMoveCount
		&& candidateMoves.every((choice) => choice.spentSecureEye)
		&& !candidateMoves.some((choice) => choice.capturedStones > 0)
	) {
		return { move: null, passReason: "all legal moves spend a secure eye without capturing" };
	}

	if (territoryFirst) {
		const collapseThreshold = Math.max(5, Math.ceil(currentBlackNodes * 0.2));
		const saferMoves = candidateMoves.filter((choice) => choice.predictedOwnLoss < collapseThreshold);
		if (saferMoves.length > 0) {
			candidateMoves = saferMoves;
		} else {
			const leastPredictedLoss = Math.min(...candidateMoves.map((choice) => choice.predictedOwnLoss));
			candidateMoves = candidateMoves.filter((choice) => choice.predictedOwnLoss === leastPredictedLoss);
		}

		const eyePreservingMoves = candidateMoves.filter((choice) => !choice.spentSecureEye);
		if (eyePreservingMoves.length > 0) candidateMoves = eyePreservingMoves;
	}

	for (const choice of candidateMoves) {
		if (choice.score > bestScore + 0.001) {
			bestScore = choice.score;
			bestMoves = [choice];
		} else if (Math.abs(choice.score - bestScore) <= 0.001) {
			bestMoves.push(choice);
		}
	}

	if (bestMoves.length === 0) {
		return { move: null, passReason: "no legal move passed the local rules simulation" };
	}
	const chosen = bestMoves[Math.floor(Math.random() * bestMoves.length)];
	return { move: { ...chosen, tiedBestMoves: bestMoves.length }, passReason: null };
}

function findWorstOpponentReply(
	board: string[][],
	analysis: ReturnType<typeof analyze>,
	forbiddenBoard: string[][],
	komi: number,
	territoryFirst: boolean,
	initialAnalysis: ReturnType<typeof analyze>,
): {
	score: number;
	point: Point | null;
	blackNodes: number;
	board: string[][];
	analysis: ReturnType<typeof analyze>;
	attackPlan: AttackPlan;
	wallDefensePlan: DefensePlan;
} {
	const size = board.length;
	let worstScore = evaluate(board, analysis, komi, territoryFirst);
	let worstAttackPlan = territoryFirst
		? getPersistentAttackPlan(initialAnalysis, analysis, board, analysis)
		: emptyAttackPlan();
	let worstWallDefensePlan = getPersistentDefensePlan(initialAnalysis, analysis, analysis);
	let worstValue = worstScore + worstAttackPlan.bonus + worstWallDefensePlan.bonus;
	let worstPoint: Point | null = null;
	let worstBlackNodes = countColorStones(analysis, "X");
	let worstBoard = board;
	let worstAnalysis = analysis;

	for (let x = 0; x < size; x++) {
		for (let y = 0; y < size; y++) {
			const response = simulateMove(board, x, y, "O", forbiddenBoard);
			if (!response) continue;
			const score = evaluate(response.board, response.analysis, komi, territoryFirst);
			const attackPlan = territoryFirst
				? getPersistentAttackPlan(initialAnalysis, analysis, response.board, response.analysis)
				: emptyAttackPlan();
			const wallDefensePlan = getPersistentDefensePlan(initialAnalysis, analysis, response.analysis);
			const value = score + attackPlan.bonus + wallDefensePlan.bonus;
			if (value < worstValue) {
				worstScore = score;
				worstAttackPlan = attackPlan;
				worstWallDefensePlan = wallDefensePlan;
				worstValue = value;
				worstPoint = [x, y];
				worstBlackNodes = countColorStones(response.analysis, "X");
				worstBoard = response.board;
				worstAnalysis = response.analysis;
			}
		}
	}

	return {
		score: worstScore,
		point: worstPoint,
		blackNodes: worstBlackNodes,
		board: worstBoard,
		analysis: worstAnalysis,
		attackPlan: worstAttackPlan,
		wallDefensePlan: worstWallDefensePlan,
	};
}

function getPersistentDefensePlan(
	initialAnalysis: ReturnType<typeof analyze>,
	afterPlayerAnalysis: ReturnType<typeof analyze>,
	afterReplyAnalysis: ReturnType<typeof analyze>,
): DefensePlan {
	const plan: DefensePlan = { chains: 0, libertiesAdded: 0, eyesAdded: 0, bonus: 0 };
	const evaluatedChains = new Set<number>();

	for (const initialChain of initialAnalysis.chains) {
		if (initialChain.color !== "X" || initialChain.liberties.size > 3 || initialChain.secureEyes.size >= 2) continue;

		const playerChain = findSurvivingChain(initialChain, afterPlayerAnalysis);
		const replyChain = findSurvivingChain(initialChain, afterReplyAnalysis);
		if (!playerChain || !replyChain || evaluatedChains.has(replyChain.id)) continue;

		const libertiesAdded = Math.min(
			Math.max(0, playerChain.chain.liberties.size - initialChain.liberties.size),
			Math.max(0, replyChain.chain.liberties.size - initialChain.liberties.size),
		);
		const eyesAdded = Math.min(
			Math.max(0, playerChain.chain.secureEyes.size - initialChain.secureEyes.size),
			Math.max(0, replyChain.chain.secureEyes.size - initialChain.secureEyes.size),
		);
		if (libertiesAdded === 0 && eyesAdded === 0) continue;

		evaluatedChains.add(replyChain.id);
		plan.chains++;
		plan.libertiesAdded += libertiesAdded;
		plan.eyesAdded += eyesAdded;
		const sizeWeight = Math.min(Math.sqrt(initialChain.stones.length), 2);
		plan.bonus += libertiesAdded * (2 + sizeWeight * 0.5) + eyesAdded * (3 + sizeWeight);
		if (initialChain.secureEyes.size < 2 && replyChain.chain.secureEyes.size >= 2) {
			plan.bonus += 2 + sizeWeight;
		}
	}

	return plan;
}

function emptyAttackPlan(): AttackPlan {
	return { chains: 0, libertiesReduced: 0, atariStones: 0, bonus: 0 };
}

function getPersistentAttackPlan(
	initialAnalysis: ReturnType<typeof analyze>,
	afterPlayerAnalysis: ReturnType<typeof analyze>,
	boardAfterReply: string[][],
	analysisAfterReply: ReturnType<typeof analyze>,
): AttackPlan {
	const plan = emptyAttackPlan();
	const evaluatedChains = new Set<number>();

	for (const initialChain of initialAnalysis.chains) {
		if (initialChain.color !== "O" || initialChain.liberties.size < 2 || initialChain.liberties.size > 4) continue;
		if (initialChain.secureEyes.size >= 2) continue;

		const playerChain = findSurvivingChain(initialChain, afterPlayerAnalysis);
		if (!playerChain || playerChain.chain.liberties.size >= initialChain.liberties.size) continue;

		const replyChain = findSurvivingChain(initialChain, analysisAfterReply);
		if (!replyChain || replyChain.chain.liberties.size >= initialChain.liberties.size) continue;
		if (replyChain.chain.liberties.size > playerChain.chain.liberties.size) continue;
		if (evaluatedChains.has(replyChain.id)) continue;
		evaluatedChains.add(replyChain.id);

		const libertyReduction = initialChain.liberties.size - replyChain.chain.liberties.size;
		plan.chains++;
		plan.libertiesReduced += libertyReduction;
		plan.bonus += libertyReduction * (1.5 + Math.sqrt(initialChain.stones.length) * 0.5);

		if (replyChain.chain.liberties.size !== 1) continue;
		const liberty = Array.from(replyChain.chain.liberties)[0];
		plan.atariStones += replyChain.chain.stones.length;
		plan.bonus += 2 + replyChain.chain.stones.length * 0.75;
	}

	return plan;
}

function findSurvivingChain(
	originalChain: Chain,
	analysis: ReturnType<typeof analyze>,
): { id: number; chain: Chain } | null {
	for (const [x, y] of originalChain.stones) {
		const chainId = analysis.chainAt[x][y];
		if (chainId >= 0 && analysis.chains[chainId].color === originalChain.color) {
			return { id: chainId, chain: analysis.chains[chainId] };
		}
	}
	return null;
}

function countColorStones(analysis: ReturnType<typeof analyze>, color: "X" | "O"): number {
	return analysis.chains.reduce(
		(count, chain) => count + (chain.color === color ? chain.stones.length : 0),
		0,
	);
}

function hasImmediateCapture(
	analysis: ReturnType<typeof analyze>,
	validMoves: boolean[][],
	size: number,
): boolean {
	for (const chain of analysis.chains) {
		if (chain.color !== "O" || chain.liberties.size !== 1) continue;
		const liberty = Array.from(chain.liberties)[0];
		if (validMoves[Math.floor(liberty / size)]?.[liberty % size]) return true;
	}
	return false;
}

function describeMoveIntent(
	move: MoveChoice,
	ownAtari: Chain[],
	opponentAtari: Chain[],
	validMoves: boolean[][],
	size: number,
): string {
	const [x, y] = move.point;
	const missedCaptures = opponentAtari.filter((chain) => {
		const liberty = Array.from(chain.liberties)[0];
		const captureX = Math.floor(liberty / size);
		const captureY = liberty % size;
		return validMoves[captureX]?.[captureY] && (captureX !== x || captureY !== y);
	});
	const missedDefenses = ownAtari.filter((chain) => {
		const liberty = Array.from(chain.liberties)[0];
		const defenseX = Math.floor(liberty / size);
		const defenseY = liberty % size;
		return validMoves[defenseX]?.[defenseY] && (defenseX !== x || defenseY !== y);
	});
	const reasons: string[] = [];

	if (move.atariCaptureStones > 0) {
		reasons.push(`captures ${move.atariCaptureStones} stone${move.atariCaptureStones === 1 ? "" : "s"} from atari`);
	} else if (move.capturedStones > 0) {
		reasons.push(`captures ${move.capturedStones} stone${move.capturedStones === 1 ? "" : "s"}`);
	}
	if (move.atariDefenseStones > 0) {
		reasons.push(`defends ${move.atariDefenseStones} own stone${move.atariDefenseStones === 1 ? "" : "s"} in atari`);
	}
	if (move.attackPlan.chains > 0) {
		const atariDetail = move.attackPlan.atariStones > 0
			? `, ${move.attackPlan.atariStones} stone${move.attackPlan.atariStones === 1 ? "" : "s"} in atari with a legal follow-up capture`
			: "";
		reasons.push(
			`pressures ${move.attackPlan.chains} enemy chain${move.attackPlan.chains === 1 ? "" : "s"}; closes ${move.attackPlan.libertiesReduced} liberties through the modeled reply${atariDetail}`,
		);
	}
	if (move.wallDefensePlan.chains > 0) {
		const improvements: string[] = [];
		if (move.wallDefensePlan.libertiesAdded > 0) improvements.push(`${move.wallDefensePlan.libertiesAdded} liberties`);
		if (move.wallDefensePlan.eyesAdded > 0) improvements.push(`${move.wallDefensePlan.eyesAdded} eyes`);
		reasons.push(`shores up ${move.wallDefensePlan.chains} threatened own chain${move.wallDefensePlan.chains === 1 ? "" : "s"} (${improvements.join(", ")})`);
	}
	if (move.blockingBonus > 0) reasons.push("blocks opponent expansion");
	if (reasons.length === 0) reasons.push(`highest-scoring eligible move under the modeled reply (${move.score.toFixed(1)})`);
	if (missedCaptures.length > 0) reasons.push(`passes up ${missedCaptures.length} legal capture point${missedCaptures.length === 1 ? "" : "s"}`);
	if (missedDefenses.length > 0) reasons.push(`leaves ${missedDefenses.length} own chain${missedDefenses.length === 1 ? "" : "s"} in atari`);
	if (move.predictedOwnLoss > 0) reasons.push(`predicts losing ${move.predictedOwnLoss} own stone${move.predictedOwnLoss === 1 ? "" : "s"} to the modeled reply`);
	return reasons.join("; ");
}

function getBlockingMoveBonus(
	board: string[][],
	analysis: ReturnType<typeof analyze>,
	x: number,
	y: number,
): number {
	const adjacent = neighbors(x, y, board.length);
	if (!adjacent.some(([nx, ny]) => board[nx][ny] === "X")) return 0;

	const opponentChains = new Set(
		adjacent
			.filter(([nx, ny]) => board[nx][ny] === "O")
			.map(([nx, ny]) => analysis.chainAt[nx][ny]),
	);
	if (opponentChains.size === 0) return 0;
	const opponentNeighbors = adjacent.filter(([nx, ny]) => board[nx][ny] === "O").length;
	return 2 + Math.max(0, opponentNeighbors - 1) * 0.75 + Math.min(opponentChains.size - 1, 2) * 0.75;
}

function simulateMove(
	board: string[][],
	x: number,
	y: number,
	color: "X" | "O",
	forbiddenBoard: string[][],
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
	if (boardsEqual(next, forbiddenBoard)) return null;
	return { board: next, analysis: nextAnalysis, captured };
}

function boardsEqual(first: string[][], second: string[][]): boolean {
	for (let x = 0; x < first.length; x++) {
		for (let y = 0; y < first[x].length; y++) {
			if (first[x][y] !== second[x][y]) return false;
		}
	}
	return true;
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
			let eyeColor: "X" | "O" | null = null;
			let isEye = true;
			const adjacentChains: number[] = [];
			for (const [nx, ny] of adjacent) {
				const color = board[nx][ny];
				if (color === "#") continue;
				if (color !== "X" && color !== "O") {
					isEye = false;
					break;
				}
				if (eyeColor !== null && color !== eyeColor) {
					isEye = false;
					break;
				}
				eyeColor = color;
				const chainId = chainAt[nx][ny];
				if (!adjacentChains.includes(chainId)) adjacentChains.push(chainId);
			}
			if (!isEye || eyeColor === null) continue;

			const pointId = x * size + y;
			if (adjacentChains.some((chainId) => chains[chainId].liberties.size <= 1)) continue;
			for (const chainId of adjacentChains) {
				chains[chainId].secureEyes.add(pointId);
			}
		}
	}

	return { chains, chainAt };
}

function evaluate(
	board: string[][],
	analysis: ReturnType<typeof analyze>,
	komi: number,
	territoryFirst: boolean,
): number {
	const size = board.length;
	const territoryPotentialWeight = territoryFirst ? 0.25 : 2;
	const influenceWeight = territoryFirst ? 0.25 : 1;
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

			if (touchesX !== touchesO) score += (touchesX ? 1 : -1) * region.length * territoryPotentialWeight;
		}
	}

	const xDistance = distancesTo(board, "X", territoryFirst);
	const oDistance = distancesTo(board, "O", territoryFirst);
	for (let x = 0; x < size; x++) {
		for (let y = 0; y < size; y++) {
			if (board[x][y] !== ".") continue;
			if (territoryFirst) {
				if (xDistance[x][y] < oDistance[x][y]) score += influenceWeight;
				else if (oDistance[x][y] < xDistance[x][y]) score -= influenceWeight;
			} else {
				if (xDistance[x][y] < Infinity) score += 1 / (xDistance[x][y] + 1);
				if (oDistance[x][y] < Infinity) score -= 1 / (oDistance[x][y] + 1);
			}
		}
	}

	return score - komi;
}

function distancesTo(board: string[][], color: "X" | "O", territoryFirst: boolean): number[][] {
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
			if (territoryFirst && board[nx][ny] !== "." && board[nx][ny] !== color) continue;
			if (distance[nx][ny] !== Infinity) continue;
			distance[nx][ny] = distance[x][y] + 1;
			pending.push([nx, ny]);
		}
	}

	return distance;
}

function neighbors(x: number, y: number, size: number): Point[] {
	let cache = neighborCache.get(size);
	if (!cache) {
		cache = Array.from({ length: size }, (_, cx) =>
			Array.from({ length: size }, (_, cy) => {
				const points: Point[] = [];
				if (cx > 0) points.push([cx - 1, cy]);
				if (cx + 1 < size) points.push([cx + 1, cy]);
				if (cy > 0) points.push([cx, cy - 1]);
				if (cy + 1 < size) points.push([cx, cy + 1]);
				return points;
			}),
		);
		neighborCache.set(size, cache);
	}
	return cache[x][y];
}

const neighborCache = new Map<number, Point[][][]>();
