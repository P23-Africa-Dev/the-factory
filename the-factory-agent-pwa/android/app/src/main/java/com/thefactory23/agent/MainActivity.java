package com.thefactory23.agent;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FactoryPushBridgePlugin.class);
        registerPlugin(LocationSettingsPlugin.class);
        registerPlugin(SessionVaultPlugin.class);
        registerPlugin(com.thefactory23.agent.fieldtrip.FieldTripTrackerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
