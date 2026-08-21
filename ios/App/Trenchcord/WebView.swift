import Photos
import SwiftUI
import WebKit

/// Hosts the Trenchcord UI, served by the embedded backend on localhost.
///
/// The frontend is the same React app the desktop build ships; it detects it is
/// running here through `window.__TRENCHCORD_PLATFORM__`, injected below before
/// any page script runs.
/// WKWebView that mirrors its native safe-area insets into CSS variables.
///
/// The frontend positions headers, the drawer and overlays with
/// `var(--safe-top)` etc. (frontend/src/index.css). `env(safe-area-inset-*)`
/// is only the fallback: under SwiftUI's `ignoresSafeArea` it reads as 0, so
/// the shell pushes measured values instead. An inline style on
/// `documentElement` beats the stylesheet's `:root` rule.
final class SafeAreaWebView: WKWebView {
    override func safeAreaInsetsDidChange() {
        super.safeAreaInsetsDidChange()
        pushSafeAreaInsets()
    }

    func pushSafeAreaInsets() {
        let i = safeAreaInsets
        let js = """
        (function () {
          var s = document.documentElement.style;
          s.setProperty('--safe-top', '\(i.top)px');
          s.setProperty('--safe-right', '\(i.right)px');
          s.setProperty('--safe-bottom', '\(i.bottom)px');
          s.setProperty('--safe-left', '\(i.left)px');
        })();
        """
        // May fire before the document exists; the error is harmless — the
        // didCommit re-push covers every navigation.
        evaluateJavaScript(js, completionHandler: nil)
    }
}

struct WebView: UIViewRepresentable {
    let url: URL

    func makeCoordinator() -> Coordinator { Coordinator(url: url) }

    func makeUIView(context: Context) -> WKWebView {
        let controller = WKUserContentController()
        // .atDocumentStart so the flag is set before the bundle evaluates —
        // isIOSApp() is read during the very first render.
        controller.addUserScript(
            WKUserScript(
                source: "window.__TRENCHCORD_PLATFORM__ = 'ios';",
                injectionTime: .atDocumentStart,
                forMainFrameOnly: true
            )
        )
        // Lock pinch/double-tap zoom in the app only. The shared index.html
        // deliberately leaves zoom enabled (web accessibility); in the shell
        // the compact layout does real sizing and accidental zoom just breaks
        // the illusion of a native app.
        controller.addUserScript(
            WKUserScript(
                source: """
                document.querySelector('meta[name=viewport]')?.setAttribute('content',
                  'width=device-width, initial-scale=1.0, viewport-fit=cover, maximum-scale=1.0, user-scalable=no');
                """,
                injectionTime: .atDocumentEnd,
                forMainFrameOnly: true
            )
        )

        // The lightbox's Save button posts the image here; the web sandbox has
        // no path of its own into the photo library.
        controller.add(context.coordinator, name: "saveImage")

        let config = WKWebViewConfiguration()
        config.userContentController = controller
        // On iPhone this defaults to false, and then WebKit ignores the
        // `playsinline` attribute and presents every <video> playback in the
        // native fullscreen player — combined with the autoplay permission
        // below, each incoming GIF (gifv = autoplaying <video>) hijacked the
        // whole screen by itself the moment it arrived.
        config.allowsInlineMediaPlayback = true
        // Alert sounds are a core feature; without this they need a user gesture
        // each time. The first tap anywhere still satisfies iOS's audio session.
        config.mediaTypesRequiringUserActionForPlayback = []
        // Default (persistent) data store, so the session cookie and the app's
        // localStorage survive relaunches.
        config.websiteDataStore = .default()

        let webView = SafeAreaWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = false
        // The page paints its own background edge to edge and pads its surfaces
        // with the --safe-* variables SafeAreaWebView injects; bouncing would
        // expose white above and below it.
        webView.scrollView.bounces = false
        // UIKit must not add its own phantom insets on top — the CSS variables
        // are the single source of truth for safe areas.
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.backgroundColor = UIColor(red: 0.19, green: 0.20, blue: 0.22, alpha: 1) // #313338
        webView.isOpaque = false
        webView.load(URLRequest(url: url))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        // The URL is set once at startup; nothing to reconcile on redraw.
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
        /// The original tokenised URL (…/?token=…). Recovery reloads go through
        /// it rather than webView.reload(): the backend swaps the token for a
        /// fresh session cookie on every pass, so even if iOS evicted the
        /// web view's cookies while the app sat unused, the page comes back
        /// authenticated instead of stranded on 401s.
        private let url: URL

        init(url: URL) {
            self.url = url
        }

        // MARK: Saving images to the photo library
        //
        // The page sends either the image bytes ({base64, mime} — used when it
        // can read them itself, which also carries the backend session cookie
        // for /telegram/media URLs) or a bare {url} for CORS-blocked public
        // CDNs, which URLSession fetches without web-sandbox restrictions.
        // Either way the outcome is reported back through
        // window.__trenchcordImageSaved(ok).

        func userContentController(
            _ userContentController: WKUserContentController,
            didReceive message: WKScriptMessage
        ) {
            guard message.name == "saveImage", let body = message.body as? [String: Any] else { return }
            let webView = message.webView
            if let base64 = body["base64"] as? String, let data = Data(base64Encoded: base64) {
                saveToPhotoLibrary(data, reportingTo: webView)
            } else if let urlString = body["url"] as? String, let url = URL(string: urlString) {
                URLSession.shared.dataTask(with: url) { [weak self, weak webView] data, response, _ in
                    let ok = (response as? HTTPURLResponse).map { (200..<300).contains($0.statusCode) } ?? false
                    guard let self, let data, ok else {
                        DispatchQueue.main.async { Coordinator.reportImageSaved(false, to: webView) }
                        return
                    }
                    self.saveToPhotoLibrary(data, reportingTo: webView)
                }.resume()
            } else {
                Coordinator.reportImageSaved(false, to: webView)
            }
        }

        private func saveToPhotoLibrary(_ data: Data, reportingTo webView: WKWebView?) {
            PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
                guard status == .authorized || status == .limited else {
                    DispatchQueue.main.async { Coordinator.reportImageSaved(false, to: webView) }
                    return
                }
                PHPhotoLibrary.shared().performChanges({
                    PHAssetCreationRequest.forAsset().addResource(with: .photo, data: data, options: nil)
                }) { success, _ in
                    DispatchQueue.main.async { Coordinator.reportImageSaved(success, to: webView) }
                }
            }
        }

        private static func reportImageSaved(_ ok: Bool, to webView: WKWebView?) {
            webView?.evaluateJavaScript(
                "window.__trenchcordImageSaved && window.__trenchcordImageSaved(\(ok))",
                completionHandler: nil
            )
        }

        /// A new document starts with pristine inline styles, so the safe-area
        /// variables must be re-pushed after every navigation commit.
        func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
            (webView as? SafeAreaWebView)?.pushSafeAreaInsets()
        }

        /// iOS reclaims the web view's content process under memory pressure
        /// while the app is backgrounded. Without this, the user comes back to
        /// a dead snapshot of the page — images missing, JavaScript gone, so
        /// the frontend's own visibility-triggered reconnect never runs — that
        /// only a reload can revive. Reload via the tokenised URL so the
        /// session cookie is re-minted even if iOS evicted the web view's
        /// stored data during the same purge; the frontend restores the
        /// selected room itself.
        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            webView.load(URLRequest(url: url))
        }

        /// The reload above can race the backend's own post-background thaw —
        /// a refused connection here would otherwise strand a blank page. Keep
        /// retrying gently, but only for connection-level failures: cancelled
        /// navigations (external links vetoed by decidePolicyFor) land here
        /// too and must not trigger a reload. If the backend is truly dead,
        /// NodeManager replaces this view with its error screen anyway.
        func webView(
            _ webView: WKWebView,
            didFailProvisionalNavigation navigation: WKNavigation!,
            withError error: Error
        ) {
            let nsError = error as NSError
            let connectionFailures = [
                NSURLErrorCannotConnectToHost,
                NSURLErrorNetworkConnectionLost,
                NSURLErrorTimedOut,
            ]
            guard nsError.domain == NSURLErrorDomain, connectionFailures.contains(nsError.code) else { return }
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak webView] in
                guard let webView else { return }
                webView.load(URLRequest(url: self.url))
            }
        }

        // MARK: JavaScript dialogs
        //
        // WKWebView implements NO JavaScript dialogs by itself: without these
        // three methods, alert() vanishes, confirm() returns false and
        // prompt() returns null — silently. The frontend uses confirm() for
        // destructive actions (remove Telegram account, unsaved changes), so
        // they must be bridged to real UIAlertControllers.

        private func topViewController() -> UIViewController? {
            let window = UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .flatMap { $0.windows }
                .first { $0.isKeyWindow }
            var top = window?.rootViewController
            while let presented = top?.presentedViewController { top = presented }
            return top
        }

        func webView(
            _ webView: WKWebView,
            runJavaScriptAlertPanelWithMessage message: String,
            initiatedByFrame frame: WKFrameInfo,
            completionHandler: @escaping () -> Void
        ) {
            guard let presenter = topViewController() else { completionHandler(); return }
            let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
            presenter.present(alert, animated: true)
        }

        func webView(
            _ webView: WKWebView,
            runJavaScriptConfirmPanelWithMessage message: String,
            initiatedByFrame frame: WKFrameInfo,
            completionHandler: @escaping (Bool) -> Void
        ) {
            guard let presenter = topViewController() else { completionHandler(false); return }
            let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) })
            alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
            presenter.present(alert, animated: true)
        }

        func webView(
            _ webView: WKWebView,
            runJavaScriptTextInputPanelWithPrompt prompt: String,
            defaultText: String?,
            initiatedByFrame frame: WKFrameInfo,
            completionHandler: @escaping (String?) -> Void
        ) {
            guard let presenter = topViewController() else { completionHandler(nil); return }
            let alert = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
            alert.addTextField { $0.text = defaultText }
            alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(nil) })
            alert.addAction(UIAlertAction(title: "OK", style: .default) { [weak alert] _ in
                completionHandler(alert?.textFields?.first?.text)
            })
            presenter.present(alert, animated: true)
        }

        /// Everything on 127.0.0.1 is our own app. Anything else is a link the
        /// user tapped in a message — Discord invites, explorers, token pages —
        /// and belongs in Safari, not inside the app's own web view.
        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard let url = navigationAction.request.url else {
                decisionHandler(.cancel)
                return
            }
            if url.host == "127.0.0.1" || url.host == "localhost" {
                decisionHandler(.allow)
                return
            }
            if UIApplication.shared.canOpenURL(url) {
                UIApplication.shared.open(url)
            }
            decisionHandler(.cancel)
        }

        /// window.open() has no target frame here, so WebKit asks the delegate.
        /// The app opens contract links this way; send them to Safari too.
        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for navigationAction: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            if let url = navigationAction.request.url, UIApplication.shared.canOpenURL(url) {
                UIApplication.shared.open(url)
            }
            return nil
        }
    }
}
