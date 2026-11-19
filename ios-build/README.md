# ChấmPro v16 iOS — unsigned preflight only
Base: df706cdcf246dc41bcd17c356cf7abb5f0223211 (the AAB build checkout). No Android, shared logic, website or production server changes.
This branch only compiles an unsigned native device archive. It does not produce a distributable IPA or publish anything.
Before TestFlight: confirm Apple bundle ID and signing, implement and verify exact-origin CORS for capacitor://localhost separately (WordPress and sync Worker), assess App Store purchase/account deletion policy, verify native file sharing, callback/login and offline persistence on physical iPhone/iPad, compare camera speed against Android v16 using identical sheets. No claim of parity before tests. Keep the native grading modules byte-identical.
