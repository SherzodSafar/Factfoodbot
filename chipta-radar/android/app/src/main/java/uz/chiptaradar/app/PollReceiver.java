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

    /** Ilovada tanlangan tilni serverga (botga) yuborish */
    static boolean sendLang(Context c, String token) {
        JSONObject body = new JSONObject();
        try {
            body.put("lang", L.lang(c));
        } catch (Exception ignored) {
            return false;
        }
        JSONObject res = Api.call("POST", "/api/app/lang", body, token);
        if (res == null || res.optInt("_status") != 200) return false;
        Prefs.langSent(c);
        return true;
    }

    /** Server javobidagi bot tilini qo'llash. true — til o'zgardi */
    static boolean applyServerLang(Context c, String lang) {
        if (!L.valid(lang) || Prefs.langPending(c) || lang.equals(Prefs.lang(c))) return false;
        Prefs.setLang(c, lang, false);
        Alerts.channels(c); // kanal nomlari ham yangi tilda
        return true;
    }

    /** Bitta tekshiruv: yangi xabarlar, til va ovoz. true — til o'zgardi (ekranni yangilash kerak) */
    static synchronized boolean poll(Context c) {
        String token = Prefs.token(c);
        if (token == null) return false;
        if (Prefs.langPending(c)) sendLang(c, token);
        JSONObject res = Api.call("GET", "/api/app/events?since=" + Prefs.since(c), null, token);
        if (res == null) { Prefs.checked(c, 0, 0, "net"); return false; }
        int status = res.optInt("_status");
        if (status == 401) { Prefs.checked(c, 0, 0, "unpaired"); return false; }
        if (status != 200) { Prefs.checked(c, 0, 0, "server:" + status); return false; }
        boolean langChanged = applyServerLang(c, res.optString("lang", ""));

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
                if (e.optLong("id") > lastId) {
                    fresh = e;
                    lastId = e.optLong("id");
                    Prefs.addHistory(c, e.optString("title"), e.optLong("at", now), e.optBoolean("intl"));
                }
            }
        }
        Prefs.checked(c, since, lastId, null);
        syncVoice(c, res.optJSONObject("voice"), token);
        if (fresh != null) Alerts.ticketFound(c, fresh.optString("title"), fresh.optBoolean("intl"));
        return langChanged;
    }
}
