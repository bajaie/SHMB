#!/bin/bash

# VitalSense Live Mobile Deploy
# Usage: ./live_deploy.sh

echo "🏗 Building Web Dashboard..."
npm run build

echo "🔄 Syncing Capacitor with Android..."
npx cap sync android

echo "🚀 Installing App to Mobile Device..."
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
cd android
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk

echo "🏁 Launching App..."
adb shell am start -n com.vitalsense.dashboard/com.vitalsense.dashboard.MainActivity

echo "✅ App is now live on your phone!"
