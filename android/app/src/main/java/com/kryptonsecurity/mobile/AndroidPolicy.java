package com.kryptonsecurity.mobile;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.SystemClock;
import android.provider.Settings;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;

final class AndroidPolicy {
    private static final String PREFS = "krypton_android";
    private static final long HOUR_MS = 60L * 60L * 1000L;

    private AndroidPolicy() {}

    static void saveHeartbeat(Context context, JSONObject response) {
        String serverTime = response.optString("serverTime");
        long serverTimeMs;
        try {
            serverTimeMs = Instant.parse(serverTime).toEpochMilli();
        } catch (Exception error) {
            throw new IllegalStateException("The server returned an invalid policy timestamp.", error);
        }

        JSONObject schedule = response.optJSONObject("schedule");
        if (schedule == null) schedule = new JSONObject();
        JSONObject securityPolicy = response.optJSONObject("policy");
        boolean allowOnce = securityPolicy == null
                || securityPolicy.optBoolean("allowEmployeeBypassWarning", true);
        boolean secretsEnabled = securityPolicy == null
                || securityPolicy.optBoolean("enableSecretDetection", true);
        boolean piiEnabled = securityPolicy == null
                || securityPolicy.optBoolean("enablePiiDetection", true);
        String ownership = response.optString("ownership", "company");
        long graceHours = response.optLong("offlineGraceHours", 72);
        int bootCount = currentBootCount(context);

        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putString("schedule", schedule.toString())
                .putBoolean("allowEmployeeBypassWarning", allowOnce)
                .putBoolean("enableSecretDetection", secretsEnabled)
                .putBoolean("enablePiiDetection", piiEnabled)
                .putString("ownership", ownership)
                .putLong("serverTimeMs", serverTimeMs)
                .putLong("syncElapsedMs", SystemClock.elapsedRealtime())
                .putLong("bootCount", bootCount)
                .putLong("offlineGraceHours", Math.max(1, graceHours))
                .putBoolean("policyValidated", true)
                .apply();
    }

    static boolean isActive(Context context) {
        SharedPreferences prefs = preferences(context);
        if (!prefs.getBoolean("policyValidated", false)) return false;
        if (prefs.getLong("bootCount", -1) != currentBootCount(context)) return false;

        long serverTime = prefs.getLong("serverTimeMs", 0);
        long syncElapsed = prefs.getLong("syncElapsedMs", -1);
        long nowElapsed = SystemClock.elapsedRealtime();
        if (serverTime <= 0 || syncElapsed < 0 || nowElapsed < syncElapsed) return false;

        long elapsed = nowElapsed - syncElapsed;
        if (elapsed > prefs.getLong("offlineGraceHours", 72) * HOUR_MS) return false;

        if ("company".equals(prefs.getString("ownership", "company"))) return true;

        try {
            JSONObject schedule = new JSONObject(prefs.getString("schedule", "{}"));
            if (!schedule.optBoolean("enabled", false)) return true;
            String zoneName = schedule.optString("timezone", "Asia/Kolkata");
            ZonedDateTime local = Instant.ofEpochMilli(serverTime + elapsed).atZone(ZoneId.of(zoneName));
            int currentDay = local.getDayOfWeek().getValue();
            int currentMinutes = local.getHour() * 60 + local.getMinute();
            int startMinutes = parseMinutes(schedule.optString("startTime"));
            int endMinutes = parseMinutes(schedule.optString("endTime"));
            if (startMinutes == endMinutes) return false;

            boolean overnight = startMinutes > endMinutes;
            int scheduleDay = overnight && currentMinutes < endMinutes
                    ? (currentDay == 1 ? 7 : currentDay - 1)
                    : currentDay;
            JSONArray workDays = schedule.optJSONArray("workDays");
            if (workDays == null || !containsDay(workDays, scheduleDay)) return false;

            return overnight
                    ? currentMinutes >= startMinutes || currentMinutes < endMinutes
                    : currentMinutes >= startMinutes && currentMinutes < endMinutes;
        } catch (Exception error) {
            return false;
        }
    }

    static boolean canAllowOnce(Context context) {
        return isActive(context)
                && preferences(context).getBoolean("allowEmployeeBypassWarning", false);
    }

    static boolean isSecretDetectionEnabled(Context context) {
        return isActive(context)
                && preferences(context).getBoolean("enableSecretDetection", true);
    }

    static boolean isPiiDetectionEnabled(Context context) {
        return isActive(context)
                && preferences(context).getBoolean("enablePiiDetection", true);
    }

    static void invalidate(Context context) {
        preferences(context).edit()
                .putBoolean("policyValidated", false)
                .putBoolean("allowEmployeeBypassWarning", false)
                .apply();
    }

    static String describeSchedule(Context context) {
        SharedPreferences prefs = preferences(context);
        if (!prefs.getBoolean("policyValidated", false)) {
            return "Company policy has not been synced. Connect to the internet to validate.";
        }
        if (prefs.getLong("bootCount", -1) != currentBootCount(context)) {
            return "Phone restarted. Reopen Krypton online to revalidate policy.";
        }
        if ("company".equals(prefs.getString("ownership", "company"))) {
            return "Company-owned device · policy is active 24/7 while validation is current.";
        }
        try {
            JSONObject schedule = new JSONObject(prefs.getString("schedule", "{}"));
            if (!schedule.optBoolean("enabled", false)) {
                return "Personal device · administrator schedule is disabled; policy is active while validation is current.";
            }
            return "Admin hours: " + schedule.optString("startTime", "09:00")
                    + "–" + schedule.optString("endTime", "18:00")
                    + " · " + schedule.optString("timezone", "Asia/Kolkata")
                    + " · " + (isActive(context) ? "active now" : "paused now");
        } catch (Exception error) {
            return "The administrator schedule is invalid. Protection is paused.";
        }
    }

    private static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static int currentBootCount(Context context) {
        return Settings.Global.getInt(context.getContentResolver(), Settings.Global.BOOT_COUNT, -1);
    }

    private static boolean containsDay(JSONArray days, int day) {
        for (int index = 0; index < days.length(); index++) {
            if (days.optInt(index, -1) == day) return true;
        }
        return false;
    }

    private static int parseMinutes(String value) {
        if (value == null || !value.matches("(?:[01]\\d|2[0-3]):[0-5]\\d")) {
            throw new IllegalArgumentException("Invalid administrator time.");
        }
        return Integer.parseInt(value.substring(0, 2)) * 60
                + Integer.parseInt(value.substring(3, 5));
    }
}
