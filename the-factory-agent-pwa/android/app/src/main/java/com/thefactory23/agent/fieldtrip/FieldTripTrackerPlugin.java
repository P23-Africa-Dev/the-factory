package com.thefactory23.agent.fieldtrip;

import android.location.Location;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * JS bridge for the native field-trip tracker (APK 1.0.4+).
 *
 * start → native service records + uploads on its own (screen off, swiped
 * away, reboot). JS only mirrors it: "fix" events for the live trail while the
 * app is open, getState() for status, flush() before End, stop() after End.
 */
@CapacitorPlugin(name = "FieldTripTracker")
public class FieldTripTrackerPlugin extends Plugin {

    private final ExecutorService io = Executors.newSingleThreadExecutor();

    @Override
    public void load() {
        FieldTripTrackingService.listener = new FieldTripTrackingService.FixListener() {
            @Override
            public void onFix(Location l) {
                JSObject o = new JSObject();
                o.put("latitude", l.getLatitude());
                o.put("longitude", l.getLongitude());
                if (l.hasAccuracy()) o.put("accuracy", l.getAccuracy());
                if (l.hasSpeed()) o.put("speed", l.getSpeed());
                if (l.hasBearing()) o.put("heading", l.getBearing());
                o.put("time", l.getTime() > 0 ? l.getTime() : System.currentTimeMillis());
                notifyListeners("fix", o);
            }

            @Override
            public void onEndedByServer() {
                notifyListeners("endedByServer", state());
            }
        };
        // App (re)opened during a trip whose service is not running (killed by the
        // system, or Android refused the restart after a reboot): resume it.
        FieldTripConfig config = FieldTripConfig.get(getContext());
        if (config.active && !config.endedByServer && !FieldTripTrackingService.isRunning()) {
            try {
                FieldTripTrackingService.start(getContext());
            } catch (Exception ignored) {
                // Started again by JS once the app is in the foreground.
            }
        }
    }

    @Override
    protected void handleOnResume() {
        FieldTripUploader.appVisible = true;
    }

    @Override
    protected void handleOnPause() {
        FieldTripUploader.appVisible = false;
    }

    @PluginMethod
    public void start(PluginCall call) {
        String clientTripId = call.getString("clientTripId");
        String apiBaseUrl = call.getString("apiBaseUrl");
        if (clientTripId == null || apiBaseUrl == null) {
            call.reject("clientTripId and apiBaseUrl are required");
            return;
        }
        FieldTripConfig config = FieldTripConfig.get(getContext());
        synchronized (config) {
            boolean newTrip = !clientTripId.equals(config.clientTripId);
            if (newTrip) {
                // A new trip: forget the previous one's points and counters.
                FieldTripStore.get(getContext()).clear();
                config.uploaded = 0;
                config.failedUploads = 0;
                config.fixes = 0;
                config.lastFixAtMillis = 0;
                config.lastAccuracy = -1f;
                config.lastError = null;
                config.lastUploadAtMillis = 0;
                config.endedByServer = false;
                config.serverId = 0;
                config.endRequestedAtMillis = 0;
            }
            config.active = true;
            config.recording = true;
            config.clientTripId = clientTripId;
            Long serverId = longOf(call, "serverId");
            if (serverId != null && serverId > 0) config.serverId = serverId;
            config.apiBaseUrl = apiBaseUrl;
            String token = call.getString("token");
            if (token != null && !token.isEmpty()) config.token = token;
            Long companyId = longOf(call, "companyId");
            if (companyId != null) config.companyId = companyId;
            Integer moving = call.getInt("movingIntervalSeconds");
            if (moving != null && moving > 0) config.movingIntervalSeconds = moving;
            Integer stationary = call.getInt("stationaryIntervalSeconds");
            if (stationary != null && stationary > 0) config.stationaryIntervalSeconds = stationary;
            Long startedAt = longOf(call, "startedAtMillis");
            if (startedAt != null && startedAt > 0) config.startedAtMillis = startedAt;
            config.save(getContext());
        }
        try {
            FieldTripTrackingService.start(getContext());
            call.resolve(state());
        } catch (Exception e) {
            call.reject("Could not start field trip tracking: " + e.getMessage(), e);
        }
    }

    /** The server id / sign-in token became known or changed. */
    @PluginMethod
    public void update(PluginCall call) {
        FieldTripConfig config = FieldTripConfig.get(getContext());
        synchronized (config) {
            Long serverId = longOf(call, "serverId");
            if (serverId != null && serverId > 0) config.serverId = serverId;
            String token = call.getString("token");
            if (token != null && !token.isEmpty()) config.token = token;
            Long companyId = longOf(call, "companyId");
            if (companyId != null && companyId > 0) config.companyId = companyId;
            Boolean recording = call.getBoolean("recording");
            if (recording != null) config.recording = recording;
            config.save(getContext());
        }
        call.resolve(state());
    }

    /** Upload everything now; resolves with what is still waiting. */
    @PluginMethod
    public void flush(PluginCall call) {
        io.execute(() -> {
            FieldTripUploader.Result r = FieldTripUploader.uploadPending(getContext());
            JSObject o = state();
            o.put("pending", r.pending);
            call.resolve(o);
        });
    }

    @PluginMethod
    public void getState(PluginCall call) {
        io.execute(() -> call.resolve(state()));
    }

    /** Recent points of the running trip (to redraw the trail after a reload). */
    @PluginMethod
    public void getTrail(PluginCall call) {
        io.execute(() -> {
            List<double[]> pts = FieldTripStore.get(getContext()).trail(2000);
            JSArray arr = new JSArray();
            for (double[] p : pts) {
                try {
                    JSArray pair = new JSArray();
                    pair.put(p[0]);
                    pair.put(p[1]);
                    arr.put(pair);
                } catch (org.json.JSONException ignored) {
                    // NaN coordinates are never stored.
                }
            }
            JSObject o = new JSObject();
            o.put("points", arr);
            call.resolve(o);
        });
    }

    /** The trip ended: stop the service and forget its points. */
    @PluginMethod
    public void stop(PluginCall call) {
        FieldTripConfig config = FieldTripConfig.get(getContext());
        synchronized (config) {
            config.active = false;
            config.save(getContext());
        }
        FieldTripTrackingService.stop(getContext());
        io.execute(() -> {
            // Report once more so managers see the final numbers, then clear.
            FieldTripUploader.reportHealth(getContext());
            FieldTripStore.get(getContext()).clear();
            call.resolve(state());
        });
    }

    /**
     * Capacitor's getLong() returns null for numbers that arrive as Integer
     * (any id below 2^31), so read every number through this.
     */
    private static Long longOf(PluginCall call, String key) {
        Object v = call.getData().opt(key);
        if (v instanceof Number) return ((Number) v).longValue();
        if (v instanceof String) {
            try {
                return Long.parseLong((String) v);
            } catch (NumberFormatException ignored) {
                return null;
            }
        }
        return null;
    }

    /** Is Android allowed to pause this app to save battery? (null on Android < 6) */
    @PluginMethod
    public void getBatteryOptimization(PluginCall call) {
        JSObject o = new JSObject();
        android.os.PowerManager pm = (android.os.PowerManager) getContext().getSystemService(android.content.Context.POWER_SERVICE);
        if (android.os.Build.VERSION.SDK_INT >= 23 && pm != null) {
            o.put("optimized", !pm.isIgnoringBatteryOptimizations(getContext().getPackageName()));
        } else {
            o.put("optimized", false);
        }
        call.resolve(o);
    }

    /** Ask Android to let the app run in the background (system dialog, else the settings list). */
    @PluginMethod
    public void openBatteryOptimizationSettings(PluginCall call) {
        String pkg = getContext().getPackageName();
        try {
            android.content.Intent i = new android.content.Intent(
                android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                android.net.Uri.parse("package:" + pkg));
            i.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        } catch (Exception e) {
            try {
                android.content.Intent i = new android.content.Intent(android.provider.Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                i.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
            } catch (Exception ignored) {
                // No settings screen on this phone.
            }
        }
        call.resolve();
    }

    private JSObject state() {
        FieldTripConfig c = FieldTripConfig.get(getContext());
        FieldTripStore store = FieldTripStore.get(getContext());
        JSObject o = new JSObject();
        o.put("active", c.active);
        o.put("running", FieldTripTrackingService.isRunning());
        o.put("recording", c.recording);
        o.put("clientTripId", c.clientTripId);
        o.put("serverId", c.serverId);
        o.put("pending", store.count(false));
        o.put("uploaded", c.uploaded);
        o.put("fixes", c.fixes);
        o.put("lastFixAt", c.lastFixAtMillis);
        o.put("lastAccuracy", c.lastAccuracy);
        o.put("endedByServer", c.endedByServer);
        o.put("lastError", c.lastError);
        o.put("endRequestedAt", c.endRequestedAtMillis);
        return o;
    }
}
