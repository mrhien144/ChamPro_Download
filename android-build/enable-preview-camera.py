#!/usr/bin/env python3
"""Enable runtime camera permission for bundled Capacitor preview only."""
from pathlib import Path
import sys
android = Path(sys.argv[1])
manifest = android / "app/src/main/AndroidManifest.xml"
s = manifest.read_text(encoding="utf-8")
if 'android.permission.CAMERA' not in s:
    s = s.replace('<application', '<uses-permission android:name="android.permission.CAMERA" />\n    <application', 1)
manifest.write_text(s, encoding="utf-8")
# Capacitor WebView requires explicit permission for getUserMedia camera.
activity = android / "app/src/main/java/com/champro/nativepreview/v3/MainActivity.java"
assert activity.exists(), activity
activity.write_text("""package com.champro.nativepreview.v3;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final int CAMERA_PERMISSION = 2026;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this,
                    new String[]{Manifest.permission.CAMERA}, CAMERA_PERMISSION);
        }
        getBridge().getWebView().setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(PermissionRequest request) {
                // Grant only camera access to the app's bundled origin.
                runOnUiThread(() -> {
                    String origin = request.getOrigin().toString();
                    boolean local = origin.startsWith("https://localhost") ||
                                    origin.startsWith("http://localhost");
                    boolean camera = false;
                    for (String resource : request.getResources()) {
                        if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) camera = true;
                    }
                    if (local && camera &&
                        ContextCompat.checkSelfPermission(MainActivity.this,
                            Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                        request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
                    } else {
                        request.deny();
                    }
                });
            }
        });
    }
}
""", encoding="utf-8")
print("PASS: preview-only Android camera permission configured")
