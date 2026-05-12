package com.visioncamerazxing;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;

public class BitmapUtils {
  public static Bitmap base642Bitmap(String base64) {
    byte[] decode = Base64.decode(base64, Base64.DEFAULT);
    return BitmapFactory.decodeByteArray(decode, 0, decode.length);
  }
}
