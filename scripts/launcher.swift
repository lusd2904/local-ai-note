import Cocoa

// 1. 异步拉起 Docker 容器确保后台服务在线
let task = Process()
task.executableURL = URL(fileURLWithPath: "/bin/bash")
let projectDir = "/Users/lusd/工程/note"
let cmd = "export PATH=\"/Users/lusd/.local/bin:/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH\"; cd \(projectDir) && docker compose up -d"
task.arguments = ["-c", cmd]
try? task.run()

// 2. 检查是否有 Chrome / Edge 独立 App 模式支持
let chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
let edgePath = "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
let bravePath = "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"

let fm = FileManager.default

if fm.fileExists(atPath: chromePath) {
    let browserTask = Process()
    browserTask.executableURL = URL(fileURLWithPath: chromePath)
    browserTask.arguments = [
        "--app=http://localhost:3000",
        "--user-data-dir=/tmp/local_note_chrome_profile",
        "--no-first-run",
        "--window-size=1280,820"
    ]
    try? browserTask.run()
} else if fm.fileExists(atPath: edgePath) {
    let browserTask = Process()
    browserTask.executableURL = URL(fileURLWithPath: edgePath)
    browserTask.arguments = [
        "--app=http://localhost:3000",
        "--user-data-dir=/tmp/local_note_chrome_profile",
        "--window-size=1280,820"
    ]
    try? browserTask.run()
} else if fm.fileExists(atPath: bravePath) {
    let browserTask = Process()
    browserTask.executableURL = URL(fileURLWithPath: bravePath)
    browserTask.arguments = [
        "--app=http://localhost:3000",
        "--user-data-dir=/tmp/local_note_chrome_profile",
        "--window-size=1280,820"
    ]
    try? browserTask.run()
} else {
    if let url = URL(string: "http://localhost:3000") {
        NSWorkspace.shared.open(url)
    }
}
