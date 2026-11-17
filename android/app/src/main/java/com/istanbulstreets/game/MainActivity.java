package com.istanbulstreets.game;

import android.app.GameManager;
import android.app.GameState;
import android.content.Context;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.media.AudioManager;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.view.Display;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final int DARK_BG = Color.parseColor("#0D1324");

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Register native Android Game Mode, Hardware Telemetry & Driving Haptics plugin
        registerPlugin(NativeGameBoostPlugin.class);
        super.onCreate(savedInstanceState);

        // Route hardware volume keys directly to game audio immediately
        setVolumeControlStream(AudioManager.STREAM_MUSIC);

        Window window = getWindow();
        // Keep the screen awake during active driving
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        window.setBackgroundDrawable(new ColorDrawable(DARK_BG));
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);

        // Enable Android Sustained Performance Mode where supported for rock-solid frame pacing
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null && pm.isSustainedPerformanceModeSupported()) {
                window.setSustainedPerformanceMode(true);
            }
        } catch (Throwable ignored) {
            // Non-fatal
        }

        // Notify Android 13+ GameManager to unlock full CPU/GPU gaming performance clocks
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            try {
                GameManager gm = getSystemService(GameManager.class);
                if (gm != null) {
                    gm.setGameState(new GameState(false, GameState.MODE_GAMEPLAY_UNINTERRUPTIBLE));
                }
            } catch (Throwable ignored) {
                // Non-fatal
            }
        }

        // Extend edge-to-edge into display cutout areas in landscape immersive mode
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowManager.LayoutParams lp = window.getAttributes();
            lp.layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS;
            window.setAttributes(lp);
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams lp = window.getAttributes();
            lp.layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            window.setAttributes(lp);
        }

        configureHighPerfWebView();
        requestHighRefreshRate(window);
        applyImmersiveFullscreen(window);
    }

    private void configureHighPerfWebView() {
        if (this.bridge == null || this.bridge.getWebView() == null) {
            return;
        }
        WebView webView = this.bridge.getWebView();
        webView.setBackgroundColor(DARK_BG);
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                // Prevent Android from lowering WebGL renderer process priority during active driving
                webView.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
            } catch (Throwable ignored) {
                // Non-fatal
            }
        }

        WebSettings settings = webView.getSettings();
        if (settings != null) {
            // Enable immediate low-latency AudioWorklet & WebAudio playback
            settings.setMediaPlaybackRequiresUserGesture(false);
            settings.setCacheMode(WebSettings.LOAD_DEFAULT);
            settings.setDomStorageEnabled(true);
            //noinspection deprecation
            settings.setRenderPriority(WebSettings.RenderPriority.HIGH);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            applyImmersiveFullscreen(getWindow());
        }
    }

    private void applyImmersiveFullscreen(Window window) {
        WindowCompat.setDecorFitsSystemWindows(window, false);
        View decorView = window.getDecorView();
        decorView.setBackgroundColor(DARK_BG);
        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(window, decorView);
        if (controller != null) {
            controller.setSystemBarsBehavior(
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            );
            controller.hide(WindowInsetsCompat.Type.systemBars());
        }
    }

    private void requestHighRefreshRate(Window window) {
        try {
            Display display =
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
                    ? getDisplay()
                    : getWindowManager().getDefaultDisplay();
            if (display == null) {
                return;
            }
            Display.Mode current = display.getMode();
            Display.Mode best = current;
            for (Display.Mode mode : display.getSupportedModes()) {
                if (
                    mode.getPhysicalWidth() == current.getPhysicalWidth() &&
                    mode.getPhysicalHeight() == current.getPhysicalHeight() &&
                    mode.getRefreshRate() > best.getRefreshRate() &&
                    mode.getRefreshRate() <= 120.5f
                ) {
                    best = mode;
                }
            }
            if (best.getModeId() != current.getModeId()) {
                WindowManager.LayoutParams lp = window.getAttributes();
                lp.preferredDisplayModeId = best.getModeId();
                window.setAttributes(lp);
            }
        } catch (Throwable ignored) {
            // Fall back silently on devices that restrict display mode switching
        }
    }
}
