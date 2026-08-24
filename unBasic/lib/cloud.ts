import {NS} from "@ns"

export class ProxyServer {
	server:Server;

	constructor(ns:NS,hostname:string) {
		this.server = ns.getServer(hostname)
	}
}

export async function main(ns:NS) {
	
}