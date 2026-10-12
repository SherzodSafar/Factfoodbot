package uz.chiptaradar.app;

import android.Manifest;
import android.app.Activity;
import android.app.AlarmManager;
import android.app.NotificationManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import java.util.ArrayList;
import java.util.List;

/** O'rnatilgandan keyingi sozlash qadamlari: holatini tekshirish va kerakli sahifani ochish */
final class Setup {
    static final class Step {
        final String key;
        final String title;
        final String hint;
        final boolean manual; // telefon holatini ayta olmaydi — «Bajardim» bilan belgilanadi
        final boolean done;

        Step(String key, String title, String hint, boolean manual, boolean done) {
            this.key = key;
            this.title = title;
            this.hint = hint;
            this.manual = manual;
            this.done = done;
        }
    }

    private Setup() {}

    static boolean isXiaomi() {
        String maker = (Build.MANUFACTURER + " " + Build.BRAND).toLowerCase();
        return maker.contains("xiaomi") || maker.contains("redmi") || maker.contains("poco");
    }

    static List<Step> steps(Context c) {
        List<Step> list = new ArrayList<>();
        NotificationManager nm = Compat.notifications(c);
        String pkg = c.getPackageName();

        boolean notify = Build.VERSION.SDK_INT >= 33
                ? c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
                : Build.VERSION.SDK_INT < 24 || nm == null || nm.areNotificationsEnabled();
        list.add(new Step("notify", L.t(c, "st_notify"), L.t(c, "st_notify_h"), false, notify));

        if (Build.VERSION.SDK_INT >= 34 && nm != null) {
            list.add(new Step("fullscreen", L.t(c, "st_fullscreen"), L.t(c, "st_fullscreen_h"), false, nm.canUseFullScreenIntent()));
        }
        if (Build.VERSION.SDK_INT >= 23) {
            list.add(new Step("overlay", L.t(c, "st_overlay"), L.t(c, "st_overlay_h"), false, Settings.canDrawOverlays(c)));
            PowerManager power = (PowerManager) c.getSystemService(Context.POWER_SERVICE);
            list.add(new Step("battery", L.t(c, "st_battery"), L.t(c, "st_battery_h"), false,
                    power != null && power.isIgnoringBatteryOptimizations(pkg)));
        }
        if (Build.VERSION.SDK_INT >= 31) {
            AlarmManager alarms = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
            list.add(new Step("alarm", L.t(c, "st_alarm"), L.t(c, "st_alarm_h"), false,
                    alarms != null && alarms.canScheduleExactAlarms()));
        }
        if (isXiaomi()) {
            list.add(new Step("autostart", L.t(c, "st_autostart"), L.t(c, "st_autostart_h"), true, Prefs.flag(c, "autostart")));
            list.add(new Step("miui", L.t(c, "st_miui"), L.t(c, "st_miui_h"), true, Prefs.flag(c, "miui")));
        }
        list.add(new Step("test", L.t(c, "st_test"), L.t(c, "st_test_h"), true, Prefs.flag(c, "test")));
        return list;
    }

    /** Qadam uchun kerakli sozlamalar sahifasini ochadi (topilmasa — ilova sozlamalari) */
    static void open(Activity a, String key) {
        String pkg = a.getPackageName();
        Uri uri = Uri.parse("package:" + pkg);
        Intent intent;
        switch (key) {
            case "notify":
                if (Build.VERSION.SDK_INT >= 33 && !Prefs.flag(a, "notifyAsked")) {
                    Prefs.setFlag(a, "notifyAsked");
                    a.requestPermissions(new String[] {Manifest.permission.POST_NOTIFICATIONS}, 1);
                    return;
                }
                intent = Build.VERSION.SDK_INT >= 26
                        ? new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, pkg)
                        : new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, uri);
                break;
            case "fullscreen":
                intent = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, uri);
                break;
            case "overlay":
                intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, uri);
                break;
            case "battery":
                intent = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                break;
            case "alarm":
                intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, uri);
                break;
            case "autostart":
                intent = new Intent().setComponent(new ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"));
                break;
            case "miui":
                intent = new Intent("miui.intent.action.APP_PERM_EDITOR")
                        .setClassName("com.miui.securitycenter", "com.miui.permcenter.permissions.PermissionsEditorActivity")
                        .putExtra("extra_pkgname", pkg);
                break;
            default:
                intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, uri);
        }
        try {
            a.startActivity(intent);
        } catch (Exception e) {
            try {
                a.startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, uri));
            } catch (Exception ignored) {
                // sozlamalar ochilmadi
            }
        }
    }
}
