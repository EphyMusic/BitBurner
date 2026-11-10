import { HourglassView } from "./lib/HourglassView";
import { SandState } from "./lib/SandState";
import type { HourglassRecord } from "./lib/SandState";

/**
 * Adds a temporary Hourglass tab to the game sidebar. It shows six servers at once;
 * choose a sort mode or page through all money-bearing servers.
 */
export async function main(ns: NS): Promise<void> {
    ns.ramOverride(2.10)
	ns.disableLog("ALL");
	let hourglass: HourglassView | null = null;
	ns.atExit(() => hourglass?.dispose());
	hourglass = new HourglassView();

	const records = new Map<string, HourglassRecord>();
	let hostnames: string[] = [];
	let nextDiscovery = 0;

	while (hourglass.active) {
		const now = Date.now();
		if (now >= nextDiscovery) {
			hostnames = discoverHostnames(ns);
			const known = new Set(hostnames);
			for (const hostname of records.keys()) {
				if (!known.has(hostname)) records.delete(hostname);
			}
			nextDiscovery = now + 5000;
		}

		for (const hostname of hostnames) {
			if (!ns.hasRootAccess(hostname)) {
				records.delete(hostname);
				continue;
			}
			const money = ns.getServerMoneyAvailable(hostname);
			const maxMoney = ns.getServerMaxMoney(hostname);
			if (maxMoney <= 0) {
				records.delete(hostname);
				continue;
			}

			let record = records.get(hostname);
			if (!record) {
				record = {
					hostname, money, maxMoney, activity: 0,
					activitySamples: [], activitySampleCursor: 0, historySince: now,
					sand: new SandState(),
				};
				records.set(hostname, record);
			} else {
				const change = Math.abs(money - record.money);
				if (change > 0) {
					record.activitySamples.push({ at: now, change });
					record.activity += change;
				}
				record.money = money;
				record.maxMoney = maxMoney;
			}
			const cutoff = now - 60_000;
			while (record.activitySampleCursor < record.activitySamples.length
				&& record.activitySamples[record.activitySampleCursor].at <= cutoff) {
				record.activity -= record.activitySamples[record.activitySampleCursor].change;
				record.activitySampleCursor++;
			}
			if (record.activitySampleCursor > 256 && record.activitySampleCursor * 2 >= record.activitySamples.length) {
				record.activitySamples.splice(0, record.activitySampleCursor);
				record.activitySampleCursor = 0;
			}
			record.activity = Math.max(0, record.activity);
			record.sand.setMoney(money, maxMoney);
		}

		const serverRecords = Array.from(records.values());
		const activityReady = serverRecords.length > 0
			&& serverRecords.every(record => now - record.historySince >= 60_000);
		hourglass.setRecords(serverRecords, activityReady);
		await ns.sleep(100);
	}
}

function discoverHostnames(ns: NS): string[] {
	const found = new Set<string>(["home"]);
	const pending = ["home"];
	for (let cursor = 0; cursor < pending.length; cursor++) {
		for (const neighbor of ns.scan(pending[cursor])) {
			if (found.has(neighbor)) continue;
			found.add(neighbor);
			pending.push(neighbor);
		}
	}
	return Array.from(found).filter(hostname => hostname !== "home");
}
