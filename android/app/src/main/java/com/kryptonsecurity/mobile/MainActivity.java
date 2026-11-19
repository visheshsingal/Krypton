package com.kryptonsecurity.mobile;

import android.accessibilityservice.AccessibilityServiceInfo;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.view.accessibility.AccessibilityManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.util.List;

public final class MainActivity extends Activity {
    private static final int BACKGROUND = Color.rgb(7, 11, 20);
    private static final int PANEL = Color.rgb(11, 18, 32);
    private static final int CYAN = Color.rgb(56, 189, 248);
    private static final int GREEN = Color.rgb(52, 211, 153);
    private static final int MUTED = Color.rgb(148, 163, 184);
    private static final int WHITE = Color.rgb(248, 250, 252);

    private TextView status;
    private Button setupButton;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(BACKGROUND);
        getWindow().setNavigationBarColor(BACKGROUND);
        showSetup();
    }

    @Override
    protected void onResume() {
        super.onResume();
        updateStatus();
    }

    private void showSetup() {
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(BACKGROUND);

        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setGravity(Gravity.CENTER_VERTICAL);
        content.setPadding(dp(24), dp(28), dp(24), dp(28));

        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(dp(22), dp(26), dp(22), dp(24));
        panel.setBackground(rounded(PANEL, 22, Color.rgb(30, 41, 59)));

        panel.addView(label("KRYPTON SECURITY", 12, CYAN, true), margin(0, 0, 0, 10));
        panel.addView(label("Set up Android protection", 25, WHITE, true), margin(0, 0, 0, 12));
        panel.addView(label(
                "Enable Krypton in Android Accessibility settings to check text as you type in other apps.",
                15, MUTED, false), margin(0, 0, 0, 18));

        status = label("", 14, MUTED, true);
        status.setPadding(dp(14), dp(13), dp(14), dp(13));
        status.setBackground(rounded(Color.rgb(15, 23, 42), 12, Color.rgb(51, 65, 85)));
        panel.addView(status, margin(0, 0, 0, 18));

        setupButton = button("Open Accessibility Settings", true);
        panel.addView(setupButton, margin(0, 0, 0, 18));
        setupButton.setOnClickListener(view ->
                startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)));

        panel.addView(label("WHAT IT CHECKS", 11, CYAN, true), margin(0, 0, 0, 7));
        panel.addView(label(
                "Krypton checks editable text fields for common API keys, passwords, and other recognizable secrets. Password-entry fields are skipped.",
                13, MUTED, false), margin(0, 0, 0, 16));

        panel.addView(label("YOUR PRIVACY", 11, CYAN, true), margin(0, 0, 0, 7));
        panel.addView(label(
                "Scanning happens on this phone. Typed text is not saved or sent to Krypton. Android requires you to enable or disable this accessibility service yourself.",
                13, MUTED, false), margin(0, 0, 0, 16));

        TextView limitation = label(
                "Important: this is best-effort warning, not guaranteed blocking. Some apps hide text from Android accessibility or submit before a warning appears. Review detections before sending sensitive content.",
                12, Color.rgb(253, 230, 138), false);
        limitation.setPadding(dp(13), dp(12), dp(13), dp(12));
        limitation.setBackground(rounded(Color.rgb(48, 37, 17), 12, Color.rgb(120, 83, 25)));
        panel.addView(limitation);

        content.addView(panel, new LinearLayout.LayoutParams(-1, -2));
        scroll.addView(content);
        setContentView(scroll);
    }

    private void updateStatus() {
        if (status == null || setupButton == null) return;
        boolean enabled = isProtectionEnabled();
        status.setText(enabled
                ? "Protection is enabled · scanning editable text locally"
                : "Protection is off · enable Krypton in Android settings");
        status.setTextColor(enabled ? GREEN : Color.rgb(253, 230, 138));
        setupButton.setText(enabled ? "Manage Accessibility Settings" : "Open Accessibility Settings");
    }

    private boolean isProtectionEnabled() {
        AccessibilityManager manager =
                (AccessibilityManager) getSystemService(ACCESSIBILITY_SERVICE);
        if (manager == null) return false;
        List<AccessibilityServiceInfo> services =
                manager.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK);
        for (AccessibilityServiceInfo service : services) {
            if (service.getId() != null &&
                    service.getId().contains(getPackageName()) &&
                    service.getId().endsWith(PromptGuardService.class.getSimpleName())) {
                return true;
            }
        }
        return false;
    }

    private TextView label(String text, int size, int color, boolean bold) {
        TextView view = new TextView(this);
        view.setText(text);
        view.setTextSize(size);
        view.setTextColor(color);
        view.setLineSpacing(dp(3), 1f);
        if (bold) view.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return view;
    }

    private Button button(String text, boolean primary) {
        Button view = new Button(this);
        view.setText(text);
        view.setAllCaps(false);
        view.setTextSize(14);
        view.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        view.setTextColor(primary ? BACKGROUND : WHITE);
        view.setBackground(rounded(primary ? CYAN : PANEL, 12,
                primary ? CYAN : Color.rgb(51, 65, 85)));
        return view;
    }

    private GradientDrawable rounded(int fill, int radius, int stroke) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(fill);
        drawable.setCornerRadius(dp(radius));
        drawable.setStroke(dp(1), stroke);
        return drawable;
    }

    private LinearLayout.LayoutParams margin(int left, int top, int right, int bottom) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
        params.setMargins(dp(left), dp(top), dp(right), dp(bottom));
        return params;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
