package uz.chiptaradar.app;

import android.Manifest;
import android.app.Activity;
import android.app.AlarmManager;
import android.app.NotificationManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import android.text.InputType;
import android.text.format.DateFormat;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

import java.util.Date;

/** Ulash (botdagi kod) va holat/ruxsatlar ekrani */
public class MainActivity extends Activity {
    private LinearLayout root;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Alerts.channels(this);
        askNotifications();
    }

    @Override
    protected void onResume() {
        super.onResume();
        render();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void askNotifications() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[] {Manifest.permission.POST_NOTIFICATIONS}, 1);
        }
    }

    private TextView para(String value, int sizeSp) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(sizeSp);
        view.setTextColor(0xFF263238);
        view.setPadding(0, dp(8), 0, dp(8));
        root.addView(view);
        return view;
    }

    private void button(String label, int color, View.OnClickListener listener) {
        Button button = new Button(this);
        button.setText(label);
        button.setAllCaps(false);
        button.setTextSize(16);
        button.setTextColor(Color.WHITE);
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(color);
        shape.setCornerRadius(dp(12));
        button.setBackground(shape);
        button.setOnClickListener(listener);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(54));
        params.setMargins(0, dp(6), 0, dp(6));
        root.addView(button, params);
    }

    private void render() {
        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(0xFFF5F7FA);
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(20), dp(32), dp(20), dp(20));
        scroll.addView(root);
        setContentView(scroll);

        TextView title = para("🚆 Chipta Radar", 26);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setGravity(Gravity.CENTER_HORIZONTAL);
        if (Prefs.token(this) == null) renderPairing(); else renderStatus();
    }

    private void renderPairing() {
        para("Kuzatuvingizda chipta chiqqanda telefoningizga qo'ng'iroq qilaman va SMS kabi xabar beraman — Telegram yopiq bo'lsa ham.", 16);
        para("1) Telegramda @Poyezd_chiptachi_bot → «📱 Qo'ng'iroq ilovasi» tugmasini bosing.\n2) Bot bergan 6 xonali kodni shu yerga yozing:", 16);
        EditText code = new EditText(this);
        code.setInputType(InputType.TYPE_CLASS_NUMBER);
        code.setHint("123456");
        code.setTextSize(26);
        code.setGravity(Gravity.CENTER);
        root.addView(code);
        button("🔗 Ulash", 0xFF1E88E5, v -> pair(code.getText().toString()));
        button("Botni ochish", 0xFF546E7A, v -> open(new Intent(Intent.ACTION_VIEW, Uri.parse(Api.BOT_URL))));
    }

    private void pair(String code) {
        toast("Ulanmoqda...");
        new Thread(() -> {
            JSONObject body = new JSONObject();
            try {
                body.put("code", code.trim());
            } catch (Exception ignored) {
                // bo'lmaydi
            }
            JSONObject res = Api.call("POST", "/api/app/pair", body, null);
            runOnUiThread(() -> {
                if (res == null) { toast("Internet yoki server javob bermadi. Qayta urinib ko'ring."); return; }
                if (!res.optBoolean("ok")) { toast(res.optString("error", "Kod noto'g'ri")); return; }
                Prefs.paired(this, res.optString("token"), res.optString("name"), res.optLong("now", System.currentTimeMillis()));
                Scheduler.schedule(this, 5_000);
                toast("✅ Ulandi!");
                render();
            });
        }).start();
    }

    private void renderStatus() {
        String name = Prefs.name(this);
        para("✅ Ulangan" + (name.isEmpty() ? "" : " (" + name + ")") + ". Kuzatuvingizda chipta chiqsa — qo'ng'iroq qilaman.", 17);
        long last = Prefs.lastCheck(this);
        String error = Prefs.lastError(this);
        para(last == 0
                ? "⏳ Birinchi tekshiruv kutilmoqda..."
                : "🕐 Oxirgi tekshiruv: " + DateFormat.getTimeFormat(this).format(new Date(last)) + (error == null ? " ✅" : "\n⚠️ " + error), 15);

        button("📞 Sinov qo'ng'irog'i", 0xFF43A047, v -> Alerts.ticketFound(this, "Toshkent → Samarqand (sinov)", false));

        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            button("🔔 Bildirishnomaga ruxsat berish", 0xFFFB8C00, v -> askNotifications());
        }
        PowerManager power = (PowerManager) getSystemService(POWER_SERVICE);
        if (Build.VERSION.SDK_INT >= 23 && power != null && !power.isIgnoringBatteryOptimizations(getPackageName())) {
            button("🔋 Batareya cheklovini o'chirish", 0xFFFB8C00,
                    v -> open(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)));
        }
        if (Build.VERSION.SDK_INT >= 31) {
            AlarmManager alarms = (AlarmManager) getSystemService(ALARM_SERVICE);
            if (alarms != null && !alarms.canScheduleExactAlarms()) {
                button("⏰ Har daqiqada tekshirishga ruxsat", 0xFFFB8C00,
                        v -> open(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + getPackageName()))));
            }
        }
        if (Build.VERSION.SDK_INT >= 34) {
            NotificationManager nm = Compat.notifications(this);
            if (nm != null && !nm.canUseFullScreenIntent()) {
                button("📲 To'liq ekran qo'ng'irog'iga ruxsat", 0xFFFB8C00,
                        v -> open(new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:" + getPackageName()))));
            }
        }
        para("ℹ️ Xiaomi/Redmi/POCO: Sozlamalar → Ilovalar → Chipta Radar → «Avtomatik ishga tushirish»ni yoqing, «Batareya tejash»ni «Cheklovsiz» qiling va «Qulflangan ekranda ko'rsatish»ga ruxsat bering.", 14);
        button("⚙️ Ilova sozlamalari", 0xFF546E7A,
                v -> open(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName()))));
        button("Uzish", 0xFF9E9E9E, v -> {
            Scheduler.cancel(this);
            Prefs.clear(this);
            render();
        });
        Scheduler.schedule(this, 3_000);
    }

    private void open(Intent intent) {
        try {
            startActivity(intent);
        } catch (Exception e) {
            toast("Bu sozlama telefoningizda topilmadi");
        }
    }

    private void toast(String text) {
        Toast.makeText(this, text, Toast.LENGTH_LONG).show();
    }
}
