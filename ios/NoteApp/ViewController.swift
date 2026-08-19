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
        LocalHttpServer.shared.start()
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
        
        // 共享持久化存储与 IndexedDB
        config.websiteDataStore = WKWebsiteDataStore.default()

        // 注册原生通信代理
        let contentController = WKUserContentController()
        contentController.add(WeakScriptMessageDelegate(delegate: self), name: "iosNativeSync")
        config.userContentController = contentController

        webView = WKWebView(frame: view.bounds, configuration: config)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.uiDelegate = self
        webView.navigationDelegate = self
        webView.scrollView.bounces = false
        webView.backgroundColor = UIColor(red: 17/255, green: 24/255, blue: 39/255, alpha: 1.0)

        if #available(iOS 11.0, *) {
            webView.scrollView.contentInsetAdjustmentBehavior = .never
        }

        view.addSubview(webView)
    }

    private func loadLocalApp() {
        // 极速加载手机内部嵌入式纯本地 HTTP 服务 (100% 独立离线，零网络依赖)
        let localPort = LocalHttpServer.shared.port
        let appUrl = URL(string: "http://127.0.0.1:\(localPort)/index.html")!
        NSLog("🚀 [iOS] Loading standalone local app at: \(appUrl.absoluteString)")

        // 调试：检查 Bundle 中是否有 www 目录
        if let wwwPath = Bundle.main.path(forResource: "www", ofType: nil) {
            NSLog("✅ [Debug] www 目录存在: \(wwwPath)")
            if let files = try? FileManager.default.contentsOfDirectory(atPath: wwwPath) {
                NSLog("✅ [Debug] www 文件数量: \(files.count)")
                NSLog("✅ [Debug] www 文件列表: \(files.prefix(5).joined(separator: ", "))")
            }
        } else {
            NSLog("❌ [Debug] www 目录不存在于 Bundle 中！")
            NSLog("❌ [Debug] Bundle path: \(Bundle.main.bundlePath)")
            if let contents = try? FileManager.default.contentsOfDirectory(atPath: Bundle.main.bundlePath) {
                NSLog("❌ [Debug] Bundle 内容: \(contents.prefix(10).joined(separator: ", "))")
            }
        }

        webView.load(URLRequest(url: appUrl, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 10))
    }

    private func requestPermissions() {
        AVAudioSession.sharedInstance().requestRecordPermission { granted in
            print("iOS 麦克风录音权限:", granted)
        }
    }

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

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        print("⚠️ WebView didFail: \(error.localizedDescription)")
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        print("⚠️ WebView didFailProvisionalNavigation: \(error.localizedDescription)")
    }

    deinit {
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "iosNativeSync")
    }
}
