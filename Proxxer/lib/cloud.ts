import { colorize } from "./common";

type ThreadInfo = {time:number, threads:number, secUp:number, ram:number};
type ThreadOptions = {
	threads?:number;
	moneyMultiplier?:number;
	securityReduction?:number;
	availableRam?:number;
};
type CloudPlan = {
	vHack:ThreadInfo;
	vGrow:ThreadInfo;
	vWeaken:ThreadInfo;
	vShare:ThreadInfo;
	delays:{vHack:number, vGrow:number, vWeaken:number};
	totalTime:{vHack:number, vGrow:number, vWeaken:number};
};

const FINISH_BUFFER_MS = 50;

export class CloudServer {
	server:Server;
	target:Server;
	readonly path:string[];
	readonly vManagesShare:boolean;
	money = 0;
	backdoor = false;
	security = 0;
	moneyMax = 0;
	securityMin = 0;
	vHackTime = 0;
	vHackTimeLeftMs = 0;
	vGrowTime = 0;
	vGrowTimeLeftMs = 0;
	vWeakenTime = 0;
	vWeakenTimeLeftMs = 0;
	vHackOperationsLeft = 0;
	private vShareOnly = false;
	private pendingPlan:CloudPlan | null = null;

	private constructor(server:Server, target:Server, path:string[], vManagesShare:boolean) {
		this.server = server;
		this.target = target;
		this.path = path;
		this.vManagesShare = vManagesShare;
		this.money = this.target.moneyAvailable ?? 0;
		this.security = this.target.hackDifficulty ?? 0;
		this.moneyMax = this.target.moneyMax ?? 0;
		this.securityMin = this.target.minDifficulty ?? 0;
	}

	static create(ns:NS, host:string, target:string, path:string[], vManagesShare = true): CloudServer | null {
		if (!ns.getServer(target).moneyMax) return null;
		const hostname = ns.serverExists(host) ? host : ns.cloud.purchaseServer(host, 8);
		if (hostname == "") return null;
		return new CloudServer(ns.getServer(hostname), ns.getServer(target), path, vManagesShare);
	}

	updateValues(ns:NS) {
		this.server = ns.getServer(this.server.hostname);
		this.target = ns.getServer(this.target.hostname);
		this.money = this.target.moneyAvailable ?? 0;
		this.security = this.target.hackDifficulty ?? 0;
		this.moneyMax = this.target.moneyMax ?? 0;
		this.securityMin = this.target.minDifficulty ?? 0;
		this.backdoor = this.target.backdoorInstalled ?? false;
	}

	advanceTimers(elapsedMs:number): void {
		if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
			throw new RangeError("Elapsed time must be a non-negative finite number");
		}

		this.vHackTimeLeftMs = Math.max(0, this.vHackTimeLeftMs - elapsedMs);
		this.vGrowTimeLeftMs = Math.max(0, this.vGrowTimeLeftMs - elapsedMs);
		this.vWeakenTimeLeftMs = Math.max(0, this.vWeakenTimeLeftMs - elapsedMs);
		if (this.vHackTimeLeftMs === 0) this.vHackOperationsLeft = 0;
	}
	
	calculateThreads(ns:NS, state:string, options:ThreadOptions = {}): ThreadInfo {
		switch(state) {
			case "HACK":
				const vHackTime = ns.getHackTime(this.target.hostname);
				const vHackRAM = ns.getScriptRam("/Proxxer/payload/hack.ts");
				const vHackThreads = options.threads ?? Math.ceil(ns.hackAnalyzeThreads(this.target.hostname, this.money));
				const vSecUpHack = ns.hackAnalyzeSecurity(vHackThreads, this.target.hostname);
				return {time: vHackTime, threads: vHackThreads, secUp: vSecUpHack, ram: vHackRAM * vHackThreads};
			case "GROW":
				const vGrowTime = ns.getGrowTime(this.target.hostname);
				const vGrowRAM = ns.getScriptRam("/Proxxer/payload/grow.ts");
				const multiplier = options.moneyMultiplier ?? (this.money > 0 ? this.moneyMax / this.money : Math.max(1, this.moneyMax));
				const vGrowThreads = options.threads ?? (multiplier > 1
					? Math.ceil(ns.growthAnalyze(this.target.hostname, multiplier, this.server.cpuCores))
					: 0);
				const vSecUpGrow = ns.growthAnalyzeSecurity(vGrowThreads, this.target.hostname, this.server.cpuCores);
				return {time: vGrowTime, threads: vGrowThreads, secUp: vSecUpGrow, ram: vGrowRAM * vGrowThreads};
			case "WEAKEN":
				const vWeakenTime = ns.getWeakenTime(this.target.hostname);
				const vWeakenRAM = ns.getScriptRam("/Proxxer/payload/weaken.ts");
				const reduction = Math.max(0, options.securityReduction ?? this.security - this.securityMin);
				let vWeakenThreads = 0;
				if (reduction > 0) {
					const perThreadReduction = ns.weakenAnalyze(1, this.server.cpuCores);
					if (perThreadReduction <= 0 || !Number.isFinite(perThreadReduction)) {
						throw new Error(`Unable to calculate weaken effect for ${this.target.hostname}`);
					}
					vWeakenThreads = Math.ceil(reduction / perThreadReduction);
					while (ns.weakenAnalyze(vWeakenThreads, this.server.cpuCores) < reduction) {
						vWeakenThreads++;
					}
				}
				return {
					time: vWeakenTime,
					threads: vWeakenThreads,
					secUp: -ns.weakenAnalyze(vWeakenThreads, this.server.cpuCores),
					ram: vWeakenRAM * vWeakenThreads
				};
			case "SHARE":
				const vShareRAM = ns.getScriptRam("/Proxxer/payload/share.ts");
				const freeRam = options.availableRam ?? this.server.maxRam - this.server.ramUsed;
				const vShareThreads = vShareRAM > 0 ? Math.floor(freeRam / vShareRAM) : 0;
				return {time: 0, threads: vShareThreads, secUp: 0, ram: vShareRAM * vShareThreads};
			default:
				throw new Error(`Unknown state: ${state}`);
		}
	}

	calculatePlan(ns:NS, finishBufferMs = FINISH_BUFFER_MS): CloudPlan {
		const availableRam = Math.max(0, this.server.maxRam - this.server.ramUsed);
		const vHackRam = ns.getScriptRam("/Proxxer/payload/hack.ts");
		const vHackPercent = ns.hackAnalyze(this.target.hostname);
		const vHackThreadsNeeded = this.money > 0
			? ns.hackAnalyzeThreads(this.target.hostname, this.money)
			: 0;
		const vMaxHackThreads = vHackRam > 0 && Number.isFinite(vHackThreadsNeeded) && vHackThreadsNeeded > 0
			? Math.min(Math.floor(availableRam / vHackRam), Math.ceil(vHackThreadsNeeded))
			: 0;

		let vHack = this.calculateThreads(ns, "HACK", {threads: 0});
		let vGrow = this.calculateThreads(ns, "GROW", {moneyMultiplier: 1});
		let vWeaken = this.calculateThreads(ns, "WEAKEN", {securityReduction: 0});
		let allocatedRam = 0;

		for (let vHackThreads = vMaxHackThreads; vHackThreads > 0; vHackThreads--) {
			const moneyRemaining = Math.max(1, this.money * (1 - Math.min(1, vHackPercent * vHackThreads)));
			if (!Number.isFinite(moneyRemaining)) continue;

			const vCandidateHack = this.calculateThreads(ns, "HACK", {threads: vHackThreads});
			const vCandidateGrow = this.calculateThreads(ns, "GROW", {
				moneyMultiplier: this.moneyMax / moneyRemaining
			});
			const securityIncrease = vCandidateHack.secUp + vCandidateGrow.secUp;
			const vCandidateWeaken = this.calculateThreads(ns, "WEAKEN", {
				securityReduction: Math.max(0, this.security - this.securityMin + securityIncrease)
			});
			const candidateRam = vCandidateHack.ram + vCandidateGrow.ram + vCandidateWeaken.ram;

			if (Number.isFinite(candidateRam) && candidateRam <= availableRam) {
				vHack = vCandidateHack;
				vGrow = vCandidateGrow;
				vWeaken = vCandidateWeaken;
				allocatedRam = candidateRam;
				break;
			}
		}

		if (vHack.threads === 0) {
			const vRecoveryGrow = this.calculateThreads(ns, "GROW");
			const vRecoveryWeaken = this.calculateThreads(ns, "WEAKEN", {
				securityReduction: Math.max(0, this.security - this.securityMin + vRecoveryGrow.secUp)
			});
			const recoveryRam = vRecoveryGrow.ram + vRecoveryWeaken.ram;
			if (recoveryRam <= availableRam) {
				vGrow = vRecoveryGrow;
				vWeaken = vRecoveryWeaken;
				allocatedRam = recoveryRam;
			} else if (this.security > this.securityMin) {
				const vWeakenRAM = ns.getScriptRam("/Proxxer/payload/weaken.ts");
				const vWeakenThreads = vWeakenRAM > 0 ? Math.floor(availableRam / vWeakenRAM) : 0;
				if (vWeakenThreads > 0) {
					const vPartialWeaken = this.calculateThreads(ns, "WEAKEN", {
						securityReduction: Math.min(
							this.security - this.securityMin,
							ns.weakenAnalyze(vWeakenThreads, this.server.cpuCores)
						)
					});
					if (vPartialWeaken.ram <= availableRam) {
						vWeaken = vPartialWeaken;
						allocatedRam = vPartialWeaken.ram;
					}
				}
			} else {
				const vGrowRAM = ns.getScriptRam("/Proxxer/payload/grow.ts");
				const vWeakenRAM = ns.getScriptRam("/Proxxer/payload/weaken.ts");
				const vMaxGrowThreads = vGrowRAM > 0
					? Math.floor(Math.max(0, availableRam - vWeakenRAM) / vGrowRAM)
					: 0;
				for (let vGrowThreads = vMaxGrowThreads; vGrowThreads > 0; vGrowThreads--) {
					const vPartialGrow = this.calculateThreads(ns, "GROW", {threads: vGrowThreads});
					const vPartialWeaken = this.calculateThreads(ns, "WEAKEN", {
						securityReduction: vPartialGrow.secUp
					});
					const partialRam = vPartialGrow.ram + vPartialWeaken.ram;
					if (partialRam <= availableRam) {
						vGrow = vPartialGrow;
						vWeaken = vPartialWeaken;
						allocatedRam = partialRam;
						break;
					}
				}
			}
		}

		const remainingRam = Math.max(0, availableRam - allocatedRam);
		const vShare = this.calculateThreads(ns, "SHARE", {availableRam: remainingRam});
		const vHasHack = vHack.threads > 0;
		const vHasGrow = vGrow.threads > 0;
		const vHasWeaken = vWeaken.threads > 0;
		const finishTime = Math.max(
			vHasHack ? vHack.time : 0,
			vHasGrow ? vGrow.time : 0,
			vHasWeaken ? vWeaken.time : 0
		);
		const buffer = Math.max(0, finishBufferMs);
		const vWeakenFinish = finishTime;
		const vGrowFinish = vHasWeaken ? Math.max(0, vWeakenFinish - buffer) : finishTime;
		const vHackFinish = vHasGrow
			? Math.max(0, vGrowFinish - buffer)
			: vHasWeaken ? Math.max(0, vWeakenFinish - buffer) : finishTime;
		const delays = {
			vHack: vHasHack ? Math.max(0, vHackFinish - vHack.time) : 0,
			vGrow: vHasGrow ? Math.max(0, vGrowFinish - vGrow.time) : 0,
			vWeaken: 0
		};

		return {
			vHack,
			vGrow,
			vWeaken,
			vShare,
			delays,
			totalTime: {
				vHack: vHasHack ? vHack.time + delays.vHack : 0,
				vGrow: vHasGrow ? vGrow.time + delays.vGrow : 0,
				vWeaken: vHasWeaken ? vWeaken.time : 0
			}
		};
	}

	upgradeSelf(ns:NS): void {
		this.updateValues(ns);
		const ram = this.server.maxRam;
		if (ns.cloud.upgradeServer(this.server.hostname,ram * 2)) {
			this.updateValues(ns);
		}
	}

    sendFiles(ns:NS): boolean {
        const files = [
            "/Proxxer/payload/weaken.ts",
            "/Proxxer/payload/grow.ts",
            "/Proxxer/payload/hack.ts",
            "/Proxxer/payload/share.ts"
        ];
        const target = this.server.hostname;

        for (const file of files) {
            const finalFile = file.replace("/Proxxer", "");
            if (!ns.fileExists(file, "home")) return false;
            if (!ns.scp(file, target, "home")) return false;
            ns.mv(target, file, finalFile);
        }
        return true;
    }

	killOld(ns:NS): boolean {
        const old = ns.ps(this.server.hostname);
        if (old.length > 0) {
            const res: boolean[] = [];
            for (const proc of old) {
                res.push(ns.kill(proc.pid));
            }
            for (const result of res) {
                if (!result) return false;
            }
            return true;
        }
        return true;
    }

	doAction(ns:NS, payload:string,threads:number,delayMs = 0): number {
		switch(payload) {
			case "HACK":
				return ns.exec("/payload/hack.ts", this.server.hostname, threads, this.target.hostname, delayMs);
			case "GROW":
				return ns.exec("/payload/grow.ts", this.server.hostname, threads, this.target.hostname, delayMs);
			case "WEAKEN":
				return ns.exec("/payload/weaken.ts", this.server.hostname, threads, this.target.hostname, delayMs);
			case "SHARE":
				return ns.exec("/payload/share.ts", this.server.hostname, threads);
			default:
				throw new Error(`Unknown payload: ${payload}`);
		}
	}

	private activePayloadProcesses(ns:NS): {vHack:ProcessInfo[], vGrow:ProcessInfo[], vWeaken:ProcessInfo[], vShare:ProcessInfo[]} {
		const processes = ns.ps(this.server.hostname);
		const matches = (process:ProcessInfo, script:string) => {
			const filename = process.filename.replace(/^\/+/, "");
			return (filename === script || filename.endsWith(`/${script}`))
				&& process.args[0] === this.target.hostname;
		};
		return {
			vHack: processes.filter(process => matches(process, "payload/hack.ts")),
			vGrow: processes.filter(process => matches(process, "payload/grow.ts")),
			vWeaken: processes.filter(process => matches(process, "payload/weaken.ts")),
			vShare: processes.filter(process => {
				const filename = process.filename.replace(/^\/+/, "");
				return filename === "payload/share.ts" || filename.endsWith("/payload/share.ts");
			})
		};
	}

	alreadyRunning(ns:NS, payload:string): boolean {
		const procs = ns.ps(this.server.hostname);
		if (procs.length === 0) return false;
		const filename = payload.replace(/^\/+/, "");
		return procs.some(proc => proc.filename.replace(/^\/+/, "") === filename);
	}

	runSelf(ns:NS, dt:number) {
		this.updateValues(ns);
		this.advanceTimers(dt);
		this.upgradeSelf(ns);

		const active = this.activePayloadProcesses(ns);
		this.vHackOperationsLeft = active.vHack.length;
		if (active.vHack.length === 0) this.vHackTimeLeftMs = 0;
		if (active.vGrow.length === 0) this.vGrowTimeLeftMs = 0;
		if (active.vWeaken.length === 0) this.vWeakenTimeLeftMs = 0;
		const activeCoreOperations = active.vHack.length + active.vGrow.length + active.vWeaken.length;
		if (activeCoreOperations > 0) return;
		if (this.pendingPlan) {
			this.pendingPlan = null;
			this.vHackOperationsLeft = 0;
		}

		if (this.vShareOnly && active.vShare.length > 0) return;
		this.vShareOnly = false;

		if (!this.target.hasAdminRights) return;

		for (const process of active.vShare) {
			if (!ns.kill(process.pid)) {
				ns.print(`Could not stop share process ${process.pid} on ${this.server.hostname}`);
				return;
			}
		}

		if (!this.sendFiles(ns)) {
			ns.print(`Could not send Proxxer payloads to ${this.server.hostname}`);
			return;
		}
		this.updateValues(ns);
		const refreshed = this.activePayloadProcesses(ns);
		if (refreshed.vHack.length + refreshed.vGrow.length + refreshed.vWeaken.length > 0) return;

		const plan = this.calculatePlan(ns);
		this.vHackTime = 0;
		this.vGrowTime = plan.vGrow.threads > 0 ? plan.totalTime.vGrow : 0;
		this.vWeakenTime = plan.vWeaken.threads > 0 ? plan.totalTime.vWeaken : 0;
		this.vHackTimeLeftMs = 0;
		this.vGrowTimeLeftMs = 0;
		this.vWeakenTimeLeftMs = 0;
		this.vHackOperationsLeft = 0;
		let startedCoreOperation = false;
		if (plan.vHack.threads > 0) {
			if (this.doAction(ns, "HACK", plan.vHack.threads, plan.delays.vHack) === 0) {
				ns.print(`Could not start ${plan.vHack.threads} hack threads on ${this.server.hostname}`);
			} else {
				this.vHackTime = plan.totalTime.vHack;
				this.vHackTimeLeftMs = plan.totalTime.vHack;
				this.vHackOperationsLeft = 1;
				startedCoreOperation = true;
			}
		}
		if (plan.vGrow.threads > 0) {
			if (this.doAction(ns, "GROW", plan.vGrow.threads, plan.delays.vGrow) === 0) {
				ns.print(`Could not start ${plan.vGrow.threads} grow threads on ${this.server.hostname}`);
			} else {
				this.vGrowTimeLeftMs = plan.totalTime.vGrow;
				startedCoreOperation = true;
			}
		}
		if (plan.vWeaken.threads > 0) {
			if (this.doAction(ns, "WEAKEN", plan.vWeaken.threads, plan.delays.vWeaken) === 0) {
				ns.print(`Could not start ${plan.vWeaken.threads} weaken threads on ${this.server.hostname}`);
			} else {
				this.vWeakenTimeLeftMs = plan.totalTime.vWeaken;
				startedCoreOperation = true;
			}
		}
		if (startedCoreOperation) this.pendingPlan = plan;
		if (this.vManagesShare && plan.vShare.threads > 0) {
			if (this.doAction(ns, "SHARE", plan.vShare.threads) === 0) {
				ns.print(`Could not start ${plan.vShare.threads} share threads on ${this.server.hostname}`);
			} else {
				this.vShareOnly = !startedCoreOperation;
			}
		} else {
			this.vShareOnly = !startedCoreOperation;
		}
	}
		
	output(ns:NS): string {
		const vShareThreads = this.vManagesShare
			? this.activePayloadProcesses(ns).vShare.reduce((total, process) => total + process.threads, 0)
			: 0;
		return [
			`${this.server.hostname} -> ${this.target.hostname.slice(0, 5)} - ${vShareThreads} S.Thread`,
			`Progress[${this.makeBar("WEAKEN",19)}] ${this.backdoor ? colorize("█", 0, 255, 0) : colorize("█", 255, 0, 0)}`,
			`RAM[${this.makeBar("RAM",12)}][${ns.format.ram(this.server.ramUsed).replace("GB", "")}/${ns.format.ram(this.server.maxRam)}]`,
		].join("\n");
	}

	makeBar(state:string,length:number = 20): string {
		let currentValue = 0;
		let maxValue = 0;
		switch(state) {
			case "RAM":
				currentValue = this.server.ramUsed;
				maxValue = this.server.maxRam;
				break;
			case "HACK":
				currentValue = this.vHackTimeLeftMs;
				maxValue = this.vHackTime;
				break;
			case "GROW":
				currentValue = this.vGrowTimeLeftMs;
				maxValue = this.vGrowTime;
				break;
			case "WEAKEN":
				currentValue = this.vWeakenTimeLeftMs;
				maxValue = this.vWeakenTime;
				break;
			case "SHARE":
				return "";
			default:
				throw new Error(`Unknown state: ${state}`);
		}
		const progress = maxValue > 0
			? Math.max(0, Math.min(1, state === "RAM" ? currentValue / maxValue : 1 - currentValue / maxValue))
			: 0;
		const filled = Math.floor(progress * length);
		return "|".repeat(filled) + "_".repeat(length - filled);
	}

}
