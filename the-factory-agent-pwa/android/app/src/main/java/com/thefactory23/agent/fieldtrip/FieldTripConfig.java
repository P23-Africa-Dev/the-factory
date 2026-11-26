package com.thefactory23.agent.fieldtrip;

import android.content.Context;
import android.content.SharedPreferences;

/** The running trip as the native tracker knows it (persisted: survives kill and reboot). */
public final class FieldTripConfig {

    private static final String PREFS = "FactoryFieldTrip";

    public boolean active;
    /** False once End is tapped: keep uploading, stop recording. */
    public boolean recording = true;
    public String clientTripId;
    public long serverId;
    public String apiBaseUrl;
    public String token;
    public long companyId;
    public int movingIntervalSeconds = 30;
    public int stationaryIntervalSeconds = 60;
    public long startedAtMillis;
    /** The server refused uploads because it already ended this trip. */
    public boolean endedByServer;
    public String lastError;
    public long lastUploadAtMillis;
    public int uploaded;
    public int failedUploads;
    public int fixes;
    public long lastFixAtMillis;
    public float lastAccuracy = -1f;
    /** End tapped in the notification; retried until the server has it. */
    public long endRequestedAtMillis;

    private static FieldTripConfig shared;

    /** One shared instance for the service and the plugin (no lost updates between them). */
    public static synchronized FieldTripConfig get(Context context) {
        if (shared == null) shared = load(context.getApplicationContext());
        return shared;
    }

    private static FieldTripConfig load(Context context) {
        SharedPreferences p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        FieldTripConfig c = new FieldTripConfig();
        c.active = p.getBoolean("active", false);
        c.recording = p.getBoolean("recording", true);
        c.clientTripId = p.getString("clientTripId", null);
        c.serverId = p.getLong("serverId", 0);
        c.apiBaseUrl = p.getString("apiBaseUrl", null);
        c.token = p.getString("token", null);
        c.companyId = p.getLong("companyId", 0);
        c.movingIntervalSeconds = p.getInt("moving", 30);
        c.stationaryIntervalSeconds = p.getInt("stationary", 60);
        c.startedAtMillis = p.getLong("startedAt", System.currentTimeMillis());
        c.endedByServer = p.getBoolean("endedByServer", false);
        c.lastError = p.getString("lastError", null);
        c.lastUploadAtMillis = p.getLong("lastUploadAt", 0);
        c.uploaded = p.getInt("uploaded", 0);
        c.failedUploads = p.getInt("failedUploads", 0);
        c.fixes = p.getInt("fixes", 0);
        c.lastFixAtMillis = p.getLong("lastFixAt", 0);
        c.lastAccuracy = p.getFloat("lastAccuracy", -1f);
        c.endRequestedAtMillis = p.getLong("endRequestedAt", 0);
        return c;
    }

    public synchronized void save(Context context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putBoolean("active", active)
            .putBoolean("recording", recording)
            .putString("clientTripId", clientTripId)
            .putLong("serverId", serverId)
            .putString("apiBaseUrl", apiBaseUrl)
            .putString("token", token)
            .putLong("companyId", companyId)
            .putInt("moving", movingIntervalSeconds)
            .putInt("stationary", stationaryIntervalSeconds)
            .putLong("startedAt", startedAtMillis)
            .putBoolean("endedByServer", endedByServer)
            .putString("lastError", lastError)
            .putLong("lastUploadAt", lastUploadAtMillis)
            .putInt("uploaded", uploaded)
            .putInt("failedUploads", failedUploads)
            .putInt("fixes", fixes)
            .putLong("lastFixAt", lastFixAtMillis)
            .putFloat("lastAccuracy", lastAccuracy)
            .putLong("endRequestedAt", endRequestedAtMillis)
            .apply();
    }

    public boolean canUpload() {
        return active && !endedByServer && serverId > 0 && token != null && !token.isEmpty()
            && apiBaseUrl != null && !apiBaseUrl.isEmpty();
    }
}
