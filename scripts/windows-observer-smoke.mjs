import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { createInterface } from "node:readline";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";

const runtime = process.env.OPENLUDE_PWSH || (process.platform === "win32" ? "powershell.exe" : undefined);
if (!runtime) { console.log("Windows observer test requires Windows or OPENLUDE_PWSH for its cross-platform protocol checks."); process.exit(0); }
const root = path.resolve(import.meta.dirname, "..");
const script = process.env.OPENLUDE_OBSERVER_SCRIPT || path.join(root, "native/launch-observer-windows.ps1");
const directory = await fs.mkdtemp(path.join(os.tmpdir(), "openlude-observer-"));
const executable = path.join(directory, "中文 observer fixture.exe");
const exec = promisify(execFile);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const timeout = Number(process.env.OPENLUDE_OBSERVER_TEST_TIMEOUT || 15000);
let helper, fixture, stderr = "";
const messages = [], checks = [];
const check = name => { checks.push(name); console.log("PASS", name); };
const until = async (condition, milliseconds = timeout) => {
  const start = Date.now();
  while (Date.now() - start < milliseconds) {
    if (condition()) return;
    if (helper?.exitCode !== null) throw new Error(`Observer exited: ${stderr}`);
    await delay(30);
  }
  throw new Error(`Observer timed out: ${stderr}; messages=${JSON.stringify(messages)}`);
};
try {
  if (process.platform === "win32") {
    const compile = path.join(directory, "compile.ps1");
    await fs.writeFile(compile, `param([string]$Destination)\nAdd-Type -TypeDefinition 'using System.Threading; public static class Fixture { public static void Main() { Thread.Sleep(30000); } }' -OutputAssembly $Destination -OutputType ConsoleApplication\n`);
    await exec(runtime, ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", compile, executable], { timeout: 30000, windowsHide: true });
  }
  helper = spawn(runtime, ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script], {
    windowsHide: true, stdio: "pipe", env: { ...process.env, OPENLUDE_OBSERVER_DIAGNOSTICS: "1" },
  });
  helper.stderr.on("data", data => { stderr += data; });
  createInterface({ input: helper.stdout }).on("line", line => { try { messages.push(JSON.parse(line)); } catch {} });
  const configure = targets => helper.stdin.write(JSON.stringify({ type: "configure", targets }) + "\n");
  configure([{ id: "fixture", path: executable }]);
  await until(() => messages.some(m => m.type === "ready"));
  assert.deepEqual(messages.find(m => m.type === "ready").running, []);
  check("A single configure message gets ready without a second stdin write");

  if (process.platform === "win32") {
    fixture = spawn(executable, [], { windowsHide: true, stdio: "ignore" });
    try { await until(() => messages.some(m => m.type === "launch" && m.id === "fixture")); }
    catch (error) {
      const inspect = path.join(directory, "inspect.ps1");
      await fs.writeFile(inspect, `param([int]$ProcessId)\nGet-Process -Id $ProcessId | Select-Object ProcessName,Path,Id | ConvertTo-Json -Compress\n`);
      const result = await exec(runtime, ["-NoProfile", "-NonInteractive", "-File", inspect, String(fixture.pid)], { windowsHide: true }).catch(e => ({ stdout: String(e) }));
      error.message += `; fixture=${result.stdout}; configured=${executable}; exit=${fixture.exitCode}`;
      throw error;
    }
    assert.equal(messages.find(m => m.type === "launch").pid, fixture.pid);
    await delay(600);
    assert.equal(messages.filter(m => m.type === "launch").length, 1);
    check("Polling detects one real launch while stdin stays idle");
    configure([{ id: "existing", path: executable }]);
    await until(() => messages.filter(m => m.type === "ready").length === 2);
    assert.equal(messages.filter(m => m.type === "ready").at(-1).running[0].pid, fixture.pid);
    fixture.kill();
    await until(() => messages.some(m => m.type === "terminated" && m.id === "existing"));
    fixture = undefined;
    check("Reconfiguration snapshots existing processes and termination is detected");

    const shortcut = path.join(directory, "shortcut.lnk"), createShortcut = path.join(directory, "shortcut.cjs");
    // Use the Windows Unicode shell API, rather than WScript's ANSI TargetPath setter.
    await fs.writeFile(createShortcut, `const {app,shell}=require("electron");
const fs=require("node:fs"),path=require("node:path");
const data=path.join(path.dirname(process.argv[2]),"electron-state");fs.mkdirSync(data,{recursive:true});app.setPath("userData",data);
app.whenReady().then(()=>{
 if(!shell.writeShortcutLink(process.argv[2],"create",{target:process.argv[3]}))throw new Error("Shortcut creation failed");
 const info=shell.readShortcutLink(process.argv[2]);
 console.log("SHORTCUT:"+JSON.stringify({target:info.target,exists:fs.existsSync(info.target)}));app.quit();
}).catch(error=>{console.error(error);app.exit(1);});
`);
    const { default: electronExecutable } = await import("electron");
    const shortcutResult = await exec(electronExecutable, [createShortcut, shortcut, executable], { windowsHide: true, timeout: 30000 });
    const shortcutLine = shortcutResult.stdout.split(/\r?\n/).find(line => line.startsWith("SHORTCUT:"));
    assert.ok(shortcutLine, `Shortcut creation failed: ${shortcutResult.stderr}`);
    const shortcutInfo = JSON.parse(shortcutLine.slice("SHORTCUT:".length));
    assert.equal(shortcutInfo.exists, true, `Invalid shortcut fixture: ${shortcutResult.stdout}`);
    configure([{ id: "shortcut", path: shortcut }]);
    await until(() => messages.filter(m => m.type === "ready").length === 3);
    fixture = spawn(executable, [], { windowsHide: true, stdio: "ignore" });
    await until(() => messages.some(m => m.type === "launch" && m.id === "shortcut"));
    check("A shortcut with Unicode and spaces resolves to the real executable");
  }
  const previous = messages.filter(m => m.type === "ready").length;
  configure([]);
  await until(() => messages.filter(m => m.type === "ready").length === previous + 1);
  check("The loop remains responsive to later configuration messages");
  const exited = new Promise(resolve => helper.once("exit", code => resolve(code)));
  helper.stdin.end();
  const result = await Promise.race([exited, delay(3000).then(() => "timeout")]);
  assert.equal(result, 0, stderr);
  check("Closing stdin exits cleanly without a blocked reader keeping the process alive");
  assert.equal(messages.some(m => m.type === "error"), false, JSON.stringify(messages));
  console.log(JSON.stringify({ platform: process.platform, protocolOnly: process.platform !== "win32", checks: checks.length }));
} finally {
  fixture?.kill();
  helper?.kill();
  await fs.rm(directory, { recursive: true, force: true });
}
