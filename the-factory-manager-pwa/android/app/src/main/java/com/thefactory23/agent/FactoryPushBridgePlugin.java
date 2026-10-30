package com.thefactory23.agent;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.lang.reflect.Method;

/**
 * Lets the WebView safely ask whether Firebase is initialized before calling
 * PushNotifications.register() (which crashes when google-services.json is missing).
 *
 * Uses reflection so the APK still compiles when the google-services plugin is not applied.
 */
@CapacitorPlugin(name = "FactoryPushBridge")
public class FactoryPushBridgePlugin extends Plugin {

    @PluginMethod
    public void isFirebaseReady(PluginCall call) {
        JSObject result = new JSObject();
        boolean ready = false;
        String reason = "not_initialized";

        try {
            Class<?> firebaseAppClass = Class.forName("com.google.firebase.FirebaseApp");
            Method getInstance = firebaseAppClass.getMethod("getInstance");
            Object app = getInstance.invoke(null);
            ready = app != null;
            reason = ready ? "ok" : "null_app";
        } catch (ClassNotFoundException e) {
            reason = "firebase_not_on_classpath";
        } catch (java.lang.reflect.InvocationTargetException e) {
            Throwable cause = e.getCause();
            if (cause instanceof IllegalStateException) {
                reason = "default_app_missing";
            } else {
                reason = cause != null ? cause.getClass().getSimpleName() : "invocation_failed";
            }
        } catch (IllegalStateException e) {
            reason = "default_app_missing";
        } catch (Throwable t) {
            reason = t.getClass().getSimpleName();
        }

        result.put("ready", ready);
        result.put("reason", reason);
        call.resolve(result);
    }
}
