#!/bin/bash

# VitalSense Pro Dev Setup (macOS)
# This script sets up a fresh Mac for ESP32 and Android/Capacitor development.

echo "🍏 Starting VitalSense macOS Master Setup..."

# 1. Install Homebrew if missing
if ! command -v brew &> /dev/null; then
    echo "📦 Installing Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi

# 2. Install Development Tools
echo "🛠 Installing Java, Node, and Arduino Tools..."
brew install --cask temurin@17
brew install node
brew install arduino-cli
brew install --cask android-commandlinetools

# 3. Configure Android Environment
echo "🤖 Configuring Android SDK..."
export ANDROID_HOME=$HOME/Library/Android/sdk
mkdir -p $ANDROID_HOME/cmdline-tools
# Link the tools so they work correctly
ln -s /usr/local/share/android-commandlinetools $ANDROID_HOME/cmdline-tools/latest 2>/dev/null

# Add to .zshrc for future sessions
if ! grep -q "ANDROID_HOME" ~/.zshrc; then
    echo 'export ANDROID_HOME=$HOME/Library/Android/sdk' >> ~/.zshrc
    echo 'export PATH=$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin' >> ~/.zshrc
    echo 'export JAVA_HOME=$(/usr/libexec/java_home -v 17)' >> ~/.zshrc
    source ~/.zshrc
fi

# 4. Install Android SDK Components (Required for App)
yes | sdkmanager --licenses
sdkmanager "platform-tools" "platforms;android-33" "build-tools;33.0.2"

# 5. Setup Arduino for ESP32
echo "🔧 Configuring ESP32 Board & Libraries..."
arduino-cli config init --overwrite
arduino-cli core update-index
arduino-cli core install esp32:esp32

# Install All Sensor Libraries
arduino-cli lib install "NimBLE-Arduino" "MPU6050_light" "Adafruit MLX90614 Library" \
                        "SparkFun MAX3010x Pulse and Proximity Sensor Library" \
                        "TinyGPSPlus" "Adafruit GFX Library" "Adafruit SSD1306"

# 6. Finalize App Dependencies
echo "🏗 Installing Dashboard App dependencies..."
npm install
npx cap sync android

echo ""
echo "✅ MAC ENVIRONMENT READY!"
echo "-------------------------------------------------------"
echo "To build and install the APP live:"
echo "1. Connect Android via USB (Debug Mode ON)"
echo "2. Run: npx cap run android"
echo "-------------------------------------------------------"
echo "To flash the SMARTBAND:"
echo "1. Connect ESP32 via USB"
echo "2. Run: ./flash_v2.sh"
echo "-------------------------------------------------------"
