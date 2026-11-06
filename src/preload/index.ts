import { contextBridge, ipcRenderer } from "electron";
import type { DesktopAPI } from "../shared/types";
const api: DesktopAPI = {
  state: () => ipcRenderer.invoke("state"),
  add: () => ipcRenderer.invoke("target:add"),
  remove: (id) => ipcRenderer.invoke("target:remove", id),
  bind: (id, theme, preferences) =>
    ipcRenderer.invoke("target:bind", id, theme, preferences),
  preferences: (value) => ipcRenderer.invoke("preferences", value),
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
contextBridge.exposeInMainWorld("timegate", api);
