import type { DesktopAPI } from "../shared/types";
declare global {
  interface Window {
    timegate: DesktopAPI;
  }
}
export {};
