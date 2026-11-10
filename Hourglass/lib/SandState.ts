export const SAND_COLUMNS = 54;
export const SAND_ROWS = 72;

export interface ActivitySample {
	at: number;
	change: number;
}

export interface HourglassRecord {
	hostname: string;
	money: number;
	maxMoney: number;
	activity: number;
	activitySamples: ActivitySample[];
	activitySampleCursor: number;
	historySince: number;
	sand: SandState;
}

export class SandState {
	readonly particles = new Uint8Array(SAND_COLUMNS * SAND_ROWS);
	readonly falling = new Uint8Array(SAND_COLUMNS * SAND_ROWS);
	private readonly driftDirection = new Int8Array(SAND_COLUMNS * SAND_ROWS);
	private readonly driftCooldown = new Uint8Array(SAND_COLUMNS * SAND_ROWS);
	private occupied = 0;
	private step = 0;
	private target = 0;
	private changeClock = 0;
	private changePeak = 0;
	private changeDirection = 0;

	setMoney(money: number, maxMoney: number): void {
		const nextTarget = Math.round(Math.max(0, Math.min(1, money / maxMoney)) * this.particles.length);
		if (nextTarget === this.target) return;
		this.target = nextTarget;
		const distance = this.target - this.occupied;
		const direction = Math.sign(distance);
		if (direction !== this.changeDirection) {
			this.changeDirection = direction;
			this.changePeak = Math.abs(distance);
			this.changeClock = 0;
		} else {
			this.changePeak = Math.max(this.changePeak, Math.abs(distance));
		}
	}

	settle(iterations: number): void {
		for (let pass = 0; pass < iterations; pass++) {
			this.step++;
			this.falling.fill(0);
			this.advanceMoneyChange();
			for (let row = SAND_ROWS - 2; row >= 0; row--) {
				const rightFirst = (row + this.step) % 2 === 0;
				for (let n = 0; n < SAND_COLUMNS; n++) {
					const col = rightFirst ? n : SAND_COLUMNS - 1 - n;
					const source = row * SAND_COLUMNS + col;
					if (!this.particles[source]) continue;

					const below = source + SAND_COLUMNS;
					if (!this.particles[below]) {
						let direction = this.driftDirection[source];
						if (direction === 0) {
							direction = Math.random() < 0.5 ? -1 : 1;
							this.driftDirection[source] = direction;
						}
						const cooldown = this.driftCooldown[source];
						if (cooldown > 0) this.driftCooldown[source]--;
						else {
							const driftCol = col + direction;
							const driftTarget = below + direction;
							this.driftCooldown[source] = 8 + Math.floor(Math.random() * 20);
							if (Math.random() < 0.25) this.driftDirection[source] = -direction;
							if (driftCol >= 0 && driftCol < SAND_COLUMNS && !this.particles[driftTarget]) {
								this.moveParticle(source, driftTarget);
								continue;
							}
						}
						this.moveParticle(source, below);
						continue;
					}

					const direction = this.driftDirection[source] || (Math.random() < 0.5 ? -1 : 1);
					this.driftDirection[source] = direction;
					for (const offset of [direction, -direction]) {
						const nextCol = col + offset;
						if (nextCol < 0 || nextCol >= SAND_COLUMNS) continue;
						const diagonal = below + offset;
						if (this.particles[diagonal]) continue;
						this.moveParticle(source, diagonal);
						break;
					}
					if (this.particles[source]) this.falling[source] = 0;
				}
			}
		}
	}

	private advanceMoneyChange(): void {
		let distance = this.target - this.occupied;
		if (distance === 0) {
			this.changeDirection = 0;
			this.changePeak = 0;
			this.changeClock = 0;
			return;
		}

		const direction = Math.sign(distance);
		if (direction !== this.changeDirection) {
			this.changeDirection = direction;
			this.changePeak = Math.abs(distance);
			this.changeClock = 0;
		}
		this.changeClock += 1000 / 60;

		while (distance !== 0) {
			const progress = 1 - Math.abs(distance) / Math.max(1, this.changePeak);
			const interval = 1 + progress * progress * 17;
			if (this.changeClock < interval) break;
			this.changeClock -= interval;
			if (distance > 0) this.addAtTop();
			else this.removeFromBottom();
			distance = this.target - this.occupied;
		}

		if (distance === 0) {
			this.changeDirection = 0;
			this.changePeak = 0;
			this.changeClock = 0;
		}
	}

	private removeFromBottom(): void {
		for (let row = SAND_ROWS - 1; row >= 0; row--) {
			const offset = row * SAND_COLUMNS;
			let picked = -1;
			let seen = 0;
			for (let col = 0; col < SAND_COLUMNS; col++) {
				const index = offset + col;
				if (!this.particles[index]) continue;
				seen++;
				if (Math.random() < 1 / seen) picked = index;
			}
			if (picked >= 0) {
				this.particles[picked] = 0;
				this.falling[picked] = 0;
				this.driftDirection[picked] = 0;
				this.driftCooldown[picked] = 0;
				this.occupied--;
				return;
			}
		}
	}

	private addAtTop(): void {
		const start = Math.floor(Math.random() * SAND_COLUMNS);
		for (let depth = 0; depth < SAND_ROWS; depth++) {
			for (let n = 0; n < SAND_COLUMNS; n++) {
				const col = (start + n) % SAND_COLUMNS;
				const index = depth * SAND_COLUMNS + col;
				if (this.particles[index]) continue;
				this.particles[index] = 1;
				this.falling[index] = 1;
				this.driftDirection[index] = Math.random() < 0.5 ? -1 : 1;
				this.driftCooldown[index] = Math.floor(Math.random() * 20);
				this.occupied++;
				return;
			}
		}
	}

	private moveParticle(source: number, destination: number): void {
		this.particles[destination] = 1;
		this.particles[source] = 0;
		this.falling[destination] = 1;
		this.driftDirection[destination] = this.driftDirection[source];
		this.driftDirection[source] = 0;
		this.driftCooldown[destination] = this.driftCooldown[source];
		this.driftCooldown[source] = 0;
	}
}
