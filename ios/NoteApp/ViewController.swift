import UIKit
import WebKit
import AVFoundation

class ViewController: UIViewController, WKUIDelegate, WKNavigationDelegate, WKScriptMessageHandler {

    var webView: WKWebView!

    override func viewDidLoad() {
        super.viewDidLoad()
        setupWebView()
        loadLocalApp()
        requestPermissions()
    }

    override var preferredStatusBarStyle: UIStatusBarStyle {
        return .default
    }

    private func setupWebView() {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        
        // 共享持久化存储与离线缓存
        config.websiteDataStore = WKWebsiteDataStore.default()

        // 注册原生通信
        let contentController = WKUserContentController()
        contentController.add(self, name: "iosNativeSync")
        config.userContentController = contentController

        webView = WKWebView(frame: view.bounds, configuration: config)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.uiDelegate = self
        webView.navigationDelegate = self
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.backgroundColor = .systemBackground

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
}
