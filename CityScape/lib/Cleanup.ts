// Shared by all CityScape modules so the script needs only one Netscript atExit handler.
const exitList: (() => void)[] = [];

/** Queue a cleanup task to run when the script exits. */
export function onExit(task: () => void): void {
	exitList.push(task);
}

/** Pass this to ns.atExit once per script. Runs queued tasks in reverse order, then clears them. */
export function exitTasks(ns:NS): void {
	while (exitList.length) {
		try { exitList.pop()!(); } catch { /* keep going so one failure doesn't block the rest */ }
	}
	ns.ui.closeTail();
}
