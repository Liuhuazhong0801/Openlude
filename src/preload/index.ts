import { contextBridge, ipcRenderer } from "electron";
import type { DesktopAPI } from "../shared/types";
const api: DesktopAPI = {
  state: () => ipcRenderer.invoke("state"),
  add: (id) => ipcRenderer.invoke("target:add", id),
  remove: (id) => ipcRenderer.invoke("target:remove", id),
  bind: (id, theme) => ipcRenderer.invoke("target:bind", id, theme),
  preferences: (value) => ipcRenderer.invoke("preferences", value),
  launch: (id) => ipcRenderer.invoke("launch", id),
  preview: (theme, id) => ipcRenderer.invoke("preview", theme, id),
  overlayPayload: () => ipcRenderer.invoke("overlay:payload"),
  overlayReady: (id) => ipcRenderer.send("overlay:ready", id),
  overlayFinish: (id) => ipcRenderer.send("overlay:finish", id),
  onAnimate: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("overlay:animate", listener);
    return () => ipcRenderer.removeListener("overlay:animate", listener);
  },
};
contextBridge.exposeInMainWorld("timegate", api);
