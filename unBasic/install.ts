// import {NS} from "@ns";

class DownloadError {
	message:string;
	time: number;

	constructor(message:string) {
		this.message = `ERROR: ${message}`;
		this.time = Date.now();
	}
}

export async function main(ns: NS) {
	ns.tprint("Downloading unBasic...")
	const files = [
		{_: ns.tprint("Downloading unbasic.ts..."),name: "unBasic.ts",success: await ns.wget("https://raw.githubusercontent.com/EphyMusic/BitBurner/refs/heads/main/unBasic/unbasic.ts","/unBasic/unbasic.ts","home"),manual: "wget https://raw.githubusercontent.com/EphyMusic/BitBurner/refs/heads/main/unBasic/unbasic.ts /unBasic/payload/weaken.ts"},
		{_: ns.tprint("Downloading weaken.ts..."),name: "weaken.ts",success: await ns.wget("https://raw.githubusercontent.com/EphyMusic/BitBurner/refs/heads/main/unBasic/payload/weaken.ts","/unBasic/payload/weaken.ts","home"),manual: "wget https://raw.githubusercontent.com/EphyMusic/BitBurner/refs/heads/main/unBasic/payload/weaken.ts /unBasic/payload/weaken.ts"},
		{_: ns.tprint("Downloading share.ts..."),name: "share.ts",success: await ns.wget("https://raw.githubusercontent.com/EphyMusic/BitBurner/refs/heads/main/unBasic/payload/share.ts", "/unBasic/payload/share.ts","home"),manual: "wget https://raw.githubusercontent.com/EphyMusic/BitBurner/refs/heads/main/unBasic/payload/share.ts /unBasic/payload/share.ts"},
		{_: ns.tprint("Downloading hack.ts..."),name: "hack.ts",success: await ns.wget("https://raw.githubusercontent.com/EphyMusic/BitBurner/refs/heads/main/unBasic/payload/hack.ts","/unBasic/payload/hack.ts","home"),manual: "wget https://raw.githubusercontent.com/EphyMusic/BitBurner/refs/heads/main/unBasic/payload/hack.ts /unBasic/payload/hack.ts"},
		{_: ns.tprint("Downloading grow.ts..."),name: "grow.ts",success: await ns.wget("https://raw.githubusercontent.com/EphyMusic/BitBurner/refs/heads/main/unBasic/payload/grow.ts", "/unBasic/payload/grow.ts","home"),manual: "wget https://raw.githubusercontent.com/EphyMusic/BitBurner/refs/heads/main/unBasic/payload/grow.ts /unBasic/payload/grow.ts"},
		{_: ns.tprint("Downloading common.ts"),name: "common.ts",success: await ns.wget("https://raw.githubusercontent.com/EphyMusic/BitBurner/refs/heads/main/unBasic/lib/common.ts", "/unBasic/lib/common.ts","home"),manual: "wget https://raw.githubusercontent.com/EphyMusic/BitBurner/refs/heads/main/unBasic/lib/common.ts /unBasic/lib/common.ts"},
		{_: ns.tprint("Downloading server.ts"),name: "server.ts",success: await ns.wget("https://raw.githubusercontent.com/EphyMusic/BitBurner/refs/heads/main/unBasic/lib/server.ts","/unBasic/lib/server.ts","home"),manual: "wget https://raw.githubusercontent.com/EphyMusic/BitBurner/refs/heads/main/unBasic/lib/server.ts /unBasic/lib/server.ts"}
	];
	const errors:DownloadError[] = []
	for (const file of files) {
		if (!file.success) errors.push(new DownloadError(`Failed to download ${file.name} from https://github.com/EphyMusic/BitBurner \nSuggest manual acquisition: home; ${file.manual}`));
	}
	if (errors.length > 0) {
		for (const err of errors) {
			ns.tprint(err.message);
		}
	} else {
		ns.tprint("Files successfully downloaded.");
	}
	ns.exit();
}
