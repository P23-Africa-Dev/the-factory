package com.thefactory23.agent;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FactoryPushBridgePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
