import type { GeneralSettings, UpdateStatus } from "../shared/types";

export function initializeSettings(initial: GeneralSettings, version: string, navigate: () => void) {
  let current = initial;
  document.querySelector(".workspace")!.insertAdjacentHTML("beforeend", `
    <main id="general-settings" class="settings-page" aria-labelledby="general-settings-title" hidden>
      <div class="settings-content"><header class="settings-page-header"><h1 id="general-settings-title" tabindex="-1">设置</h1><button class="text-button" id="back-to-workspace">返回应用</button></header>
      <section class="preferences-section"><h3>外观</h3>
        <label class="preference-row" for="appearance"><span>主题</span><select id="appearance"><option value="system">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option></select></label>
      </section>
      <section class="preferences-section"><h3>启动</h3>
        <label class="toggle-line"><span>开机启动 Openlude</span><input id="auto-start" type="checkbox"><span class="switch" aria-hidden="true"></span></label>
      </section>
      <section class="preferences-section"><h3>更新</h3>
        <label class="toggle-line"><span>自动检查更新</span><input id="auto-check-updates" type="checkbox"><span class="switch" aria-hidden="true"></span></label>
        <div class="update-actions"><button class="button" id="check-update">检查更新</button><button class="button" id="download-update" hidden>下载更新</button><button class="button primary" id="install-update" hidden>重启安装</button></div>
        <p id="update-status" role="status"></p>
      </section>
      <section class="preferences-section about-section"><div><strong>Openlude</strong><span id="settings-version"></span></div><div class="about-links"><button class="text-button" id="settings-help">使用说明</button><button class="text-button" id="open-project">GitHub</button></div></section>
      <p id="settings-error" role="alert" hidden></p>
      </div>
    </main>`);
  const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
  const appearance = $<HTMLSelectElement>("#appearance");
  const autoStart = $<HTMLInputElement>("#auto-start");
  const autoCheck = $<HTMLInputElement>("#auto-check-updates");
  const error = $("#settings-error");
  $("#settings-version").textContent = version;
  const render = () => {
    appearance.value = current.appearance;
    autoStart.checked = current.autoStart;
    autoCheck.checked = current.autoCheckUpdates;
  };
  const showError = (cause: unknown) => {
    error.textContent = String(cause instanceof Error ? cause.message : cause).replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
    error.hidden = false;
  };
  const update = (status: UpdateStatus) => {
    $("#update-status").textContent = status.message;
    $<HTMLButtonElement>("#check-update").disabled = ["checking", "downloading", "ready"].includes(status.state);
    $("#download-update").hidden = status.state !== "available";
    $("#install-update").hidden = status.state !== "ready";
  };
  async function show() {
    render();
    error.hidden = true;
    navigate();
    update(await window.openlude.updateStatus());
  }
  const save = async () => {
    error.hidden = true;
    for (const element of [appearance, autoStart, autoCheck]) element.disabled = true;
    try {
      current = await window.openlude.settings({ appearance: appearance.value as GeneralSettings["appearance"], autoStart: autoStart.checked, autoCheckUpdates: autoCheck.checked });
    } catch (cause) { showError(cause); render(); }
    finally { for (const element of [appearance, autoStart, autoCheck]) element.disabled = false; }
  };
  for (const element of [appearance, autoStart, autoCheck]) element.addEventListener("change", () => void save());
  $("#nav-settings").addEventListener("click", () => void show().catch(showError));
  $("#check-update").addEventListener("click", () => void window.openlude.checkUpdates().then(update).catch(showError));
  $("#download-update").addEventListener("click", () => void window.openlude.downloadUpdate().catch(showError));
  $("#install-update").addEventListener("click", () => void window.openlude.installUpdate().catch(showError));
  $("#open-project").addEventListener("click", () => void window.openlude.openProject().catch(showError));
  $("#settings-help").addEventListener("click", () => $<HTMLDialogElement>("#help").showModal());
  const stopUpdates = window.openlude.onUpdate(update);
  const stopSettings = window.openlude.onOpenSettings(() => void show().catch(showError));
  window.addEventListener("pagehide", () => { stopUpdates(); stopSettings(); }, { once: true });
  render();
}
