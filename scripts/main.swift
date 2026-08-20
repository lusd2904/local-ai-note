import Cocoa
import WebKit
import AVFoundation

// 🍏 支持顶部 54px 区域原生拖拽坐标跟踪的 DraggableWindow
class DraggableWindow: NSWindow {
    override var canBecomeKey: Bool { return true }
    override var canBecomeMain: Bool { return true }

    override func sendEvent(_ event: NSEvent) {
        if event.type == .leftMouseDragged {
            let loc = event.locationInWindow
            // 只要鼠标在顶部 54px 区域内拖动，平滑更新窗口坐标
            if loc.y >= self.contentView!.bounds.height - 54 {
                var origin = self.frame.origin
                origin.x += event.deltaX
                origin.y -= event.deltaY
                self.setFrameOrigin(origin)
                return
            }
        }
        super.sendEvent(event)
    }
}

class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    var window: DraggableWindow!
    var webView: WKWebView!
    var embeddedWebViews: [String: WKWebView] = [:]
    var authPopupWindow: NSWindow?
    let targetURL = URL(string: "http://localhost:3000")!

    func applicationDidFinishLaunching(_ notification: Notification) {
        // 1. 启动并确保 Docker 后台运行
        DispatchQueue.global(qos: .background).async {
            let task = Process()
            task.executableURL = URL(fileURLWithPath: "/bin/bash")
            let projectDir = "/Users/lusd/工程/note"
            let cmd = "export PATH=\"/Users/lusd/.local/bin:/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH\"; cd \(projectDir) && docker compose up -d"
            task.arguments = ["-c", cmd]
            try? task.run()
        }

        // 2. 🌟 主动向 macOS 系统请求硬件麦克风物理权限
        AVCaptureDevice.requestAccess(for: .audio) { granted in
            NSLog("Note App 麦克风物理授权状态: %@", granted ? "已授权" : "未授权")
        }

        // 3. 创建原生窗口
        let rect = NSRect(x: 0, y: 0, width: 1280, height: 820)
        let styleMask: NSWindow.StyleMask = [
            .titled,
            .closable,
            .miniaturizable,
            .resizable,
            .fullSizeContentView
        ]

        window = DraggableWindow(contentRect: rect, styleMask: styleMask, backing: .buffered, defer: false)
        window.center()
        window.title = "Note"
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.isMovableByWindowBackground = true
        window.isReleasedWhenClosed = false
        window.minSize = NSSize(width: 880, height: 580)

        // 4. 配置主 React Web 应用 (注入 nativeWebAI 脚本通道)
        let contentController = WKUserContentController()
        contentController.add(self, name: "nativeWebAI")

        let config = WKWebViewConfiguration()
        config.userContentController = contentController
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")
        config.mediaTypesRequiringUserActionForPlayback = []
        config.allowsAirPlayForMediaPlayback = true
        config.websiteDataStore = WKWebsiteDataStore.default() // 永久保持 Cookies/LocalStorage

        webView = WKWebView(frame: rect, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.autoresizingMask = [.width, .height]
        webView.setValue(false, forKey: "drawsBackground")

        window.contentView = webView

        // 5. 初始化原生的豆包与 DeepSeek 子 WebView 视图
        setupEmbeddedWebViews()

        setupMenu()

        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        loadApp()
    }

    func setupEmbeddedWebViews() {
        let sidebarWidth: CGFloat = 256
        let bounds = window.contentView!.bounds
        let webViewRect = NSRect(x: sidebarWidth, y: 0, width: max(bounds.width - sidebarWidth, 500), height: bounds.height)

        let sharedStore = WKWebsiteDataStore.default()

        let config = WKWebViewConfiguration()
        config.websiteDataStore = sharedStore
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")
        config.mediaTypesRequiringUserActionForPlayback = []
        config.allowsAirPlayForMediaPlayback = true

        let sites: [(String, String)] = [
            ("doubao", "https://www.doubao.com/chat/"),
            ("deepseek", "https://chat.deepseek.com/"),
            ("kimi", "https://kimi.moonshot.cn/"),
            ("grok", "https://grok.com/"),
            ("gemini", "https://gemini.google.com/")
        ]

        for (target, urlStr) in sites {
            let wk = WKWebView(frame: webViewRect, configuration: config)
            wk.navigationDelegate = self
            wk.uiDelegate = self
            wk.autoresizingMask = [.width, .height]
            wk.isHidden = true
            wk.customUserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15"
            window.contentView?.addSubview(wk)
            
            if let url = URL(string: urlStr) {
                wk.load(URLRequest(url: url))
            }
            
            embeddedWebViews[target] = wk
        }
    }

    // 🌟 响应 React 侧边栏发来的原生视图切换指令
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        if message.name == "nativeWebAI", let dict = message.body as? [String: Any] {
            let action = dict["action"] as? String ?? ""
            let target = dict["target"] as? String ?? ""

            DispatchQueue.main.async { [weak self] in
                guard let self = self else { return }
                if action == "show" {
                    for (key, wk) in self.embeddedWebViews {
                        wk.isHidden = (key != target)
                    }
                } else if action == "refresh" {
                    self.embeddedWebViews[target]?.reload()
                } else {
                    for wk in self.embeddedWebViews.values {
                        wk.isHidden = true
                    }
                }
            }
        }
    }

    func loadApp() {
        let request = URLRequest(url: targetURL, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 5.0)
        webView.load(request)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in
            self?.loadApp()
        }
    }

    // 🌟 macOS 原生授权麦克风捕获 (getUserMedia)
    @available(macOS 12.0, *)
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(.grant)
    }

    // 原生实现 JS confirm 弹窗支持
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = NSAlert()
        alert.messageText = "提示"
        alert.informativeText = message
        alert.addButton(withTitle: "确定")
        alert.addButton(withTitle: "取消")
        alert.alertStyle = .warning
        let response = alert.runModal()
        completionHandler(response == .alertFirstButtonReturn)
    }

    // 原生实现 JS alert 弹窗支持
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = NSAlert()
        alert.messageText = "提示"
        alert.informativeText = message
        alert.addButton(withTitle: "确定")
        alert.alertStyle = .informational
        alert.runModal()
        completionHandler()
    }

    // 🌟 原生 Prompt 支持 (解决 window.prompt 在 macOS WKWebView 中无反应)
    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let alert = NSAlert()
        alert.messageText = "请输入"
        alert.informativeText = prompt
        alert.addButton(withTitle: "确定")
        alert.addButton(withTitle: "取消")

        let input = NSTextField(frame: NSRect(x: 0, y: 0, width: 260, height: 24))
        input.stringValue = defaultText ?? ""
        alert.accessoryView = input

        let result = alert.runModal()
        if result == .alertFirstButtonReturn {
            completionHandler(input.stringValue)
        } else {
            completionHandler(nil)
        }
    }

    // 🌟 原生文件选择器支持 (解决 <input type="file"> 在 macOS WKWebView 中点击无反应)
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let openPanel = NSOpenPanel()
        openPanel.canChooseFiles = true
        openPanel.canChooseDirectories = parameters.allowsDirectories
        openPanel.allowsMultipleSelection = parameters.allowsMultipleSelection

        openPanel.begin { result in
            if result == .OK {
                completionHandler(openPanel.urls)
            } else {
                completionHandler(nil)
            }
        }
    }

    // 🌟 登录授权弹窗：支持微信扫码、手机验证码等 OAuth 登录弹窗无缝完成授权并共享 Cookie
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        configuration.websiteDataStore = WKWebsiteDataStore.default()

        let popup = WKWebView(frame: NSRect(x: 0, y: 0, width: 480, height: 620), configuration: configuration)
        popup.navigationDelegate = self
        popup.uiDelegate = self

        let popupWindow = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 480, height: 620),
                                   styleMask: [.titled, .closable, .resizable],
                                   backing: .buffered, defer: false)
        popupWindow.center()
        popupWindow.title = "账号登录与授权"
        popupWindow.contentView = popup
        popupWindow.makeKeyAndOrderFront(nil)
        self.authPopupWindow = popupWindow
        return popup
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag {
            window?.makeKeyAndOrderFront(nil)
        }
        NSApp.activate(ignoringOtherApps: true)
        return true
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return true
    }

    func setupMenu() {
        let mainMenu = NSMenu()
        let appMenuItem = NSMenuItem()
        mainMenu.addItem(appMenuItem)
        let appMenu = NSMenu()
        appMenuItem.submenu = appMenu

        appMenu.addItem(withTitle: "关于 Note", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(withTitle: "隐藏 Note", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(withTitle: "隐藏其他", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h").keyEquivalentModifierMask = [.command, .option]
        appMenu.addItem(withTitle: "显示全部", action: #selector(NSApplication.unhideAllApplications(_:)), keyEquivalent: "")
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(withTitle: "退出 Note", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")

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

        let viewMenuItem = NSMenuItem()
        mainMenu.addItem(viewMenuItem)
        let viewMenu = NSMenu(title: "视图")
        viewMenuItem.submenu = viewMenu
        let reloadItem = NSMenuItem(title: "重新加载", action: #selector(reloadApp), keyEquivalent: "r")
        reloadItem.target = self
        viewMenu.addItem(reloadItem)

        NSApp.mainMenu = mainMenu
    }

    @objc func reloadApp() {
        loadApp()
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
