package uz.chiptaradar.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;

/** Chipta topilganda: SMS ko'rinishidagi xabar + soxta kiruvchi qo'ng'iroq */
final class Alerts {
    static final String CH_CALL = "call";
    static final String CH_SMS = "sms";
    static final int CALL_ID = 21;
    static final int SMS_ID = 20;

    private Alerts() {}

    static void channels(Context c) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null) return;
        NotificationChannel call = new NotificationChannel(CH_CALL, "Qo'ng'iroq (chipta topildi)", NotificationManager.IMPORTANCE_HIGH);
        call.setSound(null, null); // qo'ng'iroq ovozini CallActivity o'zi chaladi
        call.enableVibration(false);
        call.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        NotificationChannel sms = new NotificationChannel(CH_SMS, "Xabar (chipta topildi)", NotificationManager.IMPORTANCE_HIGH);
        sms.enableVibration(true);
        sms.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(call);
        nm.createNotificationChannel(sms);
    }

    static void ticketFound(Context c, String title, boolean intl) {
        channels(c);
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null) return;

        // 1) SMS ko'rinishidagi xabar
        String body = "Chipta topuvchi botda siz so'ragan chipta paydo bo'ldi: " + title + ". Tezroq kirib sotib oling!";
        PendingIntent openBot = PendingIntent.getActivity(c, 2, new Intent(Intent.ACTION_VIEW, Uri.parse(Api.BOT_URL)),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification sms = new Notification.Builder(c, CH_SMS)
                .setSmallIcon(R.drawable.ic_stat_train)
                .setContentTitle("Chipta Radar")
                .setContentText(body)
                .setStyle(new Notification.BigTextStyle().bigText(body))
                .setCategory(Notification.CATEGORY_MESSAGE)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setAutoCancel(true)
                .setContentIntent(openBot)
                .build();
        nm.notify(SMS_ID, sms);

        // 2) Soxta kiruvchi qo'ng'iroq (qulflangan ekranda ham to'liq ekran)
        Intent call = new Intent(c, CallActivity.class)
                .putExtra("title", title)
                .putExtra("intl", intl)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent full = PendingIntent.getActivity(c, 3, call, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification ring = new Notification.Builder(c, CH_CALL)
                .setSmallIcon(R.drawable.ic_stat_train)
                .setContentTitle("📞 Chipta Radar qo'ng'iroq qilmoqda")
                .setContentText(title)
                .setCategory(Notification.CATEGORY_CALL)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setFullScreenIntent(full, true)
                .setContentIntent(full)
                .setOngoing(true)
                .setAutoCancel(true)
                .build();
        nm.notify(CALL_ID, ring);
        try {
            c.startActivity(call); // ilova ochiq bo'lsa — darhol
        } catch (Exception ignored) {
            // fonda — to'liq ekran bildirishnoma ochadi
        }
    }
}
