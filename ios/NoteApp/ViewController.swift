import UIKit
import WebKit
import AVFoundation

// L3 修复: 弱引用代理，打破 WKScriptMessageHandler 循环引用
class WeakScriptMessageDelegate: NSObject, WKScriptMessageHandler {
    weak var delegate: WKScriptMessageHandler?

    init(delegate: WKScriptMessageHandler) {
        self.delegate = delegate
        super.init()
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        delegate?.userContentController(userContentController, didReceive: message)
    }
}

class ViewController: UIViewController, WKUIDelegate, WKNavigationDelegate, WKScriptMessageHandler {

    var webView: WKWebView!

    override func viewDidLoad() {
        super.viewDidLoad()
        setupWebView()
        loadLocalApp()
        requestPermissions()
    }

    override var preferredStatusBarStyle: UIStatusBarStyle {
        return .lightContent
    }

    override var prefersStatusBarHidden: Bool {
        return false
    }

    private func setupWebView() {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        
        // 共享持久化存储与离线缓存
        config.websiteDataStore = WKWebsiteDataStore.default()

        // L3: 使用弱引用代理注册原生通信，防止循环引用内存泄漏
        let contentController = WKUserContentController()
        contentController.add(WeakScriptMessageDelegate(delegate: self), name: "iosNativeSync")
        config.userContentController = contentController

        webView = WKWebView(frame: view.bounds, configuration: config)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.uiDelegate = self
        webView.navigationDelegate = self
        webView.scrollView.bounces = false
        // L2: 使用 .automatic 让系统自动处理安全区域适配（刘海/灵动岛/Home Indicator）
        webView.scrollView.contentInsetAdjustmentBehavior = .automatic
        webView.backgroundColor = .systemBackground

        // 启用 iOS safe area 感知
        if #available(iOS 11.0, *) {
            webView.scrollView.contentInsetAdjustmentBehavior = .never
            // 通过 additionalSafeAreaInsets 确保 WebView 内容不被刘海遮挡
            // CSS 端使用 env(safe-area-inset-*) 来处理
        }

        view.addSubview(webView)
    }

    private func loadLocalApp() {
        // 优先加载本地打包的 dist 静态资源，或在同一局域网下连接 Mac 服务端
        if let localHtml = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "dist") {
            webView.loadFileURL(localHtml, allowingReadAccessTo: localHtml.deletingLastPathComponent())
        } else {
            // 离线回退或开发模式
            let defaultUrl = URL(string: "http://localhost:8008")!
            webView.load(URLRequest(url: defaultUrl))
        }
    }

    private func requestPermissions() {
        AVAudioSession.sharedInstance().requestRecordPermission { granted in
            print("iOS 麦克风录音权限:", granted)
        }
    }

    // 处理 JavaScript 传来的原生指令（如振动反馈、扫码配对等）
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        if message.name == "iosNativeSync", let body = message.body as? [String: Any] {
            if let action = body["action"] as? String {
                if action == "haptic" {
                    let generator = UIImpactFeedbackGenerator(style: .medium)
                    generator.impactOccurred()
                }
            }
        }
    }

    deinit {
        // L3: 清理 script message handler 防止悬垂引用
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "iosNativeSync")
    }
}
