package com.istanbulstreets.game;

import android.app.Activity;
import android.app.ActivityManager;
import android.app.GameManager;
import android.app.GameState;
import android.content.Context;
import android.media.AudioManager;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.view.Display;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Native Android APK performance, Game Mode (API 33+), hardware telemetry,
 * and low-latency tactile driving haptics bridge for Istanbul Streets.
 */
@CapacitorPlugin(name = "NativeGameBoost")
public class NativeGameBoostPlugin extends Plugin {

    @PluginMethod
    public void getHardwareProfile(PluginCall call) {
        JSObject result = new JSObject();
        Context ctx = getContext();

        result.put("cpuCores", Runtime.getRuntime().availableProcessors());
        result.put("sdkInt", Build.VERSION.SDK_INT);
        result.put("manufacturer", Build.MANUFACTURER != null ? Build.MANUFACTURER : "Android");
        result.put("model", Build.MODEL != null ? Build.MODEL : "Device");

        try {
            ActivityManager am = (ActivityManager) ctx.getSystemService(Context.ACTIVITY_SERVICE);
            if (am != null) {
                ActivityManager.MemoryInfo mi = new ActivityManager.MemoryInfo();
                am.getMemoryInfo(mi);
                result.put("totalRamMb", Math.round(mi.totalMem / (1024.0 * 1024.0)));
                result.put("availRamMb", Math.round(mi.availMem / (1024.0 * 1024.0)));
                result.put("lowMemory", mi.lowMemory);
            }
        } catch (Throwable ignored) {
            // Best-effort telemetry
        }

        try {
            AudioManager audio = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
            if (audio != null) {
                String sr = audio.getProperty(AudioManager.PROPERTY_OUTPUT_SAMPLE_RATE);
                String fpb = audio.getProperty(AudioManager.PROPERTY_OUTPUT_FRAMES_PER_BUFFER);
                if (sr != null) result.put("audioSampleRate", Integer.parseInt(sr));
                if (fpb != null) result.put("audioFramesPerBuffer", Integer.parseInt(fpb));
            }
        } catch (Throwable ignored) {
            // Best-effort telemetry
        }

        try {
            Activity activity = getActivity();
            if (activity != null) {
                Display display =
                    Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
                        ? activity.getDisplay()
                        : activity.getWindowManager().getDefaultDisplay();
                if (display != null && display.getMode() != null) {
                    result.put("refreshRateHz", Math.round(display.getMode().getRefreshRate()));
                }
            }
        } catch (Throwable ignored) {
            // Best-effort telemetry
        }

        String gameModeName = "standard";
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                GameManager gm = ctx.getSystemService(GameManager.class);
                if (gm != null) {
                    int gmVal = gm.getGameMode();
                    if (gmVal == GameManager.GAME_MODE_PERFORMANCE) {
                        gameModeName = "performance";
                    } else if (gmVal == GameManager.GAME_MODE_BATTERY) {
                        gameModeName = "battery";
                    } else if (gmVal == GameManager.GAME_MODE_STANDARD) {
                        gameModeName = "standard";
                    }
                }
            } catch (Throwable ignored) {
                // Unsupported OEM firmware
            }
        }
        result.put("gameMode", gameModeName);
        call.resolve(result);
    }

    @PluginMethod
    public void setGameState(PluginCall call) {
        boolean active = Boolean.TRUE.equals(call.getBoolean("active", true));
        boolean loading = Boolean.TRUE.equals(call.getBoolean("loading", false));

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            try {
                GameManager gm = getContext().getSystemService(GameManager.class);
                if (gm != null) {
                    int mode = active
                        ? GameState.MODE_GAMEPLAY_UNINTERRUPTIBLE
                        : GameState.MODE_NONE;
                    gm.setGameState(new GameState(loading, mode));
                }
            } catch (Throwable ignored) {
                // Non-fatal on emulators/OEMs without GameManager HAL
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void triggerDrivingHaptic(PluginCall call) {
        String kind = call.getString("kind", "tap");
        double intensityVal = call.getDouble("intensity", 0.6);
        float intensity = (float) Math.max(0.1, Math.min(1.0, intensityVal));

        try {
            Vibrator vibrator = resolveVibrator();
            if (vibrator == null || !vibrator.hasVibrator()) {
                call.resolve();
                return;
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && "impact".equals(kind)) {
                VibrationEffect effect = VibrationEffect.startComposition()
                    .addPrimitive(VibrationEffect.Composition.PRIMITIVE_THUD, intensity)
                    .compose();
                vibrator.vibrate(effect);
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && "shift".equals(kind)) {
                VibrationEffect effect = VibrationEffect.startComposition()
                    .addPrimitive(VibrationEffect.Composition.PRIMITIVE_CLICK, Math.min(1.0f, intensity * 0.9f))
                    .compose();
                vibrator.vibrate(effect);
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && "drift".equals(kind)) {
                VibrationEffect effect = VibrationEffect.startComposition()
                    .addPrimitive(VibrationEffect.Composition.PRIMITIVE_LOW_TICK, Math.min(0.65f, intensity * 0.5f))
                    .compose();
                vibrator.vibrate(effect);
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                long durationMs = "impact".equals(kind)
                    ? Math.round(24 + intensity * 38)
                    : "shift".equals(kind)
                        ? 16
                        : "drift".equals(kind)
                            ? 12
                            : 10;
                int amp = Math.max(24, Math.min(255, Math.round(intensity * 220)));
                vibrator.vibrate(VibrationEffect.createOneShot(durationMs, amp));
            } else {
                //noinspection deprecation
                vibrator.vibrate("impact".equals(kind) ? 35 : 14);
            }
        } catch (Throwable ignored) {
            // Non-fatal if device disables haptics
        }

        call.resolve();
    }

    private Vibrator resolveVibrator() {
        Context ctx = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            VibratorManager vm = (VibratorManager) ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            return vm != null ? vm.getDefaultVibrator() : null;
        }
        //noinspection deprecation
        return (Vibrator) ctx.getSystemService(Context.VIBRATOR_SERVICE);
    }
}
