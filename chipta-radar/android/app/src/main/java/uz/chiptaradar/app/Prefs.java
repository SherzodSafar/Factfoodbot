package uz.chiptaradar.app;

import android.content.Context;
import android.content.SharedPreferences;

/** Ulanish tokeni va oxirgi tekshiruv holati */
final class Prefs {
    private Prefs() {}

    private static SharedPreferences p(Context c) {
        return c.getSharedPreferences("chipta_radar", Context.MODE_PRIVATE);
    }

    static String token(Context c) { return p(c).getString("token", null); }
    static String name(Context c) { return p(c).getString("name", ""); }
    static long since(Context c) { return p(c).getLong("since", System.currentTimeMillis()); }
    static long lastId(Context c) { return p(c).getLong("lastId", 0); }
    static long lastCheck(Context c) { return p(c).getLong("lastCheck", 0); }
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

    static void clear(Context c) { p(c).edit().clear().apply(); }
}
