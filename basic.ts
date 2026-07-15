type ScannedServer = {
	server: Server;
	path: string[];
	action: string;
};

export async function main(ns: NS) {
	ns.disableLog("ALL");
	ns.ui.openTail();
	const startTime = Date.now() / 2000
	while (true) {
		const baseServers = serverCheckInit(ns)
		const servers = [runRootServers(ns,baseServers[1]),[""],[""]]
		await display(ns, startTime, servers);
		await ns.sleep(20)
	}
}

function scan(ns: NS, start = "home"): ScannedServer[] {
	const visited = new Map<string, { sName: string; path: string[] }>();

	function dfs(host: string, path: string[] = []) {
		const fullPath = [...path, host];
		visited.set(host, { sName: host, path: fullPath });

		for (const next of ns.scan(host)) {
			if (!visited.has(next)) {
				dfs(next, fullPath);
			}
		}
	}

	dfs(start);

	const servers: ScannedServer[] = [];
	for (const s of visited.keys()) {
		const entry = visited.get(s)!;
		servers.push({server: ns.getServer(entry.sName),path: entry.path,action:'waiting...'});
	}
	return servers;
}

function serverCheckInit(ns: NS): [ScannedServer[], ScannedServer[], ScannedServer[]] {
	const rooted: ScannedServer[] = [];
	const unrooted: ScannedServer[] = [];
	const owned: ScannedServer[] = [];
	const servers = scan(ns);

	for (const s of servers) {
		if (s.server.purchasedByPlayer) {
			owned.push(s);
		} else if (s.server.hasAdminRights) {
			rooted.push(s);
		} else {
			unrooted.push(s);
		}
	}

	return [rooted, unrooted, owned];
}

function runRootServers(ns:NS,servers:ScannedServer[]):string[] {
	const weakMem = ns.getScriptRam("/payload/weaken.ts");
	const growMem = ns.getScriptRam("/payload/grow.ts");
	const hackMem = ns.getScriptRam("/payload/hack.ts");
	const pWeak = "/payload/weaken.ts";
	const pGrow = "/payload/grow.ts";
	const pHack = "/payload/hack.ts";
	const ctx1:string[] = []
	const ctx2:string[] = []
	const ctx3:string[] = []
	const ctx4:string[] = []
	for (const s of servers) {
		const freeRam = s.server.maxRam - s.server.ramUsed;
		const currentSec = s.server.hackDifficulty ?? 0;
		const minimumSec = s.server.minDifficulty ?? 0;
		const thresholdSec = minimumSec + 1;
		const currentMoney = s.server.moneyAvailable ?? 0
		const maxMoney = s.server.moneyMax ?? 0
		if (ns.ps(s.server.hostname).length === 0) {
			let threads:number;
			switch (true) {
				case maxMoney === 0:
					s.action = "N/A";
					break;
				
				case currentSec > thresholdSec:
					if (!ns.fileExists(pWeak, s.server.hostname)) ns.scp(pWeak,s.server.hostname,"home");
					threads = Math.floor(freeRam - weakMem);
					if (threads === 0 || !Number.isFinite(threads)) break;
					ns.exec(pWeak,s.server.hostname,threads);
					s.action = "Weakening..."
					break;

				case currentMoney < maxMoney / 10:
					if (!ns.fileExists(pGrow, s.server.hostname)) ns.scp(pGrow, s.server.hostname, "home");
					threads = Math.floor(freeRam - growMem);
					if (threads === 0 || !Number.isFinite(threads)) break;
					ns.exec(pGrow,s.server.hostname,threads);
					s.action = "Growing..."
					break;

				default:
					if (!ns.fileExists(pHack, s.server.hostname)) ns.scp(pGrow,s.server.hostname,"home");
					threads = Math.floor(freeRam - hackMem);
					if (threads === 0 || !Number.isFinite(threads)) break;
					ns.exec(pHack,s.server.hostname,threads)
					s.action = "Hacking..."
					break;
			}
		} else {
			const procs = ns.ps(s.server.hostname);
			for (const p of procs) {
				s.action = recallAction(p.filename)
			}
		}
		const act = rankAction(s.action)
		if (act === 0) {
			ctx1.push(`${s.server.hostname} | $${ns.format.number(currentMoney,2)}/$${ns.format.number(maxMoney)} | ${ns.format.number(minimumSec, 2)}/${ns.format.number(currentSec,2)}/${ns.format.number(thresholdSec,2)} | ${s.action}`)
		} else if (act === 1) {
			ctx2.push(`${s.server.hostname} | $${ns.format.number(currentMoney,2)}/$${ns.format.number(maxMoney)} | ${ns.format.number(minimumSec, 2)}/${ns.format.number(currentSec,2)}/${ns.format.number(thresholdSec,2)} | ${s.action}`)
		} else if (act === 2) {
			ctx3.push(`${s.server.hostname} | $${ns.format.number(currentMoney,2)}/$${ns.format.number(maxMoney)} | ${ns.format.number(minimumSec, 2)}/${ns.format.number(currentSec,2)}/${ns.format.number(thresholdSec,2)} | ${s.action}`)
		} else {
			ctx4.push(`${s.server.hostname} | $${ns.format.number(currentMoney,2)}/$${ns.format.number(maxMoney)} | ${ns.format.number(minimumSec, 2)}/${ns.format.number(currentSec,2)}/${ns.format.number(thresholdSec,2)} | ${s.action}`)
		}
		
	}
	const context = [ctx1.join(`\n`),ctx2.join(`\n`),ctx3.join(`\n`),ctx4.join(`\n`)]
	return context
}

function runUnrootServers(ns:NS, servers:ScannedServer[]) {
	const hackLV = ns.getHackingLevel()
	for (const s of servers) {
		if (s.server.hackDifficulty && s.server.hackDifficulty <= hackLV) {
			if (s.server.numOpenPortsRequired && s.server.openPortCount && s.server.numOpenPortsRequired > s.server.openPortCount) {
				const reqPorts = s.server.numOpenPortsRequired;
				let openPorts = s.server.openPortCount;
				const actions = [ns.brutessh,ns.ftpcrack,ns.relaysmtp,ns.httpworm] 
				while (openPorts < reqPorts) {
					
				}

			}
		}
	}
}

async function display(ns: NS, startTime: number, servers: string[][]) {
	const rooted = servers[0];
	const unrooted = servers[1];
	const owned = servers[2];
	ns.clearLog()

	const rootGroups:string[][] = makeGroup(rooted);
	const unrootGroups:string[][] = makeGroup(unrooted);

	const rGroupSel:number = Math.floor((Date.now() / 2000 - startTime) % rootGroups.length);
	for (const s of rootGroups[rGroupSel]) {
		ns.print(`${s}\n`)
		ns.ui.renderTail();
	}

	const unGroupSel:number = Math.floor((Date.now() / 2000 - startTime) % unrootGroups.length);
	for (const s of unrootGroups[unGroupSel]) {
		ns.print(`${s}\n`);
		ns.ui.renderTail();
	}
	
	// ns.print("\nowned servers:\n");
	// for (const s of owned) {
	// 	ns.print(`${s.server.hostname}\n`);
	// 	ns.ui.renderTail();
	// }
}

function recallAction(str:string):string {
	str = String(str ?? "").toLowerCase();
	if (str.includes("hack")) return "Hacking...";
	if (str.includes("grow")) return "Growing...";
	if (str.includes("weak")) return "Weakening...";
	return "N/A";
}

function rankAction(str:string):number {
	str = String(str ?? "").toLowerCase();
	if (str.includes("hack")) return 0;
	if (str.includes("grow")) return 1;
	if (str.includes("weak")) return 3;
	return 4;
}

function makeGroup(servers:string[]):string[][] {
	const fullGroup:string[][] = []
	let group:string[] = []
	let x = 0;
	for (const s of servers) {
		if (x >= 5) {
			x = 0;
			fullGroup.push(group);
			group = [];
		}
		group.push(s);
		x += 1;
	}
	fullGroup.push(group);
	return fullGroup;
}