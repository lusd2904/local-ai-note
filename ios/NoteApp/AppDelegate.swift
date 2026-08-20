import UIKit

@main
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        LocalHttpServer.shared.start()
        NSLog("[NoteApp] didFinishLaunching, scenes=%d", application.connectedScenes.count)
        return true
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // 没有 Scene 窗口时（Info.plist 未声明 Scene 的旧路径）补一个主窗口，避免真机纯黑屏。
        if window == nil, application.connectedScenes.isEmpty {
            NSLog("[NoteApp] No UIScene connected — installing fallback window")
            let win = UIWindow(frame: UIScreen.main.bounds)
            win.backgroundColor = UIColor(red: 17 / 255, green: 24 / 255, blue: 39 / 255, alpha: 1)
            win.rootViewController = ViewController()
            win.makeKeyAndVisible()
            window = win
        }
    }

    func application(
        _ application: UIApplication,
        configurationForConnecting connectingSceneSession: UISceneSession,
        options: UIScene.ConnectionOptions
    ) -> UISceneConfiguration {
        let config = UISceneConfiguration(
            name: "Default Configuration",
            sessionRole: connectingSceneSession.role
        )
        config.delegateClass = SceneDelegate.self
        return config
    }

    func application(_ application: UIApplication, didDiscardSceneSessions sceneSessions: Set<UISceneSession>) {}
}
