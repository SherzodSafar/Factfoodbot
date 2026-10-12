package uz.chiptaradar.app;

import android.content.Context;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Ilova tillari: uz (lotin), uzc (kirill — lotindan avtomatik), ru, en.
 * Til bot bilan sinxron: botda o'zgarsa ilova ham o'zgaradi va aksincha.
 */
final class L {
    static final String[] CODES = {"uz", "uzc", "ru", "en"};
    static final String[] NAMES = {"🇺🇿 O'zbekcha", "🇺🇿 Ўзбекча (кирилл)", "🇷🇺 Русский", "🇬🇧 English"};

    private static final Map<String, String[]> T = new HashMap<>();

    private static void s(String key, String uz, String ru, String en) {
        T.put(key, new String[] {uz, ru, en});
    }

    static {
        s("pair_intro", "Kuzatuvingizda chipta chiqqanda telefoningizga qo'ng'iroq qilaman va SMS kabi xabar beraman — Telegram yopiq bo'lsa ham.",
                "Когда по вашему отслеживанию появятся билеты, я позвоню на телефон и пришлю уведомление как SMS — даже если Telegram закрыт.",
                "When tickets appear for your alerts, I'll call your phone and send an SMS-like notification — even if Telegram is closed.");
        s("pair_steps", "1) Telegramda @Poyezd_chiptachi_bot → «📱 Qo'ng'iroq ilovasi» tugmasini bosing.\n2) Bot bergan 6 xonali kodni shu yerga yozing:",
                "1) В Telegram откройте @Poyezd_chiptachi_bot → нажмите «📱 Приложение-звонок».\n2) Введите сюда 6-значный код от бота:",
                "1) In Telegram, open @Poyezd_chiptachi_bot → tap «📱 Call app».\n2) Enter the 6-digit code from the bot here:");
        s("connect", "🔗 Ulash", "🔗 Подключить", "🔗 Connect");
        s("open_bot", "🤖 Botni ochish", "🤖 Открыть бот", "🤖 Open the bot");
        s("ticket_site", "🎫 Chipta sayti", "🎫 Сайт билетов", "🎫 Ticket website");
        s("connecting", "Ulanmoqda...", "Подключение...", "Connecting...");
        s("net_retry", "Internet yoki server javob bermadi. Qayta urinib ko'ring.", "Нет ответа от интернета или сервера. Попробуйте ещё раз.", "No response from the internet or server. Please try again.");
        s("bad_code", "Kod noto'g'ri yoki eskirgan. Botdan yangi kod oling.", "Код неверный или устарел. Получите новый код в боте.", "The code is wrong or expired. Get a new code from the bot.");
        s("paired", "✅ Ulandi!", "✅ Подключено!", "✅ Connected!");
        s("all_set", "✅ Hammasi sozlandi!\nIlova ishlaydi — kuzatuvingizda chipta chiqsa, qo'ng'iroq qilaman.",
                "✅ Всё настроено!\nПриложение работает — когда появятся билеты, я позвоню.",
                "✅ All set!\nThe app is working — I'll call you when tickets appear.");
        s("setup_progress", "⚙️ Sozlash: %1$d/%2$d bajarildi\nQadamlarni ketma-ket bajaring — tugma kerakli sahifani ochadi. Bajarilgach shu yerga qayting.",
                "⚙️ Настройка: выполнено %1$d из %2$d\nВыполните шаги по порядку — кнопка откроет нужную страницу. Затем вернитесь сюда.",
                "⚙️ Setup: %1$d of %2$d done\nComplete the steps in order — the button opens the right page. Then come back here.");
        s("setup_btn", "Sozlash", "Настроить", "Set up");
        s("done_btn", "✅ Bajardim", "✅ Готово", "✅ Done");
        s("test_call", "📞 Sinov qo'ng'irog'i", "📞 Тестовый звонок", "📞 Test call");
        s("linked", "🔗 Ulangan", "🔗 Подключено", "🔗 Connected");
        s("waiting_first", "⏳ Birinchi tekshiruv kutilmoqda...", "⏳ Ожидается первая проверка...", "⏳ Waiting for the first check...");
        s("last_check", "🕐 Oxirgi tekshiruv: ", "🕐 Последняя проверка: ", "🕐 Last check: ");
        s("disconnect", "Uzish", "Отключить", "Disconnect");
        s("disconnect_q", "Ilovani botdan uzasizmi?", "Отключить приложение от бота?", "Disconnect the app from the bot?");
        s("disconnect_hint", "Uzilgandan keyin chipta topilsa qo'ng'iroq kelmaydi. Qayta ulash uchun botdan yangi kod olasiz.",
                "После отключения звонков о билетах не будет. Для повторного подключения понадобится новый код из бота.",
                "After that you won't get calls about tickets. To reconnect, you'll need a new code from the bot.");
        s("yes_disconnect", "Ha, uzish", "Да, отключить", "Yes, disconnect");
        s("cancel", "Bekor qilish", "Отмена", "Cancel");
        s("no_setting", "Bu sozlama telefoningizda topilmadi", "Эта настройка не найдена на вашем телефоне", "This setting wasn't found on your phone");
        s("test_title", "Toshkent → Samarqand (sinov)", "Ташкент → Самарканд (тест)", "Tashkent → Samarkand (test)");
        s("history", "🔔 Bildirishnomalar", "🔔 Уведомления", "🔔 Notifications");
        s("history_empty", "Hali bildirishnoma yo'q.\nChipta topilganda shu yerda ko'rinadi.", "Уведомлений пока нет.\nКогда найдутся билеты, они появятся здесь.", "No notifications yet.\nFound tickets will appear here.");
        s("back", "⬅️ Orqaga", "⬅️ Назад", "⬅️ Back");
        s("clear", "🗑 Tozalash", "🗑 Очистить", "🗑 Clear");
        s("clear_q", "Bildirishnomalar tarixi o'chirilsinmi?", "Очистить историю уведомлений?", "Clear the notification history?");
        s("yes_clear", "Ha, o'chirish", "Да, очистить", "Yes, clear");
        s("language", "Til", "Язык", "Language");
        s("err_net", "Internet yoki server javob bermadi", "Нет ответа от интернета или сервера", "No response from the internet or server");
        s("err_unpaired", "Ulanish bekor qilingan — botdan yangi kod oling", "Подключение отменено — получите новый код в боте", "Connection revoked — get a new code from the bot");
        s("err_server", "Server xatosi: ", "Ошибка сервера: ", "Server error: ");
        // Bildirishnoma va qo'ng'iroq
        s("ch_call", "Qo'ng'iroq (chipta topildi)", "Звонок (билет найден)", "Call (ticket found)");
        s("ch_sms", "Xabar (chipta topildi)", "Сообщение (билет найден)", "Message (ticket found)");
        s("sms_body", "Chipta topuvchi botda siz so'ragan chipta paydo bo'ldi: %s. Tezroq kirib sotib oling!",
                "В боте появился билет, который вы искали: %s. Скорее заходите и покупайте!",
                "The ticket you were looking for has appeared in the bot: %s. Hurry in and buy it!");
        s("calling", "📞 Chipta Radar qo'ng'iroq qilmoqda", "📞 Звонит Chipta Radar", "📞 Chipta Radar is calling");
        s("incoming", "Kiruvchi qo'ng'iroq...", "Входящий звонок...", "Incoming call...");
        s("decline", "Rad etish", "Отклонить", "Decline");
        s("answer", "Javob berish", "Ответить", "Answer");
        s("open_tg", "Telegramda ochish", "Открыть в Telegram", "Open in Telegram");
        s("buy", "Sotib olish", "Купить", "Buy");
        s("close", "Yopish", "Закрыть", "Close");
        s("voice_msg", "Chipta topuvchi botda siz so'ragan chipta paydo bo'ldi. Tezroq kirib sotib oling.",
                "В боте появился билет, который вы искали. Скорее заходите и покупайте.",
                "The ticket you were looking for has appeared in the bot. Hurry in and buy it.");
        // Sozlash qadamlari
        s("st_notify", "Bildirishnomalar", "Уведомления", "Notifications");
        s("st_notify_h", "Chipta haqidagi xabar va qo'ng'iroq oynasi ko'rinishi uchun.", "Чтобы показывались уведомления о билетах и окно звонка.", "So ticket notifications and the call screen can appear.");
        s("st_fullscreen", "Qo'ng'iroq oynasi (to'liq ekran)", "Окно звонка (полный экран)", "Call screen (full screen)");
        s("st_fullscreen_h", "Qulflangan ekranda ham qo'ng'iroq oynasi ochilishi uchun. Ochilgan sahifada ruxsatni yoqing.",
                "Чтобы окно звонка открывалось и на заблокированном экране. На открывшейся странице включите разрешение.",
                "So the call screen opens even on the lock screen. Turn on the permission on the page that opens.");
        s("st_overlay", "Boshqa ilovalar ustida ko'rsatish", "Поверх других приложений", "Display over other apps");
        s("st_overlay_h", "Telefon boshqa ilovada bo'lsa ham qo'ng'iroq oynasi chiqishi uchun. «Chipta Radar»ni yoqing.",
                "Чтобы окно звонка появлялось, даже когда открыто другое приложение. Включите «Chipta Radar».",
                "So the call screen shows up even while you use another app. Turn on «Chipta Radar».");
        s("st_battery", "Batareya cheklovini olib tashlash", "Снять ограничение батареи", "Remove battery restriction");
        s("st_battery_h", "Telefon uxlaganda ham tekshiruv to'xtamasligi uchun. Ro'yxatdan «Chipta Radar» → «Cheklamaslik».",
                "Чтобы проверка не останавливалась, когда телефон спит. В списке: «Chipta Radar» → «Не ограничивать».",
                "So checks keep running while the phone sleeps. In the list: «Chipta Radar» → «Unrestricted».");
        s("st_alarm", "Har daqiqada tekshirish", "Проверка каждую минуту", "Check every minute");
        s("st_alarm_h", "«Signal va eslatmalar» ruxsatini yoqing — tekshiruv har daqiqada bo'ladi.",
                "Включите разрешение «Будильники и напоминания» — проверка будет каждую минуту.",
                "Turn on «Alarms & reminders» — checks will run every minute.");
        s("st_autostart", "Avtomatik ishga tushirish (Xiaomi)", "Автозапуск (Xiaomi)", "Autostart (Xiaomi)");
        s("st_autostart_h", "Ochilgan ro'yxatda «Chipta Radar»ni yoqing, so'ng «Bajardim»ni bosing.",
                "В открывшемся списке включите «Chipta Radar», затем нажмите «Готово».",
                "Turn on «Chipta Radar» in the list that opens, then tap «Done».");
        s("st_miui", "Qulflangan ekran va qalqib chiquvchi oynalar (Xiaomi)", "Экран блокировки и всплывающие окна (Xiaomi)", "Lock screen & pop-up windows (Xiaomi)");
        s("st_miui_h", "«Qulflangan ekranda ko'rsatish» va «Fonda qalqib chiquvchi oynalarni ochish»ni yoqing, so'ng «Bajardim»ni bosing.",
                "Включите «Показывать на экране блокировки» и «Открывать всплывающие окна в фоне», затем нажмите «Готово».",
                "Turn on «Show on lock screen» and «Open new windows while running in the background», then tap «Done».");
        s("st_test", "Sinov qo'ng'irog'i", "Тестовый звонок", "Test call");
        s("st_test_h", "Qo'ng'iroq kelishi va ovoz eshitilishini tekshiring.", "Проверьте, что звонок приходит и голос слышен.", "Check that the call comes in and you can hear the voice.");
    }

    private L() {}

    /** Joriy til (tanlanmagan bo'lsa — telefon tili: ru/en, aks holda o'zbekcha) */
    static String lang(Context c) {
        String saved = Prefs.lang(c);
        if (saved != null) return saved;
        String device = Locale.getDefault().getLanguage();
        if ("ru".equals(device) || "en".equals(device)) return device;
        return "uz";
    }

    static boolean valid(String code) {
        for (String item : CODES) if (item.equals(code)) return true;
        return false;
    }

    static String t(Context c, String key) {
        String[] row = T.get(key);
        if (row == null) return key;
        switch (lang(c)) {
            case "ru": return row[1];
            case "en": return row[2];
            case "uzc": return cyr(row[0]);
            default: return row[0];
        }
    }

    static String f(Context c, String key, Object... args) {
        return String.format(Locale.US, t(c, key), args);
    }

    /* ------------------- O'zbek lotin → kirill (bot bilan bir xil qoida) ------------------- */

    private static final String APOS = "'ʻ‘’`";
    private static final Set<String> KEEP = new HashSet<>(java.util.Arrays.asList(
            "Payme", "Click", "Telegram", "eticket", "Google", "Play", "Protect", "Xiaomi", "Redmi", "POCO", "Android", "SMS", "English"));
    private static final Map<String, String> EXCEPT = new HashMap<>();
    private static final Map<Character, String> MAP = new HashMap<>();
    private static final Pattern PROTECT = Pattern.compile("https?://\\S+|[\\w.-]+@[\\w.-]+|\\b[\\w-]+\\.(?:uz|kz|ru|com|me|org|net)\\b\\S*|@\\w+");
    private static final Pattern WORD = Pattern.compile("[A-Za-z](?:[A-Za-z]|['ʻ‘’`](?=[A-Za-z]))*");

    static {
        String[] pairs = {"a", "а", "b", "б", "c", "с", "d", "д", "e", "е", "f", "ф", "g", "г", "h", "ҳ", "i", "и", "j", "ж", "k", "к", "l", "л", "m", "м",
                "n", "н", "o", "о", "p", "п", "q", "қ", "r", "р", "s", "с", "t", "т", "u", "у", "v", "в", "w", "в", "x", "х", "y", "й", "z", "з"};
        for (int i = 0; i < pairs.length; i += 2) MAP.put(pairs[i].charAt(0), pairs[i + 1]);
        String[] months = {"yanvar", "январь", "fevral", "февраль", "aprel", "апрель", "iyun", "июнь", "iyul", "июль",
                "sentabr", "сентябрь", "oktabr", "октябрь", "noyabr", "ноябрь", "dekabr", "декабрь"};
        for (int i = 0; i < months.length; i += 2) EXCEPT.put(months[i], months[i + 1]);
    }

    private static String word(String token) {
        if (KEEP.contains(token) || (token.length() > 1 && token.equals(token.toUpperCase(Locale.ROOT)))) return token;
        String lower = token.toLowerCase(Locale.ROOT);
        String except = EXCEPT.get(lower);
        if (except != null) return token.charAt(0) != lower.charAt(0) ? except.substring(0, 1).toUpperCase(Locale.ROOT) + except.substring(1) : except;
        StringBuilder out = new StringBuilder();
        int i = 0;
        while (i < lower.length()) {
            char ch = lower.charAt(i);
            char next = i + 1 < lower.length() ? lower.charAt(i + 1) : 0;
            char after = i + 2 < lower.length() ? lower.charAt(i + 2) : 0;
            String cyr;
            int len = 1;
            if ((ch == 'o' || ch == 'g') && next != 0 && APOS.indexOf(next) >= 0) { cyr = ch == 'o' ? "ў" : "ғ"; len = 2; }
            else if (ch == 's' && next == 'h') { cyr = "ш"; len = 2; }
            else if (ch == 'c' && next == 'h') { cyr = "ч"; len = 2; }
            else if (ch == 'y' && (next == 'a' || next == 'u' || (next == 'o' && !(after != 0 && APOS.indexOf(after) >= 0)))) { cyr = next == 'a' ? "я" : next == 'u' ? "ю" : "ё"; len = 2; }
            else if (ch == 'y' && next == 'e') { cyr = "е"; len = 2; }
            else if (ch == 'e') cyr = i == 0 ? "э" : "е";
            else if (APOS.indexOf(ch) >= 0) cyr = "ъ";
            else cyr = MAP.containsKey(ch) ? MAP.get(ch) : String.valueOf(ch);
            out.append(token.charAt(i) != ch ? cyr.toUpperCase(Locale.ROOT) : cyr);
            i += len;
        }
        return out.toString();
    }

    private static String plain(String text) {
        Matcher m = WORD.matcher(text);
        StringBuffer sb = new StringBuffer();
        while (m.find()) m.appendReplacement(sb, Matcher.quoteReplacement(word(m.group())));
        m.appendTail(sb);
        return sb.toString();
    }

    /** Matn → kirill; havola, @nom va domenlar o'zgarmaydi */
    static String cyr(String text) {
        Matcher m = PROTECT.matcher(text);
        StringBuilder out = new StringBuilder();
        int last = 0;
        while (m.find()) {
            out.append(plain(text.substring(last, m.start()))).append(m.group());
            last = m.end();
        }
        return out.append(plain(text.substring(last))).toString();
    }
}
