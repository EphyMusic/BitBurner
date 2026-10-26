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
	ns.tprint("Downloading CityScape...")
	const files = [
		{_: ns.tprint("Downloading main.ts..."),name: "main.ts",success: await ns.wget("https://raw.githubusercontent.com/EphyMusic/BitBurner/refs/heads/main/CityScape/main.ts","/CityScape/main.ts","home"),manual: "wget https://raw.githubusercontent.com/EphyMusic/BitBurner/refs/heads/main/CityScape/main.ts /CityScape/main.ts"},
        {_: ns.tprint("Downloading Camera.ts..."),name:"Camera.ts",success: await ns.wget("https://raw.githubusercontent.com/EphyMusic/BitBurner/refs/heads/main/CityScape/lib/Camera.ts","/CityScape/lib/Camera.ts","home"),manual: "wget https://raw.githubusercontent.com/EphyMusic/BitBurner/refs/heads/main/CityScape/lib/Camera.ts /CityScape/lib/Camera.ts"},
        {_: ns.tprint("Downloading CityDom.ts..."),name:"CityDom.ts",success: await ns.wget("https://raw.githubusercontent.com/EphyMusic/BitBurner/refs/heads/main/CityScape/lib/CityDom.ts","/CityScape/lib/CityDom.ts","home"),manual: "wget https://raw.githubusercontent.com/EphyMusic/BitBurner/refs/heads/main/CityScape/lib/CityDom.ts /CityScape/lib/CityDom.ts"},
        {_: ns.tprint("Downloading CityParser.ts..."),name:"CityParser.ts",success: await ns.wget("https://raw.githubusercontent.com/EphyMusic/BitBurner/refs/heads/main/CityScape/lib/CityParser.ts","/CityScape/lib/CityParser.ts","home"),manual: "wget https://raw.githubusercontent.com/EphyMusic/BitBurner/refs/heads/main/CityScape/lib/CityParser.ts /CityScape/lib/CityParser.ts"},
        {_: ns.tprint("Downloading CityScape.ts..."),name:"CityScape.ts",success: await ns.wget("https://raw.githubusercontent.com/EphyMusic/BitBurner/refs/heads/main/CityScape/lib/CityScape.ts","/CityScape/lib/CityScape.ts","home"),manual: "wget https://raw.githubusercontent.com/EphyMusic/BitBurner/refs/heads/main/CityScape/lib/CityScape.ts /CityScape/lib/CityScape.ts"},
        {_: ns.tprint("Downloading Cleanup.ts..."),name:"Cleanup.ts",success: await ns.wget("https://raw.githubusercontent.com/EphyMusic/BitBurner/refs/heads/main/CityScape/lib/Cleanup.ts","/CityScape/lib/Cleanup.ts","home"),manual: "wget https://raw.githubusercontent.com/EphyMusic/BitBurner/refs/heads/main/CityScape/lib/Cleanup.ts /CityScape/lib/Cleanup.ts"},
        {_: ns.tprint("Downloading Grid.ts..."),name:"Grid.ts",success: await ns.wget("https://raw.githubusercontent.com/EphyMusic/BitBurner/refs/heads/main/CityScape/lib/Grid.ts","/CityScape/lib/Grid.ts","home"),manual: "wget https://raw.githubusercontent.com/EphyMusic/BitBurner/refs/heads/main/CityScape/lib/Grid.ts /CityScape/lib/Grid.ts"},
        {_: ns.tprint("Downloading Label.ts..."),name:"Label.ts",success: await ns.wget("https://raw.githubusercontent.com/EphyMusic/BitBurner/refs/heads/main/CityScape/lib/Label.ts","/CityScape/lib/Label.ts","home"),manual: "wget https://raw.githubusercontent.com/EphyMusic/BitBurner/refs/heads/main/CityScape/lib/Label.ts /CityScape/lib/Label.ts"},
        {_: ns.tprint("Downloading Layout.ts..."),name:"Layout.ts",success: await ns.wget("https://raw.githubusercontent.com/EphyMusic/BitBurner/refs/heads/main/CityScape/lib/Layout.ts","/CityScape/lib/Layout.ts","home"),manual: "wget https://raw.githubusercontent.com/EphyMusic/BitBurner/refs/heads/main/CityScape/lib/Layout.ts /CityScape/lib/Layout.ts"},
        {_: ns.tprint("Downloading Mat4.ts..."),name:"Mat4.ts",success: await ns.wget("https://raw.githubusercontent.com/EphyMusic/BitBurner/refs/heads/main/CityScape/lib/Mat4.ts","/CityScape/lib/Mat4.ts","home"),manual: "wget https://raw.githubusercontent.com/EphyMusic/BitBurner/refs/heads/main/CityScape/lib/Mat4.ts /CityScape/lib/Mat4.ts"},
        {_: ns.tprint("Downloading MeshBuilder.ts..."),name:"MeshBuilder.ts",success: await ns.wget("https://raw.githubusercontent.com/EphyMusic/BitBurner/refs/heads/main/CityScape/lib/MeshBuilder.ts","/CityScape/lib/MeshBuilder.ts","home"),manual: "wget https://raw.githubusercontent.com/EphyMusic/BitBurner/refs/heads/main/CityScape/lib/MeshBuilder.ts /CityScape/lib/MeshBuilder.ts"},
        {_: ns.tprint("Downloading Overlay.ts..."),name:"Overlay.ts",success: await ns.wget("https://raw.githubusercontent.com/EphyMusic/BitBurner/refs/heads/main/CityScape/lib/Overlay.ts","/CityScape/lib/Overlay.ts","home"),manual: "wget https://raw.githubusercontent.com/EphyMusic/BitBurner/refs/heads/main/CityScape/lib/Overlay.ts /CityScape/lib/Overlay.ts"},
        {_: ns.tprint("Downloading Palette.ts..."),name:"Palette.ts",success: await ns.wget("https://raw.githubusercontent.com/EphyMusic/BitBurner/refs/heads/main/CityScape/lib/Palette.ts","/CityScape/lib/Palette.ts","home"),manual: "wget https://raw.githubusercontent.com/EphyMusic/BitBurner/refs/heads/main/CityScape/lib/Palette.ts /CityScape/lib/Palette.ts"},
        {_: ns.tprint("Downloading Renderer.ts..."),name:"Renderer.ts",success: await ns.wget("https://raw.githubusercontent.com/EphyMusic/BitBurner/refs/heads/main/CityScape/lib/Renderer.ts","/CityScape/lib/Renderer.ts","home"),manual: "wget https://raw.githubusercontent.com/EphyMusic/BitBurner/refs/heads/main/CityScape/lib/Renderer.ts /CityScape/lib/Renderer.ts"},
        {_: ns.tprint("Downloading Roads.ts..."),name:"Roads.ts",success: await ns.wget("https://raw.githubusercontent.com/EphyMusic/BitBurner/refs/heads/main/CityScape/lib/Roads.ts","/CityScape/lib/Roads.ts","home"),manual: "wget https://raw.githubusercontent.com/EphyMusic/BitBurner/refs/heads/main/CityScape/lib/Roads.ts /CityScape/lib/Roads.ts"},
        {_: ns.tprint("Downloading SceneBuilder.ts..."),name:"SceneBuilder.ts",success: await ns.wget("https://raw.githubusercontent.com/EphyMusic/BitBurner/refs/heads/main/CityScape/lib/SceneBuilder.ts","/CityScape/lib/SceneBuilder.ts","home"),manual: "wget https://raw.githubusercontent.com/EphyMusic/BitBurner/refs/heads/main/CityScape/lib/SceneBuilder.ts /CityScape/lib/SceneBuilder.ts"}
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
