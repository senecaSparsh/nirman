package life.nirman.app;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/** Minimal HTTP helper — device-key authed calls to the Nirman server. */
final class SmsHttp {

    static final class Result {
        final int status;
        final String body;
        Result(int status, String body) { this.status = status; this.body = body; }
    }

    static Result get(String url, String key) throws Exception {
        return request("GET", url, null, key);
    }

    static Result post(String url, String jsonBody, String key) throws Exception {
        return request("POST", url, jsonBody, key);
    }

    private static Result request(String method, String url, String jsonBody, String key) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        try {
            conn.setRequestMethod(method);
            conn.setConnectTimeout(10_000);
            conn.setReadTimeout(15_000);
            conn.setRequestProperty("x-sms-key", key);
            if (jsonBody != null) {
                conn.setDoOutput(true);
                conn.setRequestProperty("Content-Type", "application/json");
                try (OutputStream os = conn.getOutputStream()) {
                    os.write(jsonBody.getBytes(StandardCharsets.UTF_8));
                }
            }
            int status = conn.getResponseCode();
            BufferedReader br = new BufferedReader(new InputStreamReader(
                status < 400 ? conn.getInputStream() : conn.getErrorStream(), StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = br.readLine()) != null) sb.append(line);
            return new Result(status, sb.toString());
        } finally {
            conn.disconnect();
        }
    }
}
