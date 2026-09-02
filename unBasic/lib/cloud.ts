export class ProxyServer {
	hostname:string;
	target:string;
	server:Server;

	constructor(ns:NS,target:string) {
		this.target = target;
		this.hostname = `PRX-${target}` 
		ns.cloud.purchaseServer(this.hostname,8)
		this.server = ns.getServer(this.hostname);
	}

	


}