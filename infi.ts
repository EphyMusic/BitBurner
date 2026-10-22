import { colorize } from "unBasic/lib/common"

export async function main(ns: NS) {
	ns.disableLog("ALL");
	const locs = ns.infiltration.getPossibleLocations();
	const locInfos: InfiltrationLocation[] = [];

	for (const loc of locs) {
		const info = ns.infiltration.getInfiltration(loc.name);
		locInfos.push(info);
	}

	switch(ns.args[0]) {
		case "-r":
			locInfos.sort((a,b) => {
				return a.reward.SoARep - b.reward.SoARep;
			})
			locInfos.reverse()
			break;
		case "-d":
		default:
			locInfos.sort((a,b) => {
				return a.difficulty - b.difficulty;
			})
			break;
	}



	const printables:string[] = [];
	for (const info of locInfos) {	
		printables.push(colorize(`${info.location.name} <-> ${info.location.city}`,100,255,100) + colorize(`:\n-Dif:${ns.format.number(info.difficulty * 28.533129069322097)} |CL:${info.maxClearanceLevel} |R:${ns.format.number(info.reward.SoARep)}\n`,255,255,100));
	}
	ns.ui.openTail()
	ns.print(printables.join("\n"));
	ns.ui.renderTail()
}