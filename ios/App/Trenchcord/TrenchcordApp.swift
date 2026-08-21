import SwiftUI

@main
struct TrenchcordApp: App {
    @StateObject private var node = NodeManager()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView(node: node)
                .task { node.start() }
                .onChange(of: scenePhase) { phase in
                    if phase == .active { node.handleForeground() }
                }
        }
    }
}

struct RootView: View {
    @ObservedObject var node: NodeManager

    var body: some View {
        ZStack {
            Color(red: 0.19, green: 0.20, blue: 0.22).ignoresSafeArea() // #313338

            switch node.state {
            case .starting:
                VStack(spacing: 16) {
                    ProgressView().tint(.white)
                    Text("Starting Trenchcord…")
                        .font(.footnote)
                        .foregroundStyle(.white.opacity(0.6))
                }

            case .ready(let url):
                // Full bleed: the page applies its own safe-area insets in CSS,
                // so its background reaches under the notch and home indicator.
                WebView(url: url).ignoresSafeArea()

            case .failed(let message):
                VStack(spacing: 12) {
                    Image(systemName: "exclamationmark.triangle")
                        .font(.largeTitle)
                        .foregroundStyle(.orange)
                    Text("Trenchcord couldn't start")
                        .font(.headline)
                        .foregroundStyle(.white)
                    Text(message)
                        .font(.footnote)
                        .multilineTextAlignment(.center)
                        .foregroundStyle(.white.opacity(0.7))
                }
                .padding(32)
            }
        }
        .preferredColorScheme(.dark)
    }
}
