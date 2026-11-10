import type { GeneralSettings, SettingsSection, UpdateStatus, ExternalLaunchStatus } from "../shared/types";

const symbols = {
  general: "M4 7h16M4 17h16M9 4v6M15 14v6",
  appearance: "M20 13a8 8 0 11-9-9 6 6 0 009 9M16 3v4M14 5h4",
  updates: "M12 3v12M7 10l5 5 5-5M5 15v5h14v-5",
  about: "M12 16v-5M12 7v1M21 12a9 9 0 11-18 0 9 9 0 0118 0",
};
const symbol = (name: keyof typeof symbols) => `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${symbols[name]}"/></svg>`;
const sections: { id: SettingsSection; title: string; description: string }[] = [
  { id: "general", title: "通用", description: "启动与后台运行方式" },
  { id: "appearance", title: "外观", description: "选择工作台的显示方式" },
  { id: "updates", title: "更新", description: "版本检查与安装" },
  { id: "about", title: "关于", description: "Openlude" },
];

export function initializeSettings(initial: GeneralSettings, version: string, navigate: () => void) {
  let current = initial;
  let selected: SettingsSection = "general";
  document.querySelector(".workspace")!.insertAdjacentHTML("beforeend", `
    <main id="general-settings" class="settings-page" aria-labelledby="general-settings-title" hidden>
      <aside class="settings-sidebar">
        <nav role="tablist" aria-label="设置分类" aria-orientation="vertical">
          ${sections.map(s => `<button class="settings-tab" id="settings-tab-${s.id}" role="tab" data-section="${s.id}" aria-controls="settings-panel-${s.id}" aria-selected="${s.id === selected}">${symbol(s.id)}${s.title}</button>`).join("")}
        </nav>
        <div class="settings-sidebar-bottom"><span>Openlude <span id="settings-version"></span></span><button class="text-button" id="back-to-workspace">返回工作台</button></div>
      </aside>
      <div class="settings-body"><div class="settings-content">
        <header class="settings-page-header"><h1 id="general-settings-title" tabindex="-1">通用</h1><p id="settings-description">启动与后台运行方式</p></header>
        <section id="settings-panel-general" role="tabpanel" aria-labelledby="settings-tab-general">
          <label class="preference-setting toggle-line"><span><strong>开机自动启动</strong><small>登录电脑后自动运行 Openlude</small></span><input id="auto-start" type="checkbox"><span class="switch" aria-hidden="true"></span></label>
          <label class="preference-setting toggle-line"><span><strong>登录后在后台运行</strong><small>不打开工作台，保留菜单栏或托盘入口</small></span><input id="start-in-background" type="checkbox"><span class="switch" aria-hidden="true"></span></label>
          <label class="preference-setting toggle-line"><span><strong>从系统入口启动时播放动画</strong><small>Openlude 在后台运行时，对新启动的已绑定应用生效</small></span><input id="animate-external-launches" type="checkbox"><span class="switch" aria-hidden="true"></span></label><p id="external-launch-status" role="status" hidden></p>
          <label class="preference-setting preference-row" for="close-behavior"><span><strong>关闭工作台时</strong><small>退出软件可通过菜单栏或托盘菜单操作</small></span><select id="close-behavior"><option value="background">继续在后台运行</option><option value="quit">退出 Openlude</option></select></label>
          <div class="tray-description"><strong>菜单栏 / 系统托盘</strong><p>打开工作台、启动已绑定应用、设置、检查更新、退出</p></div>
        </section>
        <section id="settings-panel-appearance" role="tabpanel" aria-labelledby="settings-tab-appearance" hidden>
          <label class="preference-setting preference-row" for="appearance"><span><strong>主题</strong><small>选择跟随系统、浅色或深色外观</small></span><select id="appearance"><option value="system">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option></select></label>
          <div class="appearance-preview" aria-hidden="true"><div></div><section><i></i><i></i><i></i></section></div>
        </section>
        <section id="settings-panel-updates" role="tabpanel" aria-labelledby="settings-tab-updates" hidden>
          <label class="preference-setting toggle-line"><span><strong>自动检查更新</strong><small>有新版本时提示，由你决定何时下载和安装</small></span><input id="auto-check-updates" type="checkbox"><span class="switch" aria-hidden="true"></span></label>
          <div class="update-actions"><button class="button" id="check-update">检查更新</button><button class="button" id="download-update" hidden>下载更新</button><button class="button primary" id="install-update" hidden>重启安装</button></div><p id="update-status" role="status"></p>
        </section>
        <section id="settings-panel-about" role="tabpanel" aria-labelledby="settings-tab-about" hidden>
          <div class="about-product"><img src="./assets/branding/app-icon.png" alt=""><h2>Openlude</h2><p class="about-version"></p><p>为每一次启动，添一点期待。</p></div><div class="about-links"><button class="button" id="settings-help">使用说明</button><button class="button" id="open-project">GitHub</button></div>
        </section>
        <p id="settings-error" role="alert" hidden></p>
      </div></div>
    </main>`);
  const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
  const appearance = $<HTMLSelectElement>("#appearance");
  const autoStart = $<HTMLInputElement>("#auto-start");
  const startInBackground = $<HTMLInputElement>("#start-in-background");
  const closeBehavior = $<HTMLSelectElement>("#close-behavior");
  const externalLaunches = $<HTMLInputElement>("#animate-external-launches");
  const autoCheck = $<HTMLInputElement>("#auto-check-updates");
  const fields = [appearance, autoStart, startInBackground, closeBehavior, autoCheck, externalLaunches];
  const error = $("#settings-error");
  $("#settings-version").textContent = version;
  $(".about-version").textContent = version;
  function selectSection(section: SettingsSection, focus = false) {
    selected = section;
    for (const s of sections) {
      const active = s.id === section;
      $("#settings-tab-" + s.id).setAttribute("aria-selected", String(active));
      $("#settings-tab-" + s.id).tabIndex = active ? 0 : -1;
      $("#settings-panel-" + s.id).hidden = !active;
    }
    const info = sections.find(s => s.id === section)!;
    $("#general-settings-title").textContent = info.title;
    $("#settings-description").textContent = info.description;
    if (focus) $("#settings-tab-" + section).focus();
  }
  const render = () => {
    appearance.value = current.appearance; autoStart.checked = current.autoStart;
    startInBackground.checked = current.startInBackground; startInBackground.disabled = !current.autoStart;
    externalLaunches.checked = current.animateExternalLaunches; closeBehavior.value = current.closeBehavior; autoCheck.checked = current.autoCheckUpdates;
  };
  const showError = (cause: unknown) => {
    error.textContent = String(cause instanceof Error ? cause.message : cause).replace(/^Error invoking remote method '[^']+': (Error: )?/, ""); error.hidden = false;
  };
  const update = (status: UpdateStatus) => {
    $("#update-status").textContent = status.message;
    $<HTMLButtonElement>("#check-update").disabled = ["checking", "downloading", "ready"].includes(status.state);
    $("#download-update").hidden = status.state !== "available";
    $("#download-update").textContent = status.manual ? "下载安装包" : "下载更新";
    $("#install-update").hidden = status.state !== "ready";
  };
  function showExternalStatus(status: ExternalLaunchStatus) {
    const element = $("#external-launch-status"); element.hidden = status.state !== "error";
    element.textContent = status.message;
  }
  async function show(section?: SettingsSection) {
    render(); error.hidden = true; selectSection(section ?? selected); navigate();
    update(await window.openlude.updateStatus());
    showExternalStatus(await window.openlude.externalLaunchStatus());
  }
  const save = async () => {
    error.hidden = true; fields.forEach(element => element.disabled = true);
    try {
      current = await window.openlude.settings({ appearance: appearance.value as GeneralSettings["appearance"], autoStart: autoStart.checked,
        startInBackground: startInBackground.checked, closeBehavior: closeBehavior.value as GeneralSettings["closeBehavior"], autoCheckUpdates: autoCheck.checked, animateExternalLaunches: externalLaunches.checked });
    } catch (cause) { showError(cause); }
    finally { fields.forEach(element => element.disabled = false); render(); }
  };
  fields.forEach(element => element.addEventListener("change", () => void save()));
  for (const section of sections) $("#settings-tab-" + section.id).addEventListener("click", () => selectSection(section.id));
  $(".settings-sidebar nav").addEventListener("keydown", event => {
    const index = sections.findIndex(s => s.id === selected);
    const next = event.key === "ArrowDown" ? (index + 1) % 4 : event.key === "ArrowUp" ? (index + 3) % 4 : event.key === "Home" ? 0 : event.key === "End" ? 3 : -1;
    if (next !== -1) { event.preventDefault(); selectSection(sections[next].id, true); }
  });
  $("#nav-settings").addEventListener("click", () => void show().catch(showError));
  $("#check-update").addEventListener("click", () => void window.openlude.checkUpdates().then(update).catch(showError));
  $("#download-update").addEventListener("click", () => void window.openlude.downloadUpdate().catch(showError));
  $("#install-update").addEventListener("click", () => void window.openlude.installUpdate().catch(showError));
  $("#open-project").addEventListener("click", () => void window.openlude.openProject().catch(showError));
  $("#settings-help").addEventListener("click", () => $<HTMLDialogElement>("#help").showModal());
  const stopExternalStatus = window.openlude.onExternalLaunchStatus(showExternalStatus);
  const stopUpdates = window.openlude.onUpdate(update);
  const stopSettings = window.openlude.onOpenSettings(section => void show(section).catch(showError));
  window.addEventListener("pagehide", () => { stopUpdates(); stopSettings(); stopExternalStatus(); }, { once: true });
  render(); selectSection(selected);
}
