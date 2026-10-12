package uz.chiptaradar.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/** Har daqiqada serverni tekshirish (telefon uxlab yotganda ham — "allow while idle" signal) */
final class Scheduler {
    static final long INTERVAL_MS = 60_000;

    private Scheduler() {}

    private static PendingIntent intent(Context c) {
        return PendingIntent.getBroadcast(c, 1, new Intent(c, PollReceiver.class),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void schedule(Context c, long delayMs) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        if (am == null) return;
        long at = System.currentTimeMillis() + delayMs;
        if (Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()) {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, intent(c));
        } else {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, intent(c));
        }
    }

    static void cancel(Context c) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        if (am != null) am.cancel(intent(c));
    }
}
