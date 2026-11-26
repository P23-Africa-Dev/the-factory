package com.thefactory23.agent.fieldtrip;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/** Phone restarted (or app updated) during a field trip: resume recording. */
public class FieldTripBootReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent != null ? intent.getAction() : null;
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action)
            && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)
            && !"android.intent.action.QUICKBOOT_POWERON".equals(action)) {
            return;
        }
        FieldTripConfig config = FieldTripConfig.get(context);
        if (!config.active || config.endedByServer) return;
        try {
            FieldTripTrackingService.start(context);
        } catch (Exception e) {
            // Android may refuse a background location service start; the
            // trip resumes the next time the app opens.
            Log.w("FieldTripTracking", "resume after boot failed", e);
        }
    }
}
