import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { ExternalLaunchStatus, Target } from "../shared/types";

export class LaunchObserver {
  status: ExternalLaunchStatus = { state: "waiting", message: "添加本机应用后生效" };
  private child?: ChildProcessWithoutNullStreams;
  private targets: { id: string; path: string }[] = [];
  private enabled = false;
  private fingerprint = "";
  private running = new Set<string>();
  private expected = new Map<string, number>();
  private pending = new Map<string, { resolve: (value: boolean) => void; timer: ReturnType<typeof setTimeout> }>();
  private retry?: ReturnType<typeof setTimeout>;
  private readyTimer?: ReturnType<typeof setTimeout>;
  private retries = 0;
  constructor(private nativeRoot: string, private compiledRoot: string,
    private launched: (id: string, pid: number) => void,
    private changed: (status: ExternalLaunchStatus) => void) {}
  configure(targets: Target[], enabled: boolean) {
    const watched = targets.filter((target): target is Target & { path: string } => !!target.path).map(({ id, path }) => ({ id, path }));
    const fingerprint = JSON.stringify([enabled, watched]);
    if (fingerprint === this.fingerprint) return;
    this.fingerprint = fingerprint; this.targets = watched; this.enabled = enabled; this.retries = 0;
    clearTimeout(this.retry);
    if (!enabled || !watched.length) {
      this.stop(); this.setStatus({ state: enabled ? "waiting" : "off", message: enabled ? "添加本机应用后生效" : "已关闭系统启动动画" }); return;
    }
    if (this.child) this.configureChild();
    else this.start();
  }
  private setStatus(status: ExternalLaunchStatus) { this.status = status; this.changed(status); }
  private start() {
    if (!this.enabled || !this.targets.length) return;
    this.setStatus({ state: "starting", message: "正在连接系统启动检测…" });
    const command = process.platform === "darwin" ? path.join(this.compiledRoot, `launch-observer-darwin-${process.arch}`) : "powershell.exe";
    const args = process.platform === "darwin" ? [] : ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", path.join(this.nativeRoot, "launch-observer-windows.ps1")];
    if (!["darwin", "win32"].includes(process.platform)) { this.setStatus({ state: "error", message: "此系统暂不支持启动检测" }); return; }
    const child = spawn(command, args, { windowsHide: true, stdio: "pipe" });
    this.child = child;
    const lines = createInterface({ input: child.stdout });
    lines.on("line", line => { if (child === this.child && line.length < 65536) this.receive(line); });
    child.stderr.on("data", () => {});
    child.stdin.on("error", () => {});
    let handled = false;
    const failed = () => {
      if (handled || this.child !== child) return;
      handled = true; this.child = undefined; lines.close();
      clearTimeout(this.readyTimer);
      this.running.clear(); this.expected.clear(); this.resolvePending();
      this.setStatus({ state: "error", message: "系统启动检测已断开，可关闭此选项后重新开启" });
      if (this.enabled && ++this.retries <= 3) {
        this.retry = setTimeout(() => this.start(), 1000 * this.retries);
        this.retry.unref();
      }
    };
    child.on("error", failed); child.on("exit", failed);
    this.configureChild();
  }
  private configureChild() {
    clearTimeout(this.readyTimer);
    const child = this.child;
    this.readyTimer = setTimeout(() => { if (this.child === child) child?.kill(); }, 10000);
    this.readyTimer.unref();
    this.send({ type: "configure", targets: this.targets });
  }
  private send(value: object) {
    if (this.child?.stdin.writable) this.child.stdin.write(JSON.stringify(value) + "\n");
  }
  private receive(line: string) {
    let value: { type?: string; id?: string; pid?: number; running?: { id: string; pid: number }[]; request?: string; ok?: boolean };
    try { value = JSON.parse(line); } catch { return; }
    if (!value || typeof value !== "object") return;
    if (value.type === "ready" && Array.isArray(value.running)) {
      clearTimeout(this.readyTimer); this.retries = 0;
      this.running = new Set(value.running.filter(item => item && typeof item.id === "string" && this.targets.some(target => target.id === item.id)).map(item => item.id));
      this.setStatus({ state: "ready", message: "已开启，Openlude 在后台运行时生效" }); return;
    }
    if (value.type === "error") { clearTimeout(this.readyTimer); this.setStatus({ state: "error", message: "部分应用的启动入口无法检测，请重新添加本机应用" }); return; }
    if (value.type === "activated" && typeof value.request === "string") {
      const pending = this.pending.get(value.request);
      if (pending) { clearTimeout(pending.timer); pending.resolve(value.ok === true); this.pending.delete(value.request); }
      return;
    }
    const id = value.id;
    if (!id || !this.targets.some(target => target.id === id)) return;
    if (value.type === "terminated") { this.running.delete(id); this.expected.delete(id); return; }
    if (value.type !== "launch" || !Number.isInteger(value.pid) || value.pid! < 0) return;
    if (this.running.has(id)) return;
    this.running.add(id);
    const expectedUntil = this.expected.get(id); this.expected.delete(id);
    if (expectedUntil && expectedUntil >= Date.now()) return;
    this.launched(id, value.pid!);
  }
  expectInternal(id: string) { if (!this.running.has(id)) this.expected.set(id, Date.now() + 15000); }
  cancelInternal(id: string) { this.expected.delete(id); }
  activate(id: string): Promise<boolean> {
    if (!this.child || this.status.state !== "ready" || process.platform !== "darwin") return Promise.resolve(false);
    return new Promise(resolve => {
      const request = randomUUID();
      const timer = setTimeout(() => { this.pending.delete(request); resolve(false); }, 1200); timer.unref();
      this.pending.set(request, { resolve, timer }); this.send({ type: "activate", id, request });
    });
  }
  private resolvePending() { for (const { resolve, timer } of this.pending.values()) { clearTimeout(timer); resolve(false); } this.pending.clear(); }
  stop() {
    clearTimeout(this.retry);
    clearTimeout(this.readyTimer);
    const child = this.child; this.child = undefined;
    child?.stdin.end(); child?.kill(); this.running.clear(); this.expected.clear(); this.resolvePending();
  }
}
