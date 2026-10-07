package com.fxcalculator.app;

import android.util.Base64;

public final class OcrImageInput {
    private OcrImageInput() {}

    public static byte[] decodeImageBytes(String imageValue) {
        if (imageValue == null || imageValue.trim().isEmpty()) {
            throw new IllegalArgumentException("Image is required.");
        }

        String base64Value = stripDataUrlPrefix(imageValue.trim());
        return Base64.decode(base64Value, Base64.DEFAULT);
    }

    static String stripDataUrlPrefix(String imageValue) {
        int commaIndex = imageValue.indexOf(",");
        return commaIndex >= 0 ? imageValue.substring(commaIndex + 1) : imageValue;
    }
}
