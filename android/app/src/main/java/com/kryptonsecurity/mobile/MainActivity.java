package com.kryptonsecurity.mobile;

import android.app.Activity;
import android.app.AlertDialog;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.JsResult;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

public final class MainActivity extends Activity {
    private static final int BACKGROUND = Color.rgb(7, 11, 20);
    private static final int PANEL = Color.rgb(11, 18, 32);
    private static final int CYAN = Color.rgb(56, 189, 248);
    private static final int MUTED = Color.rgb(148, 163, 184);
    private static final int WHITE = Color.rgb(248, 250, 252);
    private static final String PREFS = "krypton_android_settings";
    private static final String DEVICE_ID_KEY = "device_id";
    private static final String POLICY_KEY = "policy";
    private static final String LAST_VALIDATION_KEY = "last_validation";
    private static final String GRACE_HOURS_KEY = "offline_grace_hours";
    private static final String APP_VERSION = "0.1.0";
    private static final List<String> AI_HOSTS = Arrays.asList(
            "chatgpt.com", "openai.com", "claude.ai", "anthropic.com",
            "gemini.google.com", "copilot.microsoft.com",
            "bing.com", "perplexity.ai"
    );
    private static final List<String> LOGIN_HOSTS = Arrays.asList(
            "auth.openai.com", "accounts.google.com", "login.microsoftonline.com",
            "login.live.com", "auth0.openai.com"
    );

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final ExecutorService networkExecutor = Executors.newSingleThreadExecutor();
    private final ScheduledExecutorService heartbeatExecutor = Executors.newSingleThreadScheduledExecutor();
    private ScheduledFuture<?> heartbeatTask;
    private EncryptedState encryptedState;
    private LinearLayout root;
    private WebView webView;
    private TextView protectionStatus;
    private JSONObject policy = new JSONObject();
    private String deviceId;
    private boolean authenticated;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(BACKGROUND);
        getWindow().setNavigationBarColor(BACKGROUND);
        encryptedState = new EncryptedState(this);
        deviceId = getSharedPreferences(PREFS, MODE_PRIVATE)
                .getString(DEVICE_ID_KEY, null);
        if (deviceId == null) {
            deviceId = UUID.randomUUID().toString();
            getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString(DEVICE_ID_KEY, deviceId).apply();
        }

        try {
            String savedPolicy = getSharedPreferences(PREFS, MODE_PRIVATE).getString(POLICY_KEY, "{}");
            policy = new JSONObject(savedPolicy == null ? "{}" : savedPolicy);
            if (!encryptedState.getAccessToken().isEmpty()) {
                validateAndOpen();
            } else {
                showLogin(null);
            }
        } catch (Exception error) {
            encryptedState.clearTokens();
            showLogin("Saved sign-in could not be unlocked. Please sign in again.");
        }
    }

    private void validateAndOpen() {
        networkExecutor.execute(() -> {
            try {
                JSONObject result = postAuthenticated("/mobile/heartbeat", new JSONObject()
                        .put("deviceId", deviceId)
                        .put("appVersion", APP_VERSION));
                if (!result.optBoolean("valid")) {
                    throw new ApiException(result.optString("message", "This device is no longer authorized."), 403);
                }
                acceptHeartbeat(result);
                mainHandler.post(this::showBrowser);
            } catch (Exception error) {
                if (!isAuthorizationFailure(error) && withinOfflineGrace()) {
                    mainHandler.post(this::showBrowser);
                } else {
                    encryptedState.clearTokens();
                    mainHandler.post(() -> showLogin("Could not validate this device. Connect to the internet and sign in again."));
                }
            }
        });
    }

    private boolean withinOfflineGrace() {
        long last = getSharedPreferences(PREFS, MODE_PRIVATE).getLong(LAST_VALIDATION_KEY, 0);
        int graceHours = getSharedPreferences(PREFS, MODE_PRIVATE).getInt(GRACE_HOURS_KEY, 0);
        return last > 0 && graceHours > 0 &&
                System.currentTimeMillis() - last <= TimeUnit.HOURS.toMillis(graceHours);
    }

    private boolean isAuthorizationFailure(Exception error) {
        return error instanceof ApiException &&
                (((ApiException) error).status == 401 || ((ApiException) error).status == 403);
    }

    private void showLogin(String errorMessage) {
        destroyWebView();
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setPadding(dp(24), dp(28), dp(24), dp(28));
        root.setBackgroundColor(BACKGROUND);

        ScrollView scroll = new ScrollView(this);
        LinearLayout form = new LinearLayout(this);
        form.setOrientation(LinearLayout.VERTICAL);
        form.setPadding(dp(22), dp(26), dp(22), dp(24));
        form.setBackground(rounded(PANEL, 22, Color.rgb(30, 41, 59)));
        form.addView(label("KRYPTON SECURITY", 12, CYAN, true), margin(0, 0, 0, 9));
        form.addView(label("Protect AI use on Android", 25, WHITE, true), margin(0, 0, 0, 8));
        form.addView(label("Sign in with the employee account created by your company administrator.", 14, MUTED, false), margin(0, 0, 0, 22));

        EditText email = input("Work email", false);
        email.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
        form.addView(email, margin(0, 0, 0, 12));
        EditText password = input("Password", true);
        password.setImeOptions(EditorInfo.IME_ACTION_DONE);
        form.addView(password, margin(0, 0, 0, 16));

        TextView error = label(errorMessage == null ? "" : errorMessage, 13, Color.rgb(252, 165, 165), false);
        error.setVisibility(errorMessage == null ? View.GONE : View.VISIBLE);
        form.addView(error, margin(0, 0, 0, 12));

        Button signIn = button("Sign in and enroll this phone", true);
        form.addView(signIn, margin(0, 0, 0, 16));
        form.addView(label("Your administrator must create your account and assign a license seat. The app only asks for Android network access.", 12, MUTED, false));
        scroll.addView(form);
        root.addView(scroll, new LinearLayout.LayoutParams(-1, -2));
        setContentView(root);

        signIn.setOnClickListener(view -> {
            String userEmail = email.getText().toString().trim();
            String userPassword = password.getText().toString();
            if (userEmail.isEmpty() || userPassword.isEmpty()) {
                error.setText("Enter your work email and password.");
                error.setVisibility(View.VISIBLE);
                return;
            }
            signIn.setEnabled(false);
            signIn.setText("Signing in…");
            error.setVisibility(View.GONE);
            networkExecutor.execute(() -> activate(userEmail, userPassword, signIn, error));
        });
    }

    private void activate(String email, String password, Button signIn, TextView error) {
        try {
            JSONObject login = postPublic("/auth/login", new JSONObject()
                    .put("email", email)
                    .put("password", password));
            String accessToken = login.optString("accessToken", "");
            String refreshToken = login.optString("refreshToken", "");
            if (accessToken.isEmpty() || refreshToken.isEmpty()) {
                throw new ApiException("Login response was incomplete.", 500);
            }
            encryptedState.saveTokens(accessToken, refreshToken);

            JSONObject enrollment = postAuthenticated("/mobile/activate", new JSONObject()
                    .put("deviceId", deviceId)
                    .put("deviceName", deviceName())
                    .put("osVersion", "Android " + Build.VERSION.RELEASE)
                    .put("appVersion", APP_VERSION));
            JSONObject responsePolicy = enrollment.optJSONObject("policy");
            if (responsePolicy != null) savePolicy(responsePolicy);
            int graceHours = enrollment.optInt("offlineGraceHours", 72);
            getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                    .putInt(GRACE_HOURS_KEY, graceHours)
                    .putLong(LAST_VALIDATION_KEY, System.currentTimeMillis())
                    .apply();
            authenticated = true;
            mainHandler.post(() -> {
                if (signIn.isAttachedToWindow()) showBrowser();
            });
        } catch (Exception failure) {
            encryptedState.clearTokens();
            String message = failure.getMessage() == null ? "Sign-in failed. Try again." : failure.getMessage();
            mainHandler.post(() -> {
                error.setText(message);
                error.setVisibility(View.VISIBLE);
                signIn.setEnabled(true);
                signIn.setText("Sign in and enroll this phone");
            });
        }
    }

    private void showBrowser() {
        authenticated = true;
        LinearLayout page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        page.setBackgroundColor(BACKGROUND);

        LinearLayout top = new LinearLayout(this);
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.setPadding(dp(16), dp(12), dp(12), dp(8));
        TextView title = label("Krypton", 20, WHITE, true);
        top.addView(title, new LinearLayout.LayoutParams(0, -2, 1));
        boolean recentlyValidated = System.currentTimeMillis() -
                getSharedPreferences(PREFS, MODE_PRIVATE).getLong(LAST_VALIDATION_KEY, 0) < TimeUnit.MINUTES.toMillis(10);
        protectionStatus = label(
                recentlyValidated ? "Policy synced" : "Offline · cached policy",
                11,
                recentlyValidated ? Color.rgb(134, 239, 172) : Color.rgb(253, 230, 138),
                true
        );
        top.addView(protectionStatus, margin(0, 0, 10, 0));
        Button logout = smallButton("Sign out");
        top.addView(logout);
        logout.setOnClickListener(view -> signOut());
        page.addView(top);

        TextView notice = label("Best-effort prompt scanning in this secure browser only. Other Android apps are not monitored.", 12, Color.rgb(253, 230, 138), false);
        notice.setPadding(dp(15), dp(10), dp(15), dp(10));
        notice.setBackground(rounded(Color.rgb(45, 37, 17), 12, Color.rgb(120, 83, 25)));
        LinearLayout.LayoutParams noticeParams = margin(dp(12), dp(2), dp(12), dp(8));
        page.addView(notice, noticeParams);

        LinearLayout sites = new LinearLayout(this);
        sites.setOrientation(LinearLayout.HORIZONTAL);
        sites.setPadding(dp(8), dp(3), dp(8), dp(8));
        String[][] links = {
                {"ChatGPT", "https://chatgpt.com/"},
                {"Claude", "https://claude.ai/"},
                {"Gemini", "https://gemini.google.com/"},
                {"Copilot", "https://copilot.microsoft.com/"},
                {"Perplexity", "https://www.perplexity.ai/"}
        };
        for (String[] link : links) {
            Button site = smallButton(link[0]);
            sites.addView(site, new LinearLayout.LayoutParams(0, dp(40), 1));
            site.setOnClickListener(view -> webView.loadUrl(link[1]));
        }
        page.addView(sites);

        if (webView == null) createWebView();
        ViewGroup previousParent = (ViewGroup) webView.getParent();
        if (previousParent != null) previousParent.removeView(webView);
        page.addView(webView, new LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(page);
        scheduleHeartbeat();
        if (webView.getUrl() == null || "about:blank".equals(webView.getUrl())) {
            protectionStatus.setText("Choose an AI site");
        }
    }

    private void createWebView() {
        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) settings.setSafeBrowsingEnabled(true);
        CookieManager.getInstance().setAcceptCookie(true);
        webView.addJavascriptInterface(new GuardBridge(), "KryptonGuard");
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onJsConfirm(android.webkit.WebView view, String url, String message, JsResult result) {
                new AlertDialog.Builder(MainActivity.this)
                        .setTitle(message != null && message.startsWith("Krypton detected")
                                ? "Krypton warning" : "Website confirmation")
                        .setMessage(message)
                        .setNegativeButton("Cancel", (dialog, which) -> result.cancel())
                        .setPositiveButton("Continue", (dialog, which) -> result.confirm())
                        .setOnCancelListener(dialog -> result.cancel())
                        .show();
                return true;
            }
        });
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                URL url;
                try {
                    url = new URL(request.getUrl().toString());
                } catch (Exception error) {
                    return true;
                }
                String host = url.getHost().toLowerCase(Locale.ROOT);
                if (!"https".equals(url.getProtocol()) || !isAllowedHost(host)) {
                    toast("This browser only opens supported AI sites and their sign-in pages.");
                    return true;
                }
                return false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (isAiUrl(url)) {
                    view.evaluateJavascript(buildGuardScript(policy), null);
                    if (protectionStatus != null) protectionStatus.setText("Policy active");
                }
            }
        });
        webView.setBackgroundColor(Color.WHITE);
    }

    private void scheduleHeartbeat() {
        if (heartbeatTask != null) heartbeatTask.cancel(false);
        heartbeatTask = heartbeatExecutor.scheduleWithFixedDelay(() -> {
            if (!authenticated) return;
            try {
                JSONObject result = postAuthenticated("/mobile/heartbeat", new JSONObject()
                        .put("deviceId", deviceId)
                        .put("appVersion", APP_VERSION));
                if (!result.optBoolean("valid")) throw new ApiException("This device is no longer authorized.", 403);
                acceptHeartbeat(result);
            } catch (Exception error) {
                if (isAuthorizationFailure(error) || !withinOfflineGrace()) {
                    authenticated = false;
                    mainHandler.post(() -> {
                        if (webView != null) webView.loadUrl("about:blank");
                        encryptedState.clearTokens();
                        showLogin("Krypton could not validate the device. Protection has stopped; reconnect and sign in again.");
                    });
                } else {
                    mainHandler.post(() -> {
                        if (protectionStatus != null) {
                            protectionStatus.setText("Offline · cached policy");
                            protectionStatus.setTextColor(Color.rgb(253, 230, 138));
                        }
                    });
                }
            }
        }, 5, 5, TimeUnit.MINUTES);
    }

    private void acceptHeartbeat(JSONObject result) {
        JSONObject updatedPolicy = result.optJSONObject("policy");
        if (updatedPolicy != null) savePolicy(updatedPolicy);
        int graceHours = result.optInt("offlineGraceHours",
                getSharedPreferences(PREFS, MODE_PRIVATE).getInt(GRACE_HOURS_KEY, 72));
        getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                .putInt(GRACE_HOURS_KEY, graceHours)
                .putLong(LAST_VALIDATION_KEY, System.currentTimeMillis())
                .apply();
    }

    private void savePolicy(JSONObject updatedPolicy) {
        policy = updatedPolicy;
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString(POLICY_KEY, updatedPolicy.toString()).apply();
        mainHandler.post(() -> {
            if (webView != null && webView.getUrl() != null && isAiUrl(webView.getUrl())) {
                webView.evaluateJavascript(buildGuardScript(policy), null);
            }
            if (protectionStatus != null) protectionStatus.setText("Policy synced");
        });
    }

    private String buildGuardScript(JSONObject currentPolicy) {
        JSONArray rules = new JSONArray();
        addRule(rules, "API_KEY_OPENAI", "OpenAI API key", "api_key",
                "\\\\bsk-(?!ant-)(?:proj-)?[a-zA-Z0-9_\\\\-]{24,}\\\\b", "CRITICAL");
        addRule(rules, "API_KEY_ANTHROPIC", "Anthropic API key", "api_key",
                "\\\\bsk-ant-(?:api03-)?[a-zA-Z0-9_\\\\-]{32,}\\\\b", "CRITICAL");
        addRule(rules, "CLOUD_AWS_KEY", "AWS access key", "cloud_credential",
                "\\\\bAKIA[0-9A-Z]{16}\\\\b", "CRITICAL");
        addRule(rules, "TOKEN_GITHUB", "GitHub access token", "api_key",
                "\\\\bgh[pousr]_[A-Za-z0-9_]{36,255}\\\\b", "CRITICAL");
        addRule(rules, "SECRET_PASSWORD", "Password", "password",
                "(?i)\\\\bpassword\\\\s*[:=]\\\\s*[^\\\\s,;]{8,}", "HIGH");
        JSONArray customRules = currentPolicy.optJSONArray("customRules");
        if (customRules != null) {
            for (int i = 0; i < customRules.length(); i++) {
                JSONObject rule = customRules.optJSONObject(i);
                if (rule == null || !rule.optBoolean("isEnabled", true)) continue;
                String pattern = rule.optString("pattern", "");
                if (pattern.isEmpty() || pattern.length() > 500) continue;
                try {
                    rules.put(new JSONObject()
                            .put("code", rule.optString("ruleCode", "CUSTOM_RULE"))
                            .put("name", rule.optString("name", "Company rule"))
                            .put("category", rule.optString("category", "custom_regex"))
                            .put("pattern", pattern)
                            .put("risk", rule.optString("riskLevel", "HIGH")));
                } catch (JSONException ignored) {
                    // Invalid company rules are skipped; the server remains the source of truth.
                }
            }
        }
        JSONArray hosts = new JSONArray();
        for (String host : AI_HOSTS) hosts.put(host);
        return "(function(){"
                + "const rulesJson=" + JSONObject.quote(rules.toString()) + ";"
                + "const policyJson=" + JSONObject.quote(currentPolicy.toString()) + ";"
                + "if(window.__kryptonGuardReady){window.__kryptonRules.splice(0,window.__kryptonRules.length,...JSON.parse(rulesJson));Object.keys(window.__kryptonPolicy).forEach(k=>delete window.__kryptonPolicy[k]);Object.assign(window.__kryptonPolicy,JSON.parse(policyJson));return;}"
                + "window.__kryptonGuardReady=true;window.__kryptonRules=JSON.parse(rulesJson);window.__kryptonPolicy=JSON.parse(policyJson);"
                + "const R=window.__kryptonRules,P=window.__kryptonPolicy;"
                + "function inspect(text){if(!text||text.length>1000000)return null;"
                + "for(const r of R){try{if((r.category==='api_key'||r.category==='private_key'||r.category==='password'||r.category==='cloud_credential'||r.category==='connection_string')&&P.enableSecretDetection===false)continue;"
                + "if(r.category==='pii'&&P.enablePiiDetection===false)continue;"
                + "if((r.category==='custom_keyword'||r.category==='custom_regex')&&P.enableCustomRules===false)continue;"
                + "const m=new RegExp(r.pattern,'i').exec(text);if(!m)continue;"
                + "const risk=r.risk||'HIGH';let action='allow';"
                + "if(risk==='CRITICAL'&&P.blockCriticalRisk!==false)action='block';"
                + "else if(risk==='HIGH'&&P.blockHighRisk!==false)action='block';"
                + "else if(risk==='MEDIUM'&&P.warnMediumRisk!==false)action='warn';"
                + "else if(risk==='LOW'&&P.allowLowRisk===false)action='block';"
                + "if(action!=='allow')return {ruleCode:r.code,ruleName:r.name,riskLevel:risk,category:r.category,action};"
                + "}catch(e){}}return null;}"
                + "function report(m,action,response){try{KryptonGuard.onDetection(JSON.stringify({ruleCode:m.ruleCode,ruleName:m.ruleName,riskLevel:m.riskLevel,category:m.category,actionTaken:action,warningResponse:response||'',hostname:location.hostname}));}catch(e){}}"
                + "function decide(m){if(!m)return true;if(m.action==='warn'){const proceed=window.confirm('Krypton detected a company policy warning. Continue with this AI submission?');report(m,proceed?'warn':'block',proceed?'proceeded':'dismissed');if(!proceed)window.alert('Krypton cancelled this submission.');return proceed;}"
                + "report(m,'block','');window.alert('Krypton blocked this submission: '+m.ruleName);return false;}"
                + "function editorText(){return Array.from(document.querySelectorAll('[contenteditable=true],textarea,input[type=text]')).map(e=>e.innerText||e.value||'').join('\\n');}"
                + "document.addEventListener('keydown',function(e){if(e.key!=='Enter'||e.shiftKey||e.isComposing)return;const t=e.target;if(!(t.isContentEditable||/^(TEXTAREA|INPUT)$/.test(t.tagName)))return;const m=inspect(t.innerText||t.value||'');if(m&&!decide(m)){e.preventDefault();e.stopImmediatePropagation();}},true);"
                + "document.addEventListener('click',function(e){const b=e.target.closest('button[type=submit],button[data-testid*=send],button[aria-label*=send i]');if(!b)return;const m=inspect(editorText());if(m&&!decide(m)){e.preventDefault();e.stopImmediatePropagation();}},true);"
                + "document.addEventListener('submit',function(e){const m=inspect(editorText());if(m&&!decide(m)){e.preventDefault();e.stopImmediatePropagation();}},true);"
                + "const allowedHosts=JSON.parse(" + JSONObject.quote(hosts.toString()) + ");"
                + "const originalFetch=window.fetch;window.fetch=function(input,init){try{const u=new URL(typeof input==='string'?input:input.url,location.href);const method=(init&&init.method)||(input&&input.method)||'GET';const body=init&&init.body;if(method.toUpperCase()==='POST'&&body&&typeof body==='string'&&/(conversation|completion|messages|responses|chat|generate|query|stream|assistant|perplexity_ask)/i.test(u.pathname+u.search)&&allowedHosts.some(h=>u.hostname===h||u.hostname.endsWith('.'+h))){const m=inspect(body);if(m&&!decide(m))return Promise.reject(new Error('Blocked by Krypton policy'));}}catch(e){if(e&&e.message==='Blocked by Krypton policy')return Promise.reject(e);}return originalFetch.apply(this,arguments);};"
                + "})();";
    }

    private void addRule(JSONArray rules, String code, String name, String category, String pattern, String risk) {
        try {
            rules.put(new JSONObject()
                    .put("code", code)
                    .put("name", name)
                    .put("category", category)
                    .put("pattern", pattern)
                    .put("risk", risk));
        } catch (JSONException error) {
            throw new IllegalStateException("Could not configure a built-in Android protection rule.", error);
        }
    }

    private final class GuardBridge {
        @JavascriptInterface
        public void onDetection(String raw) {
            try {
                JSONObject event = new JSONObject(raw);
                String host = event.optString("hostname", "").toLowerCase(Locale.ROOT);
                String action = event.optString("actionTaken", "");
                String risk = event.optString("riskLevel", "");
                if (!isAiHost(host) ||
                        !Arrays.asList("warn", "block").contains(action) ||
                        !Arrays.asList("LOW", "MEDIUM", "HIGH", "CRITICAL").contains(risk) ||
                        event.optString("ruleCode", "").length() > 100 ||
                        event.optString("ruleName", "").length() > 200) {
                    return;
                }
                networkExecutor.execute(() -> reportDetection(event));
            } catch (JSONException error) {
                android.util.Log.w("KryptonGuard", "Ignored invalid local detection metadata.");
            }
        }
    }

    private void reportDetection(JSONObject metadata) {
        try {
            String action = metadata.optString("actionTaken", "block");
            String warningResponse = metadata.optString("warningResponse", "");
            JSONObject event = new JSONObject()
                    .put("deviceId", deviceId)
                    .put("eventType", "prompt_submission")
                    .put("targetApp", metadata.optString("hostname", "AI website") + " (Krypton Android secure browser)")
                    .put("riskLevel", metadata.optString("riskLevel", "HIGH"))
                    .put("ruleCode", metadata.optString("ruleCode", "ANDROID_POLICY"))
                    .put("ruleName", metadata.optString("ruleName", "Company policy"))
                    .put("category", metadata.optString("category", "custom_regex"))
                    .put("actionTaken", action)
                    .put("redactedPreview", "")
                    .put("explanation", "Detected locally in Krypton Android secure browser.");
            if (!warningResponse.isEmpty()) event.put("warningResponse", warningResponse);
            postAuthenticated("/desktop/events", event);
        } catch (Exception error) {
            android.util.Log.w("KryptonGuard", "Could not report Android security event.");
        }
    }

    private void signOut() {
        authenticated = false;
        if (heartbeatTask != null) heartbeatTask.cancel(false);
        networkExecutor.execute(() -> {
            try {
                postPublic("/mobile/logout", new JSONObject()
                        .put("refreshToken", encryptedState.getRefreshToken()));
            } catch (Exception error) {
                android.util.Log.i("KryptonAuth", "Signing out locally because the server is unavailable.");
            }
            encryptedState.clearTokens();
            getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                    .remove(LAST_VALIDATION_KEY)
                    .remove(GRACE_HOURS_KEY)
                    .apply();
            mainHandler.post(() -> showLogin(null));
        });
    }

    private JSONObject postPublic(String path, JSONObject body) throws Exception {
        return request(path, body, null, false);
    }

    private JSONObject postAuthenticated(String path, JSONObject body) throws Exception {
        String token = encryptedState.getAccessToken();
        JSONObject result = request(path, body, token, true);
        return result;
    }

    private JSONObject request(String path, JSONObject body, String token, boolean retryOnUnauthorized) throws Exception {
        ApiResponse response = executeRequest(path, body, token);
        if (response.status == 401 && retryOnUnauthorized) {
            refreshTokens();
            response = executeRequest(path, body, encryptedState.getAccessToken());
        }
        if (response.status < 200 || response.status >= 300) {
            throw new ApiException(response.body.optString("error", "Krypton request failed."), response.status);
        }
        return response.body;
    }

    private synchronized void refreshTokens() throws Exception {
        String refreshToken = encryptedState.getRefreshToken();
        if (refreshToken.isEmpty()) throw new ApiException("Please sign in again.", 401);
        JSONObject response = request("/auth/refresh", new JSONObject().put("refreshToken", refreshToken), null, false);
        String accessToken = response.optString("accessToken", "");
        String newRefreshToken = response.optString("refreshToken", "");
        if (accessToken.isEmpty() || newRefreshToken.isEmpty()) {
            throw new ApiException("Could not refresh the sign-in. Please sign in again.", 401);
        }
        encryptedState.saveTokens(accessToken, newRefreshToken);
    }

    private ApiResponse executeRequest(String path, JSONObject body, String token) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(BuildConfig.API_BASE_URL + path).openConnection();
        connection.setRequestMethod("POST");
        connection.setConnectTimeout(12_000);
        connection.setReadTimeout(20_000);
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
        if (token != null && !token.isEmpty()) connection.setRequestProperty("Authorization", "Bearer " + token);
        connection.setDoOutput(true);
        try (OutputStream output = connection.getOutputStream()) {
            output.write(body.toString().getBytes(StandardCharsets.UTF_8));
        }
        int status = connection.getResponseCode();
        InputStream input = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        if (input != null) {
            try (InputStream stream = input) {
                byte[] buffer = new byte[4096];
                int count;
                while ((count = stream.read(buffer)) != -1) {
                    bytes.write(buffer, 0, count);
                    if (bytes.size() > 1_000_000) throw new IllegalStateException("Krypton response exceeded the safe size limit.");
                }
            }
        }
        connection.disconnect();
        String responseText = bytes.toString(StandardCharsets.UTF_8.name());
        JSONObject parsed;
        try {
            parsed = responseText.isEmpty() ? new JSONObject() : new JSONObject(responseText);
        } catch (JSONException error) {
            throw new IllegalStateException("Krypton returned an invalid response.", error);
        }
        return new ApiResponse(status, parsed);
    }

    private boolean isAiUrl(String rawUrl) {
        try {
            URL url = new URL(rawUrl);
            return "https".equals(url.getProtocol()) && isAiHost(url.getHost().toLowerCase(Locale.ROOT));
        } catch (Exception error) {
            return false;
        }
    }

    private boolean isAllowedHost(String host) {
        if (isAiHost(host)) return true;
        for (String allowed : LOGIN_HOSTS) {
            if (host.equals(allowed)) return true;
        }
        return false;
    }

    private boolean isAiHost(String host) {
        for (String allowed : AI_HOSTS) {
            if (host.equals(allowed) || host.endsWith("." + allowed)) return true;
        }
        return false;
    }

    private String deviceName() {
        String manufacturer = Build.MANUFACTURER == null ? "Android" : Build.MANUFACTURER;
        String model = Build.MODEL == null ? "Phone" : Build.MODEL;
        return (manufacturer + " " + model).trim().substring(0, Math.min(100, (manufacturer + " " + model).trim().length()));
    }

    private void destroyWebView() {
        if (webView != null) {
            ViewGroup parent = (ViewGroup) webView.getParent();
            if (parent != null) parent.removeView(webView);
            webView.stopLoading();
            webView.loadUrl("about:blank");
            webView.removeJavascriptInterface("KryptonGuard");
            webView.destroy();
            webView = null;
        }
        setContentView(new View(this));
    }

    private EditText input(String hint, boolean password) {
        EditText field = new EditText(this);
        field.setSingleLine(true);
        field.setTextColor(WHITE);
        field.setHintTextColor(MUTED);
        field.setHint(hint);
        field.setPadding(dp(14), dp(12), dp(14), dp(12));
        field.setBackground(rounded(Color.rgb(15, 23, 42), 12, Color.rgb(51, 65, 85)));
        if (password) field.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD);
        return field;
    }

    private Button button(String text, boolean primary) {
        Button button = new Button(this);
        button.setText(text);
        button.setAllCaps(false);
        button.setTextSize(14);
        button.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        button.setTextColor(primary ? BACKGROUND : WHITE);
        button.setBackground(rounded(primary ? CYAN : PANEL, 12, primary ? CYAN : Color.rgb(51, 65, 85)));
        return button;
    }

    private Button smallButton(String text) {
        Button button = button(text, false);
        button.setTextSize(10);
        button.setPadding(dp(3), 0, dp(3), 0);
        return button;
    }

    private TextView label(String text, int size, int color, boolean bold) {
        TextView view = new TextView(this);
        view.setText(text);
        view.setTextSize(size);
        view.setTextColor(color);
        if (bold) view.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return view;
    }

    private GradientDrawable rounded(int color, int radiusDp, int strokeColor) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(dp(radiusDp));
        drawable.setStroke(dp(1), strokeColor);
        return drawable;
    }

    private LinearLayout.LayoutParams margin(int left, int top, int right, int bottom) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
        params.setMargins(left, top, right, bottom);
        return params;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void toast(String message) {
        Toast.makeText(this, message, Toast.LENGTH_LONG).show();
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        authenticated = false;
        heartbeatExecutor.shutdownNow();
        networkExecutor.shutdownNow();
        if (webView != null) {
            webView.stopLoading();
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    private static final class ApiResponse {
        final int status;
        final JSONObject body;

        ApiResponse(int status, JSONObject body) {
            this.status = status;
            this.body = body;
        }
    }

    private static final class ApiException extends Exception {
        final int status;

        ApiException(String message, int status) {
            super(message);
            this.status = status;
        }
    }
}
