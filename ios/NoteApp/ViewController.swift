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

// 🌟 本地离线应用静态资源协议处理器 (app://localhost/...)
// 彻底解决 iOS WKWebView 离线加载 ES Modules 与本地资源跨域问题，实现 100% 本地独立离线秒开
class LocalAppSchemeHandler: NSObject, WKURLSchemeHandler {
    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url else {
            urlSchemeTask.didFailWithError(NSError(domain: "LocalApp", code: 404, userInfo: nil))
            return
        }
        var path = url.path
        if path.isEmpty || path == "/" {
            path = "/index.html"
        }
        
        // 查找 Bundle 内部的 www 静态资源
        var fileUrl = Bundle.main.bundleURL.appendingPathComponent("www").appendingPathComponent(path)
        if !FileManager.default.fileExists(atPath: fileUrl.path) {
            // 回退直接在 Bundle 根目录下寻找
            fileUrl = Bundle.main.bundleURL.appendingPathComponent(path)
        }
        
        guard let data = try? Data(contentsOf: fileUrl) else {
            print("⚠️ Local file not found: \(fileUrl.path)")
            urlSchemeTask.didFailWithError(NSError(domain: "LocalApp", code: 404, userInfo: nil))
            return
        }
        
        let mimeType = mimeTypeFor(path: path)
        let response = HTTPURLResponse(
            url: url,
            statusCode: 200,
            httpVersion: "HTTP/1.1",
            headerFields: [
                "Content-Type": mimeType,
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "no-cache"
            ]
        )!
        urlSchemeTask.didReceive(response)
        urlSchemeTask.didReceive(data)
        urlSchemeTask.didFinish()
    }
    
    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}
    
    private func mimeTypeFor(path: String) -> String {
        let lower = path.lowercased()
        if lower.hasSuffix(".html") { return "text/html; charset=utf-8" }
        if lower.hasSuffix(".js") || lower.hasSuffix(".mjs") { return "application/javascript; charset=utf-8" }
        if lower.hasSuffix(".css") { return "text/css; charset=utf-8" }
        if lower.hasSuffix(".png") { return "image/png" }
        if lower.hasSuffix(".jpg") || lower.hasSuffix(".jpeg") { return "image/jpeg" }
        if lower.hasSuffix(".svg") { return "image/svg+xml" }
        if lower.hasSuffix(".json") { return "application/json; charset=utf-8" }
        if lower.hasSuffix(".wasm") { return "application/wasm" }
        return "application/octet-stream"
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
        
        // 注册 app:// 自定义协议加载本地离线前端 (100% 独立离线)
        config.setURLSchemeHandler(LocalAppSchemeHandler(), forURLScheme: "app")
        
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
        webView.backgroundColor = UIColor(red: 15/255, green: 23/255, blue: 42/255, alpha: 1.0)

        if #available(iOS 11.0, *) {
            webView.scrollView.contentInsetAdjustmentBehavior = .never
        }

        view.addSubview(webView)
    }

    private func loadLocalApp() {
        // 100% 本地独立离线加载
        let appUrl = URL(string: "app://localhost/index.html")!
        webView.load(URLRequest(url: appUrl))
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
