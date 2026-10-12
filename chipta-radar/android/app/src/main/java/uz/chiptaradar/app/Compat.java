package uz.chiptaradar.app;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.os.Build;

/** Android 5.0+ (API 21) bilan moslik yordamchilari */
final class Compat {
    private Compat() {}

    static int immutable() {
        return Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0;
    }

    static NotificationManager notifications(Context c) {
        return (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
    }

    @SuppressWarnings("deprecation")
    static Notification.Builder builder(Context c, String channel) {
        if (Build.VERSION.SDK_INT >= 26) return new Notification.Builder(c, channel);
        return new Notification.Builder(c).setPriority(Notification.PRIORITY_MAX).setDefaults(Notification.DEFAULT_ALL);
    }
}
