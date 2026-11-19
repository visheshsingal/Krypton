package com.kryptonsecurity.mobile;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.os.Bundle;
import android.text.InputType;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.widget.Toast;

import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

public final class PromptGuardService extends AccessibilityService {
    private static final long WARNING_INTERVAL_MS = TimeUnit.SECONDS.toMillis(4);

    private static final Pattern[] SECRET_PATTERNS = {
            Pattern.compile("\\bsk-(?!ant-)(?:proj-)?[A-Za-z0-9_-]{24,}\\b"),
            Pattern.compile("\\bsk-ant-(?:api03-)?[A-Za-z0-9_-]{32,}\\b"),
            Pattern.compile("\\bAKIA[0-9A-Z]{16}\\b"),
            Pattern.compile("\\bgh[pousr]_[A-Za-z0-9_]{36,255}\\b"),
            Pattern.compile("-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
            Pattern.compile("(?i)\\b(?:mongodb(?:\\+srv)?|postgres|postgresql|mysql|redis)://[^:\\s]+:[^@\\s]+@[^\\s]+"),
            Pattern.compile("(?i)\\b(?:password|passwd|api_secret|client_secret|jwt_secret|secret_key|database_url)\\s*[:=]\\s*[^\\s,;]{6,}"),
            Pattern.compile("(?m)^(?:[A-Z0-9_]*(?:SECRET|KEY|PASSWORD|TOKEN|AUTH|DATABASE_URL)[A-Z0-9_]*)\\s*=\\s*[^\\s,;]{8,}")
    };

    private long lastWarningAt;
    private ClipboardManager clipboardManager;
    private ClipboardManager.OnPrimaryClipChangedListener clipListener;

    @Override
    public void onServiceConnected() {
        AccessibilityServiceInfo info = getServiceInfo();
        if (info != null) {
            info.eventTypes = AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED;
            info.feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC;
            info.notificationTimeout = 100;
            info.flags = AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;
            info.packageNames = null;
            setServiceInfo(info);
        }

        // Initialize Clipboard DLP protection
        initClipboardListener();
    }

    private void initClipboardListener() {
        try {
            clipboardManager = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            if (clipboardManager != null && clipListener == null) {
                clipListener = () -> {
                    try {
                        ClipData clip = clipboardManager.getPrimaryClip();
                        if (clip != null && clip.getItemCount() > 0) {
                            CharSequence clipText = clip.getItemAt(0).getText();
                            if (clipText != null && containsSensitivePattern(clipText)) {
                                clipboardManager.setPrimaryClip(ClipData.newPlainText(
                                        "krypton_sanitized",
                                        "[KRYPTON DLP: Sensitive Content Blocked]"
                                ));
                                showRateLimitedWarning("Krypton DLP: Sensitive text in clipboard was sanitized.");
                            }
                        }
                    } catch (Exception ignored) {
                        // Handled
                    }
                };
                clipboardManager.addPrimaryClipChangedListener(clipListener);
            }
        } catch (Exception ignored) {
            // Handled
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

            // FOOLPROOF ACTION: Replace the sensitive text directly in the active input field
            Bundle arguments = new Bundle();
            arguments.putCharSequence(
                    AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
                    "[KRYPTON DLP: Sensitive Content Blocked]"
            );
            boolean replaced = source.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, arguments);

            showRateLimitedWarning(replaced
                    ? "Krypton DLP: Sensitive data was blocked and removed from this input field."
                    : "Krypton DLP: Sensitive data detected! Review before submitting.");
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

    private void showRateLimitedWarning(String message) {
        long now = System.currentTimeMillis();
        if (now - lastWarningAt < WARNING_INTERVAL_MS) return;
        lastWarningAt = now;
        Toast.makeText(this, message, Toast.LENGTH_LONG).show();
    }

    @Override
    public void onDestroy() {
        if (clipboardManager != null && clipListener != null) {
            try {
                clipboardManager.removePrimaryClipChangedListener(clipListener);
            } catch (Exception ignored) {}
        }
        super.onDestroy();
    }

    @Override
    public void onInterrupt() {
        // Android may interrupt accessibility services when system UI changes.
    }
}
