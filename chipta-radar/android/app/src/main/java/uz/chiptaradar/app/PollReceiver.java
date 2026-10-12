package uz.chiptaradar.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;

/** Signal kelganda serverdan yangi "chipta topildi" xabarlarini so'raydi */
public class PollReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        final Context c = context.getApplicationContext();
        final PendingResult result = goAsync();
        new Thread(() -> {
            try {
                poll(c);
            } finally {
                if (Prefs.token(c) != null) Scheduler.schedule(c, Scheduler.INTERVAL_MS);
                result.finish();
            }
        }).start();
    }

    /** Admin tanlagan ovozli xabarni yuklab olish (o'zgarganda) */
    private static void syncVoice(Context c, JSONObject voice, String token) {
        String wanted = voice == null ? "" : voice.optString("id", "");
        if (wanted.equals(Prefs.voiceId(c))) return;
        String old = Prefs.voicePath(c);
        if (wanted.isEmpty()) {
            Prefs.setVoice(c, "", null);
        } else {
            File target = new File(c.getFilesDir(), "voice-" + wanted);
            if (!Api.download("/api/app/voice/" + wanted, token, target)) return; // keyingi tekshiruvda qayta urinadi
            Prefs.setVoice(c, wanted, target.getPath());
        }
        if (old != null) {
            File previous = new File(old);
            if (!previous.getPath().equals(Prefs.voicePath(c))) previous.delete();
        }
    }

    static void poll(Context c) {
        String token = Prefs.token(c);
        if (token == null) return;
        JSONObject res = Api.call("GET", "/api/app/events?since=" + Prefs.since(c), null, token);
        if (res == null) { Prefs.checked(c, 0, 0, "Internet yoki server javob bermadi"); return; }
        int status = res.optInt("_status");
        if (status == 401) { Prefs.checked(c, 0, 0, "Ulanish bekor qilingan — botdan yangi kod oling"); return; }
        if (status != 200) { Prefs.checked(c, 0, 0, "Server xatosi: " + status); return; }

        long now = res.optLong("now", System.currentTimeMillis());
        JSONArray events = res.optJSONArray("events");
        long since = now - 5_000;
        long lastId = Prefs.lastId(c);
        JSONObject fresh = null;
        if (events != null && events.length() > 0) {
            for (int i = 0; i < events.length(); i++) {
                JSONObject e = events.optJSONObject(i);
                if (e == null) continue;
                since = Math.max(Prefs.since(c), e.optLong("at", now));
                if (e.optLong("id") > lastId) { fresh = e; lastId = e.optLong("id"); }
            }
        }
        Prefs.checked(c, since, lastId, null);
        syncVoice(c, res.optJSONObject("voice"), token);
        if (fresh != null) Alerts.ticketFound(c, fresh.optString("title"), fresh.optBoolean("intl"));
    }
}
