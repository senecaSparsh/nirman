package life.nirman.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // App-local plugin — registered explicitly because sync regenerates
        // capacitor.settings.gradle from node_modules plugins only.
        registerPlugin(PrintPlugin.class);
    }
}
