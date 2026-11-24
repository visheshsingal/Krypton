package com.kryptonsecurity.mobile;

import android.content.Context;
import android.os.Build;
import android.provider.Settings;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

final class KryptonApi {
    private static final String API_BASE = "https://krypton-ten-theta.vercel.app/api";
    private static final String PREFS = "krypton_android";

    private KryptonApi() {}

    static JSONObject signInAndActivate(Context context, String email, String password) throws Exception {
        JSONObject credentials = new JSONObject();
        credentials.put("email", email);
        credentials.put("password", password);
        JSONObject login = post("/auth/login", credentials, null);
        String accessToken = login.optString("accessToken");
        String refreshToken = login.optString("refreshToken");
        if (accessToken.isEmpty() || refreshToken.isEmpty()) {
            throw new IllegalStateException("The server did not return a valid sign-in session.");
        }

        String deviceId = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getString("deviceId", null);
        if (deviceId == null || deviceId.isEmpty()) deviceId = UUID.randomUUID().toString();

        JSONObject device = new JSONObject();
        device.put("deviceId", deviceId);
        device.put("deviceName", Build.MANUFACTURER + " " + Build.MODEL);
        device.put("osVersion", "Android " + Build.VERSION.RELEASE);
        device.put("appVersion", BuildConfig.VERSION_NAME);
        JSONObject activation = post("/mobile/activate", device, accessToken);
        if (!activation.optBoolean("success")) {
            throw new IllegalStateException("The company did not activate this device.");
        }

        SecureSessionStore.save(context, accessToken, refreshToken);
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putString("deviceId", deviceId)
                .putString("userEmail", login.optJSONObject("user") == null
                        ? email : login.getJSONObject("user").optString("email", email))
                .apply();
        refreshPolicy(context);
        return activation;
    }

    static JSONObject refreshPolicy(Context context) throws Exception {
        JSONObject body = new JSONObject();
        body.put("deviceId", context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getString("deviceId", ""));
        body.put("appVersion", BuildConfig.VERSION_NAME);
        JSONObject heartbeat = authorizedPost(context, "/mobile/heartbeat", body);
        if (!heartbeat.optBoolean("valid")) {
            clearSession(context);
            throw new IllegalStateException(heartbeat.optString("message", "This device is not active."));
        }
        AndroidPolicy.saveHeartbeat(context, heartbeat);
        return heartbeat;
    }

    private static JSONObject authorizedPost(Context context, String path, JSONObject body) throws Exception {
        String token = SecureSessionStore.accessToken(context);
        if (token == null) throw new IllegalStateException("Sign in to connect this device.");

        HttpResult first = request(path, body, token);
        if (first.statusCode != 401) return parseAuthorizedResponse(context, first);

        String refreshToken = SecureSessionStore.refreshToken(context);
        if (refreshToken == null) {
            clearSession(context);
            throw new IllegalStateException("Your sign-in expired. Sign in again.");
        }
        JSONObject refreshBody = new JSONObject();
        refreshBody.put("refreshToken", refreshToken);
        JSONObject refresh;
        try {
            refresh = parseResponse(request("/auth/refresh", refreshBody, null));
        } catch (Exception error) {
            clearSession(context);
            throw error;
        }
        String newAccessToken = refresh.optString("accessToken");
        String newRefreshToken = refresh.optString("refreshToken");
        if (newAccessToken.isEmpty() || newRefreshToken.isEmpty()) {
            clearSession(context);
            throw new IllegalStateException("Your sign-in expired. Sign in again.");
        }
        SecureSessionStore.save(context, newAccessToken, newRefreshToken);
        return parseAuthorizedResponse(context, request(path, body, newAccessToken));
    }

    private static JSONObject parseAuthorizedResponse(Context context, HttpResult result) throws Exception {
        if (result.statusCode == 401 || result.statusCode == 403) clearSession(context);
        return parseResponse(result);
    }

    private static JSONObject post(String path, JSONObject body, String bearer) throws Exception {
        return parseResponse(request(path, body, bearer));
    }

    private static HttpResult request(String path, JSONObject body, String bearer) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(API_BASE + path).openConnection();
        connection.setRequestMethod("POST");
        connection.setConnectTimeout(12000);
        connection.setReadTimeout(12000);
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
        if (bearer != null) connection.setRequestProperty("Authorization", "Bearer " + bearer);
        connection.setDoOutput(true);

        byte[] payload = body.toString().getBytes(StandardCharsets.UTF_8);
        connection.setFixedLengthStreamingMode(payload.length);
        try (OutputStream output = connection.getOutputStream()) {
            output.write(payload);
        }

        int status = connection.getResponseCode();
        InputStream input = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
        String responseText = input == null ? "" : readFully(input);
        connection.disconnect();
        JSONObject response;
        try {
            response = responseText.isEmpty() ? new JSONObject() : new JSONObject(responseText);
        } catch (Exception error) {
            throw new IllegalStateException("The server returned an unreadable response.");
        }
        return new HttpResult(status, response);
    }

    private static JSONObject parseResponse(HttpResult result) throws Exception {
        if (result.statusCode < 200 || result.statusCode >= 300) {
            throw new IllegalStateException(result.body.optString("error",
                    result.body.optString("message", "Request failed (" + result.statusCode + ").")));
        }
        return result.body;
    }

    private static String readFully(InputStream input) throws Exception {
        try (InputStream source = input; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int count;
            while ((count = source.read(buffer)) != -1) output.write(buffer, 0, count);
            return output.toString(StandardCharsets.UTF_8.name());
        }
    }

    private static void clearSession(Context context) {
        SecureSessionStore.clear(context);
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .remove("policy")
                .putBoolean("policyValidated", false)
                .putBoolean("allowEmployeeBypassWarning", false)
                .apply();
    }

    private static final class HttpResult {
        final int statusCode;
        final JSONObject body;

        HttpResult(int statusCode, JSONObject body) {
            this.statusCode = statusCode;
            this.body = body;
        }
    }
}
