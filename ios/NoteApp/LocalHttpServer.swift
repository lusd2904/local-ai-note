import Foundation
import WebKit

/// 在 App Bundle 中定位打包进去的前端静态资源（www）。
enum BundleWWW {
    static func root() -> URL? {
        let fm = FileManager.default
        let candidates: [URL?] = [
            Bundle.main.resourceURL?.appendingPathComponent("www", isDirectory: true),
            Bundle.main.bundleURL.appendingPathComponent("www", isDirectory: true),
            Bundle.main.url(forResource: "www", withExtension: nil)
        ]

        for candidate in candidates {
            guard let dir = candidate else { continue }
            if fm.fileExists(atPath: dir.appendingPathComponent("index.html").path) {
                return dir
            }
        }

        // 资源被拍平到 bundle 根目录时
        if let resourceURL = Bundle.main.resourceURL,
           fm.fileExists(atPath: resourceURL.appendingPathComponent("index.html").path) {
            return resourceURL
        }

        // 最后全 bundle 搜索 index.html
        if let resourceURL = Bundle.main.resourceURL,
           let enumerator = fm.enumerator(
            at: resourceURL,
            includingPropertiesForKeys: [.isRegularFileKey],
            options: [.skipsHiddenFiles]
           ) {
            for case let url as URL in enumerator {
                if url.lastPathComponent == "index.html" {
                    return url.deletingLastPathComponent()
                }
            }
        }
        return nil
    }

    static func file(for requestPath: String) -> URL? {
        guard let root = root() else { return nil }
        var path = requestPath
        if let query = path.firstIndex(of: "?") {
            path = String(path[..<query])
        }
        if let hash = path.firstIndex(of: "#") {
            path = String(path[..<hash])
        }
        path = path.removingPercentEncoding ?? path
        while path.hasPrefix("/") {
            path.removeFirst()
        }
        if path.isEmpty || path.hasSuffix("/") {
            path += "index.html"
        }

        var url = root
        for component in path.split(separator: "/") {
            if component == "." { continue }
            if component == ".." { return nil }
            url.appendPathComponent(String(component))
        }

        let fileURL = url.standardizedFileURL
        let rootPath = root.standardizedFileURL.path
        let filePath = fileURL.path
        guard filePath == rootPath || filePath.hasPrefix(rootPath + "/") else { return nil }

        var isDir: ObjCBool = false
        guard FileManager.default.fileExists(atPath: filePath, isDirectory: &isDir), !isDir.boolValue else {
            return nil
        }
        return fileURL
    }

    static func mimeType(for path: String) -> String {
        let lower = path.lowercased()
        if lower.hasSuffix(".html") || lower.hasSuffix(".htm") { return "text/html; charset=utf-8" }
        if lower.hasSuffix(".js") || lower.hasSuffix(".mjs") { return "text/javascript; charset=utf-8" }
        if lower.hasSuffix(".css") { return "text/css; charset=utf-8" }
        if lower.hasSuffix(".png") { return "image/png" }
        if lower.hasSuffix(".jpg") || lower.hasSuffix(".jpeg") { return "image/jpeg" }
        if lower.hasSuffix(".gif") { return "image/gif" }
        if lower.hasSuffix(".svg") { return "image/svg+xml" }
        if lower.hasSuffix(".json") || lower.hasSuffix(".webmanifest") { return "application/json; charset=utf-8" }
        if lower.hasSuffix(".ico") { return "image/x-icon" }
        if lower.hasSuffix(".wasm") { return "application/wasm" }
        if lower.hasSuffix(".woff") { return "font/woff" }
        if lower.hasSuffix(".woff2") { return "font/woff2" }
        if lower.hasSuffix(".ttf") { return "font/ttf" }
        if lower.hasSuffix(".webp") { return "image/webp" }
        if lower.hasSuffix(".mp3") { return "audio/mpeg" }
        if lower.hasSuffix(".wav") { return "audio/wav" }
        if lower.hasSuffix(".map") { return "application/json" }
        return "application/octet-stream"
    }

    static func data(for requestPath: String) -> (Data, String)? {
        guard let file = file(for: requestPath), let data = try? Data(contentsOf: file) else {
            return nil
        }
        var body = data
        let mime = mimeType(for: file.lastPathComponent)
        if mime.contains("text/html"), var html = String(data: data, encoding: .utf8) {
            html = html.replacingOccurrences(of: " crossorigin", with: "")
            body = Data(html.utf8)
        }
        return (body, mime)
    }

    static func diagnosticText() -> String {
        let bundle = Bundle.main.bundlePath
        let root = root()?.path ?? "(未找到 www)"
        let contents = (try? FileManager.default.contentsOfDirectory(atPath: Bundle.main.bundlePath)) ?? []
        let wwwContents: [String]
        if let rootPath = self.root()?.path {
            wwwContents = (try? FileManager.default.contentsOfDirectory(atPath: rootPath)) ?? []
        } else {
            wwwContents = []
        }
        return """
        Bundle: \(bundle)
        www: \(root)
        Bundle 顶层: \(contents.prefix(12).joined(separator: ", "))
        www 顶层: \(wwwContents.prefix(12).joined(separator: ", "))
        """
    }
}

/// 自定义 URL Scheme，不依赖 loopback socket / ATS，避免真机黑屏。
final class LocalSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "noteapp"
    private var stopped = NSHashTable<AnyObject>.weakObjects()
    private let lock = NSLock()

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url else {
            urlSchemeTask.didFailWithError(URLError(.badURL))
            return
        }

        var path = url.path
        if path.isEmpty || path == "/" {
            path = "/index.html"
        }

        let method = urlSchemeTask.request.httpMethod ?? "GET"
        let payload: (Int, String, Data)
        if method == "OPTIONS" {
            payload = (204, "text/plain", Data())
        } else if let (data, mime) = BundleWWW.data(for: path) {
            payload = (200, mime, data)
        } else {
            NSLog("[NoteApp] 404 %@\n%@", path, BundleWWW.diagnosticText())
            let body = Data("Not Found: \(path)".utf8)
            payload = (404, "text/plain; charset=utf-8", body)
        }

        let response = HTTPURLResponse(
            url: url,
            statusCode: payload.0,
            httpVersion: "HTTP/1.1",
            headerFields: corsHeaders(contentType: payload.1, length: payload.2.count)
        )!

        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.lock.lock()
            let cancelled = self.stopped.contains(urlSchemeTask)
            self.lock.unlock()
            guard !cancelled else { return }
            urlSchemeTask.didReceive(response)
            if !payload.2.isEmpty {
                urlSchemeTask.didReceive(payload.2)
            }
            urlSchemeTask.didFinish()
        }
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
        lock.lock()
        stopped.add(urlSchemeTask)
        lock.unlock()
    }

    private func corsHeaders(contentType: String, length: Int) -> [String: String] {
        [
            "Content-Type": contentType,
            "Content-Length": "\(length)",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "*",
            "Cache-Control": "no-cache"
        ]
    }
}

/// 备用 loopback HTTP 服务。主路径已改为 noteapp:// scheme。
final class LocalHttpServer {
    static let shared = LocalHttpServer()

    private var serverSocket: Int32 = -1
    private var isRunning = false
    public private(set) var port: UInt16 = 28080

    var isListening: Bool { isRunning }

    func start() {
        guard !isRunning else { return }

        serverSocket = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP)
        guard serverSocket >= 0 else {
            NSLog("[LocalServer] socket() failed: %d", errno)
            return
        }

        var opt: Int32 = 1
        setsockopt(serverSocket, SOL_SOCKET, SO_REUSEADDR, &opt, socklen_t(MemoryLayout<Int32>.size))
        setsockopt(serverSocket, SOL_SOCKET, SO_NOSIGPIPE, &opt, socklen_t(MemoryLayout<Int32>.size))

        if !bindAndListen(port) {
            // 端口被占时改用系统分配端口
            if !bindAndListen(0) {
                NSLog("[LocalServer] bind/listen failed")
                close(serverSocket)
                serverSocket = -1
                return
            }
        }

        isRunning = true
        NSLog("[LocalServer] http://127.0.0.1:%u  www=%@", port, BundleWWW.root()?.path ?? "MISSING")

        DispatchQueue.global(qos: .userInteractive).async { [weak self] in
            self?.acceptLoop()
        }
    }

    private func bindAndListen(_ requested: UInt16) -> Bool {
        var addr = sockaddr_in()
        addr.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        addr.sin_family = sa_family_t(AF_INET)
        addr.sin_port = requested.bigEndian
        addr.sin_addr.s_addr = inet_addr("127.0.0.1")

        let bindResult = withUnsafePointer(to: &addr) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                bind(serverSocket, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }
        guard bindResult >= 0 else { return false }
        guard listen(serverSocket, 128) >= 0 else { return false }

        var bound = sockaddr_in()
        var len = socklen_t(MemoryLayout<sockaddr_in>.size)
        _ = withUnsafeMutablePointer(to: &bound) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                getsockname(serverSocket, $0, &len)
            }
        }
        port = UInt16(bigEndian: bound.sin_port)
        return true
    }

    private func acceptLoop() {
        while isRunning {
            var clientAddr = sockaddr_in()
            var clientLen = socklen_t(MemoryLayout<sockaddr_in>.size)
            let clientSocket = withUnsafeMutablePointer(to: &clientAddr) {
                $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                    accept(serverSocket, $0, &clientLen)
                }
            }
            guard clientSocket >= 0 else { continue }

            var nosig: Int32 = 1
            setsockopt(clientSocket, SOL_SOCKET, SO_NOSIGPIPE, &nosig, socklen_t(MemoryLayout<Int32>.size))

            DispatchQueue.global(qos: .userInitiated).async { [weak self] in
                self?.handleClient(clientSocket)
            }
        }
    }

    private func handleClient(_ clientSocket: Int32) {
        defer { close(clientSocket) }
        guard let requestStr = readHeaders(clientSocket) else { return }
        let lines = requestStr.components(separatedBy: "\r\n")
        guard let firstLine = lines.first else { return }
        let parts = firstLine.split(separator: " ")
        guard parts.count >= 2 else { return }

        var rawPath = String(parts[1])
        if let queryIndex = rawPath.firstIndex(of: "?") {
            rawPath = String(rawPath[..<queryIndex])
        }

        if let (data, mime) = BundleWWW.data(for: rawPath) {
            let header = """
            HTTP/1.1 200 OK\r
            Content-Type: \(mime)\r
            Content-Length: \(data.count)\r
            Access-Control-Allow-Origin: *\r
            Cache-Control: no-cache\r
            Connection: close\r
            \r

            """
            sendAll(clientSocket, Data(header.utf8))
            sendAll(clientSocket, data)
        } else {
            NSLog("[LocalServer] 404 %@", rawPath)
            let body = Data("Not Found".utf8)
            let header = "HTTP/1.1 404 Not Found\r\nContent-Type: text/plain\r\nContent-Length: \(body.count)\r\nConnection: close\r\n\r\n"
            sendAll(clientSocket, Data(header.utf8))
            sendAll(clientSocket, body)
        }
    }

    private func readHeaders(_ socket: Int32) -> String? {
        var data = Data()
        var buf = [UInt8](repeating: 0, count: 2048)
        for _ in 0..<32 {
            let n = recv(socket, &buf, buf.count, 0)
            if n <= 0 { break }
            data.append(buf, count: n)
            if let text = String(data: data, encoding: .utf8), text.contains("\r\n\r\n") {
                return text
            }
            if data.count > 64 * 1024 { break }
        }
        return String(data: data, encoding: .utf8)
    }

    private func sendAll(_ socket: Int32, _ data: Data) {
        data.withUnsafeBytes { raw in
            guard let base = raw.bindMemory(to: UInt8.self).baseAddress else { return }
            var sent = 0
            let total = raw.count
            while sent < total {
                let n = send(socket, base + sent, total - sent, 0)
                if n <= 0 { break }
                sent += n
            }
        }
    }
}
