package com.thefactory23.agent.fieldtrip;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;
import com.thefactory23.agent.MainActivity;
import com.thefactory23.agent.R;
import java.util.UUID;

/**
 * Records the running field trip natively: a location foreground service that
 * keeps going when the screen is off, the phone dozes, the app is swiped away
 * (stopWithTask=false) or the phone restarts (FieldTripBootReceiver).
 *
 * Every accepted fix is written to SQLite first, then uploaded in batches by
 * {@link FieldTripUploader}. Uploads also run from the location callback, so
 * they happen even when timers are deferred by Doze.
 */
public class FieldTripTrackingService extends Service {

    private static final String TAG = "FieldTripTracking";
    private static final String CHANNEL_ID = "field_trip";
    private static final int NOTIFICATION_ID = 23_501;
    private static final long UPLOAD_EVERY_MS = 30_000;
    private static final long HEALTH_EVERY_MS = 60_000;
    private static final float MAX_ACCURACY_M = 250f;
    private static final float MOVING_SPEED_MPS = 0.5f;
    /** Notification "End trip" button. */
    public static final String ACTION_END = "com.thefactory23.agent.fieldtrip.END";

    public interface FixListener {
        void onFix(Location location);
        /** The trip is over on the server (ended there, or via the notification). */
        void onEndedByServer();
    }

    /** The plugin listens while the app is alive (to draw the live trail). */
    public static volatile FixListener listener;
    private static volatile boolean running = false;

    private HandlerThread thread;
    private Handler handler;
    private FusedLocationProviderClient fused;
    private LocationCallback callback;
    private PowerManager.WakeLock wakeLock;
    private long lastSavedAt = 0;
    private long lastHealthAt = 0;
    private long lastAttemptAt = 0;
    private Location previousFix;
    private boolean derivedMoving = false;

    public static boolean isRunning() {
        return running;
    }

    public static void start(Context context) {
        Intent i = new Intent(context, FieldTripTrackingService.class);
        ContextCompat.startForegroundService(context, i);
    }

    public static void stop(Context context) {
        context.stopService(new Intent(context, FieldTripTrackingService.class));
    }

    @Override
    public void onCreate() {
        super.onCreate();
        thread = new HandlerThread("field-trip-tracking");
        thread.start();
        handler = new Handler(thread.getLooper());
        fused = LocationServices.getFusedLocationProviderClient(this);
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm != null) {
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "factory23:field-trip-upload");
            wakeLock.setReferenceCounted(false);
        }
    }

    @Override
    public int onStartCommand(@Nullable Intent intent, int flags, int startId) {
        FieldTripConfig config = FieldTripConfig.get(this);
        try {
            startInForeground(config);
        } catch (Exception e) {
            // Android refuses a location service started from the background
            // without "Allow all the time": nothing we can do until the app opens.
            Log.w(TAG, "startForeground failed", e);
            stopSelf();
            return START_NOT_STICKY;
        }
        if (!config.active || config.endedByServer) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (intent != null && ACTION_END.equals(intent.getAction())) {
            if (config.serverId <= 0) {
                // Trip not on the server yet (started offline): let the app end it.
                startActivity(new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            } else {
                config.recording = false;
                if (config.endRequestedAtMillis <= 0) config.endRequestedAtMillis = System.currentTimeMillis();
                config.save(this);
                try {
                    startInForeground(config); // notification now says "Ending…"
                } catch (Exception ignored) {
                    // Keep the previous notification.
                }
                handler.post(() -> maybeUpload(true));
            }
        }
        running = true;
        requestUpdates(config);
        handler.removeCallbacks(tick);
        handler.post(tick);
        return START_STICKY;
    }

    private void startInForeground(FieldTripConfig config) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm != null && nm.getNotificationChannel(CHANNEL_ID) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL_ID, "Field trip", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Shown while a field trip is being recorded");
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open,
            PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0));
        Notification n = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_live_tracking)
            .setContentTitle("Field trip in progress")
            .setContentText("Recording your route and stops · Tap to open")
            .setWhen(config.startedAtMillis > 0 ? config.startedAtMillis : System.currentTimeMillis())
            .setUsesChronometer(true)
            .setShowWhen(true)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            // Own group: Android would otherwise bundle it with the app's task
            // alerts and hide the End trip button behind two taps.
            .setGroup("factory23_field_trip")
            .setContentIntent(pi)
            .addAction(0, config.endRequestedAtMillis > 0 ? "Ending…" : "End trip", endIntent())
            .build();
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(NOTIFICATION_ID, n);
        }
    }

    private PendingIntent endIntent() {
        Intent end = new Intent(this, FieldTripTrackingService.class).setAction(ACTION_END);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        return Build.VERSION.SDK_INT >= 26
            ? PendingIntent.getForegroundService(this, 1, end, flags)
            : PendingIntent.getService(this, 1, end, flags);
    }

    @SuppressLint("MissingPermission")
    private void requestUpdates(FieldTripConfig config) {
        if (callback != null) return;
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED
            && ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            config.lastError = "Location permission missing";
            config.save(this);
            return;
        }
        long interval = Math.max(5, Math.min(config.movingIntervalSeconds, 60)) * 1000L / 2;
        LocationRequest request = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, interval)
            .setMinUpdateIntervalMillis(5_000)
            .setMinUpdateDistanceMeters(0f)
            .setWaitForAccurateLocation(false)
            .build();
        callback = new LocationCallback() {
            @Override
            public void onLocationResult(@NonNull LocationResult result) {
                for (Location l : result.getLocations()) onFix(l);
            }
        };
        try {
            fused.requestLocationUpdates(request, callback, thread.getLooper());
        } catch (Exception e) {
            Log.w(TAG, "requestLocationUpdates failed", e);
            config.lastError = "GPS: " + e.getMessage();
            config.save(this);
            callback = null;
        }
    }

    private void onFix(Location l) {
        FieldTripConfig config = FieldTripConfig.get(this);
        if (!config.active || config.endedByServer) return;
        long now = System.currentTimeMillis();
        config.fixes++;
        config.lastFixAtMillis = now;
        config.lastAccuracy = l.hasAccuracy() ? l.getAccuracy() : -1f;

        FixListener ls = listener;
        if (ls != null) {
            try { ls.onFix(l); } catch (Exception ignored) { }
        }

        boolean accurate = config.recording && (!l.hasAccuracy() || l.getAccuracy() <= MAX_ACCURACY_M);
        // Movement from the measured position over a window of at least 15 s
        // (fixes 5 s apart are within GPS noise when walking). Used as well as
        // the reported speed: some phones report no speed, or 0 while moving.
        if (previousFix == null) {
            previousFix = l;
        } else if (l.getTime() - previousFix.getTime() >= 15_000) {
            float metres = l.distanceTo(previousFix);
            float seconds = (l.getTime() - previousFix.getTime()) / 1000f;
            float noise = Math.max(l.hasAccuracy() ? l.getAccuracy() : 10f, 10f);
            derivedMoving = metres > noise && metres / seconds >= MOVING_SPEED_MPS;
            previousFix = l;
        }
        boolean moving = (l.hasSpeed() && l.getSpeed() >= MOVING_SPEED_MPS) || derivedMoving;
        long intervalMs = (moving ? config.movingIntervalSeconds : Math.min(config.stationaryIntervalSeconds, 60)) * 1000L;
        if (accurate && now - lastSavedAt >= intervalMs * 85 / 100) {
            lastSavedAt = now;
            FieldTripStore.Point p = new FieldTripStore.Point();
            p.clientPointId = UUID.randomUUID().toString();
            p.latitude = l.getLatitude();
            p.longitude = l.getLongitude();
            p.accuracy = l.hasAccuracy() ? (double) l.getAccuracy() : null;
            p.speed = l.hasSpeed() ? (double) l.getSpeed() : null;
            p.heading = l.hasBearing() ? (double) l.getBearing() : null;
            long fixTime = l.getTime() > 0 ? l.getTime() : now;
            p.recordedAt = FieldTripUploader.iso(Math.min(fixTime, now));
            FieldTripStore.get(this).insert(p);
        }
        maybeUpload(false);
    }

    /** Runs every 30 s (when the CPU is awake) and from every fix. */
    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            maybeUpload(false);
            if (handler != null && running) handler.postDelayed(this, UPLOAD_EVERY_MS);
        }
    };

    private void maybeUpload(boolean force) {
        FieldTripConfig config = FieldTripConfig.get(this);
        long now = System.currentTimeMillis();
        if (!force && now - lastAttemptAt < UPLOAD_EVERY_MS) {
            config.save(this);
            return;
        }
        lastAttemptAt = now;
        if (wakeLock != null) wakeLock.acquire(60_000);
        try {
            if (config.endRequestedAtMillis > 0) {
                // End tapped in the notification: finish once it reaches the server.
                if (FieldTripUploader.endTrip(this)) {
                    FieldTripUploader.reportHealth(this);
                    config.active = false;
                    config.endedByServer = true;
                    config.save(this);
                    FieldTripStore.get(this).clear();
                    FixListener ls = listener;
                    if (ls != null) {
                        try { ls.onEndedByServer(); } catch (Exception ignored) { }
                    }
                    stopSelf();
                } else {
                    config.save(this);
                }
                return;
            }
            FieldTripUploader.Result r = FieldTripUploader.uploadPending(this);
            if (now - lastHealthAt >= HEALTH_EVERY_MS) {
                lastHealthAt = now;
                FieldTripUploader.reportHealth(this);
            }
            if (r.endedByServer) {
                FixListener ls = listener;
                if (ls != null) {
                    try { ls.onEndedByServer(); } catch (Exception ignored) { }
                }
                stopSelf();
            }
        } finally {
            if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        }
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // Swiped away: keep recording (stopWithTask=false). Nothing to do.
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        running = false;
        if (callback != null) {
            try { fused.removeLocationUpdates(callback); } catch (Exception ignored) { }
            callback = null;
        }
        if (handler != null) handler.removeCallbacksAndMessages(null);
        if (thread != null) thread.quitSafely();
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
