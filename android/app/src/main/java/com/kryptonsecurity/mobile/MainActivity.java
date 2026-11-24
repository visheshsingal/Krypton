package com.kryptonsecurity.mobile;

import android.app.Activity;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.provider.Settings;
import android.view.Gravity;
import android.view.inputmethod.InputMethodManager;
import android.view.inputmethod.InputMethodInfo;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONObject;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    private static final int BLUE = Color.rgb(37, 99, 235);
    private static final int INK = Color.rgb(15, 23, 42);
    private static final int MUTED = Color.rgb(100, 116, 139);
    private static final int BORDER = Color.rgb(226, 232, 240);
    private static final String PREFS = "krypton_android";
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    private EditText emailField;
    private EditText passwordField;
    private TextView message;
    private Button submitButton;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.WHITE);
        getWindow().setNavigationBarColor(Color.WHITE);
        getWindow().getDecorView().setSystemUiVisibility(
                android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
                        | android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
        );
        render();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (hasSession()) refreshPolicy();
        else render();
    }

    @Override
    protected void onDestroy() {
        executor.shutdown();
        super.onDestroy();
    }

    private boolean hasSession() {
        try {
            return SecureSessionStore.accessToken(this) != null;
        } catch (Exception error) {
            SecureSessionStore.clear(this);
            AndroidPolicy.invalidate(this);
            return false;
        }
    }

    private void render() {
        if (hasSession()) renderDashboard();
        else renderSignIn();
    }

    private void renderSignIn() {
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(Color.WHITE);

        LinearLayout page = page();
        LinearLayout brand = brand();
        page.addView(brand, params(0, 0, 0, 36));

        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams contentParams = new LinearLayout.LayoutParams(-1, 0, 1f);

        TextView eyebrow = text("ANDROID PROTECTION", 13, BLUE, true);
        content.addView(eyebrow, params(0, 0, 0, 8));
        content.addView(text("Sign in to Krypton", 30, INK, true), params(0, 0, 0, 8));
        content.addView(text(
                "Connect this phone to your company policy. Krypton scans text typed with its optional keyboard on this device.",
                15, MUTED, false), params(0, 0, 0, 24));

        LinearLayout card = card();
        card.addView(text("Company account", 18, INK, true), params(0, 0, 0, 4));
        card.addView(text("Use the email and password provided by your company.", 13, MUTED, false), params(0, 0, 0, 20));

        emailField = input("Work email", false);
        emailField.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
        emailField.setSingleLine(true);
        card.addView(emailField, params(0, 0, 0, 12));

        passwordField = input("Password", true);
        passwordField.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD);
        passwordField.setSingleLine(true);
        card.addView(passwordField, params(0, 0, 0, 16));

        message = text("", 13, Color.rgb(185, 28, 28), false);
        card.addView(message, params(0, 0, 0, 8));

        submitButton = button("Continue", true);
        card.addView(submitButton, params(0, 0, 0, 4));
        submitButton.setOnClickListener(view -> signIn());
        content.addView(card, new LinearLayout.LayoutParams(-1, -2));

        page.addView(content, contentParams);
        TextView note = text("Your typed text is inspected locally and is not sent to Krypton.", 12, MUTED, false);
        page.addView(note, params(0, 28, 0, 0));
        scroll.addView(page);
        setContentView(scroll);
    }

    private void renderDashboard() {
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(Color.rgb(248, 250, 252));
        LinearLayout page = page();
        page.setPadding(dp(20), dp(18), dp(20), dp(28));
        page.addView(brand(), params(0, 0, 0, 22));

        LinearLayout hero = new LinearLayout(this);
        hero.setOrientation(LinearLayout.VERTICAL);
        hero.setPadding(dp(20), dp(20), dp(20), dp(20));
        hero.setBackground(rounded(Color.rgb(15, 23, 42), 18, Color.rgb(15, 23, 42)));
        hero.addView(text("ANDROID DEVICE PROTECTION", 11, Color.rgb(147, 197, 253), true), params(0, 0, 0, 10));
        hero.addView(text("Keep sensitive data\nout of AI chats.", 27, Color.WHITE, true), params(0, 0, 0, 9));
        hero.addView(text(
                "Krypton checks for recognizable secrets and personal data as you type with this keyboard.",
                14, Color.rgb(203, 213, 225), false));
        page.addView(hero, params(0, 0, 0, 16));

        LinearLayout statusCard = card();
        statusCard.setBackground(rounded(Color.WHITE, 16, BORDER));
        statusCard.addView(text("PROTECTION STATUS", 11, MUTED, true), params(0, 0, 0, 12));
        TextView status = text("Checking company policy…", 16, INK, true);
        status.setTag("policy-status");
        statusCard.addView(status, params(0, 0, 0, 7));
        TextView schedule = text(AndroidPolicy.describeSchedule(this), 13, MUTED, false);
        schedule.setTag("policy-schedule");
        statusCard.addView(schedule, params(0, 0, 0, 12));
        TextView keyboardStatus = text("", 12, BLUE, true);
        keyboardStatus.setTag("keyboard-status");
        statusCard.addView(keyboardStatus);
        page.addView(statusCard, params(0, 0, 0, 16));

        LinearLayout setup = card();
        setup.setBackground(rounded(Color.WHITE, 16, BORDER));
        setup.addView(text("Finish keyboard setup", 17, INK, true), params(0, 0, 0, 5));
        setup.addView(text(
                "Android requires you to enable Krypton and then select it as your active keyboard.",
                13, MUTED, false), params(0, 0, 0, 14));

        Button enable = button("Open keyboard settings", true);
        setup.addView(enable, params(0, 0, 0, 9));
        enable.setOnClickListener(view -> startActivity(new Intent(Settings.ACTION_INPUT_METHOD_SETTINGS)));

        Button choose = button("Select Krypton keyboard", false);
        setup.addView(choose);
        choose.setOnClickListener(view -> {
            InputMethodManager manager = (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
            if (manager != null) manager.showInputMethodPicker();
        });
        page.addView(setup, params(0, 0, 0, 16));

        LinearLayout detection = card();
        detection.setBackground(rounded(Color.WHITE, 16, BORDER));
        detection.addView(text("What Krypton checks", 17, INK, true), params(0, 0, 0, 7));
        detection.addView(text(
                "API keys, passwords and database credentials, plus recognizable emails, phone numbers, and selected government/payment ID formats.",
                13, MUTED, false), params(0, 0, 0, 10));
        detection.addView(text(
                "Ordinary questions are allowed. Krypton does not understand every prompt or identify all confidential context; only detected patterns are held for your choice.",
                13, INK, false), params(0, 0, 0, 10));
        detection.addView(text(
                "Checks happen on-device. Pasting, dictation, another keyboard, or app-specific editors may bypass them.",
                12, MUTED, false));
        page.addView(detection, params(0, 0, 0, 16));

        LinearLayout test = card();
        test.setBackground(rounded(Color.rgb(239, 246, 255), 16, Color.rgb(191, 219, 254)));
        test.addView(text("TRY A SAFE TEST", 11, BLUE, true), params(0, 0, 0, 7));
        test.addView(text(
                "With Krypton selected in a text field, type: My password is Demo-Pass-123!",
                13, INK, true), params(0, 0, 0, 6));
        test.addView(text(
                "The sensitive value should be removed. Allow once appears only when company policy permits it; otherwise it stays blocked.",
                12, MUTED, false));
        page.addView(test, params(0, 0, 0, 18));

        TextView identity = text(
                getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("userEmail", ""),
                12, MUTED, false);
        page.addView(identity, params(0, 3, 0, 0));
        scroll.addView(page);
        setContentView(scroll);
        updateKeyboardStatus();
        refreshPolicy();
    }

    private void signIn() {
        String email = emailField.getText().toString().trim();
        String password = passwordField.getText().toString();
        if (email.isEmpty() || password.isEmpty()) {
            message.setText("Enter your company email and password.");
            return;
        }

        setBusy(true);
        executor.execute(() -> {
            try {
                JSONObject result = KryptonApi.signInAndActivate(this, email, password);
                runOnUiThread(() -> {
                    if (message != null) message.setText("");
                    setBusy(false);
                    renderDashboard();
                });
            } catch (Exception error) {
                runOnUiThread(() -> {
                    setBusy(false);
                    if (message != null) message.setText(error.getMessage());
                });
            }
        });
    }

    private void refreshPolicy() {
        if (!hasSession()) return;
        executor.execute(() -> {
            try {
                KryptonApi.refreshPolicy(this);
            } catch (Exception error) {
                android.util.Log.w("KryptonAndroid", "Policy refresh failed: " + error.getMessage());
            }
            runOnUiThread(() -> {
                if (hasSession()) updatePolicyStatus();
                else renderSignIn();
            });
        });
    }

    private void updatePolicyStatus() {
        if (!(getWindow().getDecorView() instanceof android.view.ViewGroup root)) return;
        TextView status = root.findViewWithTag("policy-status");
        TextView schedule = root.findViewWithTag("policy-schedule");
        if (status == null || schedule == null) return;

        boolean active = AndroidPolicy.isActive(this);
        boolean checksEnabled = AndroidPolicy.isSecretDetectionEnabled(this)
                || AndroidPolicy.isPiiDetectionEnabled(this);
        status.setText(active
                ? checksEnabled ? "Protection active" : "Policy active · checks disabled by admin"
                : "Protection inactive · checks paused");
        status.setTextColor(active && checksEnabled ? Color.rgb(29, 78, 216) : Color.rgb(180, 83, 9));
        schedule.setText(AndroidPolicy.describeSchedule(this));
        updateKeyboardStatus();
    }

    private void updateKeyboardStatus() {
        if (!(getWindow().getDecorView() instanceof android.view.ViewGroup root)) return;
        TextView status = root.findViewWithTag("keyboard-status");
        if (status == null) return;
        boolean enabled = isKryptonKeyboardEnabled();
        boolean selected = isKryptonKeyboardSelected();
        if (selected) {
            status.setText("Krypton is selected · checks run while policy is active");
            status.setTextColor(Color.rgb(29, 78, 216));
        } else if (enabled) {
            status.setText("Keyboard enabled · select Krypton to use it");
            status.setTextColor(Color.rgb(180, 83, 9));
        } else {
            status.setText("Keyboard not enabled yet");
            status.setTextColor(Color.rgb(180, 83, 9));
        }
    }

    private boolean isKryptonKeyboardEnabled() {
        InputMethodManager manager = (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
        if (manager == null) return false;
        String kryptonId = new ComponentName(this, KryptonInputMethodService.class).flattenToString();
        for (InputMethodInfo method : manager.getEnabledInputMethodList()) {
            if (kryptonId.equals(method.getId())) return true;
        }
        return false;
    }

    private boolean isKryptonKeyboardSelected() {
        String selected = Settings.Secure.getString(getContentResolver(), Settings.Secure.DEFAULT_INPUT_METHOD);
        return new ComponentName(this, KryptonInputMethodService.class).flattenToString().equals(selected);
    }

    private void setBusy(boolean busy) {
        if (submitButton == null) return;
        submitButton.setEnabled(!busy);
        submitButton.setText(busy ? "Connecting…" : "Continue");
    }

    private LinearLayout page() {
        LinearLayout page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        page.setPadding(dp(24), dp(28), dp(24), dp(28));
        page.setMinimumHeight(getResources().getDisplayMetrics().heightPixels);
        return page;
    }

    private LinearLayout brand() {
        LinearLayout brand = new LinearLayout(this);
        brand.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout mark = new LinearLayout(this);
        mark.setGravity(Gravity.CENTER);
        mark.setBackground(rounded(BLUE, 12, BLUE));
        TextView icon = text("K", 19, Color.WHITE, true);
        mark.addView(icon);
        brand.addView(mark, new LinearLayout.LayoutParams(dp(38), dp(38)));
        TextView title = text("Krypton", 16, INK, true);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(-2, -2);
        titleParams.leftMargin = dp(11);
        brand.addView(title, titleParams);
        return brand;
    }

    private LinearLayout card() {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(20), dp(20), dp(20), dp(20));
        card.setBackground(rounded(Color.WHITE, 18, BORDER));
        return card;
    }

    private EditText input(String hint, boolean secret) {
        EditText field = new EditText(this);
        field.setTextSize(15);
        field.setTextColor(INK);
        field.setHintTextColor(Color.rgb(148, 163, 184));
        field.setHint(hint);
        field.setPadding(dp(13), 0, dp(13), 0);
        field.setBackground(rounded(Color.WHITE, 10, Color.rgb(203, 213, 225)));
        field.setMinHeight(dp(50));
        field.setSingleLine(true);
        field.setSelectAllOnFocus(false);
        if (secret) field.setTypeface(Typeface.DEFAULT);
        return field;
    }

    private Button button(String title, boolean primary) {
        Button button = new Button(this);
        button.setText(title);
        button.setAllCaps(false);
        button.setTextSize(14);
        button.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        button.setTextColor(primary ? Color.WHITE : INK);
        button.setMinHeight(dp(48));
        button.setBackground(rounded(primary ? BLUE : Color.WHITE, 10, primary ? BLUE : BORDER));
        return button;
    }

    private TextView text(String value, int size, int color, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(color);
        view.setLineSpacing(dp(3), 1f);
        if (bold) view.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return view;
    }

    private GradientDrawable rounded(int fill, int radius, int stroke) {
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(fill);
        shape.setCornerRadius(dp(radius));
        shape.setStroke(dp(1), stroke);
        return shape;
    }

    private LinearLayout.LayoutParams params(int left, int top, int right, int bottom) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
        params.setMargins(dp(left), dp(top), dp(right), dp(bottom));
        return params;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
