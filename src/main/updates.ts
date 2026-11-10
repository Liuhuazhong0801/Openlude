import { app, net, shell } from "electron";
import { autoUpdater } from "electron-updater";
import type { UpdateStatus } from "../shared/types";
import { PROJECT_URL, parseStableRelease, hasNativeUpdateMetadata } from "./release-info";

export { PROJECT_URL };
const RELEASE_API = "https://api.github.com/repos/Liuhuazhong0801/Openlude/releases/latest";

export class UpdateManager {
  status: UpdateStatus = { state: "idle", message: "" };
  private checking = false;
  private manualDownloadPage?: string;
  private timer?: ReturnType<typeof setTimeout>;
  private interval?: ReturnType<typeof setInterval>;

  constructor(private notify: (status: UpdateStatus) => void) {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowPrerelease = false;
    autoUpdater.on("update-available", info => this.set({ state: "available", version: info.version, message: `新版本 ${info.version} 可用` }));
    autoUpdater.on("update-not-available", () => this.set({ state: "current", message: "已是最新版本" }));
    autoUpdater.on("download-progress", info => this.set({ ...this.status, state: "downloading", progress: Math.round(info.percent), message: `正在下载 ${Math.round(info.percent)}%` }));
    autoUpdater.on("update-downloaded", info => this.set({ state: "ready", version: info.version, message: "更新已下载，重启后安装" }));
    autoUpdater.on("error", () => this.set({ state: "error", message: "更新失败，请稍后重试" }));
  }

  private set(status: UpdateStatus) {
    this.status = status;
    this.notify(status);
  }

  autoCheck(enabled: boolean) {
    clearTimeout(this.timer);
    clearInterval(this.interval);
    if (!enabled || process.env.OPENLUDE_TEST_DATA || !app.isPackaged) return;
    this.timer = setTimeout(() => void this.check(), 8000);
    this.interval = setInterval(() => void this.check(), 6 * 60 * 60 * 1000);
    this.timer.unref();
    this.interval.unref();
  }

  async check(): Promise<UpdateStatus> {
    if (this.checking || ["downloading", "ready"].includes(this.status.state)) return this.status;
    this.checking = true;
    this.manualDownloadPage = undefined;
    this.set({ state: "checking", message: "正在检查更新…" });
    try {
      const response = await net.fetch(RELEASE_API, {
        headers: { Accept: "application/vnd.github+json" },
        signal: AbortSignal.timeout(12000),
      });
      if (response.status === 404) {
        this.set({ state: "empty", message: "尚未发布正式版本" });
      } else if (!response.ok) {
        throw new Error("Release lookup failed");
      } else if (!app.isPackaged) {
        this.set({ state: "development", message: "开发模式，请在安装版中更新" });
      } else {
        const release = parseStableRelease(await response.json());
        if (autoUpdater.currentVersion.compare(release.version) >= 0) {
          this.set({ state: "current", message: "已是最新版本" });
        } else if (!hasNativeUpdateMetadata(release, process.platform)) {
          this.manualDownloadPage = release.downloadPage;
          this.set({ state: "available", manual: true, version: release.version, message: `发现新版本 ${release.version}，请下载安装包完成更新` });
        } else {
          await autoUpdater.checkForUpdates();
        }
      }
    } catch {
      this.set({ state: "error", message: "无法检查更新，请稍后重试" });
    } finally { this.checking = false; }
    return this.status;
  }

  async download() {
    if (this.status.state !== "available") return;
    if (this.manualDownloadPage) {
      try { await shell.openExternal(this.manualDownloadPage); }
      catch { this.set({ state: "error", message: "无法打开下载页面，请稍后重试" }); }
      return;
    }
    this.set({ ...this.status, state: "downloading", progress: 0, message: "正在下载 0%" });
    try { await autoUpdater.downloadUpdate(); }
    catch { this.set({ state: "error", message: "下载失败，请重新检查更新" }); }
  }

  install() {
    if (this.status.state !== "ready") throw new Error("更新尚未下载完成");
    autoUpdater.quitAndInstall();
  }
}
