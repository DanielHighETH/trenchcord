import Foundation
import UIKit

/// Owns the embedded Node.js backend: starts it, waits for it to answer, and
/// nudges it when the app comes back to the foreground.
///
/// This mirrors what `desktop/main.js` does for Electron — same environment
/// variables, same health poll, same fixed port — except the backend runs on a
/// thread inside this process instead of a forked utility process.
@MainActor
final class NodeManager: ObservableObject {

    enum State: Equatable {
        case starting
        /// Backend is up; load this URL in the web view.
        case ready(URL)
        /// Unrecoverable: nodejs-mobile cannot restart its engine in-process.
        case failed(String)
    }

    @Published private(set) var state: State = .starting

    /// Same default as the desktop app. A fixed port keeps the web view's origin
    /// stable across launches, which is what preserves its localStorage; on a
    /// physical device there is no one inside the sandbox to collide with.
    /// The Simulator is different: it shares the Mac's loopback, so the desktop
    /// Trenchcord app (if running) already owns 47853 and the backend would die
    /// with EADDRINUSE — simulator builds use their own port.
    #if targetEnvironment(simulator)
    private static let port = 47854
    #else
    private static let port = 47853
    #endif
    private static let healthTimeout: TimeInterval = 30
    private static let healthPollInterval: TimeInterval = 0.25

    private var started = false

    /// Writable storage for config.json, contracts.json, the local token and
    /// uploaded sounds. Application Support rather than Documents: this is app
    /// state, not user documents, and it should not show up in the Files app.
    private lazy var dataDirectory: URL = {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let dir = base.appendingPathComponent("Trenchcord", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }()

    private var backendScript: URL? {
        Bundle.main.url(forResource: "index", withExtension: "cjs", subdirectory: "backend")
    }

    private var frontendDist: URL? {
        Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "frontend/dist")?
            .deletingLastPathComponent()
    }

    private var localTokenPath: URL {
        dataDirectory.appendingPathComponent("local-token")
    }

    // MARK: - Startup

    func start() {
        guard !started else { return }
        started = true

        guard let script = backendScript, let frontend = frontendDist else {
            state = .failed(
                "The app bundle is missing its backend or frontend files. "
                + "Rebuild with `npm run build:ios-payload` before archiving."
            )
            return
        }

        excludeFromBackupIfNeeded()
        setEnvironment(frontendDist: frontend)

        // node::Start never returns while the server is running, so it gets its
        // own thread. The larger stack is for teleproto's MTProto handshake,
        // which does deep pure-JS bignum work under a JIT-less V8.
        let thread = Thread {
            NodeRunner.startEngine(withArguments: ["node", script.path])
        }
        thread.stackSize = 4 * 1024 * 1024
        thread.name = "trenchcord-backend"
        thread.start()

        waitForHealth()
    }

    private func setEnvironment(frontendDist: URL) {
        // setenv rather than a launch environment: node::Start inherits this
        // process's environment, and these must be set before the thread starts.
        setenv("PORT", String(Self.port), 1)
        setenv("NODE_ENV", "production", 1)
        setenv("TRENCHCORD_DATA_DIR", dataDirectory.path, 1)
        setenv("TRENCHCORD_FRONTEND_DIST", frontendDist.path, 1)
        // Official builds are gated, exactly as on desktop.
        setenv("TRENCHCORD_REQUIRE_SUBSCRIPTION", "1", 1)
        // Drops every billing link from the UI and names this device sensibly in
        // the account dashboard (os.hostname() is meaningless here).
        setenv("TRENCHCORD_PLATFORM", "ios", 1)
        setenv("TRENCHCORD_DEVICE_NAME", UIDevice.current.name, 1)
        // Every app on the phone shares 127.0.0.1, so arriving from loopback
        // proves nothing. The web view is authorised with the token below instead.
        setenv("TRENCHCORD_TRUST_LOOPBACK", "0", 1)

        #if DEBUG
        // Debug builds pair against the dev cloud API on the development Mac
        // (same Wi-Fi network) instead of api.trenchcord.app, which NODE_ENV=
        // production would otherwise select. Adjust to the Mac's LAN IP; the
        // dev API must listen on all interfaces (it does — `*:8787`).
        // Approve the pairing code from the dashboard in the Mac's browser.
        setenv("TRENCHCORD_CLOUD_URL", "http://192.168.1.100:8787", 1)
        #endif
    }

    /// config.json holds Discord tokens and Telegram session strings. iCloud
    /// backups are encrypted, but there is no reason for live credentials to
    /// travel off the device — the user can re-import from their desktop export.
    private func excludeFromBackupIfNeeded() {
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var dir = dataDirectory
        try? dir.setResourceValues(values)
    }

    // MARK: - Health

    private func waitForHealth() {
        let deadline = Date().addingTimeInterval(Self.healthTimeout)
        let healthURL = URL(string: "http://127.0.0.1:\(Self.port)/health")!

        func poll() {
            var request = URLRequest(url: healthURL)
            request.timeoutInterval = 2
            URLSession.shared.dataTask(with: request) { _, response, _ in
                let ok = (response as? HTTPURLResponse)?.statusCode == 200
                Task { @MainActor in
                    if ok {
                        self.finishStartup()
                    } else if Date() < deadline {
                        DispatchQueue.main.asyncAfter(deadline: .now() + Self.healthPollInterval) { poll() }
                    } else {
                        // Don't dead-end here: a slow first boot on an older
                        // phone (JIT-less V8 parsing the whole bundle), or a
                        // deadline that lapsed while iOS froze the app
                        // mid-start, both land in this branch and recover.
                        // Show the screen, keep checking, and take the app
                        // back the moment the backend answers.
                        self.state = .failed(
                            "Trenchcord's backend is taking too long to start. "
                            + "It will recover on its own if it can — if this screen stays, "
                            + "close the app completely and open it again."
                        )
                        self.verifyBackendAlive()
                    }
                }
            }.resume()
        }
        poll()
    }

    private func finishStartup() {
        // The backend swaps this token for an HttpOnly cookie and redirects to
        // "/", so it is never left in the address bar or in web view history.
        // Written by the backend at startup, so it exists by the time /health passes.
        guard let token = try? String(contentsOf: localTokenPath, encoding: .utf8)
            .trimmingCharacters(in: .whitespacesAndNewlines),
              !token.isEmpty,
              let url = URL(string: "http://127.0.0.1:\(Self.port)/?token=\(token)")
        else {
            state = .failed("Trenchcord couldn't authorise this device. Please close the app completely and open it again.")
            return
        }
        state = .ready(url)
    }

    // MARK: - Lifecycle

    /// Called when the app returns to the foreground. iOS freezes the whole
    /// process while backgrounded, which silently kills the Discord and Telegram
    /// sockets; both supervisors would notice on their own eventually, but only
    /// after up to a minute of missed messages. This collapses that to seconds.
    func handleForeground() {
        switch state {
        case .ready:
            sendResumeNudge { alive in
                if !alive { self.verifyBackendAlive() }
            }
        case .failed:
            // The last foreground cycle gave up on the backend. Health-check it
            // again anyway: a long event-loop stall right after thaw (JIT-less
            // V8 chewing through piled-up reconnect work) looks identical to a
            // dead thread at first, but it recovers — take the app back with it.
            verifyBackendAlive()
        case .starting:
            break
        }
    }

    /// POST /api/system/resume so the Discord/Telegram supervisors probe their
    /// sockets right now instead of waiting out their own heartbeat intervals.
    private func sendResumeNudge(completion: (@MainActor @Sendable (Bool) -> Void)? = nil) {
        guard let token = try? String(contentsOf: localTokenPath, encoding: .utf8)
            .trimmingCharacters(in: .whitespacesAndNewlines) else { return }

        var request = URLRequest(url: URL(string: "http://127.0.0.1:\(Self.port)/api/system/resume")!)
        request.httpMethod = "POST"
        request.timeoutInterval = 5
        request.setValue(token, forHTTPHeaderField: "X-Trenchcord-Token")
        URLSession.shared.dataTask(with: request) { _, response, _ in
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            let alive = (200..<500).contains(status) // any HTTP answer at all means Node is up
            Task { @MainActor in completion?(alive) }
        }.resume()
    }

    /// The resume nudge got no HTTP answer — either Node is still thawing after
    /// suspension, or its thread died (unrecoverable in-process). Right after a
    /// thaw the event loop can stall for tens of seconds while every suspended
    /// timer and dead socket fires at once (V8 runs without JIT here, so the
    /// Telegram re-handshakes are genuinely slow), so poll patiently before
    /// declaring death — a torn-down web view over a false positive costs a
    /// force-quit, while extra patience costs nothing visible.
    private var verifying = false

    private func verifyBackendAlive(attempt: Int = 0) {
        if attempt == 0 {
            guard !verifying else { return }
            verifying = true
        }
        var request = URLRequest(url: URL(string: "http://127.0.0.1:\(Self.port)/health")!)
        request.timeoutInterval = 4
        URLSession.shared.dataTask(with: request) { _, response, _ in
            let ok = (response as? HTTPURLResponse)?.statusCode == 200
            Task { @MainActor in
                if ok {
                    self.verifying = false
                    // The nudge that started this check never went through, so
                    // the supervisors haven't probed yet — nudge again, and
                    // restore the web view if a previous cycle tore it down.
                    self.sendResumeNudge()
                    if case .failed = self.state { self.finishStartup() }
                    return
                }
                if attempt < 20 {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
                        self.verifyBackendAlive(attempt: attempt + 1)
                    }
                } else {
                    self.verifying = false
                    // Context-neutral: this loop now serves both the slow
                    // cold boot and the post-background death.
                    self.state = .failed(
                        "Trenchcord's backend stopped responding. "
                        + "It will recover on its own if it can — if this screen stays, "
                        + "close the app completely and open it again."
                    )
                    // Keep watching from the error screen: if the backend was
                    // merely stalled, flip back to the app without user action.
                    DispatchQueue.main.asyncAfter(deadline: .now() + 5) {
                        self.verifyBackendAlive()
                    }
                }
            }
        }.resume()
    }
}
