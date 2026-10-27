import { CityScape } from "./lib/CityScape";
import { exitTasks } from "./lib/Cleanup";

/**
 * 3D replacement for the City tab. Open the City page (ASCII map mode, not list mode) and
 * run this; building clicks behave exactly like clicking the original map. Close it with the
 * on-screen exit button or by killing the script - the original city view is restored.
 */
export async function main(ns: NS): Promise<void> {
	// ns.ramOverride(1.65)
	ns.atExit(exitTasks);
	ns.disableLog("ALL");
	ns.clearLog();
	ns.ui.openTail();
	ns.ui.resizeTail(250,35)
	ns.ui.setTailMinimized(true);
	const city = new CityScape(ns);
	while (await city.tick(200)) { /* sync happens inside tick */ }
}
