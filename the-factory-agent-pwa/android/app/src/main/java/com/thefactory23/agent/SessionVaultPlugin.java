package com.thefactory23.agent;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Durable copy of the sign-in, outside the WebView.
 *
 * The WebView keeps localStorage in a LevelDB log. If the app process is killed
 * in the middle of a write (update, crash, Android freeing memory, battery
 * dies) the log can be left with a run of zeros, and every later write is then
 * ignored on start-up: the app comes back with an OLD session, its token is
 * rejected and the user is signed out. SharedPreferences.commit() writes the
 * file atomically, so the newest sign-in (or sign-out) always survives.
 */
@CapacitorPlugin(name = "SessionVault")
public class SessionVaultPlugin extends Plugin {

    private static final String PREFS = "FactorySessionVault";
    private static final String KEY_SESSION = "session";
    private static final String KEY_SAVED_AT = "savedAt";
    private static final String KEY_LOGGED_OUT_AT = "loggedOutAt";

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static long longOf(PluginCall call, String key) {
        Object v = call.getData().opt(key);
        return v instanceof Number ? ((Number) v).longValue() : 0L;
    }

    /** Save the signed-in session (JSON string) with the time it was saved. */
    @PluginMethod
    public void save(PluginCall call) {
        String session = call.getString("session");
        long savedAt = longOf(call, "savedAt");
        if (session == null || savedAt <= 0) {
            call.reject("session and savedAt are required");
            return;
        }
        boolean ok = prefs().edit()
            .putString(KEY_SESSION, session)
            .putLong(KEY_SAVED_AT, savedAt)
            .remove(KEY_LOGGED_OUT_AT)
            .commit();
        JSObject o = new JSObject();
        o.put("ok", ok);
        call.resolve(o);
    }

    /** The saved session (or the sign-out time). */
    @PluginMethod
    public void load(PluginCall call) {
        SharedPreferences p = prefs();
        JSObject o = new JSObject();
        o.put("session", p.getString(KEY_SESSION, null));
        o.put("savedAt", p.getLong(KEY_SAVED_AT, 0L));
        o.put("loggedOutAt", p.getLong(KEY_LOGGED_OUT_AT, 0L));
        call.resolve(o);
    }

    /** Signed out: forget the session and remember when. */
    @PluginMethod
    public void clear(PluginCall call) {
        long at = longOf(call, "loggedOutAt");
        boolean ok = prefs().edit()
            .remove(KEY_SESSION)
            .remove(KEY_SAVED_AT)
            .putLong(KEY_LOGGED_OUT_AT, at > 0 ? at : System.currentTimeMillis())
            .commit();
        JSObject o = new JSObject();
        o.put("ok", ok);
        call.resolve(o);
    }
}
