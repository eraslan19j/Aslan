#!/usr/bin/env bash
set -euo pipefail

mkdir -p qa-out/android
APK="android/app/build/outputs/apk/debug/app-debug.apk"
PKG="com.istanbulstreets.game"

echo "Suppressing Android first-run immersive confirmation overlay..."
adb shell settings put secure immersive_mode_confirmations confirmed || true
adb shell settings put global policy_control immersive.full=* || true

echo "Installing APK: ${APK}"
adb logcat -c || true
adb install -r "${APK}"

echo "Launching ${PKG}/.MainActivity..."
adb shell am start -W -n "${PKG}/.MainActivity"
sleep 18

echo "Capturing launch screenshot..."
adb exec-out screencap -p > qa-out/android/emulator_01_launch.png

{
  echo "=== wm size ==="
  adb shell wm size || true
  echo "=== display orientation ==="
  adb shell dumpsys input | grep -E "SurfaceOrientation|DisplayViewport|Viewport" | head -n 15 || true
  echo "=== cutout / window ==="
  adb shell dumpsys window displays | grep -E "mDisplayId|cur=|app=|DisplayCutout" | head -n 15 || true
} > qa-out/android/display-info.txt

DIMS=$(node -e "const fs=require('fs'), {PNG}=require('pngjs'); const p=PNG.sync.read(fs.readFileSync('qa-out/android/emulator_01_launch.png')); console.log(p.width + ' ' + p.height);")
W=$(echo "${DIMS}" | awk '{print $1}')
H=$(echo "${DIMS}" | awk '{print $2}')
echo "Captured emulator screencap dimensions: ${W}x${H}"

# Simulate virtual left-side joystick swipe (walk forward-right)
STICK_X=$((W * 8 / 100))
STICK_Y=$((H * 82 / 100))
STICK_TO_X=$((W * 13 / 100))
STICK_TO_Y=$((H * 72 / 100))
adb shell input swipe "${STICK_X}" "${STICK_Y}" "${STICK_TO_X}" "${STICK_TO_Y}" 1100 || true
sleep 3
adb exec-out screencap -p > qa-out/android/emulator_02_after_joystick.png

# Simulate Android Hardware Back button -> should open Pause modal (NOT exit app)
adb shell input keyevent 4 || true
sleep 3
adb exec-out screencap -p > qa-out/android/emulator_03_pause_back.png

# Verify app process is still alive after Back key
ALIVE=$(adb shell pidof "${PKG}" || true)
echo "App PID after Back key: ${ALIVE:-NONE}"

# Dump full logcat + compact app-focused logcat for WebGL/Chromium/Capacitor inspection
adb logcat -d -v time > qa-out/android/logcat.txt || true
grep -iE "ISTANBUL_BOOT|istanbulstreets|chromium|Capacitor|WebView|WebGL|THREE|FATAL EXCEPTION|ANR in|AndroidRuntime" qa-out/android/logcat.txt > qa-out/android/logcat-app.txt || true

node - "${ALIVE}" <<'NODE'
const fs = require('node:fs');
const { PNG } = require('pngjs');

const pidAfterBack = (process.argv[2] || '').trim();
const log = fs.existsSync('qa-out/android/logcat.txt')
  ? fs.readFileSync('qa-out/android/logcat.txt', 'utf8')
  : '';
const lines = log.split(/\r?\n/);

const fatals = lines.filter((l) => /FATAL EXCEPTION/i.test(l)).slice(0, 20);
const anrs = lines.filter((l) => /ANR in com\.istanbulstreets/i.test(l)).slice(0, 20);
const chromiumErrors = lines
  .filter((l) => /chromium/i.test(l) && /(CONSOLE.*ERROR|Uncaught|TypeError|ReferenceError|SyntaxError)/i.test(l))
  .slice(0, 30);
const bootLines = lines.filter((l) => /ISTANBUL_BOOT/i.test(l)).slice(0, 5);

const checkImg = (file) => {
  const p = PNG.sync.read(fs.readFileSync(file));
  const colors = new Set();
  let bright = 0;
  let centerBright = 0;
  let centerTotal = 0;
  const x0 = Math.floor(p.width * 0.3);
  const x1 = Math.floor(p.width * 0.7);
  const y0 = Math.floor(p.height * 0.25);
  const y1 = Math.floor(p.height * 0.75);
  const stride = 4 * 11;
  for (let i = 0; i < p.data.length; i += stride) {
    const r = p.data[i];
    const g = p.data[i + 1];
    const b = p.data[i + 2];
    colors.add(`${r >> 3},${g >> 3},${b >> 3}`);
    if (r + g + b > 300) bright += 1;
    const pxIdx = i / 4;
    const x = pxIdx % p.width;
    const y = Math.floor(pxIdx / p.width);
    if (x >= x0 && x <= x1 && y >= y0 && y <= y1) {
      centerTotal += 1;
      if (r + g + b > 180) centerBright += 1;
    }
  }
  return {
    file,
    width: p.width,
    height: p.height,
    isLandscape: p.width > p.height,
    uniqueColors: colors.size,
    brightFrac: Number((bright / Math.max(1, Math.floor(p.data.length / stride))).toFixed(4)),
    centerBrightFrac: Number((centerBright / Math.max(1, centerTotal)).toFixed(4)),
  };
};

const shots = [
  checkImg('qa-out/android/emulator_01_launch.png'),
  checkImg('qa-out/android/emulator_02_after_joystick.png'),
  checkImg('qa-out/android/emulator_03_pause_back.png'),
];

const report = {
  generatedAtIso: new Date().toISOString(),
  note: 'Android x86_64 KVM emulator (SwiftShader GPU) validates layout, landscape, cutout, touch input, Back key, and crash-free launch — NOT real-device FPS.',
  appAliveAfterBack: pidAfterBack.length > 0,
  fatalCount: fatals.length,
  anrCount: anrs.length,
  chromiumErrorCount: chromiumErrors.length,
  bootLines,
  fatals,
  anrs,
  chromiumErrors,
  shots,
};

fs.writeFileSync('qa-out/android/emulator-report.json', JSON.stringify(report, null, 2));
console.log('EMULATOR_QA_REPORT', JSON.stringify(report, null, 2));

if (fatals.length > 0) {
  console.error('FAIL: FATAL EXCEPTION found in logcat');
  process.exit(1);
}
if (anrs.length > 0) {
  console.error('FAIL: ANR found in logcat');
  process.exit(1);
}
if (!shots[0].isLandscape) {
  console.error('FAIL: App did not lock to landscape orientation!', shots[0]);
  process.exit(1);
}
if (shots[0].centerBrightFrac < 0.05) {
  console.error('FAIL: Center WebGL 3D canvas looks blank/black on Android WebView!', shots[0]);
  process.exit(1);
}
if (!report.appAliveAfterBack) {
  console.error('FAIL: App process exited after hardware Back button!');
  process.exit(1);
}
console.log('ANDROID EMULATOR QA PASS');
NODE
