package uz.chiptaradar.app;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;

import java.io.File;
import java.util.Locale;

/**
 * Qo'ng'iroq ko'tarilganda ovozli xabar (ikki marta).
 * O'zbekcha — yozib olingan ovoz (admin yuklagani yoki ilovadagi standart), bo'lmasa telefon ovozi;
 * ruscha/inglizcha — telefon ovozi shu tilda, bo'lmasa yozib olingan ovoz.
 */
final class Voice implements TextToSpeech.OnInitListener {
    private final Context c;
    private final int usage;
    private final String say;
    private final String lang;
    private final Runnable done;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private MediaPlayer player;
    private TextToSpeech tts;
    private int plays;
    private boolean stopped;
    private boolean finished;

    Voice(Context c, int usage, String title, Runnable done) {
        this.c = c;
        this.usage = usage;
        this.done = done;
        lang = L.lang(c);
        say = L.t(c, "voice_msg") + (title == null ? "" : " " + title.replace("→", ","));
    }

    private boolean spokenFirst() {
        return "ru".equals(lang) || "en".equals(lang);
    }

    private AudioAttributes attrs() {
        return new AudioAttributes.Builder().setUsage(usage).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build();
    }

    void start() {
        if (spokenFirst() || !playRecorded()) tts = new TextToSpeech(c, this);
    }

    private boolean playRecorded() {
        String custom = Prefs.voicePath(c);
        if (custom != null && new File(custom).length() > 0) {
            try {
                player = new MediaPlayer();
                player.setAudioAttributes(attrs());
                player.setDataSource(custom);
                player.prepare();
            } catch (Exception e) {
                release(); // fayl ochilmadi (masalan, eski Android'da ogg) — standart ovoz
            }
        }
        try {
            int res = c.getResources().getIdentifier("voice", "raw", c.getPackageName());
            if (player == null && res != 0) {
                AudioManager audio = (AudioManager) c.getSystemService(Context.AUDIO_SERVICE);
                player = MediaPlayer.create(c, res, attrs(), audio.generateAudioSessionId());
            }
            if (player == null) return false;
            plays = 0;
            player.setOnCompletionListener(mp -> {
                if (++plays < 2 && !stopped) {
                    mp.seekTo(0);
                    mp.start();
                } else {
                    finish();
                }
            });
            player.start();
            return true;
        } catch (Exception e) {
            release();
            return false;
        }
    }

    @Override
    public void onInit(int result) {
        if (stopped || tts == null) return;
        if (result != TextToSpeech.SUCCESS) {
            if (!(spokenFirst() && playRecorded())) finish();
            return;
        }
        Locale[] candidates = "ru".equals(lang) ? new Locale[] {new Locale("ru", "RU")}
                : "en".equals(lang) ? new Locale[] {Locale.US, Locale.UK}
                : new Locale[] {new Locale("uz", "UZ"), new Locale("tr", "TR"), new Locale("ru", "RU")};
        boolean found = false;
        for (Locale locale : candidates) {
            if (tts.isLanguageAvailable(locale) >= TextToSpeech.LANG_AVAILABLE) {
                tts.setLanguage(locale);
                found = true;
                break;
            }
        }
        if (!found && spokenFirst() && playRecorded()) return; // bu tilda ovoz yo'q — yozib olingan ovoz
        tts.setAudioAttributes(attrs());
        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override public void onStart(String id) { }
            @Override public void onDone(String id) { if ("msg2".equals(id)) finish(); }
            @Override public void onError(String id) { finish(); }
        });
        tts.speak(say, TextToSpeech.QUEUE_FLUSH, null, "msg1");
        tts.speak(say, TextToSpeech.QUEUE_ADD, null, "msg2");
    }

    private void finish() {
        if (finished || stopped) return;
        finished = true;
        if (done != null) handler.post(done);
    }

    void stop() {
        stopped = true;
        handler.removeCallbacksAndMessages(null);
        release();
        if (tts != null) {
            try {
                tts.stop();
                tts.shutdown();
            } catch (Exception ignored) {
                // allaqachon to'xtagan
            }
            tts = null;
        }
    }

    private void release() {
        if (player == null) return;
        try {
            player.release();
        } catch (Exception ignored) {
            // allaqachon bo'shatilgan
        }
        player = null;
    }
}
