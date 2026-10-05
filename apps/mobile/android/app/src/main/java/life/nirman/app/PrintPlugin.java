package life.nirman.app;

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.webkit.WebView;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Local plugin — window.print() doesn't exist in the Android WebView.
 * Bridges to PrintManager using the WebView's own print adapter, which
 * also covers "Save as PDF".
 */
@CapacitorPlugin(name = "Print")
public class PrintPlugin extends Plugin {

    @PluginMethod
    public void print(PluginCall call) {
        WebView webView = getBridge().getWebView();
        if (webView == null) {
            call.reject("WebView not available");
            return;
        }
        String jobName = call.getString("jobName", "Document");
        getActivity().runOnUiThread(() -> {
            PrintManager printManager =
                (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
            printManager.print(
                jobName,
                webView.createPrintDocumentAdapter(jobName),
                new PrintAttributes.Builder().build()
            );
        });
        call.resolve(new JSObject());
    }
}
