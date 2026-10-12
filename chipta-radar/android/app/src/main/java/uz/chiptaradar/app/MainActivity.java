package uz.chiptaradar.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.text.format.DateFormat;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Date;
import java.util.List;

/** Ulash (botdagi kod), holat/ruxsatlar va bildirishnomalar tarixi ekrani */
public class MainActivity extends Activity {
    private final Handler ui = new Handler(Looper.getMainLooper());
    private LinearLayout root;
    private boolean historyOpen;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Alerts.channels(this);
        SystemCall.register(this);
    }

    @Override
    protected void onResume() {
        super.onResume();
        render();
        refresh();
    }

    @Override
    public void onBackPressed() {
        if (historyOpen) {
            historyOpen = false;
            render();
            return;
        }
        super.onBackPressed();
    }

    /** Ochilganda server bilan tekshiruv (yangi xabar, botdagi til) — so'ng ekran yangilanadi */
    private void refresh() {
        if (Prefs.token(this) == null) return;
        final Context c = getApplicationContext();
        new Thread(() -> {
            PollReceiver.poll(c);
            ui.post(() -> {
                if (!isFinishing()) render();
            });
        }).start();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private String t(String key) {
        return L.t(this, key);
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

    private Button makeButton(String label, int color, View.OnClickListener listener) {
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
        return button;
    }

    private void button(String label, int color, View.OnClickListener listener) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(54));
        params.setMargins(0, dp(6), 0, dp(6));
        root.addView(makeButton(label, color, listener), params);
    }

    /** Ikki tugma yonma-yon: botni ochish va chipta sayti */
    private void linksRow() {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams left = new LinearLayout.LayoutParams(0, dp(54), 1f);
        left.setMargins(0, dp(6), dp(6), dp(6));
        LinearLayout.LayoutParams right = new LinearLayout.LayoutParams(0, dp(54), 1f);
        right.setMargins(dp(6), dp(6), 0, dp(6));
        row.addView(makeButton(t("open_bot"), 0xFF1E88E5, v -> open(Api.BOT_URL)), left);
        row.addView(makeButton(t("ticket_site"), 0xFF43A047, v -> open(Api.siteUrl(this, false))), right);
        root.addView(row);
    }

    /** Yuqori qator: nom, til (🌐) va qo'ng'iroqcha (🔔, o'qilmaganlar soni bilan) */
    private void topBar() {
        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);

        TextView title = new TextView(this);
        title.setText("🚆 Chipta Radar");
        title.setTextSize(22);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setTextColor(0xFF263238);
        bar.addView(title, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

        TextView langButton = iconButton("🌐");
        langButton.setContentDescription(t("language"));
        langButton.setOnClickListener(v -> chooseLanguage());
        bar.addView(langButton, new LinearLayout.LayoutParams(dp(48), dp(48)));

        FrameLayout bell = new FrameLayout(this);
        TextView icon = iconButton("🔔");
        icon.setContentDescription(t("history"));
        bell.addView(icon, new FrameLayout.LayoutParams(dp(48), dp(48)));
        int unread = Prefs.unread(this);
        if (unread > 0) {
            TextView badge = new TextView(this);
            badge.setText(unread > 99 ? "99+" : String.valueOf(unread));
            badge.setTextSize(11);
            badge.setTypeface(Typeface.DEFAULT_BOLD);
            badge.setTextColor(Color.WHITE);
            badge.setGravity(Gravity.CENTER);
            badge.setPadding(dp(4), 0, dp(4), 0);
            badge.setMinWidth(dp(18));
            GradientDrawable dot = new GradientDrawable();
            dot.setColor(0xFFE53935);
            dot.setCornerRadius(dp(9));
            badge.setBackground(dot);
            bell.addView(badge, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, dp(18), Gravity.TOP | Gravity.END));
        }
        View.OnClickListener openHistory = v -> {
            historyOpen = true;
            render();
        };
        icon.setOnClickListener(openHistory);
        bell.setOnClickListener(openHistory);
        bar.addView(bell, new LinearLayout.LayoutParams(dp(48), dp(48)));
        root.addView(bar);
    }

    private TextView iconButton(String emoji) {
        TextView view = new TextView(this);
        view.setText(emoji);
        view.setTextSize(24);
        view.setGravity(Gravity.CENTER);
        return view;
    }

    private void render() {
        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(0xFFF5F7FA);
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(20), dp(24), dp(20), dp(20));
        scroll.addView(root);
        setContentView(scroll);

        topBar();
        if (historyOpen) renderHistory();
        else if (Prefs.token(this) == null) renderPairing();
        else renderStatus();
    }

    /* ------------------------------ Til ------------------------------ */

    private void chooseLanguage() {
        String current = L.lang(this);
        int checked = 0;
        for (int i = 0; i < L.CODES.length; i++) if (L.CODES[i].equals(current)) checked = i;
        new AlertDialog.Builder(this)
                .setTitle("🌐 Til · Язык · Language")
                .setSingleChoiceItems(L.NAMES, checked, (dialog, which) -> {
                    dialog.dismiss();
                    setLanguage(L.CODES[which]);
                })
                .show();
    }

    /** Til ilovada tanlandi — botga ham yuboriladi (internet bo'lmasa keyingi tekshiruvda) */
    private void setLanguage(String code) {
        if (code.equals(L.lang(this)) && Prefs.lang(this) != null) return;
        Prefs.setLang(this, code, true);
        Alerts.channels(this);
        render();
        final String token = Prefs.token(this);
        if (token == null) return;
        final Context c = getApplicationContext();
        new Thread(() -> PollReceiver.sendLang(c, token)).start();
    }

    /* ---------------------------- Ulash ---------------------------- */

    private void renderPairing() {
        para(t("pair_intro"), 16);
        para(t("pair_steps"), 16);
        EditText code = new EditText(this);
        code.setInputType(InputType.TYPE_CLASS_NUMBER);
        code.setHint("123456");
        code.setTextSize(26);
        code.setGravity(Gravity.CENTER);
        root.addView(code);
        button(t("connect"), 0xFF1E88E5, v -> pair(code.getText().toString()));
        linksRow();
    }

    private void pair(String code) {
        toast(t("connecting"));
        final Context c = getApplicationContext();
        new Thread(() -> {
            JSONObject body = new JSONObject();
            try {
                body.put("code", code.trim());
            } catch (Exception ignored) {
                // bo'lmaydi
            }
            JSONObject res = Api.call("POST", "/api/app/pair", body, null);
            if (res != null && res.optBoolean("ok")) {
                Prefs.paired(c, res.optString("token"), res.optString("name"), res.optLong("now", System.currentTimeMillis()));
                // Ilovada til tanlangan bo'lsa — botga yuboriladi, aks holda botdagi til olinadi
                if (Prefs.langPending(c)) PollReceiver.sendLang(c, Prefs.token(c));
                else PollReceiver.applyServerLang(c, res.optString("lang", ""));
            }
            ui.post(() -> {
                if (res == null) { toast(t("net_retry")); return; }
                if (!res.optBoolean("ok")) { toast(t("bad_code")); return; }
                Scheduler.schedule(this, 5_000);
                toast(t("paired"));
                render();
            });
        }).start();
    }

    /* ---------------------------- Holat ---------------------------- */

    /** Xato kodi → tanlangan tildagi matn (eski versiyadan qolgan matn — o'zicha) */
    private String errorText(String code) {
        if ("net".equals(code)) return t("err_net");
        if ("unpaired".equals(code)) return t("err_unpaired");
        if (code.startsWith("server:")) return t("err_server") + code.substring(7);
        return code;
    }

    /** Holat va o'rnatilgandan keyingi sozlash qadamlari (har biri kerakli sahifani ochadi) */
    private void renderStatus() {
        linksRow();

        List<Setup.Step> steps = Setup.steps(this);
        int done = 0;
        for (Setup.Step step : steps) if (step.done) done++;
        boolean ready = done == steps.size();

        if (ready) {
            card(t("all_set"), 0xFFE8F5E9, 0xFF1B5E20);
        } else {
            card(L.f(this, "setup_progress", done, steps.size()), 0xFFFFF3E0, 0xFFE65100);
            boolean first = true;
            int number = 0;
            for (Setup.Step step : steps) {
                number++;
                if (step.done) {
                    para(number + ". ✅ " + step.title, 15).setTextColor(0xFF2E7D32);
                    continue;
                }
                TextView text = para(number + ". " + (first ? "👉 " : "⬜ ") + step.title + "\n" + step.hint, 15);
                if (first) text.setTypeface(Typeface.DEFAULT_BOLD);
                if (step.key.equals("test")) {
                    button(t("test_call"), 0xFF43A047, v -> testCall());
                } else {
                    button(first ? t("setup_btn") + " →" : t("setup_btn"), first ? 0xFF1E88E5 : 0xFF90A4AE, v -> Setup.open(this, step.key));
                    if (step.manual) button(t("done_btn"), 0xFF607D8B, v -> {
                        Prefs.setFlag(this, step.key);
                        render();
                    });
                    if (step.key.equals("callacc")) button(t("skip"), 0xFF90A4AE, v -> {
                        Prefs.setFlag(this, "callacc_skip");
                        render();
                    });
                }
                first = false;
            }
        }

        String name = Prefs.name(this);
        long last = Prefs.lastCheck(this);
        String error = Prefs.lastError(this);
        para(t("linked") + (name.isEmpty() ? "" : " (" + name + ")") + ". "
                + (last == 0 ? t("waiting_first")
                        : t("last_check") + DateFormat.getTimeFormat(this).format(new Date(last)) + (error == null ? " ✅" : "\n⚠️ " + errorText(error))), 14);
        if (ready) button(t("test_call"), 0xFF43A047, v -> testCall());
        button(t("disconnect"), 0xFF9E9E9E, v -> confirmDisconnect());
        Scheduler.schedule(this, 3_000);
    }

    /** «Uzish» — tasdiqlangandan keyingina */
    private void confirmDisconnect() {
        new AlertDialog.Builder(this)
                .setTitle(t("disconnect_q"))
                .setMessage(t("disconnect_hint"))
                .setNegativeButton(t("cancel"), null)
                .setPositiveButton(t("yes_disconnect"), (dialog, which) -> {
                    Scheduler.cancel(this);
                    Prefs.clear(this);
                    render();
                })
                .show();
    }

    private void testCall() {
        Prefs.setFlag(this, "test");
        String title = t("test_title");
        Prefs.addHistory(this, title, System.currentTimeMillis(), false);
        Alerts.ticketFound(this, title, false);
    }

    /* ------------------------ Bildirishnomalar ------------------------ */

    private void renderHistory() {
        Prefs.markRead(this);
        LinearLayout head = new LinearLayout(this);
        head.setOrientation(LinearLayout.HORIZONTAL);
        head.setGravity(Gravity.CENTER_VERTICAL);
        TextView back = new TextView(this);
        back.setText(t("back"));
        back.setTextSize(16);
        back.setTextColor(0xFF1E88E5);
        back.setPadding(0, dp(12), dp(16), dp(12));
        back.setOnClickListener(v -> {
            historyOpen = false;
            render();
        });
        head.addView(back);
        TextView title = new TextView(this);
        title.setText(t("history"));
        title.setTextSize(18);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setTextColor(0xFF263238);
        head.addView(title);
        root.addView(head);

        JSONArray list = Prefs.history(this);
        if (list.length() == 0) {
            para(t("history_empty"), 16).setTextColor(0xFF78909C);
            return;
        }
        for (int i = 0; i < list.length(); i++) {
            JSONObject item = list.optJSONObject(i);
            if (item != null) historyItem(item);
        }
        button(t("clear"), 0xFF90A4AE, v -> new AlertDialog.Builder(this)
                .setMessage(t("clear_q"))
                .setNegativeButton(t("cancel"), null)
                .setPositiveButton(t("yes_clear"), (dialog, which) -> {
                    Prefs.clearHistory(this);
                    render();
                })
                .show());
    }

    /** SMS ko'rinishidagi yozuv: matn, o'ng pastda — sana va soat. Bosilsa — bot */
    private void historyItem(JSONObject item) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(14), dp(12), dp(14), dp(10));
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(Color.WHITE);
        shape.setCornerRadius(dp(14));
        shape.setStroke(dp(1), 0xFFE0E6EB);
        card.setBackground(shape);

        TextView body = new TextView(this);
        body.setText(L.f(this, "sms_body", item.optString("title")));
        body.setTextSize(15);
        body.setTextColor(0xFF263238);
        card.addView(body);

        Date at = new Date(item.optLong("at"));
        TextView time = new TextView(this);
        time.setText(DateFormat.getDateFormat(this).format(at) + " · " + DateFormat.getTimeFormat(this).format(at));
        time.setTextSize(12);
        time.setTextColor(0xFF78909C);
        time.setGravity(Gravity.END);
        card.addView(time, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        card.setOnClickListener(v -> open(Api.BOT_URL));
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        params.setMargins(0, dp(6), 0, dp(6));
        root.addView(card, params);
    }

    /* ----------------------------- Yordamchi ----------------------------- */

    private void card(String value, int background, int color) {
        TextView view = para(value, 16);
        view.setTextColor(color);
        view.setTypeface(Typeface.DEFAULT_BOLD);
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(background);
        shape.setCornerRadius(dp(14));
        view.setBackground(shape);
        view.setPadding(dp(16), dp(14), dp(16), dp(14));
    }

    private void open(String url) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (Exception e) {
            toast(t("no_setting"));
        }
    }

    private void toast(String text) {
        Toast.makeText(this, text, Toast.LENGTH_LONG).show();
    }
}
