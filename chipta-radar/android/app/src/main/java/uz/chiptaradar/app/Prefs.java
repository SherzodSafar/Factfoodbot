package uz.chiptaradar.app;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

/** Ulanish tokeni, oxirgi tekshiruv holati, til va bildirishnomalar tarixi */
final class Prefs {
    private static final int HISTORY_MAX = 50;

    private Prefs() {}

    private static SharedPreferences p(Context c) {
        return c.getSharedPreferences("chipta_radar", Context.MODE_PRIVATE);
    }

    static String token(Context c) { return p(c).getString("token", null); }
    static String name(Context c) { return p(c).getString("name", ""); }
    static long since(Context c) { return p(c).getLong("since", System.currentTimeMillis()); }
    static long lastId(Context c) { return p(c).getLong("lastId", 0); }
    static long lastCheck(Context c) { return p(c).getLong("lastCheck", 0); }
    /** Oxirgi xato kodi: net, unpaired yoki server:<kod> (matni tanlangan tilda ko'rsatiladi) */
    static String lastError(Context c) { return p(c).getString("lastError", null); }

    static void paired(Context c, String token, String name, long now) {
        p(c).edit().putString("token", token).putString("name", name).putLong("since", now).remove("lastError").apply();
    }

    static void checked(Context c, long since, long lastId, String error) {
        SharedPreferences.Editor e = p(c).edit().putLong("lastCheck", System.currentTimeMillis());
        if (since > 0) e.putLong("since", since);
        if (lastId > 0) e.putLong("lastId", lastId);
        if (error == null) e.remove("lastError"); else e.putString("lastError", error);
        e.apply();
    }

    /** Serverdan yuklangan ovozli xabar ("" — ilovadagi standart ovoz) */
    static String voiceId(Context c) { return p(c).getString("voiceId", ""); }
    static String voicePath(Context c) { return p(c).getString("voicePath", null); }
    static void setVoice(Context c, String id, String path) { p(c).edit().putString("voiceId", id).putString("voicePath", path).apply(); }

    /** Telefon sozlamalarida qo'lda bajariladigan (tekshirib bo'lmaydigan) qadamlar */
    static boolean flag(Context c, String key) { return p(c).getBoolean("flag_" + key, false); }
    static void setFlag(Context c, String key) { p(c).edit().putBoolean("flag_" + key, true).apply(); }

    /** Til: pending=true — ilovada tanlangan, serverga (botga) hali yuborilmagan */
    static String lang(Context c) { return p(c).getString("lang", null); }
    static boolean langPending(Context c) { return p(c).getBoolean("langPending", false); }
    static void setLang(Context c, String lang, boolean pending) { p(c).edit().putString("lang", lang).putBoolean("langPending", pending).apply(); }
    static void langSent(Context c) { p(c).edit().putBoolean("langPending", false).apply(); }

    /** Bildirishnomalar tarixi (yangisi birinchi) */
    static JSONArray history(Context c) {
        try {
            return new JSONArray(p(c).getString("history", "[]"));
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    static synchronized void addHistory(Context c, String title, long at, boolean intl) {
        JSONArray old = history(c);
        JSONArray list = new JSONArray();
        try {
            list.put(new JSONObject().put("title", title).put("at", at).put("intl", intl));
            for (int i = 0; i < old.length() && list.length() < HISTORY_MAX; i++) list.put(old.get(i));
        } catch (Exception ignored) {
            // buzilgan yozuv — o'tkazib yuboriladi
        }
        p(c).edit().putString("history", list.toString()).putInt("unread", unread(c) + 1).apply();
    }

    static int unread(Context c) { return p(c).getInt("unread", 0); }
    static void markRead(Context c) { p(c).edit().putInt("unread", 0).apply(); }
    static void clearHistory(Context c) { p(c).edit().remove("history").putInt("unread", 0).apply(); }

    /** Uzish: faqat ulanish ma'lumotlari o'chadi (til, tarix, sozlash belgilari qoladi) */
    static void clear(Context c) {
        p(c).edit().remove("token").remove("name").remove("since").remove("lastId").remove("lastCheck").remove("lastError").apply();
    }
}
