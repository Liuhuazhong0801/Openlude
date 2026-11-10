export function installerTarget(args, platform = process.platform, hostArch = process.arch) {
  const index = args.indexOf("--arch");
  const arch = index < 0 ? hostArch : args[index + 1];
  if (!["darwin", "win32"].includes(platform) || !["arm64", "x64"].includes(arch))
    throw new Error("Installer packaging supports macOS arm64/x64 and Windows x64.");
  if (platform === "win32" && arch !== "x64") throw new Error("The Windows installer supports x64.");
  const name = platform === "darwin" ? "macos" : "windows";
  return { arch, platform: name, suffix: `${name}-${arch}`, mac: platform === "darwin" };
}
