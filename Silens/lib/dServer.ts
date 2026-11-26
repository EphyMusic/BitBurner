class DarkServer {
    password: string | number = ""

    private constructor(
    public server: Server & { isOnline: boolean },
    public nearby: string[],
    public details: DarknetServerDetails,
  ) {}

  static create(ns: NS): DarkServer | undefined {
    const server = ns.getServer(ns.getHostname()) as Server & { isOnline: boolean };
    if (server.isOnline !== true) return undefined;

    return new DarkServer(
      server,
      ns.dnet.probe(),
      ns.dnet.getServerDetails(server.hostname),
    );
  }

    refresh(ns:NS) {
        this.server = ns.getServer(ns.getHostname()) as Server & { isOnline: boolean }
        this.nearby = ns.dnet.probe()
        this.details = ns.dnet.getServerDetails(this.server.hostname)
    }

    async discoverPass(ns:NS,server:string) {
        this.refresh(ns)
        const format = this.details.passwordFormat
        const length = this.details.passwordLength
        const hint = this.details.passwordHint

        switch (format) {
            case "alphabetic":
                if (hint.includes("default")) {
                    const attempt = await ns.dnet.authenticate(server, "password")
                    if (attempt.success) {
                        this.password = "password"
                    }
                }
        }
    }
}