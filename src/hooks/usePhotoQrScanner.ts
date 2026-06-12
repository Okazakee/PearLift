import { fromByteArray } from 'base64-js';
import { useEffect, useRef } from 'react';
import {
  CommonResolutions,
  useCameraDevice,
  useCameraPermission,
  usePhotoOutput,
} from 'react-native-vision-camera';
import { decodeBase64 } from 'vision-camera-zxing';

interface UsePhotoQrScannerOptions {
  open: boolean;
  processing: boolean;
  onPayload: (payload: string) => Promise<void>;
}

interface UsePhotoQrScannerResult {
  permission: ReturnType<typeof useCameraPermission>;
  device: ReturnType<typeof useCameraDevice>;
  photoOutput: ReturnType<typeof usePhotoOutput>;
}

export function usePhotoQrScanner({
  open,
  processing,
  onPayload,
}: UsePhotoQrScannerOptions): UsePhotoQrScannerResult {
  const permission = useCameraPermission();
  const device = useCameraDevice('back');
  const photoOutput = usePhotoOutput({
    targetResolution: CommonResolutions.LOWEST_4_3,
    containerFormat: 'jpeg',
    quality: 0.65,
    qualityPrioritization: 'speed',
  });
  const scanLoopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const captureInFlightRef = useRef(false);

  useEffect(() => {
    if (!open || !permission.hasPermission || !device) return;

    let cancelled = false;

    const queueNextCapture = (delayMs: number) => {
      if (scanLoopTimeoutRef.current) {
        clearTimeout(scanLoopTimeoutRef.current);
      }
      scanLoopTimeoutRef.current = setTimeout(() => {
        if (cancelled) return;
        void captureAndDecode();
      }, delayMs);
    };

    const captureAndDecode = async () => {
      if (cancelled || captureInFlightRef.current || processing) {
        queueNextCapture(400);
        return;
      }

      captureInFlightRef.current = true;
      let nextDelayMs = 350;

      try {
        const photo = await photoOutput.capturePhoto(
          { enableShutterSound: false },
          {},
        );
        try {
          const fileData = await photo.getFileDataAsync();
          const qrResults = await decodeBase64(
            fromByteArray(new Uint8Array(fileData)),
            { multiple: true },
          );
          const payload = qrResults.find(
            (result) => result.barcodeText,
          )?.barcodeText;
          if (payload) {
            nextDelayMs = 900;
            await onPayload(payload);
          }
        } finally {
          photo.dispose();
        }
      } catch {
        nextDelayMs = 700;
      } finally {
        captureInFlightRef.current = false;
      }

      if (!cancelled) {
        queueNextCapture(nextDelayMs);
      }
    };

    queueNextCapture(250);

    return () => {
      cancelled = true;
      captureInFlightRef.current = false;
      if (scanLoopTimeoutRef.current) {
        clearTimeout(scanLoopTimeoutRef.current);
        scanLoopTimeoutRef.current = null;
      }
    };
  }, [
    device,
    onPayload,
    open,
    permission.hasPermission,
    photoOutput,
    processing,
  ]);

  return {
    permission,
    device,
    photoOutput,
  };
}
