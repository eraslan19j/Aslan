package com.istanbulstreets.game;

import android.os.Build;
import android.os.Bundle;
import android.view.Display;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        // Keep the screen awake during active play
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        // Allow drawing into display cutout areas in landscape immersive mode
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams lp = window.getAttributes();
            lp.layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            window.setAttributes(lp);
        }

        requestHighRefreshRate(window);
        applyImmersiveFullscreen(window);
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
