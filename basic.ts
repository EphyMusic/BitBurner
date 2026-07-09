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
		await display(ns, startTime, serverCheckInit(ns));
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

async function display(ns: NS, startTime: number, servers: [ScannedServer[], ScannedServer[], ScannedServer[]]) {
	const rooted = runRootServers(ns,servers[0]);
	const unrooted = servers[1];
	const owned = servers[2];
	ns.clearLog()

	ns.print("rooted servers:\n");
	for (const s of rooted) {

		ns.ui.renderTail();
	}

	const unrootGroups: ScannedServer[][] = [];
	let group: ScannedServer[] = [];
	ns.print("\nunrooted servers:\n");
	let x = 0;
	for (const s of unrooted) {
		if (x >= 5) {
			x = 0;
			unrootGroups.push(group);
			group = [];
		}
		group.push(s);
		x += 1;
	}
	const groupSel = Math.floor((Date.now() / 2000 - startTime) % unrootGroups.length);
	for (const s of unrootGroups[groupSel]) {
		ns.print(`${s.server.hostname}\n`);
		ns.ui.renderTail();
	}
	
	// ns.print("\nowned servers:\n");
	// for (const s of owned) {
	// 	ns.print(`${s.server.hostname}\n`);
	// 	ns.ui.renderTail();
	// }
}

function runRootServers(ns:NS,servers:ScannedServer[]):string[] {
	const weakMem = ns.getScriptRam("/payload/weaken.ts");
	const growMem = ns.getScriptRam("/payload/grow.ts");
	const hackMem = ns.getScriptRam("/payload/hack.ts");
	const pWeak = "/payload/weaken.ts";
	const pGrow = "/payload/grow.ts";
	const pHack = "/payload/hack.ts";
	const context:string[] = [];
	for (const s of servers) {
		const freeRam = s.server.maxRam - s.server.ramUsed;
		let output:string;
		const currentSec = s.server.hackDifficulty ?? 0;
		const thresholdSec = (s.server.minDifficulty ?? 0) + 1;
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
		if (rankAction(s.action) === 0) {
			context.push(`${s.server.hostname} | $${s.server.moneyAvailable}/$${s.server.moneyMax}`)
		}

	}

	return context
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