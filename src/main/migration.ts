import fs from "node:fs/promises";
import path from "node:path";
import { decodeState } from "./model";

/** Copy the previous product's settings once; never remove or overwrite either copy. */
export async function copyLegacySettings(destination: string, source: string): Promise<boolean> {
  try {
    await fs.access(destination);
    return false;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  let bytes: string;
  try { bytes = await fs.readFile(source, "utf8"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
  decodeState(JSON.parse(bytes));
  await fs.mkdir(path.dirname(destination), { recursive: true });
  try { await fs.writeFile(destination, bytes, { flag: "wx" }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
  return true;
}
