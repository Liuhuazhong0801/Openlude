import { contextBridge, ipcRenderer } from "electron";
import type { DesktopAPI } from "../shared/types";
const api: DesktopAPI = {
  state: () => ipcRenderer.invoke("state"),
  add: () => ipcRenderer.invoke("target:add"),
  remove: (id) => ipcRenderer.invoke("target:remove", id),
  bind: (id, theme, preferences) =>
    ipcRenderer.invoke("target:bind", id, theme, preferences),
  preferences: (value) => ipcRenderer.invoke("preferences", value),
  settings: value => ipcRenderer.invoke("settings:update", value),
  updateStatus: () => ipcRenderer.invoke("updates:status"),
  checkUpdates: () => ipcRenderer.invoke("updates:check"),
  downloadUpdate: () => ipcRenderer.invoke("updates:download"),
  installUpdate: () => ipcRenderer.invoke("updates:install"),
  openProject: () => ipcRenderer.invoke("project:open"),
  onUpdate: callback => {
    const listener = (_event: Electron.IpcRendererEvent, status: Parameters<typeof callback>[0]) => callback(status);
    ipcRenderer.on("updates:status", listener);
    return () => ipcRenderer.removeListener("updates:status", listener);
  },
  onOpenSettings: callback => {
    const listener = () => callback();
    ipcRenderer.on("settings:open", listener);
    return () => ipcRenderer.removeListener("settings:open", listener);
  },
  launch: (id) => ipcRenderer.invoke("launch", id),
  preview: (theme, id, preferences) =>
    ipcRenderer.invoke("preview", theme, id, preferences),
  overlayPayload: () => ipcRenderer.invoke("overlay:payload"),
  overlayReady: (id) => ipcRenderer.send("overlay:ready", id),
  overlayFinish: (id) => ipcRenderer.send("overlay:finish", id),
  overlaySkip: (id) => ipcRenderer.send("overlay:skip", id),
  onAnimate: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("overlay:animate", listener);
    return () => ipcRenderer.removeListener("overlay:animate", listener);
  },
};
contextBridge.exposeInMainWorld("openlude", api);
