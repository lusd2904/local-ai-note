import Foundation

/// 🌟 iOS 本地内嵌高性能微型 HTTP 服务 (100% 独立离线)
/// 彻底解决 WebKit 对 ES Modules 的 CORS/file:// 协议拦截
class LocalHttpServer {
    static let shared = LocalHttpServer()
    
    private var serverSocket: Int32 = -1
    private var isRunning = false
    public private(set) var port: UInt16 = 28080
    
    func start() {
        guard !isRunning else { return }
        
        serverSocket = socket(AF_INET, SOCK_STREAM, 0)
        guard serverSocket >= 0 else {
            print("❌ [LocalServer] Socket creation failed")
            return
        }
        
        var opt: Int32 = 1
        setsockopt(serverSocket, SOL_SOCKET, SO_REUSEADDR, &opt, socklen_t(MemoryLayout<Int32>.size))
        
        var addr = sockaddr_in()
        addr.sin_family = sa_family_t(AF_INET)
        addr.sin_port = port.bigEndian
        addr.sin_addr.s_addr = inet_addr("127.0.0.1")
        
        let bindResult = withUnsafePointer(to: &addr) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                bind(serverSocket, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }
        
        guard bindResult >= 0 else {
            print("❌ [LocalServer] Bind failed on port \(port)")
            close(serverSocket)
            return
        }
        
        guard listen(serverSocket, 128) >= 0 else {
            print("❌ [LocalServer] Listen failed")
            close(serverSocket)
            return
        }
        
        isRunning = true
        print("✅ [LocalServer] Running locally at http://127.0.0.1:\(port)")
        
        DispatchQueue.global(qos: .userInteractive).async { [weak self] in
            self?.acceptLoop()
        }
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
            
            DispatchQueue.global(qos: .userInitiated).async { [weak self] in
                self?.handleClient(clientSocket)
            }
        }
    }
    
    private func handleClient(_ clientSocket: Int32) {
        defer { close(clientSocket) }
        
        var buffer = [UInt8](repeating: 0, count: 4096)
        let bytesRead = recv(clientSocket, &buffer, buffer.count, 0)
        guard bytesRead > 0 else { return }
        
        guard let requestStr = String(bytes: buffer[0..<bytesRead], encoding: .utf8) else { return }
        let lines = requestStr.components(separatedBy: "\r\n")
        guard let firstLine = lines.first else { return }
        
        let parts = firstLine.components(separatedBy: " ")
        guard parts.count >= 2 else { return }
        
        var rawPath = parts[1]
        if let queryIndex = rawPath.firstIndex(of: "?") {
            rawPath = String(rawPath[..<queryIndex])
        }
        
        while rawPath.hasPrefix("/") {
            rawPath.removeFirst()
        }
        if rawPath.isEmpty {
            rawPath = "index.html"
        }
        
        // 查找 Bundle 内部的 www 静态资源
        var targetUrl: URL? = nil
        if let rUrl = Bundle.main.url(forResource: rawPath, withExtension: nil, subdirectory: "www") {
            targetUrl = rUrl
        } else {
            let u1 = Bundle.main.bundleURL.appendingPathComponent("www").appendingPathComponent(rawPath)
            if FileManager.default.fileExists(atPath: u1.path) {
                targetUrl = u1
            } else {
                let u2 = Bundle.main.bundleURL.appendingPathComponent(rawPath)
                if FileManager.default.fileExists(atPath: u2.path) {
                    targetUrl = u2
                }
            }
        }
        
        guard let file = targetUrl, let data = try? Data(contentsOf: file) else {
            let notFound = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
            _ = notFound.withCString { send(clientSocket, $0, strlen($0), 0) }
            return
        }
        
        let mime = mimeType(for: rawPath)
        let header = "HTTP/1.1 200 OK\r\nContent-Type: \(mime)\r\nContent-Length: \(data.count)\r\nAccess-Control-Allow-Origin: *\r\nCache-Control: no-cache\r\nConnection: close\r\n\r\n"
        
        _ = header.withCString { send(clientSocket, $0, strlen($0), 0) }
        data.withUnsafeBytes { rawBuffer in
            if let base = rawBuffer.baseAddress {
                _ = send(clientSocket, base, data.count, 0)
            }
        }
    }
    
    private func mimeType(for path: String) -> String {
        let lower = path.lowercased()
        if lower.hasSuffix(".html") { return "text/html; charset=utf-8" }
        if lower.hasSuffix(".js") || lower.hasSuffix(".mjs") { return "application/javascript; charset=utf-8" }
        if lower.hasSuffix(".css") { return "text/css; charset=utf-8" }
        if lower.hasSuffix(".png") { return "image/png" }
        if lower.hasSuffix(".jpg") || lower.hasSuffix(".jpeg") { return "image/jpeg" }
        if lower.hasSuffix(".svg") { return "image/svg+xml" }
        if lower.hasSuffix(".json") { return "application/json; charset=utf-8" }
        if lower.hasSuffix(".ico") { return "image/x-icon" }
        if lower.hasSuffix(".wasm") { return "application/wasm" }
        return "application/octet-stream"
    }
}
