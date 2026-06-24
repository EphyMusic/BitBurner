type ScannedServer = {
	server: Server;
	path: string[];
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
		servers.push({server: ns.getServer(entry.sName),path: entry.path});
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
	const rooted = servers[0];
	const unrooted = servers[1];
	const owned = servers[2];
	ns.clearLog()

	ns.print("rooted servers:\n");
	for (const s of rooted) {
		const currentMoney: number = s.server.moneyAvailable ?? 0
		const maxMoney: number = s.server.moneyMax ?? 0
		const currentSecurity: number = s.server.hackDifficulty ?? 0
		const minSecurity = s.server.minDifficulty ?? 0
		let maxSecurity = 0
		if (minSecurity > 0) {
			maxSecurity = minSecurity + (minSecurity/10) + 1
		}
		let action = "Waiting..."
		

		let context: string
		context = `${s.server.hostname} | ${ns.format.number(currentMoney,2)}/${ns.format.number(maxMoney,2)} | ${currentSecurity}/${maxSecurity}`
		ns.print(`${context}\n`);
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
