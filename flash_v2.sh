#!/bin/bash

# VitalSense v2.0 Flash & Monitor Script
# Usage: ./flash_v2.sh

echo "🔍 Searching for ESP32-C3..."
PORT=$(ls /dev/cu.usbmodem* 2>/dev/null | head -n 1)

if [ -z "$PORT" ]; then
    echo "❌ Device not found! Please connect the SmartBand via USB."
    exit 1
fi

echo "✅ Found device on: $PORT"

# 1. Compile and Upload
echo "🚀 Compiling & Flashing Firmware v2.0..."
arduino-cli compile --fqbn esp32:esp32:esp32c3:CDCOnBoot=cdc,DebugLevel=info vitalsense_esp32_firmware/vitalsense_esp32_firmware.ino
arduino-cli upload -p $PORT --fqbn esp32:esp32:esp32c3:CDCOnBoot=cdc,DebugLevel=info vitalsense_esp32_firmware/vitalsense_esp32_firmware.ino

# 2. Start Monitor
echo "📺 Starting Live Monitor... (Ctrl+C to stop)"
arduino-cli monitor -p $PORT --config baudrate=115200
