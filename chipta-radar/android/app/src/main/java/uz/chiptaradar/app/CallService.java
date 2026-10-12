package uz.chiptaradar.app;

import android.content.Context;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.telecom.Connection;
import android.telecom.ConnectionRequest;
import android.telecom.ConnectionService;
import android.telecom.DisconnectCause;
import android.telecom.PhoneAccount;
import android.telecom.PhoneAccountHandle;
import android.telecom.TelecomManager;

/**
 * Telefonning o'z «Telefon» ilovasi orqali keladigan qo'ng'iroq (Android 6+):
 * standart kiruvchi qo'ng'iroq oynasi, ovozsiz rejim qoidalari va qo'ng'iroqlar tarixi — tizimniki.
 */
public class CallService extends ConnectionService {
    static volatile String pendingTitle;
    static volatile boolean pendingIntl;

    static Uri address() {
        return Uri.fromParts(PhoneAccount.SCHEME_SIP, "Chipta Radar", null);
    }

    @Override
    public Connection onCreateIncomingConnection(PhoneAccountHandle account, ConnectionRequest request) {
        Bundle extras = request.getExtras();
        String title = extras != null && extras.getString("title") != null ? extras.getString("title") : pendingTitle;
        TicketCall call = new TicketCall(getApplicationContext(), title);
        call.setAddress(address(), TelecomManager.PRESENTATION_ALLOWED);
        call.setCallerDisplayName("Chipta Radar", TelecomManager.PRESENTATION_ALLOWED);
        call.setAudioModeIsVoip(true);
        call.setRinging();
        return call;
    }

    /** Tizim qo'ng'iroqni qabul qilmadi (masalan, boshqa qo'ng'iroq bor) — ilovaning o'z oynasi */
    @Override
    public void onCreateIncomingConnectionFailed(PhoneAccountHandle account, ConnectionRequest request) {
        Alerts.callScreen(getApplicationContext(), pendingTitle, pendingIntl);
    }

    /** Qo'ng'iroqlar tarixidan qayta qo'ng'iroq — haqiqiy raqam yo'q, bekor qilinadi */
    @Override
    public Connection onCreateOutgoingConnection(PhoneAccountHandle account, ConnectionRequest request) {
        return Connection.createCanceledConnection();
    }

    /** Bitta qo'ng'iroq: 45 soniya jiringlaydi (javob bo'lmasa — o'tkazib yuborilgan), ko'tarilsa ovozli xabar */
    static final class TicketCall extends Connection {
        private final Context c;
        private final String title;
        private final Handler handler = new Handler(Looper.getMainLooper());
        private Voice voice;
        private boolean closed;

        TicketCall(Context c, String title) {
            this.c = c;
            this.title = title;
            handler.postDelayed(() -> close(DisconnectCause.MISSED), 45_000);
        }

        @Override
        public void onAnswer() {
            handler.removeCallbacksAndMessages(null);
            setActive();
            // Ovoz qo'ng'iroq karnayiga (quloqqa) chiqadi; aytib bo'lgach — qo'ng'iroq tugaydi
            handler.postDelayed(() -> {
                voice = new Voice(c, AudioAttributes.USAGE_VOICE_COMMUNICATION, title, () -> handler.postDelayed(() -> close(DisconnectCause.REMOTE), 800));
                voice.start();
            }, 800);
        }

        @Override
        public void onAnswer(int videoState) {
            onAnswer();
        }

        @Override
        public void onReject() {
            close(DisconnectCause.REJECTED);
        }

        @Override
        public void onDisconnect() {
            close(DisconnectCause.LOCAL);
        }

        @Override
        public void onAbort() {
            close(DisconnectCause.CANCELED);
        }

        private void close(int cause) {
            if (closed) return;
            closed = true;
            handler.removeCallbacksAndMessages(null);
            if (voice != null) voice.stop();
            setDisconnected(new DisconnectCause(cause));
            destroy();
        }
    }
}
