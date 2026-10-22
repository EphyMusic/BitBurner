import { Dashboard, exitTasks } from "./lib/Dashboard";
import { Graph } from "./lib/Graph";

export async function main(ns: NS): Promise<void> {
	ns.atExit(exitTasks);
	const servers = ns.scan("home").slice(0, 6);
	const dash = new Dashboard(ns, { title: "Monitor" });
	const money = dash.add(new Graph({ title: "Money available", category: "Servers" }));
	const sec = dash.add(new Graph({ title: "Security level", category: "Security", format: v => v.toFixed(1) }));
	const player = dash.add(new Graph({ title: "Player money", category: "Player" }));

	while (await dash.tick(1000)) {
		for (const s of servers) {
			money.push(s, ns.getServerMoneyAvailable(s));
			sec.push(s, ns.getServerSecurityLevel(s));
		}
		player.push("money", ns.getPlayer().money);
	}
}
