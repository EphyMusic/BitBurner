class HacknetNode {
	node:number
	info:NodeStats
	constructor(ns:NS,num:number) {
		this.node = num;
		this.info = ns.hacknet.getNodeStats(num);
	}

	refreshNodeInfo(ns:NS) {
		this.info = ns.hacknet.getNodeStats(this.node);
	}

	canUpgrade(ns:NS,component:string,num:number):boolean {
		const currMoney = ns.getPlayer().money
		if (typeof component !== "string") {
			ns.tprint(`ERROR: In canUpgrade() [param component not string, instead: ${typeof component}]`)
			ns.exit()
		}
		switch (component) {
			case "RAM":
				return ns.hacknet.getRamUpgradeCost(this.node,num) <= currMoney;
			case "CORE":
				return ns.hacknet.getCoreUpgradeCost(this.node,num) <= currMoney;
			case "LV":
				return ns.hacknet.getLevelUpgradeCost(this.node,num) <= currMoney;
			case "CACHE":
				if (!this.info.cache) return false;
				return ns.hacknet.getCacheUpgradeCost(this.node,num) <= currMoney;
			default:
				return false;
		}
	}

	maxBuyable(ns:NS,component:string,limit:number):number {
		let max = 0;
		for (let i = 1;i <= limit;i++) {
			if (this.canUpgrade(ns,component,i)) max ++;
		}
		return max;
	}
}

