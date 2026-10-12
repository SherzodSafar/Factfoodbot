package uz.chiptaradar.app;

import android.app.Activity;
import android.app.NotificationManager;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;


/** Soxta kiruvchi qo'ng'iroq: jiringlaydi, ko'tarilganda ovozli xabar aytadi */
public class CallActivity extends Activity {
    private final Handler handler = new Handler(Looper.getMainLooper());
    private Ringtone ringtone;
    private Vibrator vibrator;
    private Voice voice;
    private LinearLayout buttons;
    private TextView status;
    private String title;
    private boolean intl;
    private String message;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        title = getIntent().getStringExtra("title");
        intl = getIntent().getBooleanExtra("intl", false);
        message = L.t(this, "voice_msg");
        buildUi();
        startRinging();
        handler.postDelayed(this::finish, 45_000); // javob berilmasa — 45 soniyada to'xtaydi
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private TextView text(String value, int sizeSp, int color) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(sizeSp);
        view.setTextColor(color);
        view.setGravity(Gravity.CENTER);
        view.setPadding(0, dp(6), 0, dp(6));
        return view;
    }

    private Button button(String label, int color, View.OnClickListener listener) {
        Button button = new Button(this);
        button.setText(label);
        button.setTextColor(Color.WHITE);
        button.setTextSize(17);
        button.setAllCaps(false);
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(color);
        shape.setCornerRadius(dp(32));
        button.setBackground(shape);
        button.setOnClickListener(listener);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, dp(64), 1f);
        params.setMargins(dp(10), dp(8), dp(10), dp(8));
        button.setLayoutParams(params);
        return button;
    }

    private void buildUi() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        root.setBackgroundColor(0xFF101418);
        root.setPadding(dp(24), dp(72), dp(24), dp(40));

        root.addView(text(L.t(this, "incoming"), 16, 0xFFB0BEC5));
        TextView name = text("Chipta Radar", 34, Color.WHITE);
        name.setTypeface(Typeface.DEFAULT_BOLD);
        root.addView(name);
        root.addView(text(title == null ? "" : title, 18, 0xFFE0E0E0));
        status = text("", 17, 0xFF81C784);
        root.addView(status);
        root.addView(new View(this), new LinearLayout.LayoutParams(1, 0, 1f));

        buttons = new LinearLayout(this);
        buttons.setOrientation(LinearLayout.HORIZONTAL);
        buttons.addView(button(L.t(this, "decline"), 0xFFE53935, v -> finish()));
        buttons.addView(button(L.t(this, "answer"), 0xFF43A047, v -> answer()));
        root.addView(buttons, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        setContentView(root);
    }

    private void startRinging() {
        // Telefon ovozsiz rejimda — jiringlamaydi, tebranish rejimida — faqat tebranadi (oddiy qo'ng'iroq kabi)
        AudioManager audio = (AudioManager) getSystemService(AUDIO_SERVICE);
        int mode = audio == null ? AudioManager.RINGER_MODE_NORMAL : audio.getRingerMode();
        if (mode == AudioManager.RINGER_MODE_SILENT) return;
        if (mode == AudioManager.RINGER_MODE_VIBRATE) {
            startVibration();
            return;
        }
        try {
            Uri uri = RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_RINGTONE);
            if (uri == null) uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            ringtone = RingtoneManager.getRingtone(this, uri);
            if (ringtone != null) {
                ringtone.setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build());
                if (Build.VERSION.SDK_INT >= 28) ringtone.setLooping(true);
                ringtone.play();
            }
        } catch (Exception ignored) {
            // ovozsiz bo'lsa ham tebranish ishlaydi
        }
        startVibration();
    }

    private void startVibration() {
        vibrator = (Vibrator) getSystemService(VIBRATOR_SERVICE);
        if (vibrator != null) {
            long[] pattern = {0, 900, 700};
            if (Build.VERSION.SDK_INT >= 26) vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
            else vibrator.vibrate(pattern, 0);
        }
    }

    private void stopRinging() {
        if (ringtone != null) ringtone.stop();
        if (vibrator != null) vibrator.cancel();
        NotificationManager nm = Compat.notifications(this);
        if (nm != null) nm.cancel(Alerts.CALL_ID);
    }

    private void answer() {
        handler.removeCallbacksAndMessages(null);
        stopRinging();
        status.setText("🔊 " + message);
        buttons.removeAllViews();
        buttons.setOrientation(LinearLayout.VERTICAL);
        buttons.addView(button(L.t(this, "open_tg"), 0xFF1E88E5, v -> open(Api.BOT_URL)));
        buttons.addView(button(L.t(this, "buy"), 0xFF43A047, v -> open(Api.siteUrl(this, intl))));
        buttons.addView(button(L.t(this, "close"), 0xFF546E7A, v -> finish()));
        for (int i = 0; i < buttons.getChildCount(); i++) {
            buttons.getChildAt(i).setLayoutParams(new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(60)));
        }
        voice = new Voice(this, AudioAttributes.USAGE_ALARM, title, null);
        voice.start();
    }

    private void open(String url) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (Exception ignored) {
            // brauzer/Telegram yo'q
        }
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        stopRinging();
        if (voice != null) voice.stop();
        super.onDestroy();
    }
}
