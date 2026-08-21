import Cocoa
import WebKit
import AVFoundation

final class WeakScriptMessageDelegate: NSObject, WKScriptMessageHandler {
    weak var delegate: WKScriptMessageHandler?
    init(delegate: WKScriptMessageHandler? = nil) {
        self.delegate = delegate
        super.init()
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        delegate?.userContentController(userContentController, didReceive: message)
    }
}

class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    var window: NSWindow!
    var webView: WKWebView!
    var overlay: NSView!
    var overlayLabel: NSTextField!
    var embeddedWebViews: [String: WKWebView] = [:]
    var authPopupWindow: NSWindow?
    var sidebarWidth: CGFloat = 256
    var projectDir: URL?
    let targetURL = URL(string: "http://127.0.0.1:3000")!
    let weakNativeAI = WeakScriptMessageDelegate(delegate: nil)
    let weakNativeApp = WeakScriptMessageDelegate(delegate: nil)

    let siteMap: [(String, String)] = [
        ("doubao", "https://www.doubao.com/chat/"),
        ("deepseek", "https://chat.deepseek.com/"),
        ("kimi", "https://kimi.moonshot.cn/"),
        ("grok", "https://grok.com/"),
        ("gemini", "https://gemini.google.com/")
    ]

    func applicationDidFinishLaunching(_ notification: Notification) {
        weakNativeAI.delegate = self
        weakNativeApp.delegate = self

        AVCaptureDevice.requestAccess(for: .audio) { granted in
            NSLog("Note App 麦克风物理授权状态: %@", granted ? "已授权" : "未授权")
        }

        let savedFrame = UserDefaults.standard.string(forKey: "note.windowFrame")
        var rect = NSRect(x: 0, y: 0, width: 1280, height: 820)
        if let savedFrame, !savedFrame.isEmpty {
            rect = NSRectFromString(savedFrame)
            if rect.width < 880 { rect.size.width = 1280 }
            if rect.height < 580 { rect.size.height = 820 }
        }

        let styleMask: NSWindow.StyleMask = [
            .titled, .closable, .miniaturizable, .resizable, .fullSizeContentView
        ]
        window = NSWindow(contentRect: rect, styleMask: styleMask, backing: .buffered, defer: false)
        if savedFrame == nil { window.center() }
        window.title = "Note"
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.isMovableByWindowBackground = true
        window.isReleasedWhenClosed = false
        window.minSize = NSSize(width: 880, height: 580)

        let contentController = WKUserContentController()
        contentController.add(weakNativeAI, name: "nativeWebAI")
        contentController.add(weakNativeApp, name: "nativeApp")

        let config = WKWebViewConfiguration()
        config.userContentController = contentController
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")
        config.mediaTypesRequiringUserActionForPlayback = []
        config.allowsAirPlayForMediaPlayback = true
        config.websiteDataStore = WKWebsiteDataStore.default()

        let bounds = window.contentView?.bounds ?? rect
        webView = WKWebView(frame: bounds, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.autoresizingMask = [.width, .height]
        webView.setValue(false, forKey: "drawsBackground")
        window.contentView = webView

        overlay = NSView(frame: bounds)
        overlay.autoresizingMask = [.width, .height]
        overlay.wantsLayer = true
        overlay.layer?.backgroundColor = NSColor(red: 17/255, green: 24/255, blue: 39/255, alpha: 1).cgColor
        overlayLabel = NSTextField(labelWithString: "正在启动本地笔记服务…")
        overlayLabel.textColor = .white
        overlayLabel.font = NSFont.systemFont(ofSize: 15, weight: .medium)
        overlayLabel.alignment = .center
        overlayLabel.frame = NSRect(x: 40, y: bounds.height / 2 - 12, width: bounds.width - 80, height: 24)
        overlayLabel.autoresizingMask = [.width, .minYMargin, .maxYMargin]
        overlay.isHidden = true
        overlay.addSubview(overlayLabel)
        window.contentView?.addSubview(overlay)

        setupMenu()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        bootstrapServices()
    }

    func resolveProjectDir() -> URL? {
        let fm = FileManager.default
        let support = fm.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("LocalAINote", isDirectory: true)
        try? fm.createDirectory(at: support, withIntermediateDirectories: true)
        let bookmark = support.appendingPathComponent("project_path.txt")

        func valid(_ url: URL) -> Bool {
            fm.fileExists(atPath: url.appendingPathComponent("docker-compose.yml").path)
        }
        func remember(_ url: URL) {
            try? url.path.write(to: bookmark, atomically: true, encoding: .utf8)
        }

        if let env = ProcessInfo.processInfo.environment["NOTE_PROJECT_DIR"], !env.isEmpty {
            let url = URL(fileURLWithPath: env)
            if valid(url) { remember(url); return url }
        }
        let parent = Bundle.main.bundleURL.deletingLastPathComponent()
        if valid(parent) { remember(parent); return parent }
        if let saved = try? String(contentsOf: bookmark, encoding: .utf8) {
            let url = URL(fileURLWithPath: saved.trimmingCharacters(in: .whitespacesAndNewlines))
            if valid(url) { return url }
        }
        return nil
    }

    func setStatus(_ text: String) {
        DispatchQueue.main.async { self.overlayLabel.stringValue = text }
    }

    var loadRetries = 0

    func httpOK(_ raw: String, timeout: TimeInterval = 0.4) -> Bool {
        guard let url = URL(string: raw) else { return false }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: timeout)
        request.httpMethod = "GET"
        let sem = DispatchSemaphore(value: 0)
        var ok = false
        URLSession.shared.dataTask(with: request) { _, resp, _ in
            if let http = resp as? HTTPURLResponse, (200..<500).contains(http.statusCode) {
                ok = true
            }
            sem.signal()
        }.resume()
        _ = sem.wait(timeout: .now() + timeout + 0.15)
        return ok
    }

    func ensureDockerUp(_ projectDir: URL) {
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/bin/bash")
        let extraPath = "/opt/homebrew/bin:/usr/local/bin:\(NSHomeDirectory())/.local/bin:/usr/bin:/bin"
        var env = ProcessInfo.processInfo.environment
        env["PATH"] = extraPath + ":" + (env["PATH"] ?? "")
        task.environment = env
        task.currentDirectoryURL = projectDir
        task.arguments = ["-lc", "export PATH=\"\(extraPath):$PATH\"; docker compose up -d"]
        do {
            try task.run()
            task.waitUntilExit()
        } catch {
            NSLog("docker compose failed: %@", error.localizedDescription)
        }
    }

    func bootstrapServices(force: Bool = false) {
        projectDir = projectDir ?? resolveProjectDir()
        guard let projectDir else {
            overlay.isHidden = false
            setStatus("找不到工程目录（需要 docker-compose.yml）。请从仓库里的 Note.app 启动一次。")
            return
        }

        DispatchQueue.global(qos: .userInitiated).async {
            if !force, self.httpOK("http://127.0.0.1:3000/") {
                DispatchQueue.main.async { self.finishLoad() }
                return
            }

            DispatchQueue.main.async {
                self.overlay.isHidden = false
                self.setStatus("正在启动本地笔记服务…")
            }
            self.ensureDockerUp(projectDir)

            for i in 1...60 {
                if self.httpOK("http://127.0.0.1:3000/") {
                    DispatchQueue.main.async { self.finishLoad() }
                    return
                }
                DispatchQueue.main.async {
                    self.setStatus("等待服务就绪… (\(i)/60)")
                }
                Thread.sleep(forTimeInterval: 1.0)
            }
            DispatchQueue.main.async {
                self.overlay.isHidden = false
                self.setStatus("启动超时。请确认 Docker Desktop 已打开，然后按 ⌘⇧R 重试。")
            }
        }
    }

    func finishLoad() {
        overlay.isHidden = true
        loadApp()
    }

    func loadApp() {
        webView.load(URLRequest(url: targetURL, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 10))
    }

    func embeddedFrame() -> NSRect {
        let bounds = window.contentView?.bounds ?? .zero
        return NSRect(
            x: sidebarWidth,
            y: 0,
            width: max(bounds.width - sidebarWidth, 400),
            height: bounds.height
        )
    }

    func ensureEmbedded(target: String) {
        if embeddedWebViews[target] != nil { return }
        guard let urlStr = siteMap.first(where: { $0.0 == target })?.1, let url = URL(string: urlStr) else { return }

        let config = WKWebViewConfiguration()
        config.websiteDataStore = WKWebsiteDataStore.default()
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")
        config.mediaTypesRequiringUserActionForPlayback = []
        config.allowsAirPlayForMediaPlayback = true

        let wk = WKWebView(frame: embeddedFrame(), configuration: config)
        wk.navigationDelegate = self
        wk.uiDelegate = self
        wk.autoresizingMask = [.width, .height]
        wk.isHidden = true
        wk.customUserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15"
        window.contentView?.addSubview(wk, positioned: .below, relativeTo: overlay)
        wk.load(URLRequest(url: url))
        embeddedWebViews[target] = wk
    }

    func layoutEmbedded() {
        let frame = embeddedFrame()
        for wk in embeddedWebViews.values {
            wk.frame = frame
        }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let dict = message.body as? [String: Any] else { return }
        let action = dict["action"] as? String ?? ""
        let target = dict["target"] as? String ?? ""

        DispatchQueue.main.async {
            if message.name == "nativeApp" {
                if action == "sidebarWidth", let width = dict["width"] as? Double {
                    self.sidebarWidth = CGFloat(width)
                    self.layoutEmbedded()
                } else if action == "dragWindow" {
                    if let event = NSApp.currentEvent {
                        if event.clickCount == 2 {
                            self.window.zoom(nil)
                        } else {
                            self.window.performDrag(with: event)
                        }
                    }
                }
                return
            }
            if action == "show" {
                self.ensureEmbedded(target: target)
                for (key, wk) in self.embeddedWebViews {
                    wk.isHidden = (key != target)
                    if key == target { wk.frame = self.embeddedFrame() }
                }
            } else if action == "refresh" {
                self.embeddedWebViews[target]?.reload()
            } else {
                for wk in self.embeddedWebViews.values { wk.isHidden = true }
            }
        }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        let nsError = error as NSError
        if nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled {
            return
        }
        loadRetries += 1
        if loadRetries <= 3 {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in
                self?.loadApp()
            }
            return
        }
        DispatchQueue.main.async {
            self.overlay.isHidden = false
            self.setStatus("页面加载失败，正在重试…")
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in
            self?.bootstrapServices(force: true)
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        if webView == self.webView {
            loadRetries = 0
            overlay.isHidden = true
        }
    }

    @available(macOS 12.0, *)
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(.grant)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = NSAlert()
        alert.messageText = "提示"
        alert.informativeText = message
        alert.addButton(withTitle: "确定")
        alert.addButton(withTitle: "取消")
        completionHandler(alert.runModal() == .alertFirstButtonReturn)
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = NSAlert()
        alert.messageText = "提示"
        alert.informativeText = message
        alert.addButton(withTitle: "确定")
        alert.runModal()
        completionHandler()
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let alert = NSAlert()
        alert.messageText = "请输入"
        alert.informativeText = prompt
        alert.addButton(withTitle: "确定")
        alert.addButton(withTitle: "取消")
        let input = NSTextField(frame: NSRect(x: 0, y: 0, width: 260, height: 24))
        input.stringValue = defaultText ?? ""
        alert.accessoryView = input
        completionHandler(alert.runModal() == .alertFirstButtonReturn ? input.stringValue : nil)
    }

    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let openPanel = NSOpenPanel()
        openPanel.canChooseFiles = true
        openPanel.canChooseDirectories = parameters.allowsDirectories
        openPanel.allowsMultipleSelection = parameters.allowsMultipleSelection
        openPanel.begin { result in
            completionHandler(result == .OK ? openPanel.urls : nil)
        }
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        configuration.websiteDataStore = WKWebsiteDataStore.default()
        let popup = WKWebView(frame: NSRect(x: 0, y: 0, width: 480, height: 620), configuration: configuration)
        popup.navigationDelegate = self
        popup.uiDelegate = self
        let popupWindow = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 480, height: 620),
            styleMask: [.titled, .closable, .resizable],
            backing: .buffered,
            defer: false
        )
        popupWindow.center()
        popupWindow.title = "账号登录与授权"
        popupWindow.contentView = popup
        popupWindow.makeKeyAndOrderFront(nil)
        self.authPopupWindow = popupWindow
        return popup
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag { window?.makeKeyAndOrderFront(nil) }
        NSApp.activate(ignoringOtherApps: true)
        return true
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    func applicationWillTerminate(_ notification: Notification) {
        UserDefaults.standard.set(NSStringFromRect(window.frame), forKey: "note.windowFrame")
        webView.evaluateJavaScript("window.__noteFlushSave && window.__noteFlushSave()", completionHandler: nil)
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "nativeWebAI")
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "nativeApp")
    }

    func evalNative(_ fn: String) {
        webView.evaluateJavaScript("window.__noteNative && window.__noteNative.\(fn)()", completionHandler: nil)
    }

    func setupMenu() {
        let mainMenu = NSMenu()
        let appMenuItem = NSMenuItem()
        mainMenu.addItem(appMenuItem)
        let appMenu = NSMenu()
        appMenuItem.submenu = appMenu
        appMenu.addItem(withTitle: "关于 Note", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        let settingsItem = NSMenuItem(title: "设置…", action: #selector(openSettings), keyEquivalent: ",")
        settingsItem.target = self
        appMenu.addItem(settingsItem)
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(withTitle: "隐藏 Note", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(withTitle: "隐藏其他", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h").keyEquivalentModifierMask = [.command, .option]
        appMenu.addItem(withTitle: "显示全部", action: #selector(NSApplication.unhideAllApplications(_:)), keyEquivalent: "")
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(withTitle: "退出 Note", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")

        let fileMenuItem = NSMenuItem()
        mainMenu.addItem(fileMenuItem)
        let fileMenu = NSMenu(title: "文件")
        fileMenuItem.submenu = fileMenu
        let newItem = NSMenuItem(title: "新建笔记", action: #selector(newNote), keyEquivalent: "n")
        newItem.target = self
        fileMenu.addItem(newItem)
        let saveItem = NSMenuItem(title: "立即保存", action: #selector(saveNow), keyEquivalent: "s")
        saveItem.target = self
        fileMenu.addItem(saveItem)

        let editMenuItem = NSMenuItem()
        mainMenu.addItem(editMenuItem)
        let editMenu = NSMenu(title: "编辑")
        editMenuItem.submenu = editMenu
        editMenu.addItem(withTitle: "撤销", action: Selector(("undo:")), keyEquivalent: "z")
        editMenu.addItem(withTitle: "重做", action: Selector(("redo:")), keyEquivalent: "Z")
        editMenu.addItem(NSMenuItem.separator())
        editMenu.addItem(withTitle: "剪切", action: Selector(("cut:")), keyEquivalent: "x")
        editMenu.addItem(withTitle: "复制", action: Selector(("copy:")), keyEquivalent: "c")
        editMenu.addItem(withTitle: "粘贴", action: Selector(("paste:")), keyEquivalent: "v")
        editMenu.addItem(withTitle: "全选", action: Selector(("selectAll:")), keyEquivalent: "a")
        editMenu.addItem(NSMenuItem.separator())
        let findItem = NSMenuItem(title: "查找笔记", action: #selector(focusSearch), keyEquivalent: "f")
        findItem.target = self
        editMenu.addItem(findItem)
        let paletteItem = NSMenuItem(title: "快速跳转", action: #selector(openPalette), keyEquivalent: "p")
        paletteItem.target = self
        editMenu.addItem(paletteItem)

        let viewMenuItem = NSMenuItem()
        mainMenu.addItem(viewMenuItem)
        let viewMenu = NSMenu(title: "视图")
        viewMenuItem.submenu = viewMenu
        let sidebarItem = NSMenuItem(title: "折叠/展开侧栏", action: #selector(toggleSidebar), keyEquivalent: "\\")
        sidebarItem.target = self
        viewMenu.addItem(sidebarItem)
        let reloadItem = NSMenuItem(title: "重新加载", action: #selector(reloadApp), keyEquivalent: "r")
        reloadItem.keyEquivalentModifierMask = [.command, .shift]
        reloadItem.target = self
        viewMenu.addItem(reloadItem)

        NSApp.mainMenu = mainMenu
    }

    @objc func newNote() { evalNative("newNote") }
    @objc func saveNow() { evalNative("saveNow") }
    @objc func openSettings() { evalNative("openSettings") }
    @objc func focusSearch() { evalNative("focusSearch") }
    @objc func openPalette() { evalNative("commandPalette") }
    @objc func toggleSidebar() { evalNative("toggleSidebar") }
    @objc func reloadApp() {
        loadRetries = 0
        bootstrapServices(force: true)
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
