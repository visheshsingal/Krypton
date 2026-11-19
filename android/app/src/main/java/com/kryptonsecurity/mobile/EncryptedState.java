package com.kryptonsecurity.mobile;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.nio.ByteBuffer;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

final class EncryptedState {
    private static final String KEY_ALIAS = "krypton_android_auth_v2";
    private static final String PREFS = "krypton_android_private_state";
    private static final String ACCESS_TOKEN = "access_token";
    private static final String REFRESH_TOKEN = "refresh_token";

    private final SharedPreferences preferences;

    EncryptedState(Context context) {
        preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    synchronized String getAccessToken() throws Exception {
        return decrypt(preferences.getString(ACCESS_TOKEN, null));
    }

    synchronized String getRefreshToken() throws Exception {
        return decrypt(preferences.getString(REFRESH_TOKEN, null));
    }

    synchronized void saveTokens(String accessToken, String refreshToken) throws Exception {
        preferences.edit()
                .putString(ACCESS_TOKEN, encrypt(accessToken))
                .putString(REFRESH_TOKEN, encrypt(refreshToken))
                .apply();
    }

    synchronized void clearTokens() {
        preferences.edit().remove(ACCESS_TOKEN).remove(REFRESH_TOKEN).apply();
    }

    private String encrypt(String value) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
        byte[] iv = cipher.getIV();
        if (iv == null || iv.length != 12) {
            throw new IllegalStateException("Android Keystore returned an invalid encryption IV.");
        }
        byte[] ciphertext = cipher.doFinal(value.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        ByteBuffer result = ByteBuffer.allocate(iv.length + ciphertext.length);
        result.put(iv);
        result.put(ciphertext);
        return Base64.encodeToString(result.array(), Base64.NO_WRAP);
    }

    private String decrypt(String encoded) throws Exception {
        if (encoded == null || encoded.isEmpty()) return "";
        byte[] value = Base64.decode(encoded, Base64.NO_WRAP);
        if (value.length < 29) throw new IllegalStateException("Stored authentication data is invalid.");
        ByteBuffer input = ByteBuffer.wrap(value);
        byte[] iv = new byte[12];
        input.get(iv);
        byte[] ciphertext = new byte[input.remaining()];
        input.get(ciphertext);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), new GCMParameterSpec(128, iv));
        return new String(cipher.doFinal(ciphertext), java.nio.charset.StandardCharsets.UTF_8);
    }

    private SecretKey getOrCreateKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        java.security.Key existing = keyStore.getKey(KEY_ALIAS, null);
        if (existing instanceof SecretKey) return (SecretKey) existing;

        KeyGenerator generator = KeyGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_AES,
                "AndroidKeyStore"
        );
        generator.init(new KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
        ).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(false)
                .build());
        return generator.generateKey();
    }
}
