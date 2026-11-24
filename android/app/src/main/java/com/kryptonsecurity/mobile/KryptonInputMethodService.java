package com.kryptonsecurity.mobile;

import android.inputmethodservice.InputMethodService;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.text.InputType;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class KryptonInputMethodService extends InputMethodService {
    private static final int BLUE = 37;
    private static final int INK = 15;
    private static final int MUTED = 100;
    private static final Pattern[] SENSITIVE_PATTERNS = {
            Pattern.compile("\\bsk-(?!ant-)(?:proj-)?[A-Za-z0-9_-]{24,}\\b"),
            Pattern.compile("\\bsk-ant-(?:api03-)?[A-Za-z0-9_-]{32,}\\b"),
            Pattern.compile("\\bAKIA[0-9A-Z]{16}\\b"),
            Pattern.compile("\\bgh[pousr]_[A-Za-z0-9_]{36,255}\\b"),
            Pattern.compile("-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\\s\\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
            Pattern.compile("(?i)\\b(?:mongodb(?:\\+srv)?|postgres|postgresql|mysql|redis)://[^:\\s]+:[^@\\s]+@[^\\s]+"),
            Pattern.compile("(?i)\\b(?:password|passwd|api_secret|client_secret|jwt_secret|secret_key|database_url)\\s*[:=]\\s*[^\\s,;]{6,}"),
            Pattern.compile("(?m)^(?:[A-Z0-9_]*(?:SECRET|KEY|PASSWORD|TOKEN|AUTH|DATABASE_URL)[A-Z0-9_]*)\\s*=\\s*[^\\s,;]{8,}")
    };

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService networkExecutor = Executors.newSingleThreadExecutor();
    private LinearLayout keyboard;
    private LinearLayout decisionBar;
    private TextView banner;
    private String heldText;
    private boolean secureField;
    private boolean shifted;
    private boolean symbols;
    private boolean inputActive;
    private long lastHeartbeatElapsed;
    private final Runnable heartbeatLoop = new Runnable() {
        @Override
        public void run() {
            if (!inputActive) return;
            requestHeartbeatIfNeeded();
            handler.postDelayed(this, 5 * 60 * 1000L);
        }
    };

    @Override
    public View onCreateInputView() {
        keyboard = new LinearLayout(this);
        keyboard.setOrientation(LinearLayout.VERTICAL);
        keyboard.setPadding(dp(5), dp(6), dp(5), dp(6));
        keyboard.setBackgroundColor(android.graphics.Color.rgb(241, 245, 249));

        banner = new TextView(this);
        banner.setText("Krypton keyboard · checks stay on this phone");
        banner.setTextSize(12);
        banner.setTextColor(color(MUTED));
        banner.setGravity(Gravity.CENTER_VERTICAL);
        banner.setPadding(dp(9), 0, dp(9), 0);
        keyboard.addView(banner, new LinearLayout.LayoutParams(-1, dp(34)));

        decisionBar = new LinearLayout(this);
        decisionBar.setGravity(Gravity.CENTER_VERTICAL);
        decisionBar.setVisibility(View.GONE);
        keyboard.addView(decisionBar, new LinearLayout.LayoutParams(-1, dp(42)));

        rebuildKeys();
        updateBanner();
        return keyboard;
    }

    @Override
    public void onStartInput(EditorInfo attribute, boolean restarting) {
        super.onStartInput(attribute, restarting);
        heldText = null;
        int variation = attribute == null ? 0 : attribute.inputType & InputType.TYPE_MASK_VARIATION;
        secureField = attribute != null && (
                variation == InputType.TYPE_TEXT_VARIATION_PASSWORD
                        || variation == InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD
                        || variation == InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD
                        || variation == InputType.TYPE_NUMBER_VARIATION_PASSWORD
        );
        if (keyboard != null) {
            updateBanner();
            updateDecisionBar();
        }
        inputActive = true;
        requestHeartbeatIfNeeded();
        handler.removeCallbacks(heartbeatLoop);
        handler.postDelayed(heartbeatLoop, 5 * 60 * 1000L);
    }

    @Override
    public void onFinishInput() {
        inputActive = false;
        handler.removeCallbacks(heartbeatLoop);
        heldText = null;
        updateDecisionBar();
        super.onFinishInput();
    }

    @Override
    public void onDestroy() {
        networkExecutor.shutdownNow();
        super.onDestroy();
    }

    private void addRow(String[] labels) {
        LinearLayout row = new LinearLayout(this);
        row.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams rowParams = new LinearLayout.LayoutParams(-1, dp(47));
        rowParams.topMargin = dp(4);
        keyboard.addView(row, rowParams);

        for (String label : labels) {
            Button key = new Button(this);
            key.setTag(label);
            key.setText(label.equals("space") ? "" : label);
            key.setTextSize(label.length() > 1 ? 12 : 17);
            key.setTextColor(color(INK));
            key.setAllCaps(false);
            key.setPadding(0, 0, 0, 0);
            key.setMinWidth(0);
            key.setMinimumWidth(0);
            key.setMinHeight(0);
            key.setMinimumHeight(0);
            key.setBackgroundColor(android.graphics.Color.WHITE);
            LinearLayout.LayoutParams keyParams = new LinearLayout.LayoutParams(0, -1, keyWeight(label));
            keyParams.setMargins(dp(2), dp(1), dp(2), dp(1));
            row.addView(key, keyParams);

            if (label.equals("space")) {
                key.setText("English (US)");
                key.setTextSize(10);
                key.setTextColor(color(MUTED));
                key.setOnClickListener(view -> typeText(" "));
            } else if (label.equals("enter")) {
                key.setText(enterLabel());
                key.setOnClickListener(view -> sendEnter());
            } else if (label.equals("⌫")) {
                key.setOnClickListener(view -> deleteCharacter());
            } else if (label.equals("⇧")) {
                key.setOnClickListener(view -> {
                    shifted = !shifted;
                    updateKeys();
                });
            } else if (label.equals("?123")) {
                key.setOnClickListener(view -> {
                    symbols = true;
                    rebuildKeys();
                });
            } else if (label.equals("ABC")) {
                key.setOnClickListener(view -> {
                    symbols = false;
                    rebuildKeys();
                });
            } else {
                key.setOnClickListener(view -> {
                    typeText(shifted ? label.toUpperCase() : label);
                    if (shifted) {
                        shifted = false;
                        updateKeys();
                    }
                });
            }
        }
    }

    private void updateKeys() {
        if (keyboard == null) return;
        for (int rowIndex = 0; rowIndex < keyboard.getChildCount(); rowIndex++) {
            View child = keyboard.getChildAt(rowIndex);
            if (!(child instanceof LinearLayout row) || row == decisionBar) continue;
            for (int keyIndex = 0; keyIndex < row.getChildCount(); keyIndex++) {
                View key = row.getChildAt(keyIndex);
                if (key instanceof Button button) {
                    String value = button.getTag() instanceof String ? (String) button.getTag() : "";
                    if (value.length() == 1 && Character.isLetter(value.charAt(0))) {
                        button.setText(shifted ? value.toUpperCase() : value.toLowerCase());
                    }
                }
            }
        }
    }

    private void rebuildKeys() {
        if (keyboard == null) return;
        while (keyboard.getChildCount() > 2) keyboard.removeViewAt(2);
        if (symbols) {
            addRow(new String[]{"1", "2", "3", "4", "5", "6", "7", "8", "9", "0"});
            addRow(new String[]{"@", "#", "$", "%", "&", "-", "+", "(", ")"});
            addRow(new String[]{"=", "*", "\"", "'", ":", ";", "!", "?", "⌫"});
            addRow(new String[]{"ABC", ",", "space", ".", "enter"});
        } else {
            addRow(new String[]{"q", "w", "e", "r", "t", "y", "u", "i", "o", "p"});
            addRow(new String[]{"a", "s", "d", "f", "g", "h", "j", "k", "l"});
            addRow(new String[]{"⇧", "z", "x", "c", "v", "b", "n", "m", "⌫"});
            addRow(new String[]{"?123", ",", "space", ".", "enter"});
        }
    }

    private void typeText(String value) {
        if (heldText != null) return;
        InputConnection connection = getCurrentInputConnection();
        if (connection == null) return;
        connection.commitText(value, 1);
        inspectCurrentText();
    }

    private boolean inspectCurrentText() {
        if (secureField || !AndroidPolicy.isActive(this)) {
            updateBanner();
            return false;
        }
        InputConnection connection = getCurrentInputConnection();
        if (connection == null) return false;
        CharSequence before = connection.getTextBeforeCursor(5000, 0);
        if (before == null || before.length() == 0) return false;
        String text = before.toString();
        for (Pattern pattern : SENSITIVE_PATTERNS) {
            Matcher matcher = pattern.matcher(text);
            while (matcher.find()) {
                if (matcher.end() == text.length()) {
                    String matched = matcher.group();
                    if (connection.deleteSurroundingText(matched.length(), 0)) {
                        heldText = matched;
                        showDecision();
                        return true;
                    }
                }
            }
        }
        updateBanner();
        return false;
    }

    private void showDecision() {
        boolean allowOnce = AndroidPolicy.canAllowOnce(this);
        banner.setText(allowOnce
                ? "Sensitive-looking text removed from the field."
                : "Company policy blocked this sensitive-looking text.");
        banner.setTextColor(android.graphics.Color.rgb(185, 28, 28));
        decisionBar.removeAllViews();
        Button block = actionButton("Keep blocked", false);
        if (allowOnce) {
            Button allow = actionButton("Allow once", true);
            decisionBar.addView(allow, new LinearLayout.LayoutParams(0, dp(38), 1f));
            LinearLayout.LayoutParams blockParams = new LinearLayout.LayoutParams(0, dp(38), 1f);
            blockParams.leftMargin = dp(6);
            decisionBar.addView(block, blockParams);
            allow.setOnClickListener(view -> {
                String pending = heldText;
                heldText = null;
                if (pending != null && getCurrentInputConnection() != null) {
                    getCurrentInputConnection().commitText(pending, 1);
                }
                updateDecisionBar();
                updateBanner();
            });
        } else {
            decisionBar.addView(block, new LinearLayout.LayoutParams(-1, dp(38)));
        }
        block.setOnClickListener(view -> {
            heldText = null;
            updateDecisionBar();
            updateBanner();
        });
        decisionBar.setVisibility(View.VISIBLE);
    }

    private Button actionButton(String title, boolean primary) {
        Button button = new Button(this);
        button.setText(title);
        button.setAllCaps(false);
        button.setTextSize(12);
        button.setTextColor(primary ? android.graphics.Color.WHITE : color(INK));
        button.setBackgroundColor(primary ? color(BLUE) : android.graphics.Color.WHITE);
        button.setPadding(dp(4), 0, dp(4), 0);
        return button;
    }

    private void updateDecisionBar() {
        if (decisionBar != null && heldText == null) decisionBar.setVisibility(View.GONE);
    }

    private void updateBanner() {
        if (banner == null || heldText != null) return;
        if (secureField) {
            banner.setText("Password field · scanning is paused");
            banner.setTextColor(color(MUTED));
        } else if (AndroidPolicy.isActive(this)) {
            banner.setText("Krypton policy active · text is checked locally");
            banner.setTextColor(color(BLUE));
        } else {
            banner.setText("Policy inactive · text checks are paused");
            banner.setTextColor(android.graphics.Color.rgb(180, 83, 9));
        }
    }

    private void deleteCharacter() {
        if (heldText != null) return;
        InputConnection connection = getCurrentInputConnection();
        if (connection != null) {
            connection.deleteSurroundingText(1, 0);
            updateBanner();
        }
    }

    private void sendEnter() {
        if (heldText != null || inspectCurrentText()) return;
        InputConnection connection = getCurrentInputConnection();
        if (connection == null) return;
        EditorInfo info = getCurrentInputEditorInfo();
        if (info != null) {
            int action = info.actionId != 0
                    ? info.actionId
                    : info.imeOptions & EditorInfo.IME_MASK_ACTION;
            if (action != EditorInfo.IME_ACTION_NONE && action != EditorInfo.IME_ACTION_UNSPECIFIED) {
                connection.performEditorAction(action);
                return;
            }
        }
        connection.sendKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_ENTER));
        connection.sendKeyEvent(new KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_ENTER));
    }

    private String enterLabel() {
        EditorInfo info = getCurrentInputEditorInfo();
        if (info == null) return "↵";
        switch (info.imeOptions & EditorInfo.IME_MASK_ACTION) {
            case EditorInfo.IME_ACTION_GO:
                return "Go";
            case EditorInfo.IME_ACTION_SEARCH:
                return "Search";
            case EditorInfo.IME_ACTION_SEND:
                return "Send";
            case EditorInfo.IME_ACTION_NEXT:
                return "Next";
            case EditorInfo.IME_ACTION_DONE:
                return "Done";
            default:
                return "↵";
        }
    }

    private void requestHeartbeatIfNeeded() {
        long now = SystemClock.elapsedRealtime();
        if (now - lastHeartbeatElapsed < 5 * 60 * 1000L) return;
        lastHeartbeatElapsed = now;
        networkExecutor.execute(() -> {
            try {
                KryptonApi.refreshPolicy(this);
                handler.post(this::updateBanner);
            } catch (Exception error) {
                android.util.Log.w("KryptonAndroid", "Keyboard policy refresh failed: " + error.getMessage());
                handler.post(this::updateBanner);
            }
        });
    }

    private float keyWeight(String label) {
        if (label.equals("space")) return 5f;
        if (label.equals("enter") || label.equals("?123") || label.equals("⇧") || label.equals("⌫")) return 1.5f;
        return 1f;
    }

    private int color(int value) {
        if (value == BLUE) return android.graphics.Color.rgb(37, 99, 235);
        if (value == INK) return android.graphics.Color.rgb(15, 23, 42);
        return android.graphics.Color.rgb(100, 116, 139);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
