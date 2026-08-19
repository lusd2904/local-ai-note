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
class LocalAppSchemeHandler: NSObject, WKURLSchemeHandler {
    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url else {
            urlSchemeTask.didFailWithError(NSError(domain: "LocalApp", code: 404, userInfo: nil))
            return
        }
        
        var cleanPath = url.path
        while cleanPath.hasPrefix("/") {
            cleanPath.removeFirst()
        }
        if cleanPath.isEmpty {
            cleanPath = "index.html"
        }
        
        // 查找 Bundle 内部的 www 静态资源
        var fileUrl: URL? = nil
        if let rUrl = Bundle.main.url(forResource: cleanPath, withExtension: nil, subdirectory: "www") {
            fileUrl = rUrl
        } else {
            let u1 = Bundle.main.bundleURL.appendingPathComponent("www").appendingPathComponent(cleanPath)
            if FileManager.default.fileExists(atPath: u1.path) {
                fileUrl = u1
            } else {
                let u2 = Bundle.main.bundleURL.appendingPathComponent(cleanPath)
                if FileManager.default.fileExists(atPath: u2.path) {
                    fileUrl = u2
                }
            }
        }
        
        guard let targetFile = fileUrl, let data = try? Data(contentsOf: targetFile) else {
            print("⚠️ Local file not found: \(cleanPath)")
            urlSchemeTask.didFailWithError(NSError(domain: "LocalApp", code: 404, userInfo: nil))
            return
        }
        
        let mimeType = mimeTypeFor(path: cleanPath)
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
        
        // 允许本地跨域与资源读取
        config.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")
        config.setValue(true, forKey: "allowUniversalAccessFromFileURLs")
        
        // 注册 app:// 离线协议处理器
        config.setURLSchemeHandler(LocalAppSchemeHandler(), forURLScheme: "app")
        
        // 共享持久化存储与 IndexedDB
        config.websiteDataStore = WKWebsiteDataStore.default()

        // 注册原生通信代理与全局 JS 异常监听
        let contentController = WKUserContentController()
        contentController.add(WeakScriptMessageDelegate(delegate: self), name: "iosNativeSync")
        
        let errorLoggerJs = """
        window.addEventListener('error', function(e) {
            if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.iosNativeSync) {
                window.webkit.messageHandlers.iosNativeSync.postMessage({
                    action: 'log',
                    message: 'JS ERROR: ' + e.message + ' at ' + e.filename + ':' + e.lineno
                });
            }
        });
        window.addEventListener('unhandledrejection', function(e) {
            if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.iosNativeSync) {
                window.webkit.messageHandlers.iosNativeSync.postMessage({
                    action: 'log',
                    message: 'UNHANDLED REJECTION: ' + (e.reason ? (e.reason.stack || e.reason.message || e.reason) : 'unknown')
                });
            }
        });
        """
        let userScript = WKUserScript(source: errorLoggerJs, injectionTime: .atDocumentStart, forMainFrameOnly: false)
        contentController.addUserScript(userScript)
        config.userContentController = contentController

        webView = WKWebView(frame: view.bounds, configuration: config)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.uiDelegate = self
        webView.navigationDelegate = self
        webView.scrollView.bounces = false
        webView.backgroundColor = UIColor(red: 17/255, green: 24/255, blue: 39/255, alpha: 1.0) // 优雅深色底色

        if #available(iOS 11.0, *) {
            webView.scrollView.contentInsetAdjustmentBehavior = .never
        }

        view.addSubview(webView)
    }

    private func loadLocalApp() {
        // 优先使用 loadFileURL 直接读取本地 Bundle 中的 www/index.html (极速离线且零网络依赖)
        if let localHtml = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "www") {
            print("🚀 Loading local bundle html: \(localHtml.path)")
            webView.loadFileURL(localHtml, allowingReadAccessTo: Bundle.main.bundleURL)
        } else if let localHtmlRoot = Bundle.main.url(forResource: "index", withExtension: "html") {
            print("🚀 Loading root bundle html: \(localHtmlRoot.path)")
            webView.loadFileURL(localHtmlRoot, allowingReadAccessTo: Bundle.main.bundleURL)
        } else {
            // 回退到 app:// 协议
            print("🚀 Loading via app:// scheme")
            let appUrl = URL(string: "app://localhost/index.html")!
            webView.load(URLRequest(url: appUrl))
        }
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
                } else if action == "log", let msg = body["message"] as? String {
                    print("📱 [iOS Web Log] \(msg)")
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
