package com.thefactory23.agent.fieldtrip;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.location.LocationManager;
import android.os.Build;
import android.os.PowerManager;
import androidx.core.content.ContextCompat;
import androidx.core.location.LocationManagerCompat;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Uploads the trip's stored points to POST {api}/field-trips/{id}/points in
 * batches of 50, and reports tracking health. Runs in native code so it works
 * while the WebView is frozen (screen off, Doze, app swiped away).
 */
public final class FieldTripUploader {

    public static final int BATCH = 50;
    private static final Object LOCK = new Object();
    /** Set by the plugin while the app is on screen. */
    public static volatile boolean appVisible = false;

    public static final class Result {
        public int pending;
        public boolean endedByServer;
        public String lastError;
    }

    private FieldTripUploader() {}

    public static String iso(long millis) {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        f.setTimeZone(TimeZone.getTimeZone("UTC"));
        return f.format(new Date(millis));
    }

    /** Upload everything waiting (blocking; call off the main thread). */
    public static Result uploadPending(Context context) {
        synchronized (LOCK) {
            FieldTripConfig config = FieldTripConfig.get(context);
            FieldTripStore store = FieldTripStore.get(context);
            Result result = new Result();

            while (config.canUpload()) {
                List<FieldTripStore.Point> batch = store.pending(BATCH);
                if (batch.isEmpty()) break;
                try {
                    JSONObject body = new JSONObject();
                    if (config.companyId > 0) body.put("company_id", config.companyId);
                    JSONArray points = new JSONArray();
                    for (FieldTripStore.Point p : batch) {
                        JSONObject o = new JSONObject();
                        o.put("latitude", p.latitude);
                        o.put("longitude", p.longitude);
                        if (p.accuracy != null) o.put("accuracy_meters", p.accuracy);
                        if (p.speed != null) o.put("speed_mps", p.speed);
                        if (p.heading != null) o.put("heading_degrees", p.heading);
                        o.put("recorded_at", p.recordedAt);
                        o.put("client_point_id", p.clientPointId);
                        points.put(o);
                    }
                    body.put("points", points);

                    Response r = post(config, "/field-trips/" + config.serverId + "/points", body);
                    if (r.code >= 200 && r.code < 300) {
                        store.markUploaded(batch);
                        config.uploaded += batch.size();
                        config.lastError = null;
                        config.lastUploadAtMillis = System.currentTimeMillis();
                        continue;
                    }
                    config.failedUploads++;
                    if (r.code == 422 && r.body != null && r.body.matches("(?is).*(not active|not found).*")) {
                        // The server already ended this trip: stop recording into it.
                        config.endedByServer = true;
                        config.lastError = "Trip already ended on the server";
                        break;
                    }
                    if (r.code == 422) {
                        // These points can never be stored (validation): drop them, keep going.
                        store.markUploaded(batch);
                        config.lastError = "Rejected: " + truncate(r.body);
                        continue;
                    }
                    config.lastError = "HTTP " + r.code + (r.code == 401 ? " (signed out)" : "");
                    break; // network / server / auth: retry later
                } catch (Exception e) {
                    config.failedUploads++;
                    config.lastError = e.getClass().getSimpleName() + ": " + truncate(e.getMessage());
                    break;
                }
            }

            config.save(context);
            result.pending = store.count(false);
            result.endedByServer = config.endedByServer;
            result.lastError = config.lastError;
            return result;
        }
    }

    /**
     * End tapped in the notification: upload every point, then POST
     * /field-trips/{id}/end. True once the server has ended the trip (or had
     * already ended it). Blocking; call off the main thread.
     */
    public static boolean endTrip(Context context) {
        FieldTripConfig config = FieldTripConfig.get(context);
        if (config.serverId <= 0 || config.token == null || config.apiBaseUrl == null) return false;
        Result r = uploadPending(context);
        if (r.pending > 0 && !r.endedByServer) return false; // offline: try again later
        try {
            JSONObject b = new JSONObject();
            if (config.companyId > 0) b.put("company_id", config.companyId);
            b.put("recorded_at", iso(config.endRequestedAtMillis > 0 ? config.endRequestedAtMillis : System.currentTimeMillis()));
            Response res = post(config, "/field-trips/" + config.serverId + "/end", b);
            if (res.code >= 200 && res.code < 300) return true;
            config.lastError = "End: HTTP " + res.code;
            return res.code == 422 && res.body != null && res.body.matches("(?is).*(not active|not found).*");
        } catch (Exception e) {
            config.lastError = "End: " + e.getClass().getSimpleName();
            return false;
        }
    }

    /** POST /field-trips/{id}/health (best effort). */
    public static void reportHealth(Context context) {
        FieldTripConfig config = FieldTripConfig.get(context);
        if (config.serverId <= 0 || config.token == null || config.apiBaseUrl == null) return;
        try {
            FieldTripStore store = FieldTripStore.get(context);
            JSONObject b = new JSONObject();
            if (config.companyId > 0) b.put("company_id", config.companyId);
            b.put("source", "native");
            b.put("app_version", appVersion(context));
            b.put("app_state", appVisible ? "foreground" : "background");
            b.put("permission", permission(context));
            b.put("precise", granted(context, Manifest.permission.ACCESS_FINE_LOCATION));
            LocationManager lm = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
            if (lm != null) b.put("location_services_on", LocationManagerCompat.isLocationEnabled(lm));
            PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            if (pm != null && Build.VERSION.SDK_INT >= 23) {
                b.put("battery_optimized", !pm.isIgnoringBatteryOptimizations(context.getPackageName()));
            }
            b.put("fixes", config.fixes);
            if (config.lastFixAtMillis > 0) b.put("last_fix_at", iso(config.lastFixAtMillis));
            if (config.lastAccuracy >= 0) b.put("last_accuracy_m", config.lastAccuracy);
            b.put("queued", store.count(false));
            b.put("uploaded", config.uploaded);
            b.put("failed_uploads", config.failedUploads);
            if (config.lastError != null) b.put("last_error", config.lastError);
            b.put("reported_at", iso(System.currentTimeMillis()));
            post(config, "/field-trips/" + config.serverId + "/health", b);
        } catch (Exception ignored) {
            // Health is diagnostics only.
        }
    }

    private static String appVersion(Context context) {
        try {
            return context.getPackageManager().getPackageInfo(context.getPackageName(), 0).versionName;
        } catch (Exception e) {
            return null;
        }
    }

    private static String permission(Context context) {
        if (Build.VERSION.SDK_INT >= 29 && granted(context, Manifest.permission.ACCESS_BACKGROUND_LOCATION)) return "always";
        if (Build.VERSION.SDK_INT < 29 && granted(context, Manifest.permission.ACCESS_FINE_LOCATION)) return "always";
        if (granted(context, Manifest.permission.ACCESS_FINE_LOCATION)
            || granted(context, Manifest.permission.ACCESS_COARSE_LOCATION)) return "while_in_use";
        return "denied";
    }

    private static boolean granted(Context context, String permission) {
        return ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED;
    }

    private static final class Response {
        int code;
        String body;
    }

    private static Response post(FieldTripConfig config, String path, JSONObject body) throws Exception {
        String base = config.apiBaseUrl.endsWith("/")
            ? config.apiBaseUrl.substring(0, config.apiBaseUrl.length() - 1)
            : config.apiBaseUrl;
        HttpURLConnection c = (HttpURLConnection) new URL(base + path).openConnection();
        try {
            c.setConnectTimeout(15_000);
            c.setReadTimeout(20_000);
            c.setRequestMethod("POST");
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json");
            c.setRequestProperty("Accept", "application/json");
            c.setRequestProperty("Authorization", "Bearer " + config.token);
            if (config.companyId > 0) c.setRequestProperty("X-Company-ID", String.valueOf(config.companyId));
            byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream os = c.getOutputStream()) {
                os.write(bytes);
            }
            Response r = new Response();
            r.code = c.getResponseCode();
            InputStream is = r.code >= 400 ? c.getErrorStream() : c.getInputStream();
            r.body = is == null ? null : read(is);
            return r;
        } finally {
            c.disconnect();
        }
    }

    private static String read(InputStream is) throws Exception {
        try (InputStream in = is; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buf = new byte[4096];
            int n;
            while ((n = in.read(buf)) > 0 && out.size() < 16_384) out.write(buf, 0, n);
            return out.toString("UTF-8");
        }
    }

    private static String truncate(String s) {
        if (s == null) return "";
        return s.length() > 200 ? s.substring(0, 200) : s;
    }
}
