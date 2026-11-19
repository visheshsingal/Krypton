package com.kryptonsecurity.mobile;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.text.InputType;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.widget.Toast;

import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

public final class PromptGuardService extends AccessibilityService {
    private static final long WARNING_INTERVAL_MS = TimeUnit.SECONDS.toMillis(8);

    private static final Pattern[] SECRET_PATTERNS = {
            Pattern.compile("\\bsk-(?!ant-)(?:proj-)?[A-Za-z0-9_-]{24,}\\b"),
            Pattern.compile("\\bsk-ant-(?:api03-)?[A-Za-z0-9_-]{32,}\\b"),
            Pattern.compile("\\bAKIA[0-9A-Z]{16}\\b"),
            Pattern.compile("\\bgh[pousr]_[A-Za-z0-9_]{36,255}\\b"),
            Pattern.compile("-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
            Pattern.compile("(?i)\\bpassword\\s*[:=]\\s*[^\\s,;]{8,}")
    };

    private long lastWarningAt;

    @Override
    public void onServiceConnected() {
        AccessibilityServiceInfo info = getServiceInfo();
        if (info != null) {
            info.eventTypes = AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED;
            info.feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC;
            info.notificationTimeout = 150;
            info.flags = 0;
            info.packageNames = null;
            setServiceInfo(info);
        }
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null || event.getEventType() != AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED) return;
        if (getPackageName().contentEquals(event.getPackageName())) return;

        AccessibilityNodeInfo source = event.getSource();
        if (source == null) return;
        try {
            if (!source.isEditable() || source.isPassword() || isPasswordField(source.getInputType())) return;
            CharSequence text = source.getText();
            if (text == null || text.length() > 20000 || !containsSensitivePattern(text)) return;
            showRateLimitedWarning();
        } finally {
            source.recycle();
        }
    }

    private boolean isPasswordField(int inputType) {
        int variation = inputType & InputType.TYPE_MASK_VARIATION;
        return variation == InputType.TYPE_TEXT_VARIATION_PASSWORD
                || variation == InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD
                || variation == InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD
                || variation == InputType.TYPE_NUMBER_VARIATION_PASSWORD;
    }

    private boolean containsSensitivePattern(CharSequence text) {
        for (Pattern pattern : SECRET_PATTERNS) {
            if (pattern.matcher(text).find()) return true;
        }
        return false;
    }

    private void showRateLimitedWarning() {
        long now = System.currentTimeMillis();
        if (now - lastWarningAt < WARNING_INTERVAL_MS) return;
        lastWarningAt = now;
        Toast.makeText(this,
                "Krypton found text that may contain a secret. Review it before sending.",
                Toast.LENGTH_LONG).show();
    }

    @Override
    public void onInterrupt() {
        // Android may interrupt accessibility services when system UI changes.
    }
}
