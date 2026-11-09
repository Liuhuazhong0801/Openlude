import AppKit
import Foundation

struct Target {
    let id: String
    let path: String
    let bundleId: String?
}
var targets: [Target] = []
var announced = Set<String>()
let workspace = NSWorkspace.shared
func canonical(_ path: String) -> String {
    URL(fileURLWithPath: path).standardizedFileURL.resolvingSymlinksInPath().path
}
func emit(_ value: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]) else { return }
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data([10]))
}
func target(for application: NSRunningApplication) -> Target? {
    if let url = application.bundleURL {
        let path = canonical(url.path)
        return targets.first { $0.path == path }
    }
    guard let bundleId = application.bundleIdentifier else { return nil }
    return targets.first { $0.bundleId == bundleId }
}
func running(_ target: Target) -> [NSRunningApplication] {
    workspace.runningApplications.filter { $0.bundleURL.map { canonical($0.path) == target.path } ?? false }
}
let center = workspace.notificationCenter
var tokens: [NSObjectProtocol] = []
for name in [NSWorkspace.willLaunchApplicationNotification, NSWorkspace.didLaunchApplicationNotification] {
    tokens.append(center.addObserver(forName: name, object: nil, queue: .main) { notification in
        guard let application = notification.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication,
              let match = target(for: application) else { return }
        if name == NSWorkspace.willLaunchApplicationNotification && !running(match).isEmpty { return }
        if announced.insert(match.id).inserted {
            emit(["type": "launch", "id": match.id, "pid": max(0, application.processIdentifier)])
        }
    })
}
tokens.append(center.addObserver(forName: NSWorkspace.didTerminateApplicationNotification, object: nil, queue: .main) { notification in
    guard let application = notification.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication,
          let match = target(for: application) else { return }
    if running(match).isEmpty {
        announced.remove(match.id)
        emit(["type": "terminated", "id": match.id, "pid": application.processIdentifier])
    }
})
NSApplication.shared.setActivationPolicy(.prohibited)
DispatchQueue.global(qos: .utility).async {
    while let line = readLine() {
        guard let data = line.data(using: .utf8),
              let message = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { continue }
        DispatchQueue.main.async {
            if message["type"] as? String == "configure", let values = message["targets"] as? [[String: String]] {
                targets = values.compactMap { value in
                    guard let id = value["id"], let path = value["path"] else { return nil }
                    let url = URL(fileURLWithPath: canonical(path))
                    return Target(id: id, path: url.path, bundleId: Bundle(url: url)?.bundleIdentifier)
                }
                announced = Set(targets.filter { !running($0).isEmpty }.map { $0.id })
                let snapshot = targets.flatMap { item in running(item).map { ["id": item.id, "pid": Int($0.processIdentifier)] as [String: Any] } }
                emit(["type": "ready", "running": snapshot])
            } else if message["type"] as? String == "activate", let id = message["id"] as? String,
                      let request = message["request"] as? String {
                let match = targets.first { $0.id == id }
                let application = match.flatMap { running($0).first }
                let activated = application?.activate(options: [.activateAllWindows, .activateIgnoringOtherApps]) ?? false
                emit(["type": "activated", "request": request, "ok": activated])
            }
        }
    }
    exit(0) // Parent exited; never leave an orphaned observer.
}
NSApplication.shared.run()
