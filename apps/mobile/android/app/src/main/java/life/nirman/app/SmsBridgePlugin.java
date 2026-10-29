package life.nirman.app;

import android.Manifest;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Handler;
import android.os.HandlerThread;
import android.telephony.SmsManager;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Turns this phone into the company's SMS device — no separate app, no
 * configuration screens:
 *
 *   configure({key, baseUrl})  — store the device key (minted by the web
 *                                layer via POST /api/sms/devices), enable
 *                                the SMS_RECEIVED receiver, start the
 *                                outbox poller.
 *   requestPermissions()       — fire the OS prompt for READ/RECEIVE/SEND
 *                                SMS; resolves immediately — JS re-reads
 *                                status() after the user answers.
 *   sendSms({to, body})        — send one message now (used by the app and
 *                                internally by the outbox poller).
 *   status()                   — { hasKey, canReadSms, canSendSms }.
 *
 * The poller pulls GET /api/sms/outbox every 60s while the app is alive,
 * sends each message on this phone's SIM via SmsManager, and acks via
 * POST. Pull-model means zero network setup — the phone just calls out.
 */
@CapacitorPlugin(name = "SmsBridge")
public class SmsBridgePlugin extends Plugin {

    static final String PREFS = "nirman_sms";
    static final String PREF_KEY = "deviceKey";
    static final String PREF_BASE = "baseUrl";
    private static final long POLL_MS = 60_000;

    private static final String[] SMS_PERMS = {
        Manifest.permission.READ_SMS,
        Manifest.permission.RECEIVE_SMS,
        Manifest.permission.SEND_SMS,
    };

    private HandlerThread pollThread;
    private Handler pollHandler;
    private final Runnable pollTask = new Runnable() {
        @Override public void run() {
            pollOutbox();
            if (pollHandler != null) pollHandler.postDelayed(this, POLL_MS);
        }
    };

    @PluginMethod
    public void configure(PluginCall call) {
        String key = call.getString("key");
        String base = call.getString("baseUrl");
        if (key == null || base == null) {
            call.reject("key and baseUrl are required");
            return;
        }
        Context ctx = getContext();
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString(PREF_KEY, key).putString(PREF_BASE, base).apply();
        // Enable the manifest receiver now that we have credentials.
        ctx.getPackageManager().setComponentEnabledSetting(
            new ComponentName(ctx, SmsReceiver.class),
            PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
            PackageManager.DONT_KILL_APP);
        startPoller();
        call.resolve(new JSObject());
    }

    @PluginMethod
    public void getDeviceKey(PluginCall call) {
        String key = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(PREF_KEY, null);
        JSObject r = new JSObject();
        if (key != null) r.put("key", key);
        call.resolve(r);
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        ActivityCompat.requestPermissions(getActivity(), SMS_PERMS, 7701);
        JSObject r = new JSObject();
        r.put("requested", true);
        call.resolve(r);
    }

    @PluginMethod
    public void sendSms(PluginCall call) {
        String to = call.getString("to");
        String body = call.getString("body");
        JSObject r = new JSObject();
        try {
            sendOne(to, body);
            r.put("sent", true);
        } catch (Exception e) {
            r.put("sent", false);
            r.put("error", String.valueOf(e.getMessage()));
        }
        call.resolve(r);
    }

    @PluginMethod
    public void status(PluginCall call) {
        Context ctx = getContext();
        JSObject r = new JSObject();
        r.put("hasKey", ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(PREF_KEY, null) != null);
        r.put("canReadSms", hasPerm(Manifest.permission.READ_SMS));
        r.put("canSendSms", hasPerm(Manifest.permission.SEND_SMS));
        call.resolve(r);
    }

    @Override
    protected void handleOnDestroy() {
        if (pollHandler != null) pollHandler.removeCallbacks(pollTask);
        if (pollThread != null) pollThread.quitSafely();
        super.handleOnDestroy();
    }

    // ── internals ──────────────────────────────────────────────

    private boolean hasPerm(String perm) {
        return ContextCompat.checkSelfPermission(getContext(), perm)
            == PackageManager.PERMISSION_GRANTED;
    }

    private void startPoller() {
        if (pollHandler != null) return;
        pollThread = new HandlerThread("sms-outbox");
        pollThread.start();
        pollHandler = new Handler(pollThread.getLooper());
        pollHandler.postDelayed(pollTask, 5_000); // first poll quickly after login
    }

    private void pollOutbox() {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String key = prefs.getString(PREF_KEY, null);
        String base = prefs.getString(PREF_BASE, null);
        if (key == null || base == null || !hasPerm(Manifest.permission.SEND_SMS)) return;
        try {
            SmsHttp.Result res = SmsHttp.get(base + "/api/sms/outbox", key);
            if (res.status != 200) return;
            JSONArray messages = new JSONObject(res.body).optJSONArray("messages");
            if (messages == null || messages.length() == 0) return;
            JSONArray results = new JSONArray();
            for (int i = 0; i < messages.length(); i++) {
                JSONObject m = messages.getJSONObject(i);
                JSONObject r = new JSONObject();
                r.put("id", m.getString("id"));
                try {
                    sendOne(m.getString("toPhone"), m.getString("body"));
                    r.put("ok", true);
                } catch (Exception e) {
                    r.put("ok", false);
                    r.put("error", String.valueOf(e.getMessage()));
                }
                results.put(r);
            }
            JSONObject ack = new JSONObject();
            ack.put("results", results);
            SmsHttp.post(base + "/api/sms/outbox", ack.toString(), key);
        } catch (Exception ignored) {
            // Offline / server down — the poll retries next cycle; the
            // server keeps items QUEUED until acked or 3 attempts.
        }
    }

    private void sendOne(String to, String body) {
        SmsManager mgr = getContext().getSystemService(SmsManager.class);
        // Multipart for anything longer than one segment — bank/OTP bodies
        // routinely exceed 160 chars.
        java.util.ArrayList<String> parts = mgr.divideMessage(body);
        if (parts.size() == 1) {
            mgr.sendTextMessage(to, null, body, null, null);
        } else {
            mgr.sendMultipartTextMessage(to, null, parts, null, null);
        }
    }
}
