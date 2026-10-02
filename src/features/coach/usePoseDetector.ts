import { useCallback, useEffect, useRef, useState } from 'react';
import { Asset } from 'expo-asset';
import { Platform } from 'react-native';
import { loadTensorflowModel, type TensorflowModelDelegate, type TfliteModel } from 'react-native-fast-tflite';
import { CommonResolutions, useFrameOutput, type CameraFrameOutput, type Frame } from 'react-native-vision-camera';
import { useResizer } from 'react-native-vision-camera-resizer';
import { scheduleOnRN } from 'react-native-worklets';
import { MOVENET_INPUT_SIZE, type FrameGeometry, type Orientation } from '@/core/movenet';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset reference
const MODEL = require('../../../assets/models/movenet_multipose_256.tflite');

/** Try GPU delegates first; the float16 model may not be supported everywhere. */
const DELEGATE_ORDER: TensorflowModelDelegate[][] = Platform.select({
  ios: [['core-ml'], []],
  android: [['android-gpu'], []],
  default: [[]],
});

type ModelState = { status: 'loading' } | { status: 'ready'; model: TfliteModel } | { status: 'error'; error: Error };

function useMoveNet(): ModelState {
  const [state, setState] = useState<ModelState>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let lastError: Error = new Error('No delegate worked');
      // In release builds the model is an Android resource ("assets_models_…"), which
      // fast-tflite's URL-based loader cannot open; copy it to a real file first.
      let url: string;
      try {
        const asset = await Asset.fromModule(MODEL).downloadAsync();
        url = asset.localUri ?? asset.uri;
      } catch (e) {
        if (!cancelled) setState({ status: 'error', error: e as Error });
        return;
      }
      for (const delegates of DELEGATE_ORDER) {
        try {
          const model = await loadTensorflowModel({ url }, delegates);
          if (!cancelled) setState({ status: 'ready', model });
          return;
        } catch (e) {
          lastError = e as Error;
          console.warn(`MoveNet failed with delegates [${delegates.join(',')}]: ${lastError.message}`);
        }
      }
      if (!cancelled) setState({ status: 'error', error: lastError });
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}

export interface Detection {
  /** Raw MoveNet output: 6 × 56 floats. */
  output: number[];
  geometry: FrameGeometry;
  timestamp: number;
}

/**
 * Runs MoveNet MultiPose on camera frames, on the camera's frame thread.
 * Results are delivered to `onDetection` on the JS thread, at most `maxFps`
 * times per second.
 */
export function usePoseDetector(onDetection: (d: Detection) => void, maxFps = 15) {
  const model = useMoveNet();
  const resizer = useResizer({
    width: MOVENET_INPUT_SIZE,
    height: MOVENET_INPUT_SIZE,
    channelOrder: 'rgb',
    dataType: 'uint8',
    // Letterbox instead of crop so feet and heads are never cut off.
    scaleMode: 'contain',
    pixelLayout: 'interleaved',
  });

  const callbackRef = useRef(onDetection);
  useEffect(() => {
    callbackRef.current = onDetection;
  }, [onDetection]);
  const lastDelivered = useRef(0);

  // Stable JS-thread receiver for worklet results (refs are only read when it runs).
  const [receive] = useState(
    () => (output: number[], width: number, height: number, orientation: string, mirrored: boolean) => {
      const now = Date.now();
      if (now - lastDelivered.current < 1000 / maxFps) return;
      lastDelivered.current = now;
      callbackRef.current({
        output,
        geometry: { bufferWidth: width, bufferHeight: height, orientation: orientation as Orientation, mirrored },
        timestamp: now,
      });
    },
  );

  const tflite = model.status === 'ready' ? model.model : undefined;
  const resize = resizer.state === 'ready' ? resizer.resizer : undefined;

  // Memoized so the worklet is only re-created when the model or resizer changes,
  // not on every render of the camera screen.
  const onFrame = useCallback(
    (frame: Frame) => {
      'worklet';
      if (tflite != null && resize != null) {
        const resized = resize.resize(frame);
        try {
          const outputs = tflite.runSync([resized.getPixelBuffer()]);
          const data = Array.from(new Float32Array(outputs[0]));
          scheduleOnRN(receive, data, frame.width, frame.height, frame.orientation, frame.isMirrored);
        } finally {
          resized.dispose();
        }
      }
      frame.dispose();
    },
    [tflite, resize, receive],
  );
  const onFrameDropped = useCallback(() => {
    // Expected while inference is busy; dropping frames keeps latency low.
  }, []);

  const frameOutput: CameraFrameOutput = useFrameOutput({
    targetResolution: CommonResolutions.HD_16_9,
    pixelFormat: 'yuv',
    // Upright buffers keep the coordinate math simple.
    enablePhysicalBufferRotation: true,
    dropFramesWhileBusy: true,
    onFrame,
    onFrameDropped,
  });

  const error = model.status === 'error' ? model.error : resizer.state === 'error' ? resizer.error : null;
  return {
    frameOutput,
    ready: tflite != null && resize != null,
    error,
  };
}
