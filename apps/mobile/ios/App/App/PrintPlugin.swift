import Capacitor
import UIKit

/**
 * Local plugin — JS `window.print()` is a no-op inside WKWebView.
 * The web bridge (apps/web/src/lib/native.ts) rebinds window.print to
 * `Print.print(...)`, which lands here and presents the system print
 * dialog over the current WebView rendering (UIPrintInteractionController
 * also exposes "Save as PDF", covering the PDF-download path).
 */
@objc(PrintPlugin)
public class PrintPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PrintPlugin"
    public let jsName = "Print"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "print", returnType: CAPPluginReturnPromise)
    ]

    @objc func `print`(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let webView = self?.bridge?.webView else {
                call.reject("WebView not available")
                return
            }
            let info = UIPrintInfo.printInfo()
            info.outputType = .general
            info.jobName = call.getString("jobName") ?? webView.title ?? "Document"

            let controller = UIPrintInteractionController.shared
            controller.printInfo = info
            controller.printFormatter = webView.viewPrintFormatter()
            controller.present(animated: true) { _, completed, error in
                if let error {
                    call.reject(error.localizedDescription)
                } else {
                    call.resolve(["completed": completed])
                }
            }
        }
    }
}
