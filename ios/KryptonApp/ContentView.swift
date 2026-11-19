import SwiftUI
import UIKit

struct ContentView: View {
    @State private var showingSetup = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text("KRYPTON SECURITY")
                    .font(.caption.weight(.bold))
                    .tracking(1.4)
                    .foregroundStyle(.cyan)

                Text("Keyboard protection")
                    .font(.largeTitle.bold())
                    .foregroundStyle(.white)

                Button {
                    showingSetup = true
                } label: {
                    Label("How to enable keyboard", systemImage: "keyboard")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 15)
                }
                .buttonStyle(.borderedProminent)
                .tint(.cyan)

                VStack(alignment: .leading, spacing: 10) {
                    Text("HOW IT WORKS").font(.caption.bold()).foregroundStyle(.cyan)
                    Text("When you choose Krypton Keyboard, text is checked on this iPhone as you type. A matching secret is not inserted into the text field.")
                    Text("Krypton does not request Full Access. Text and detections stay on-device.")
                }
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.78))
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 16))

                VStack(alignment: .leading, spacing: 10) {
                    Text("PROTECTION STATUS").font(.caption.bold()).foregroundStyle(.cyan)
                    Text("iOS does not tell this app when you switch keyboards. Without Full Access, Krypton cannot share keyboard activity with this app or an administrator.")
                    Text("Some secure fields and apps use Apple’s keyboard or do not expose enough text to scan. This cannot guarantee protection in every app.")
                }
                .font(.footnote)
                .foregroundStyle(.white.opacity(0.65))
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(.white.opacity(0.04), in: RoundedRectangle(cornerRadius: 16))
            }
            .padding(24)
        }
        .background(Color(red: 7 / 255, green: 11 / 255, blue: 20 / 255).ignoresSafeArea())
        .preferredColorScheme(.dark)
        .alert("Add Krypton Keyboard", isPresented: $showingSetup) {
            Button("Got it", role: .cancel) {}
        } message: {
            Text("In Settings, open General → Keyboard → Keyboards → Add New Keyboard and select Krypton. Then choose it from the keyboard globe key when typing. Keep Allow Full Access turned off.")
        }
    }
}
