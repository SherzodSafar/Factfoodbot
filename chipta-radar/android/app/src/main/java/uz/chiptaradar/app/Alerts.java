package uz.chiptaradar.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.text.format.DateFormat;
import android.widget.RemoteViews;

import java.util.Date;

/** Chipta topilganda: SMS ko'rinishidagi xabar + soxta kiruvchi qo'ng'iroq */
final class Alerts {
    static final String CH_CALL = "call";
    static final String CH_SMS = "sms";
    static final int CALL_ID = 21;
    static final int SMS_ID = 20;

    private Alerts() {}

    /** Kanallar (nomi tanlangan tilda; qayta chaqirilsa nom yangilanadi) */
    static void channels(Context c) {
        if (Build.VERSION.SDK_INT < 26) return; // eski Android'da kanal yo'q
        NotificationManager nm = Compat.notifications(c);
        if (nm == null) return;
        NotificationChannel call = new NotificationChannel(CH_CALL, L.t(c, "ch_call"), NotificationManager.IMPORTANCE_HIGH);
        call.setSound(null, null); // qo'ng'iroq ovozini CallActivity o'zi chaladi
        call.enableVibration(false);
        call.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        NotificationChannel sms = new NotificationChannel(CH_SMS, L.t(c, "ch_sms"), NotificationManager.IMPORTANCE_HIGH);
        sms.enableVibration(true);
        sms.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(call);
        nm.createNotificationChannel(sms);
    }

    /** Bildirishnoma ko'rinishi: sarlavha, matn va o'ng pastki burchakda — soat */
    private static RemoteViews smsView(Context c, String body, String time, boolean expanded) {
        RemoteViews views = new RemoteViews(c.getPackageName(), R.layout.notif_sms);
        views.setTextViewText(R.id.n_title, "Chipta Radar");
        views.setTextViewText(R.id.n_text, body);
        views.setTextViewText(R.id.n_time, time);
        views.setInt(R.id.n_text, "setMaxLines", expanded ? 10 : 1);
        if (Build.VERSION.SDK_INT < 24) {
            int pad = Math.round(16 * c.getResources().getDisplayMetrics().density);
            views.setViewPadding(R.id.n_root, pad, pad * 3 / 4, pad, pad * 3 / 4); // eski Android'da ramka yo'q
        }
        return views;
    }

    @SuppressWarnings("deprecation")
    static void ticketFound(Context c, String title, boolean intl) {
        channels(c);
        NotificationManager nm = Compat.notifications(c);
        if (nm == null) return;

        // 1) SMS ko'rinishidagi xabar
        String body = L.f(c, "sms_body", title);
        String time = DateFormat.getTimeFormat(c).format(new Date());
        PendingIntent openBot = PendingIntent.getActivity(c, 2, new Intent(Intent.ACTION_VIEW, Uri.parse(Api.BOT_URL)),
                Compat.immutable() | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.Builder sms = Compat.builder(c, CH_SMS)
                .setSmallIcon(R.drawable.ic_stat_train)
                .setContentTitle("Chipta Radar")
                .setContentText(body)
                .setShowWhen(false) // vaqt sarlavhada emas — o'ng pastda
                .setCategory(Notification.CATEGORY_MESSAGE)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setAutoCancel(true)
                .setContentIntent(openBot);
        if (Build.VERSION.SDK_INT >= 24) {
            sms.setStyle(new Notification.DecoratedCustomViewStyle())
                    .setCustomContentView(smsView(c, body, time, false))
                    .setCustomBigContentView(smsView(c, body, time, true))
                    .setCustomHeadsUpContentView(smsView(c, body, time, false));
        } else {
            sms.setContent(smsView(c, body, time, true));
        }
        nm.notify(SMS_ID, sms.build());

        // 2) Qo'ng'iroq: telefonning o'z «Telefon» ilovasida (tarixga yoziladi), imkoni bo'lmasa — ilova oynasi
        if (!SystemCall.ring(c, title, intl)) callScreen(c, title, intl);
    }

    /** Ilovaning o'z kiruvchi qo'ng'iroq oynasi (qulflangan ekranda ham to'liq ekran) */
    static void callScreen(Context c, String title, boolean intl) {
        channels(c);
        NotificationManager nm = Compat.notifications(c);
        if (nm == null) return;
        Intent call = new Intent(c, CallActivity.class)
                .putExtra("title", title)
                .putExtra("intl", intl)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent full = PendingIntent.getActivity(c, 3, call, Compat.immutable() | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification ring = Compat.builder(c, CH_CALL)
                .setSmallIcon(R.drawable.ic_stat_train)
                .setContentTitle(L.t(c, "calling"))
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
