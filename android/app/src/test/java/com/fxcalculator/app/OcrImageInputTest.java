package com.fxcalculator.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;

import org.junit.Test;

public class OcrImageInputTest {
    @Test
    public void decodeImageBytes_rejectsEmptyInput() {
        assertThrows(IllegalArgumentException.class, () -> OcrImageInput.decodeImageBytes(" "));
    }

    @Test
    public void stripDataUrlPrefix_removesMetadata() {
        assertEquals("AQID", OcrImageInput.stripDataUrlPrefix("data:image/png;base64,AQID"));
    }
}
