export class CloudServer {
	readonly server:Server;
	target:Server;
	readonly path:string[];
	money = 0;
	security = 0;
	moneyMax = 0;
	securityMin = 0;

	private constructor(server:Server, target:Server, path:string[]) {
		this.server = server;
		this.target = target;
		this.path = path;
		this.refresh();
	}

	static create(ns:NS, host:string, target:string, path:string[]): CloudServer | null {
		const hostname = ns.serverExists(host) ? host : ns.cloud.purchaseServer(host, 8);
		if (hostname == "") return null;
		return new CloudServer(ns.getServer(hostname), ns.getServer(target), path);
	}

	private refresh() {
		this.money = this.target.moneyAvailable ?? 0;
		this.security = this.target.hackDifficulty ?? 0;
		this.moneyMax = this.target.moneyMax ?? 0;
		this.securityMin = this.target.minDifficulty ?? 0;
	}

	updateValues(ns:NS) {
		this.target = ns.getServer(this.target.hostname);
		this.refresh();
	}
	
	calculateThreads(ns:NS, state:string) {
		switch(state) {
			case "HACK":
				const hackTime = ns.getHackTime(this.target.hostname);
				const fullHackThread = ns.hackAnalyzeThreads(this.target.hostname, this.moneyMax - this.money);
				return {time: hackTime, threads: fullHackThread};
			case "GROW":
				const growTime = ns.getGrowTime(this.target.hostname);
				const fullGrowThread = ns.growthAnalyze(this.target.hostname, this.moneyMax / this.money);
				return {time: growTime, threads: fullGrowThread};
			case "WEAKEN":
				const weakenTime = ns.getWeakenTime(this.target.hostname);
				let fullWeakenThread = 0;
				let amount = 1;
				for (let i = 1; amount < this.security - this.securityMin; i++) {
					fullWeakenThread = i;
					amount = ns.weakenAnalyze(i);
				}
				return {time: weakenTime, threads: fullWeakenThread};
		}
	}

    sendFiles(ns: NS): boolean {
        const files = [
            "/unBasic/payload/weaken.ts",
            "/unBasic/payload/grow.ts",
            "/unBasic/payload/hack.ts",
            "/unBasic/payload/share.ts"
        ];
        const target = this.server.hostname;

        for (const file of files) {
            const finalFile = file.replace("/unBasic", "");
            if (!ns.fileExists(file, "home")) return false;
            if (!ns.scp(file, target, "home")) return false;
            ns.mv(target, file, finalFile);
        }
        return true;
    }

	killOld(ns: NS): boolean {
        const old = ns.ps(this.server.hostname);
        if (old.length > 0) {
            const res: boolean[] = [];
            for (const proc of old) {
                res.push(ns.kill(proc.pid));
            }
            for (const result of res) {
                if (!result) return false;
            }
            return true;
        }
        return true;
    }


}

