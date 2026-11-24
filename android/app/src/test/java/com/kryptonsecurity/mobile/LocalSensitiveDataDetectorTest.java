package com.kryptonsecurity.mobile;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

public final class LocalSensitiveDataDetectorTest {
    @Test
    public void detectsLabeledPasswordAndKeepsOnlyTheSensitiveValue() {
        LocalSensitiveDataDetector.Detection result = LocalSensitiveDataDetector.find(
                "My password is Demo-Pass-123!",
                true,
                true
        );

        assertEquals("Demo-Pass-123!", result.matchedText);
        assertEquals("Credential or secret", result.category);
    }

    @Test
    public void detectsApiTokens() {
        LocalSensitiveDataDetector.Detection result = LocalSensitiveDataDetector.find(
                "sk-proj-ABCDEFGHIJKLMNOPQRSTUVWXYZ123456",
                true,
                true
        );

        assertEquals("Credential or secret", result.category);
    }

    @Test
    public void detectsPersonalInformation() {
        assertEquals("Email address", find("Contact me at person@example.com").category);
        assertEquals("Phone number", find("My number is 98765 43210").category);
        assertEquals("Possible Aadhaar number", find("1234 5678 9012").category);
        assertEquals("Possible PAN number", find("ABCDE1234F").category);
        assertEquals("Possible SSN", find("123-45-6789").category);
        assertEquals("Possible payment-card number", find("4111 1111 1111 1111").category);
    }

    @Test
    public void ignoresOrdinaryQuestionsAndInvalidCardNumbers() {
        assertNull(find("What is the weather in Delhi today?"));
        assertNull(find("4111 1111 1111 1112"));
    }

    @Test
    public void respectsAdministratorDetectionSwitches() {
        assertNull(LocalSensitiveDataDetector.find(
                "person@example.com",
                true,
                false
        ));
        assertNull(LocalSensitiveDataDetector.find(
                "sk-proj-ABCDEFGHIJKLMNOPQRSTUVWXYZ123456",
                false,
                true
        ));
    }

    private LocalSensitiveDataDetector.Detection find(String text) {
        return LocalSensitiveDataDetector.find(text, true, true);
    }
}
