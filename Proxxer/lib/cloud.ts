export class CloudServer {
	server:Server;
	target:Server;
	state:string;
	lastState:string;
	money:number;
	security:number;
	moneyMax:number;
	securityMin:number;

	constructor(ns:NS, host:string, target:string) {
		this.server = ns.getServer(host) as Server;
		this.target = ns.getServer(target) as Server;
		this.state = "INIT";
		this.lastState = "INIT";
		this.money = this.target.moneyAvailable? this.target.moneyAvailable : 0;
		this.security = this.target.hackDifficulty? this.target.hackDifficulty : 0;
		this.moneyMax = this.target.moneyMax? this.target.moneyMax : 0;
		this.securityMin = this.target.minDifficulty? this.target.minDifficulty : 0;	
	}
	
	calculateThreads(ns:NS) {
		switch(this.state) {
			case "HACK":
				const hackTime = ns.getHackTime(this.target.hostname);
				const fullHackThread = ns.hackAnalyzeThreads(this.target.hostname, this.money);
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

	runState(ns:NS) {
		switch(this.state) {
			case "INIT":
				if (!this.target.moneyAvailable || this.moneyMax == 0) {
					this.state = "SHARE";
					return;
				} else {
					if (this.money < this.moneyMax / 10) {
						this.state = "GROW";
					} else if (this.security > this.securityMin * 1.2) {
						this.state = "WEAKEN";
					} else {
						this.state = "HACK";
					}
				}
				return;
			
			case "SHARE":
				// Implement the logic for the SHARE state here
				return;
			case "HACK":
				// Implement the logic for the HACK state here
				break;
			case "GROW":
				// Implement the logic for the GROW state here
				break;
			case "WEAKEN":
				// Implement the logic for the WEAKEN state here
				break;
		}
	}
}

