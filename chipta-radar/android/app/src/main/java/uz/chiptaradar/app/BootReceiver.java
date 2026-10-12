package uz.chiptaradar.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Telefon qayta yoqilganda yoki ilova yangilanganda tekshiruvni qayta boshlaydi */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (Prefs.token(context) != null) Scheduler.schedule(context.getApplicationContext(), 10_000);
    }
}
