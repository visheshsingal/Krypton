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

final class SecureSessionStore {
    private static final String PREFS = "krypton_android";
    private static final String KEY_ALIAS = "krypton_android_session_v1";
    private static final String ACCESS_TOKEN = "encryptedAccessToken";
    private static final String REFRESH_TOKEN = "encryptedRefreshToken";

    private SecureSessionStore() {}

    static void save(Context context, String accessToken, String refreshToken) throws Exception {
        SharedPreferences prefs = preferences(context);
        prefs.edit()
                .putString(ACCESS_TOKEN, encrypt(accessToken))
                .putString(REFRESH_TOKEN, encrypt(refreshToken))
                .apply();
    }

    static String accessToken(Context context) throws Exception {
        return decrypt(preferences(context).getString(ACCESS_TOKEN, null));
    }

    static String refreshToken(Context context) throws Exception {
        return decrypt(preferences(context).getString(REFRESH_TOKEN, null));
    }

    static void clear(Context context) {
        preferences(context).edit().remove(ACCESS_TOKEN).remove(REFRESH_TOKEN).apply();
    }

    private static String encrypt(String value) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
        byte[] iv = cipher.getIV();
        byte[] encrypted = cipher.doFinal(value.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        ByteBuffer output = ByteBuffer.allocate(1 + iv.length + encrypted.length);
        output.put((byte) iv.length);
        output.put(iv);
        output.put(encrypted);
        return Base64.encodeToString(output.array(), Base64.NO_WRAP);
    }

    private static String decrypt(String value) throws Exception {
        if (value == null || value.isEmpty()) return null;
        byte[] encoded = Base64.decode(value, Base64.NO_WRAP);
        ByteBuffer input = ByteBuffer.wrap(encoded);
        int ivLength = Byte.toUnsignedInt(input.get());
        if (ivLength < 12 || ivLength > 16 || input.remaining() <= ivLength) {
            throw new IllegalStateException("The saved sign-in session is invalid. Sign in again.");
        }
        byte[] iv = new byte[ivLength];
        input.get(iv);
        byte[] encrypted = new byte[input.remaining()];
        input.get(encrypted);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), new GCMParameterSpec(128, iv));
        return new String(cipher.doFinal(encrypted), java.nio.charset.StandardCharsets.UTF_8);
    }

    private static SecretKey getOrCreateKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        java.security.Key existing = keyStore.getKey(KEY_ALIAS, null);
        if (existing instanceof SecretKey secretKey) return secretKey;

        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
        ).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build());
        return generator.generateKey();
    }

    private static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
