export function initTail(ns: NS, title: string, width: number, height: number, fontSize: number) {
    ns.disableLog("ALL");
    ns.ui.openTail();
    // await boot(ns);
    ns.ui.setTailTitle(title ?? "Test");
    const [x, y] = ns.ui.windowSize();
    ns.ui.resizeTail(width ?? x / 7, height ?? y / 7);
    ns.ui.setTailFontSize(fontSize ?? 14);
    ns.ui.moveTail(x - width, 0);
    ns.ui.renderTail();
    ns.atExit(ns.ui.closeTail);
}

export class HacknetNode {
	idx:number;
	stats:NodeStats;
	shouldRest:boolean;
	restTimer:number = 0;
	max = {ram:false,cores:false,lv:false}
	constructor(ns:NS,idx:number) {
		this.stats = ns.hacknet.getNodeStats(idx);
		this.idx = idx;
		this.shouldRest = false;
	}

	refreshStats(ns:NS) {
		this.stats = ns.hacknet.getNodeStats(this.idx);
	}
	
	buyRam(ns:NS,num:number = 1):boolean {
		return ns.hacknet.upgradeRam(this.idx,num);
	}

	buyCore(ns:NS,num:number = 1):boolean {
		return ns.hacknet.upgradeCore(this.idx,num);
	}

	buyLv(ns:NS,num:number = 1):boolean {
		return ns.hacknet.upgradeLevel(this.idx,num);
	}

	buyCache(ns:NS,num:number =1):boolean {
		return ns.hacknet.upgradeCache(this.idx,num);
	}

	output(ns:NS):string {
		this.refreshStats(ns)
		let output:string = `N:${this.idx}|L:${this.stats.level}|R:${this.stats.ram}|C:${this.stats.cores}`
		if (this.stats.cache) output += `|Ch:${this.stats.cache}`;
		if (this.stats.hashCapacity) output += `|Hc:${this.stats.hashCapacity}`;
		if (this.stats.ramUsed) output += `|Ru:${this.stats.ramUsed}`;
		output += `| $${ns.format.number(this.stats.production)}/s | $${ns.format.number(this.stats.totalProduction)} | ${ns.format.time(this.restTimer).replace("second","s").replace("ss","s").replace(" ","")}`
		return output;
	}

	runSelf(ns:NS,num:number = 1) {
		let upgraded = false;
		if (this.max.ram && this.max.cores && this.max.lv) return;
		if (this.shouldRest) return;
		if (this.stats.ram < 64) {
			if (this.buyRam(ns,num)) upgraded = true;
		} else {
			this.max.ram = true;
		}
		if (this.stats.cores < 16) {
			if (this.buyCore(ns,num)) upgraded = true;
		} else {
			this.max.cores = true;
		}
		if (this.stats.cores < 200) {
			if (this.buyLv(ns,num)) upgraded = true;
		} else {
			this.max.lv = true;
		}
		this.shouldRest = !upgraded;
		if (this.shouldRest) this.restTimer = 30000 + ((Math.random() * 4)-2);
	}
}

export async function initHacknet(ns: NS):Promise<HacknetNode[]> {
	const nodes:HacknetNode[] = [];
	const numNodes = ns.hacknet.numNodes();
	for (let i = 0; i < numNodes;i++) {
		nodes.push(new HacknetNode(ns,i));
	}
	let idx:number = 0;
	while (idx !== -1) {
		idx = ns.hacknet.purchaseNode()
		if (idx === -1) break;
		nodes.push(new HacknetNode(ns,idx));
		await ns.sleep(10)
	}
	// if (nodes.length === 0) {
	// 	const tNodes = ns.hacknet.numNodes()
	// 	if (tNodes === 0) return nodes;
	// 	for (let n = 0;n<tNodes;n++) nodes.push(new HacknetNode(ns,n));
	// }
	return nodes;
}

export async function main(ns:NS) {
	initTail(ns,"Hacknet Node Manager",430,570,14)
	const nodes = await initHacknet(ns)
	let lastTime = Date.now()
	while(true) {
		ns.clearLog()
		const nodeNew:number = ns.hacknet.purchaseNode();
		if (nodeNew != -1) nodes.push(new HacknetNode(ns,nodeNew));
		const now:number = Date.now();
		const dt:number = now - lastTime;
		const output:string[] = [];
		let perSecSum:number = 0;
		let totalSum:number = 0;
		for (const node of nodes) {
			if (node.shouldRest) {
				if (node.restTimer > 0) {
					node.restTimer = Math.max(node.restTimer - dt,0);
				} else {
					node.shouldRest = false;
				}
			}
			node.runSelf(ns);
			perSecSum += node.stats.production;
			totalSum += node.stats.totalProduction
			output.push(node.output(ns));
			lastTime = now;
		}
		ns.print("$" + ns.format.number(perSecSum) + "/s | $" + ns.format.number(totalSum) + "\n" + output.join("\n"))
		ns.ui.renderTail();
		await ns.sleep(100);
		
	}
}