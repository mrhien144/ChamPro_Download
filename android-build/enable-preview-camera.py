#!/usr/bin/env python3
"""Enable runtime camera permission for bundled Capacitor preview only."""
from pathlib import Path
import sys
android = Path(sys.argv[1])
manifest = android / "app/src/main/AndroidManifest.xml"
s = manifest.read_text(encoding="utf-8")
if 'android.permission.CAMERA' not in s:
    s = s.replace('<application', '<uses-permission android:name="android.permission.CAMERA" />\n    <application', 1)
# v14.3 opt-in deep link. No camera permission or WebChromeClient changes.
# Only a public pairing code is returned; no account JWT or refresh secret in URLs.
if 'android:scheme="champrotest145"' not in s:
    deep_link = """<intent-filter>
            <action android:name="android.intent.action.VIEW" />
            <category android:name="android.intent.category.DEFAULT" />
            <category android:name="android.intent.category.BROWSABLE" />
            <data android:scheme="champrotest145" android:host="auth" android:path="/complete" />
        </intent-filter>"""
    s = s.replace('</activity>', deep_link + '\n        </activity>', 1)
manifest.write_text(s, encoding="utf-8")
# Capacitor WebView requires explicit permission for getUserMedia camera.
# Capacitor places the generated activity under the package of appId.
# Derive that path instead of assuming the older v14.5 package. Do not
# change the camera/WebChromeClient implementation.
java_root = android / "app/src/main/java"
activity_candidates = sorted(java_root.rglob("MainActivity.java"))
assert len(activity_candidates) == 1, (
    f"Expected exactly one generated MainActivity.java; found {activity_candidates}"
)
activity = activity_candidates[0]
package_name = ".".join(activity.relative_to(java_root).parts[:-1])
assert package_name in (
    "com.champro.nativepreview.v145", "com.champro.nativepreview.v146"
), f"Unexpected Android package: {package_name}"
activity_code = """package com.champro.nativepreview.v145;

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
"""
activity_code = activity_code.replace(
    "package com.champro.nativepreview.v145;",
    f"package {package_name};",
    1
)
activity.write_text(activity_code, encoding="utf-8")
print(f"PASS: preview-only Android camera permission configured for {package_name}")
