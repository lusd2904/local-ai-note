import UIKit
import WebKit
import AVFoundation

final class WeakScriptMessageDelegate: NSObject, WKScriptMessageHandler {
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

    private var webView: WKWebView!
    private let schemeHandler = LocalSchemeHandler()
    private let statusLabel = UITextView()
    private var didTryHTTPFallback = false
    private var didTryFileFallback = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 17 / 255, green: 24 / 255, blue: 39 / 255, alpha: 1)
        LocalHttpServer.shared.start()
        setupStatusLabel()
        setupWebView()
        loadLocalApp()
        requestPermissions()
    }

    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }

    private func setupStatusLabel() {
        statusLabel.translatesAutoresizingMaskIntoConstraints = false
        statusLabel.isEditable = false
        statusLabel.isSelectable = true
        statusLabel.font = .monospacedSystemFont(ofSize: 13, weight: .regular)
        statusLabel.textColor = .white
        statusLabel.backgroundColor = UIColor(white: 0.08, alpha: 0.94)
        statusLabel.textContainerInset = UIEdgeInsets(top: 28, left: 16, bottom: 28, right: 16)
        statusLabel.isHidden = true
        view.addSubview(statusLabel)
        NSLayoutConstraint.activate([
            statusLabel.topAnchor.constraint(equalTo: view.topAnchor),
            statusLabel.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            statusLabel.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            statusLabel.trailingAnchor.constraint(equalTo: view.trailingAnchor)
        ])
    }

    private func setupWebView() {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.websiteDataStore = WKWebsiteDataStore.default()
        config.setURLSchemeHandler(schemeHandler, forURLScheme: LocalSchemeHandler.scheme)
        if #available(iOS 15.0, *) {
            config.upgradeKnownHostsToHTTPS = false
            config.defaultWebpagePreferences.allowsContentJavaScript = true
        }

        let contentController = WKUserContentController()
        contentController.add(WeakScriptMessageDelegate(delegate: self), name: "iosNativeSync")
        config.userContentController = contentController

        webView = WKWebView(frame: .zero, configuration: config)
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.uiDelegate = self
        webView.navigationDelegate = self
        webView.scrollView.bounces = false
        webView.backgroundColor = UIColor(red: 17 / 255, green: 24 / 255, blue: 39 / 255, alpha: 1)
        webView.isOpaque = false
        if #available(iOS 16.4, *) {
            webView.isInspectable = true
        }
        webView.scrollView.contentInsetAdjustmentBehavior = .never

        view.insertSubview(webView, at: 0)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor)
        ])
    }

    private func loadLocalApp() {
        let diag = BundleWWW.diagnosticText()
        NSLog("[NoteApp] %@", diag.replacingOccurrences(of: "\n", with: " | "))

        if BundleWWW.root() == nil {
            showStatus("""
            应用资源未打进安装包（找不到 www/index.html）。

            \(diag)

            请用最新工程 Clean Build Folder 后重新 Run。
            """)
        }

        // 主路径：自定义 scheme，不走 ATS / loopback。
        let appURL = URL(string: "\(LocalSchemeHandler.scheme)://app/index.html")!
        NSLog("[NoteApp] loading %@", appURL.absoluteString)
        webView.load(URLRequest(url: appURL, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 20))
    }

    private func loadHTTPFallback() {
        guard !didTryHTTPFallback else { return }
        didTryHTTPFallback = true
        LocalHttpServer.shared.start()
        let port = LocalHttpServer.shared.port
        let url = URL(string: "http://127.0.0.1:\(port)/index.html")!
        NSLog("[NoteApp] HTTP fallback %@", url.absoluteString)
        showStatus("正在使用本地 HTTP 回退加载…\n\(url.absoluteString)")
        webView.load(URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 20))
    }

    private func loadFileFallback() {
        guard !didTryFileFallback else { return }
        didTryFileFallback = true
        guard let root = BundleWWW.root() else {
            showStatus("无法加载页面。\n\n\(BundleWWW.diagnosticText())")
            return
        }
        let index = root.appendingPathComponent("index.html")
        NSLog("[NoteApp] file fallback %@", index.path)
        showStatus("正在使用 file:// 回退加载…")
        webView.loadFileURL(index, allowingReadAccessTo: root)
    }

    private func requestPermissions() {
        AVAudioSession.sharedInstance().requestRecordPermission { granted in
            NSLog("[NoteApp] microphone granted=%@", granted ? "YES" : "NO")
        }
    }

    private func showStatus(_ text: String) {
        DispatchQueue.main.async {
            self.statusLabel.text = text
            self.statusLabel.isHidden = false
            self.view.bringSubviewToFront(self.statusLabel)
            NSLog("[NoteApp] status: %@", text.replacingOccurrences(of: "\n", with: " | "))
        }
    }

    private func hideStatus() {
        DispatchQueue.main.async {
            self.statusLabel.isHidden = true
        }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "iosNativeSync",
              let body = message.body as? [String: Any],
              let action = body["action"] as? String else { return }
        if action == "haptic" {
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        NSLog("[NoteApp] didFinish %@", webView.url?.absoluteString ?? "")
        webView.evaluateJavaScript("document.getElementById('root') ? 'ok' : 'no-root'") { [weak self] result, error in
            if let error {
                NSLog("[NoteApp] js eval error %@", error.localizedDescription)
            }
            NSLog("[NoteApp] root probe %@", String(describing: result))
            if (result as? String) == "ok" {
                self?.hideStatus()
            }
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        handleLoadError(error, stage: "didFail")
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        handleLoadError(error, stage: "didFailProvisional")
    }

    private func handleLoadError(_ error: Error, stage: String) {
        let nsError = error as NSError
        if nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled {
            return
        }
        NSLog("[NoteApp] %@ %@", stage, error.localizedDescription)
        if !didTryHTTPFallback {
            loadHTTPFallback()
            return
        }
        if !didTryFileFallback {
            loadFileFallback()
            return
        }
        showStatus("""
        页面加载失败：\(error.localizedDescription)

        \(BundleWWW.diagnosticText())
        """)
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        decisionHandler(.allow)
    }

    deinit {
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "iosNativeSync")
    }
}
