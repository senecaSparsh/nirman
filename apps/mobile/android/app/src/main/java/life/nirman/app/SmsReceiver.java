package life.nirman.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.telephony.SmsMessage;

import org.json.JSONObject;

/**
 * Manifest-declared receiver for android.provider.Telephony.SMS_RECEIVED.
 * Works even when the app process is dead — the system wakes it.
 *
 * Only bank/transactional senders are forwarded (carrier shortcodes like
 * VK-HDFCBK, AX-SBIN) — personal chats never leave the phone. The intake
 * server dedupes, parses, and matches; this receiver just transports.
 */
public class SmsReceiver extends BroadcastReceiver {

    /** Carrier shortcode ("VK-HDFCBK") or sender containing a bank/UPI keyword.
     *  String.matches() is full-string — keyword alt needs .* around it. */
    private static final String BANK_SENDER =
        "(?i)(^.{2}-.{3,}$|.*(bank|hdfc|icici|sbi|axis|kotak|yesbnk|pnb|bob|canara|indus|idfc|federal|paytm|upi|imps|neft|rtgs).*)";

    @Override
    public void onReceive(Context context, Intent intent) {
        SharedPreferences prefs = context.getSharedPreferences(SmsBridgePlugin.PREFS, Context.MODE_PRIVATE);
        String key = prefs.getString(SmsBridgePlugin.PREF_KEY, null);
        String base = prefs.getString(SmsBridgePlugin.PREF_BASE, null);
        if (key == null || base == null) return;

        Bundle bundle = intent.getExtras();
        if (bundle == null) return;
        Object[] pdus = (Object[]) bundle.get("pdus");
        String format = bundle.getString("format");
        if (pdus == null || pdus.length == 0) return;

        // Multi-part SMS share the sender — join segments into one message.
        StringBuilder body = new StringBuilder();
        String sender = null;
        for (Object pdu : pdus) {
            SmsMessage msg = SmsMessage.createFromPdu((byte[]) pdu, format);
            if (msg == null) continue;
            if (sender == null) sender = msg.getDisplayOriginatingAddress();
            String part = msg.getMessageBody();
            if (part != null) body.append(part);
        }
        if (sender == null || body.length() == 0) return;
        if (!sender.matches(BANK_SENDER)) return; // never forward personal SMS

        final String fSender = sender;
        final String fBody = body.toString();
        final String fBase = base;
        final String fKey = key;
        final BroadcastReceiver.PendingResult pr = goAsync();
        new Thread(() -> {
            try {
                JSONObject json = new JSONObject();
                json.put("sender", fSender);
                json.put("message", fBody);
                json.put("receivedAt", System.currentTimeMillis());
                SmsHttp.post(fBase + "/api/sms/intake", json.toString(), fKey);
            } catch (Exception ignored) {
                // Lost SMS — the outbox/intake patterns tolerate redelivery;
                // a transient drop only delays that one message.
            } finally {
                pr.finish();
            }
        }).start();
    }

}
