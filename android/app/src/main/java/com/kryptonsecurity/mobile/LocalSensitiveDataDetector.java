package com.kryptonsecurity.mobile;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class LocalSensitiveDataDetector {
    private static final Pattern[] SECRET_PATTERNS = {
            Pattern.compile("\\bsk-(?!ant-)(?:proj-)?[A-Za-z0-9_-]{24,}\\b"),
            Pattern.compile("\\bsk-ant-(?:api03-)?[A-Za-z0-9_-]{32,}\\b"),
            Pattern.compile("\\bAKIA[0-9A-Z]{16}\\b"),
            Pattern.compile("\\bgh[pousr]_[A-Za-z0-9_]{36,255}\\b"),
            Pattern.compile("-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\\s\\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
            Pattern.compile("(?i)\\b(?:mongodb(?:\\+srv)?|postgres(?:ql)?|mysql|redis)://[^:\\s]+:[^@\\s]+@[^\\s]+"),
            Pattern.compile("(?i)\\b(?:password|passwd|passcode|api[_ ]?secret|client[_ ]?secret|jwt[_ ]?secret|secret[_ ]?key|database[_ ]?url|access[_ ]?token|refresh[_ ]?token)\\s*(?:[:=]|\\bis\\b)\\s*([^\\s,;]{6,})"),
            Pattern.compile("(?m)\\b[A-Z0-9_]*(?:SECRET|KEY|PASSWORD|TOKEN|AUTH|DATABASE_URL)[A-Z0-9_]*\\s*=\\s*[^\\s,;]{8,}")
    };

    private static final Pattern[] PII_PATTERNS = {
            Pattern.compile("(?i)\\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}\\b"),
            Pattern.compile("(?<!\\d)(?:\\+?91[ -]?)?[6-9]\\d{4}[ -]?\\d{5}(?!\\d)"),
            Pattern.compile("(?<!\\d)(?:\\d{4}[ -]?){2}\\d{4}(?!\\d)"),
            Pattern.compile("(?i)\\b[A-Z]{5}\\d{4}[A-Z]\\b"),
            Pattern.compile("(?<!\\d)\\d{3}-\\d{2}-\\d{4}(?!\\d)"),
            Pattern.compile("(?<!\\d)(?:\\d[ -]?){13,19}(?!\\d)")
    };

    private LocalSensitiveDataDetector() {}

    static Detection find(String text, boolean secretsEnabled, boolean piiEnabled) {
        if (text == null || text.isEmpty()) return null;
        if (secretsEnabled) {
            Detection detection = findAtCursor(text, SECRET_PATTERNS, "Credential or secret");
            if (detection != null) return detection;
        }
        if (piiEnabled) {
            for (int index = 0; index < PII_PATTERNS.length; index++) {
                Matcher matcher = PII_PATTERNS[index].matcher(text);
                while (matcher.find()) {
                    if (matcher.end() != text.length()) continue;
                    String match = matcher.group();
                    if (index == PII_PATTERNS.length - 1 && !passesLuhn(match)) continue;
                    return new Detection(match, piiCategory(index));
                }
            }
        }
        return null;
    }

    private static Detection findAtCursor(String text, Pattern[] patterns, String category) {
        for (Pattern pattern : patterns) {
            Matcher matcher = pattern.matcher(text);
            while (matcher.find()) {
                if (matcher.end() == text.length()) {
                    String match = matcher.groupCount() > 0 ? matcher.group(1) : matcher.group();
                    return new Detection(match, category);
                }
            }
        }
        return null;
    }

    private static String piiCategory(int patternIndex) {
        switch (patternIndex) {
            case 0:
                return "Email address";
            case 1:
                return "Phone number";
            case 2:
                return "Possible Aadhaar number";
            case 3:
                return "Possible PAN number";
            case 4:
                return "Possible SSN";
            default:
                return "Possible payment-card number";
        }
    }

    private static boolean passesLuhn(String value) {
        int sum = 0;
        int digits = 0;
        boolean doubleDigit = false;
        for (int index = value.length() - 1; index >= 0; index--) {
            char character = value.charAt(index);
            if (!Character.isDigit(character)) continue;
            int digit = Character.digit(character, 10);
            if (doubleDigit) {
                digit *= 2;
                if (digit > 9) digit -= 9;
            }
            sum += digit;
            digits++;
            doubleDigit = !doubleDigit;
        }
        return digits >= 13 && digits <= 19 && sum % 10 == 0;
    }

    static final class Detection {
        final String matchedText;
        final String category;

        Detection(String matchedText, String category) {
            this.matchedText = matchedText;
            this.category = category;
        }
    }
}
