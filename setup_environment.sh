#!/bin/bash

# VitalSense v2.0 Environment Setup Script
# Usage: chmod +x setup_environment.sh && ./setup_environment.sh

echo "🚀 Starting VitalSense Environment Setup..."

# 1. Check for Homebrew (macOS)
if [[ "$OSTYPE" == "darwin"* ]]; then
    if ! command -v brew &> /dev/null; then
        echo "Installing Homebrew..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    fi
fi

# 2. Install Arduino CLI
echo "📦 Installing Arduino CLI..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    brew install arduino-cli
else
    curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | sh
fi

# 3. Configure Arduino CLI for ESP32
echo "🔧 Configuring ESP32 Board Support..."
arduino-cli config init --overwrite
arduino-cli core update-index
arduino-cli core install esp32:esp32

# 4. Install Required Firmware Libraries
echo "📚 Installing Arduino Libraries..."
arduino-cli lib install "NimBLE-Arduino"
arduino-cli lib install "MPU6050_light"
arduino-cli lib install "Adafruit MLX90614 Library"
arduino-cli lib install "SparkFun MAX3010x Pulse and Proximity Sensor Library"
arduino-cli lib install "TinyGPSPlus"
arduino-cli lib install "Adafruit GFX Library"
arduino-cli lib install "Adafruit SSD1306"

# 5. Setup App Environment
echo "📱 Setting up Dashboard App..."
if ! command -v npm &> /dev/null; then
    echo "❌ Node.js not found! Please install Node.js from https://nodejs.org/"
    exit 1
fi

npm install
npx cap sync android

echo "✅ SETUP COMPLETE!"
echo "-------------------------------------------------------"
echo "To test the system:"
echo "1. Connect ESP32 via USB"
echo "2. Run: ./flash_v2.sh (Generating this for you next...)"
echo "-------------------------------------------------------"
