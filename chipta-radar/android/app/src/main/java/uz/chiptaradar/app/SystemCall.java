package uz.chiptaradar.app;

import android.app.Activity;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.drawable.Icon;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.telecom.PhoneAccount;
import android.telecom.PhoneAccountHandle;
import android.telecom.TelecomManager;

import java.util.Collections;

/**
 * «Qo'ng'iroq hisobi» (calling account): yoqilgan bo'lsa, chipta qo'ng'irog'i telefonning o'z
 * «Telefon» ilovasida keladi va qo'ng'iroqlar tarixiga yoziladi. Faqat SIP manzil — oddiy
 * qo'ng'iroqlarga aralashmaydi (SIM tanlash so'ralmaydi).
 */
final class SystemCall {
    private static boolean registered;

    private SystemCall() {}

    static boolean supported() {
        return Build.VERSION.SDK_INT >= 23;
    }

    private static TelecomManager telecom(Context c) {
        return (TelecomManager) c.getSystemService(Context.TELECOM_SERVICE);
    }

    private static PhoneAccountHandle handle(Context c) {
        return new PhoneAccountHandle(new ComponentName(c, CallService.class), "chipta-radar");
    }

    static void register(Context c) {
        if (!supported() || registered) return;
        TelecomManager tm = telecom(c);
        if (tm == null) return;
        try {
            PhoneAccount account = PhoneAccount.builder(handle(c), "Chipta Radar")
                    .setCapabilities(PhoneAccount.CAPABILITY_CALL_PROVIDER)
                    .setIcon(Icon.createWithResource(c, R.mipmap.ic_launcher))
                    .setShortDescription(L.t(c, "acc_desc"))
                    .setSupportedUriSchemes(Collections.singletonList(PhoneAccount.SCHEME_SIP))
                    .build();
            tm.registerPhoneAccount(account);
            registered = true;
        } catch (Exception ignored) {
            // telefon qo'ng'iroq hisoblarini qo'llamaydi — ilovaning o'z oynasi ishlatiladi
        }
    }

    /** Hisob «Qo'ng'iroq hisoblari»da yoqilganmi */
    static boolean enabled(Context c) {
        if (!supported()) return false;
        register(c);
        TelecomManager tm = telecom(c);
        if (tm == null) return false;
        try {
            PhoneAccount account = tm.getPhoneAccount(handle(c));
            return account != null && account.isEnabled();
        } catch (Exception e) {
            return false;
        }
    }

    /** Telefonning o'z kiruvchi qo'ng'irog'i. false — imkoni yo'q (ilovaning o'z oynasi chiqadi) */
    static boolean ring(Context c, String title, boolean intl) {
        if (!enabled(c)) return false;
        try {
            Bundle inner = new Bundle();
            inner.putString("title", title);
            inner.putBoolean("intl", intl);
            Bundle extras = new Bundle();
            extras.putParcelable(TelecomManager.EXTRA_INCOMING_CALL_ADDRESS, CallService.address());
            extras.putBundle(TelecomManager.EXTRA_INCOMING_CALL_EXTRAS, inner);
            CallService.pendingTitle = title;
            CallService.pendingIntl = intl;
            telecom(c).addNewIncomingCall(handle(c), extras);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /** «Qo'ng'iroq hisoblari» sahifasi (topilmasa — qo'ng'iroq sozlamalari, so'ng ilova sozlamalari) */
    static void openSettings(Activity a) {
        Intent[] options = {
                new Intent(TelecomManager.ACTION_CHANGE_PHONE_ACCOUNTS),
                new Intent(TelecomManager.ACTION_SHOW_CALL_SETTINGS),
                new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + a.getPackageName())),
        };
        for (Intent intent : options) {
            try {
                a.startActivity(intent);
                return;
            } catch (Exception ignored) {
                // keyingisi
            }
        }
    }
}
