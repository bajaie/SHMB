#!/bin/bash

# SHMB v3 Prototype Deployer (Stable Engine)
# Usage: ./v3_deploy.sh

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export JAVA_HOME=$(/usr/libexec/java_home -v 17)

echo "🏗 Building v3 Dashboard..."
npm run build

echo "🔄 Syncing Capacitor..."
npx cap sync android

echo "🚀 Performing Clean Android Build..."
cd android
./gradlew clean assembleDebug

echo "🧹 Removing Old Version from Device..."
adb uninstall com.shmb.app

echo "📲 Installing v3 Prototype..."
adb install -r app/build/outputs/apk/debug/app-debug.apk

echo "🏁 Launching v3 Prototype..."
adb shell am start -n com.shmb.app/com.shmb.app.MainActivity

echo "✅ SHMB is now Live with fresh assets!"
