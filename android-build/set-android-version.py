#!/usr/bin/env python3
"""Set the real Android APK versionCode/versionName, not only a web UI label.
Only targets generated v14.2 Android debug build. Production must use stable app ID + signing key.
"""
from pathlib import Path
import re
import sys
android=Path(sys.argv[1])
gradle=android / "app/build.gradle"
assert gradle.is_file(), gradle
source=gradle.read_text(encoding="utf-8")
def replace_once(pattern, replacement, value):
    out,count=re.subn(pattern,replacement,value,count=1,flags=re.M)
    if count!=1: raise RuntimeError("Android Gradle version anchor not found: "+pattern)
    return out
source=replace_once(r'^(\s*)versionCode\s+\d+\s*$',r'\g<1>versionCode 14200',source)
source=replace_once(r'^(\s*)versionName\s+"[^"]+"\s*$',r'\g<1>versionName "14.2-test"',source)
gradle.write_text(source,encoding="utf-8")
print("PASS: APK versionCode 14200, versionName 14.2-test")
