package com.fxcalculator.app;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;

@CapacitorPlugin(name = "Ocr")
public class OcrPlugin extends Plugin {
    @PluginMethod
    public void recognizeText(PluginCall call) {
        String imageValue = call.getString("image");
        if (imageValue == null || imageValue.trim().isEmpty()) {
            call.reject("Image is required.");
            return;
        }

        byte[] imageBytes;
        try {
            imageBytes = OcrImageInput.decodeImageBytes(imageValue);
        } catch (IllegalArgumentException error) {
            call.reject("Unable to decode that image.");
            return;
        }

        Bitmap bitmap = BitmapFactory.decodeByteArray(imageBytes, 0, imageBytes.length);
        if (bitmap == null) {
            call.reject("Unable to decode that image.");
            return;
        }

        InputImage image = InputImage.fromBitmap(bitmap, 0);
        TextRecognizer recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
        recognizer
            .process(image)
            .addOnSuccessListener(visionText -> {
                JSObject result = new JSObject();
                result.put("text", visionText.getText());
                call.resolve(result);
            })
            .addOnFailureListener(error -> call.reject("Unable to recognize text in that image.", error))
            .addOnCompleteListener(task -> recognizer.close());
    }
}
