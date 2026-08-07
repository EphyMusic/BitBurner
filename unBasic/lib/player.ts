import {NS} from "@ns";

class PlayerInfo {
	player:Player;
	money:number;

	constructor(ns:NS) {
		this.player = ns.getPlayer();
		this.money = this.player.money;
	}

	refreshPlayer(ns:NS) {
		this.player = ns.getPlayer();
	}
}