#!/bin/sh
set -eu

ANDROID_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPOSITORY_ROOT=$(CDPATH= cd -- "$ANDROID_ROOT/.." && pwd)

if [ -z "${ANDROID_HOME:-}" ]; then
  if [ -d "$HOME/Library/Android/sdk" ]; then
    ANDROID_HOME="$HOME/Library/Android/sdk"
  elif [ -d "$HOME/Android/Sdk" ]; then
    ANDROID_HOME="$HOME/Android/Sdk"
  else
    printf '%s\n' "Android SDK not found. Set ANDROID_HOME to your Android SDK directory." >&2
    exit 1
  fi
fi

export ANDROID_HOME
export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$ANDROID_HOME}"
"$ANDROID_ROOT/gradlew" --no-daemon -p "$ANDROID_ROOT" assembleDebug
node "$ANDROID_ROOT/scripts/publish-debug-apk.cjs"

APK_VERSION=$(node -p "require('$ANDROID_ROOT/app/build/outputs/apk/debug/output-metadata.json').elements[0].versionName")
printf '\nAPK version %s published to the existing download URL: /downloads/Krypton-Android-0.1.0-test.apk\n' "$APK_VERSION"
printf 'Install the APK on a test phone and allow installation from this source when Android prompts.\n'
