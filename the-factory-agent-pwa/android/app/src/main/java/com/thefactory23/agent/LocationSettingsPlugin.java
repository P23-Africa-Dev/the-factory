package com.thefactory23.agent;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.os.SystemClock;
import android.provider.Settings;
import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.location.LocationManagerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Logger;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.common.ConnectionResult;
import com.google.android.gms.common.GoogleApiAvailability;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.common.api.ResolvableApiException;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.LocationSettingsRequest;
import com.google.android.gms.location.LocationSettingsStatusCodes;
import com.google.android.gms.location.Priority;
import java.util.Map;

/**
 * Pre-flight helpers for "Start Field Trip".
 *
 * The background-geolocation plugin only checks permissions and rejects with
 * "Location services disabled." when device GPS is off. This plugin lets the
 * WebView: (1) show Google's in-app "Turn on device location?" dialog,
 * (2) read foreground / background permission state without prompting,
 * (3) ask for "Allow all the time" the way each Android version expects, and
 * (4) open the app's settings screen as a last resort.
 *
 * Every method resolves (never rejects) for expected outcomes, so JS can branch
 * on the result. Only one dialog / settings round-trip can be pending at a time.
 */
@CapacitorPlugin(name = "LocationSettings")
public class LocationSettingsPlugin extends Plugin {

    private static final String TAG = "LocationSettings";

    /** Capacitor's own cache of "never ask again" permission states (see Bridge.PERMISSION_PREFS_NAME). */
    private static final String CAPACITOR_PERM_PREFS = "PluginPermStates";
    /** Our own record of which permissions this plugin has asked for. */
    private static final String OWN_PREFS = "FactoryLocationSettings";
    private static final String PREF_ASKED_FOREGROUND = "asked_foreground";
    private static final String PREF_ASKED_BACKGROUND = "asked_background";

    /**
     * When a permission request comes back "denied" this fast, Android answered without
     * showing any UI (user previously chose "Don't ask again" / denied twice).
     */
    private static final long AUTO_DENIED_THRESHOLD_MS = 400;

    private static final String BACKGROUND_PERMISSION = "android.permission.ACCESS_BACKGROUND_LOCATION";

    private enum Pending {
        NONE,
        RESOLUTION,
        FOREGROUND,
        BACKGROUND,
        BACKGROUND_SETTINGS,
        APP_SETTINGS
    }

    private ActivityResultLauncher<IntentSenderRequest> resolutionLauncher;
    private ActivityResultLauncher<String[]> permissionLauncher;
    private ActivityResultLauncher<Intent> settingsLauncher;

    private Pending pending = Pending.NONE;
    private String pendingCallId = null;
    private long pendingStartedAt = 0;

    @Override
    public void load() {
        resolutionLauncher = bridge.registerForActivityResult(
            new ActivityResultContracts.StartIntentSenderForResult(),
            this::onResolutionResult
        );
        permissionLauncher = bridge.registerForActivityResult(
            new ActivityResultContracts.RequestMultiplePermissions(),
            this::onPermissionResult
        );
        settingsLauncher = bridge.registerForActivityResult(
            new ActivityResultContracts.StartActivityForResult(),
            this::onSettingsResult
        );
    }

    // ------------------------------------------------------------------
    // checkLocationSettings
    // ------------------------------------------------------------------

    @PluginMethod
    public void checkLocationSettings(PluginCall call) {
        final boolean highAccuracy = call.getBoolean("highAccuracy", true);
        final boolean showDialog = call.getBoolean("showDialog", true);

        if (!isPlayServicesAvailable()) {
            // e.g. Huawei without GMS: no in-app dialog possible.
            boolean on = isLocationServicesOn();
            call.resolve(settingsResult(on, on ? "already_on" : "unavailable"));
            return;
        }

        LocationRequest request = new LocationRequest.Builder(
            highAccuracy ? Priority.PRIORITY_HIGH_ACCURACY : Priority.PRIORITY_BALANCED_POWER_ACCURACY,
            10_000L
        ).build();
        LocationSettingsRequest settingsRequest = new LocationSettingsRequest.Builder()
            .addLocationRequest(request)
            .setAlwaysShow(true)
            .build();

        Activity activity = getActivity();
        if (activity == null) {
            call.resolve(settingsResult(isLocationServicesOn(), "unavailable"));
            return;
        }

        LocationServices.getSettingsClient(activity)
            .checkLocationSettings(settingsRequest)
            .addOnSuccessListener(response -> call.resolve(settingsResult(true, "already_on")))
            .addOnFailureListener(e -> {
                if (e instanceof ResolvableApiException && showDialog) {
                    if (!beginPending(call, Pending.RESOLUTION)) return;
                    try {
                        IntentSenderRequest intentSenderRequest = new IntentSenderRequest.Builder(
                            ((ResolvableApiException) e).getResolution()
                        ).build();
                        resolutionLauncher.launch(intentSenderRequest);
                    } catch (Exception launchError) {
                        Logger.error(TAG, "Could not show location resolution dialog", launchError);
                        PluginCall saved = endPending();
                        if (saved != null) {
                            boolean on = isLocationServicesOn();
                            saved.resolve(settingsResult(on, on ? "already_on" : "unavailable"));
                        }
                    }
                    return;
                }

                if (e instanceof ResolvableApiException) {
                    // Caller asked not to show the dialog: report the current state only.
                    call.resolve(settingsResult(false, "declined"));
                    return;
                }

                int status = e instanceof ApiException ? ((ApiException) e).getStatusCode() : -1;
                if (status != LocationSettingsStatusCodes.SETTINGS_CHANGE_UNAVAILABLE) {
                    Logger.warn(TAG, "checkLocationSettings failed: " + e.getMessage());
                }
                // Settings can't be fixed in-app (or GMS error). Fall back to the raw toggle.
                boolean on = isLocationServicesOn();
                call.resolve(settingsResult(on, on ? "already_on" : "unavailable"));
            });
    }

    private void onResolutionResult(ActivityResult result) {
        PluginCall call = endPending();
        if (call == null) return;
        boolean on = result.getResultCode() == Activity.RESULT_OK || isLocationServicesOn();
        call.resolve(settingsResult(on, on ? "turned_on" : "declined"));
    }

    private JSObject settingsResult(boolean enabled, String resolution) {
        JSObject ret = new JSObject();
        ret.put("enabled", enabled);
        ret.put("resolution", resolution);
        return ret;
    }

    // ------------------------------------------------------------------
    // getPermissionStatus / requestForegroundPermission
    // ------------------------------------------------------------------

    @PluginMethod
    public void getPermissionStatus(PluginCall call) {
        call.resolve(buildPermissionStatus());
    }

    /**
     * Requests ACCESS_FINE_LOCATION + ACCESS_COARSE_LOCATION ("While using the app").
     * Must be granted before {@link #requestBackgroundPermission(PluginCall)}.
     * Resolves with the same shape as getPermissionStatus().
     */
    @PluginMethod
    public void requestForegroundPermission(PluginCall call) {
        if (isForegroundGranted()) {
            call.resolve(buildPermissionStatus());
            return;
        }
        if (!beginPending(call, Pending.FOREGROUND)) return;
        prefs().edit().putBoolean(PREF_ASKED_FOREGROUND, true).apply();
        runOnUi(() ->
            permissionLauncher.launch(
                new String[] { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }
            )
        );
    }

    // ------------------------------------------------------------------
    // requestBackgroundPermission
    // ------------------------------------------------------------------

    /**
     * Asks for "Allow all the time".
     *  - Android 9 and below: background access comes with foreground → granted.
     *  - Android 10 (API 29): system dialog offers "Allow all the time".
     *  - Android 11+ (API 30+): Android forbids a dialog; requesting the permission opens the app's
     *    location-permission settings page. If Android refuses to open it (denied too often), we open
     *    the app details settings page instead. Resolves when the user returns to the app.
     *
     * Resolves { status: 'granted'|'denied'|'prompt'|'foreground_required', openedSettings, method, sdkInt }.
     */
    @PluginMethod
    public void requestBackgroundPermission(PluginCall call) {
        if (!isForegroundGranted()) {
            call.resolve(backgroundResult("foreground_required", false, "none"));
            return;
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || isBackgroundGranted()) {
            call.resolve(backgroundResult("granted", false, "not_needed"));
            return;
        }
        if (!beginPending(call, Pending.BACKGROUND)) return;
        prefs().edit().putBoolean(PREF_ASKED_BACKGROUND, true).apply();
        runOnUi(() -> permissionLauncher.launch(new String[] { BACKGROUND_PERMISSION }));
    }

    private void onPermissionResult(Map<String, Boolean> grants) {
        if (pending == Pending.FOREGROUND) {
            PluginCall call = endPending();
            if (call != null) call.resolve(buildPermissionStatus());
            return;
        }
        if (pending != Pending.BACKGROUND) return;

        long elapsed = SystemClock.elapsedRealtime() - pendingStartedAt;
        boolean granted = isBackgroundGranted();
        boolean opensSettingsPage = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R;

        if (granted) {
            PluginCall call = endPending();
            if (call != null) call.resolve(backgroundResult("granted", opensSettingsPage, opensSettingsPage ? "permission_page" : "dialog"));
            return;
        }

        if (elapsed < AUTO_DENIED_THRESHOLD_MS && !shouldShowRationale(BACKGROUND_PERMISSION)) {
            // Android answered without UI. Send the user to app settings → Permissions → Location.
            PluginCall call = bridge.getSavedCall(pendingCallId);
            if (call != null && launchAppSettings(Pending.BACKGROUND_SETTINGS)) return;
            call = endPending();
            if (call != null) call.resolve(backgroundResult(backgroundState(), false, "none"));
            return;
        }

        PluginCall call = endPending();
        if (call != null) {
            call.resolve(backgroundResult(backgroundState(), opensSettingsPage, opensSettingsPage ? "permission_page" : "dialog"));
        }
    }

    private JSObject backgroundResult(String status, boolean openedSettings, String method) {
        JSObject ret = new JSObject();
        ret.put("status", status);
        ret.put("openedSettings", openedSettings);
        ret.put("method", method);
        ret.put("sdkInt", Build.VERSION.SDK_INT);
        return ret;
    }

    // ------------------------------------------------------------------
    // openAppSettings / openLocationSettings
    // ------------------------------------------------------------------

    /** Opens Settings → Apps → Factory 23 Agent. Resolves with permission status when the user returns. */
    @PluginMethod
    public void openAppSettings(PluginCall call) {
        if (!beginPending(call, Pending.APP_SETTINGS)) return;
        if (!launchAppSettings(Pending.APP_SETTINGS)) {
            PluginCall saved = endPending();
            if (saved != null) {
                JSObject ret = buildPermissionStatus();
                ret.put("opened", false);
                saved.resolve(ret);
            }
        }
    }

    /**
     * Opens the system Location settings screen (fallback for phones without Google Play services,
     * where checkLocationSettings cannot show the in-app dialog). Resolves when the user returns.
     */
    @PluginMethod
    public void openLocationSettings(PluginCall call) {
        if (!beginPending(call, Pending.APP_SETTINGS)) return;
        try {
            Intent intent = new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS);
            runOnUi(() -> settingsLauncher.launch(intent));
        } catch (Exception e) {
            Logger.error(TAG, "Could not open location settings", e);
            PluginCall saved = endPending();
            if (saved != null) {
                JSObject ret = buildPermissionStatus();
                ret.put("opened", false);
                saved.resolve(ret);
            }
        }
    }

    /** Assumes a call is already pending; switches the pending kind and launches app details. */
    private boolean launchAppSettings(Pending kind) {
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.fromParts("package", getContext().getPackageName(), null));
            pending = kind;
            runOnUi(() -> settingsLauncher.launch(intent));
            return true;
        } catch (Exception e) {
            Logger.error(TAG, "Could not open app settings", e);
            return false;
        }
    }

    private void onSettingsResult(ActivityResult result) {
        Pending kind = pending;
        PluginCall call = endPending();
        if (call == null) return;
        if (kind == Pending.BACKGROUND_SETTINGS) {
            call.resolve(backgroundResult(isBackgroundGranted() ? "granted" : backgroundState(), true, "app_settings"));
            return;
        }
        JSObject ret = buildPermissionStatus();
        ret.put("opened", true);
        call.resolve(ret);
    }

    // ------------------------------------------------------------------
    // State helpers
    // ------------------------------------------------------------------

    private JSObject buildPermissionStatus() {
        JSObject ret = new JSObject();
        ret.put("foreground", foregroundState());
        ret.put("background", backgroundState());
        ret.put("precise", isGranted(Manifest.permission.ACCESS_FINE_LOCATION));
        ret.put("locationServicesOn", isLocationServicesOn());
        ret.put("sdkInt", Build.VERSION.SDK_INT);
        return ret;
    }

    private String foregroundState() {
        if (isForegroundGranted()) return "granted";
        if (shouldShowRationale(Manifest.permission.ACCESS_FINE_LOCATION)) return "prompt";
        String capacitorState = getContext()
            .getSharedPreferences(CAPACITOR_PERM_PREFS, Context.MODE_PRIVATE)
            .getString(Manifest.permission.ACCESS_FINE_LOCATION, null);
        if ("denied".equals(capacitorState)) return "denied";
        if (prefs().getBoolean(PREF_ASKED_FOREGROUND, false)) return "denied";
        return "prompt";
    }

    private String backgroundState() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            // Pre-Android 10 there is no separate background permission.
            return foregroundState();
        }
        if (isBackgroundGranted()) return "granted";
        if (!isForegroundGranted()) {
            // Can't ask for background before foreground; mirror foreground's "can we ask" state.
            return "denied".equals(foregroundState()) ? "denied" : "prompt";
        }
        if (shouldShowRationale(BACKGROUND_PERMISSION)) return "prompt";
        // On Android 11+ background can always be granted from the settings page, so "denied" here
        // means "asked before and refused" — requestBackgroundPermission() still routes to settings.
        return prefs().getBoolean(PREF_ASKED_BACKGROUND, false) ? "denied" : "prompt";
    }

    private boolean isForegroundGranted() {
        return isGranted(Manifest.permission.ACCESS_FINE_LOCATION) || isGranted(Manifest.permission.ACCESS_COARSE_LOCATION);
    }

    private boolean isBackgroundGranted() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return isForegroundGranted();
        return isGranted(BACKGROUND_PERMISSION);
    }

    private boolean isGranted(String permission) {
        return ContextCompat.checkSelfPermission(getContext(), permission) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean shouldShowRationale(String permission) {
        Activity activity = getActivity();
        return activity != null && ActivityCompat.shouldShowRequestPermissionRationale(activity, permission);
    }

    private boolean isLocationServicesOn() {
        LocationManager lm = (LocationManager) getContext().getSystemService(Context.LOCATION_SERVICE);
        return lm != null && LocationManagerCompat.isLocationEnabled(lm);
    }

    private boolean isPlayServicesAvailable() {
        try {
            return GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(getContext()) == ConnectionResult.SUCCESS;
        } catch (Throwable t) {
            return false;
        }
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(OWN_PREFS, Context.MODE_PRIVATE);
    }

    private void runOnUi(Runnable r) {
        Activity activity = getActivity();
        if (activity != null) {
            activity.runOnUiThread(r);
        } else {
            r.run();
        }
    }

    // ------------------------------------------------------------------
    // Pending-call bookkeeping (one system UI round-trip at a time)
    // ------------------------------------------------------------------

    private synchronized boolean beginPending(PluginCall call, Pending kind) {
        if (pending != Pending.NONE && pendingCallId != null && bridge.getSavedCall(pendingCallId) != null) {
            call.reject("Another location settings request is already in progress.", "BUSY");
            return false;
        }
        bridge.saveCall(call);
        pending = kind;
        pendingCallId = call.getCallbackId();
        pendingStartedAt = SystemClock.elapsedRealtime();
        return true;
    }

    private synchronized PluginCall endPending() {
        PluginCall call = pendingCallId != null ? bridge.getSavedCall(pendingCallId) : null;
        if (call != null) bridge.releaseCall(call);
        pending = Pending.NONE;
        pendingCallId = null;
        pendingStartedAt = 0;
        return call;
    }
}
