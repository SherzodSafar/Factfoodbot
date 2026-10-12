package uz.chiptaradar.app;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/** Chipta Radar serveri bilan aloqa */
final class Api {
    static final String BASE = "https://chipta-radar-api.onrender.com";
    static final String BOT_URL = "https://t.me/Poyezd_chiptachi_bot";

    private Api() {}

    /** JSON javob ("_status" — HTTP kodi) yoki tarmoq xatosida null */
    static JSONObject call(String method, String path, JSONObject body, String token) {
        HttpURLConnection con = null;
        try {
            con = (HttpURLConnection) new URL(BASE + path).openConnection();
            con.setRequestMethod(method);
            con.setConnectTimeout(8000);
            con.setReadTimeout(8000);
            con.setRequestProperty("Accept", "application/json");
            if (token != null) con.setRequestProperty("Authorization", "Bearer " + token);
            if (body != null) {
                con.setDoOutput(true);
                con.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                try (OutputStream out = con.getOutputStream()) {
                    out.write(body.toString().getBytes(StandardCharsets.UTF_8));
                }
            }
            int status = con.getResponseCode();
            InputStream in = status >= 400 ? con.getErrorStream() : con.getInputStream();
            String text = in == null ? "" : read(in);
            JSONObject json;
            try {
                json = new JSONObject(text);
            } catch (Exception e) {
                json = new JSONObject();
            }
            json.put("_status", status);
            return json;
        } catch (Exception e) {
            return null;
        } finally {
            if (con != null) con.disconnect();
        }
    }

    private static String read(InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[4096];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        in.close();
        return new String(out.toByteArray(), StandardCharsets.UTF_8);
    }
}
