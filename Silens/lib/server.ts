import { getKeyList } from "./helpers/getKeyList";


export class ScannedServer {
    hostname: string;
    path: string[];
    server: Server;
    isRooted: boolean;
    isOwned: boolean;
    hasMoney: boolean;
    hasRam: boolean;

    constructor(ns: NS, hostname: string, path: string[]) {
        this.hostname = hostname;
        this.path = path;
        this.server = <Server>ns.getServer(hostname);
        this.isRooted = this.server.hasAdminRights;
        this.isOwned = this.server.purchasedByPlayer;
        this.hasMoney = this.server.moneyMax != undefined;
        this.hasRam = this.server.maxRam > 0;
    }

    getIncludedKeys<T extends ScannedServer>(ctor: new () => T): readonly string[] {
        return getKeyList(ctor, { removedKeys: ["hasMoney", "hasRam"] });
    }
    
}

