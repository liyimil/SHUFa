import { useEffect, useMemo, useRef, useState } from "react";
import {
  Image,
  type LayoutChangeEvent,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  containedImageLayout,
  cropFrameToPixels,
  type CropFrame,
  type ImageBounds,
  initialCropFrame,
  moveCropFrame,
  type PixelCropRect,
  type QuarterTurn,
  resizeCropFrame,
  turnQuarter,
} from "./artwork-crop";

export interface CropEditorSource extends ImageBounds {
  uri: string;
}

interface ArtworkCropEditorProps {
  busy: boolean;
  onCancel: () => void;
  onConfirm: (crop: PixelCropRect, rotation: QuarterTurn) => void;
  source: CropEditorSource;
}

const rotationLabels: Record<QuarterTurn, string> = {
  0: "保持原方向",
  90: "裁切后顺时针旋转 90°",
  180: "裁切后旋转 180°",
  270: "裁切后逆时针旋转 90°",
};

export function ArtworkCropEditor({
  busy,
  onCancel,
  onConfirm,
  source,
}: ArtworkCropEditorProps) {
  const bounds = useMemo(
    () => ({ height: source.height, width: source.width }),
    [source.height, source.width],
  );
  const [frame, setFrame] = useState<CropFrame>(() => initialCropFrame(bounds));
  const [rotation, setRotation] = useState<QuarterTurn>(0);
  const [canvas, setCanvas] = useState<ImageBounds>({ height: 1, width: 1 });
  const frameRef = useRef(frame);
  const dragStartRef = useRef(frame);
  const display = containedImageLayout(bounds, canvas);
  const displayRef = useRef(display);

  useEffect(() => {
    frameRef.current = frame;
    displayRef.current = display;
  }, [display, frame]);

  // PanResponder stores these callbacks and only reads the refs after a gesture.
  // eslint-disable-next-line react-hooks/refs
  const panResponder = PanResponder.create({
    onMoveShouldSetPanResponder: () => !busy,
    onPanResponderGrant: () => {
      dragStartRef.current = frameRef.current;
    },
    onPanResponderMove: (_event, gesture) => {
      const scale = displayRef.current.scale;
      if (!scale) return;
      setFrame(
        moveCropFrame(
          dragStartRef.current,
          gesture.dx / scale,
          gesture.dy / scale,
          bounds,
        ),
      );
    },
    onStartShouldSetPanResponder: () => !busy,
  });

  function handleCanvasLayout(event: LayoutChangeEvent): void {
    const { height, width } = event.nativeEvent.layout;
    setCanvas({ height, width });
  }

  function nudge(deltaX: number, deltaY: number): void {
    setFrame((current) => moveCropFrame(current, deltaX, deltaY, bounds));
  }

  function nudgeStep(): number {
    return Math.max(8, frame.size * 0.04);
  }

  const cropLeft = display.left + frame.x * display.scale;
  const cropTop = display.top + frame.y * display.scale;
  const cropSize = frame.size * display.scale;
  const imageRight = display.left + display.width;
  const imageBottom = display.top + display.height;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.eyebrow}>单字裁切与方向修正</Text>
      <Text style={styles.title}>让字完整落在方框内</Text>
      <Text style={styles.helper}>
        拖动方框定位，使用按钮调整边界；四周保留少量纸面。旋转会在裁切后应用，原图不会被覆盖。
      </Text>

      <View
        accessibilityLabel="单字裁切画布，可拖动方框调整位置"
        onLayout={handleCanvasLayout}
        style={styles.canvas}
      >
        <Image
          resizeMode="contain"
          source={{ uri: source.uri }}
          style={styles.image}
        />
        <View
          pointerEvents="none"
          style={[
            styles.mask,
            {
              height: Math.max(0, cropTop - display.top),
              left: display.left,
              top: display.top,
              width: display.width,
            },
          ]}
        />
        <View
          pointerEvents="none"
          style={[
            styles.mask,
            {
              height: Math.max(0, imageBottom - cropTop - cropSize),
              left: display.left,
              top: cropTop + cropSize,
              width: display.width,
            },
          ]}
        />
        <View
          pointerEvents="none"
          style={[
            styles.mask,
            {
              height: cropSize,
              left: display.left,
              top: cropTop,
              width: Math.max(0, cropLeft - display.left),
            },
          ]}
        />
        <View
          pointerEvents="none"
          style={[
            styles.mask,
            {
              height: cropSize,
              left: cropLeft + cropSize,
              top: cropTop,
              width: Math.max(0, imageRight - cropLeft - cropSize),
            },
          ]}
        />
        <View
          accessibilityLabel="可拖动的单字选框"
          accessibilityRole="adjustable"
          {...panResponder.panHandlers}
          style={[
            styles.cropFrame,
            {
              height: cropSize,
              left: cropLeft,
              top: cropTop,
              width: cropSize,
            },
          ]}
        >
          <View
            pointerEvents="none"
            style={[styles.gridLine, styles.gridVerticalOne]}
          />
          <View
            pointerEvents="none"
            style={[styles.gridLine, styles.gridVerticalTwo]}
          />
          <View
            pointerEvents="none"
            style={[styles.gridLine, styles.gridHorizontalOne]}
          />
          <View
            pointerEvents="none"
            style={[styles.gridLine, styles.gridHorizontalTwo]}
          />
        </View>
      </View>

      <Text accessibilityLiveRegion="polite" style={styles.status}>
        选框 {Math.round(frame.size)} × {Math.round(frame.size)} 像素；
        {rotationLabels[rotation]}
      </Text>

      <View style={styles.controlGroup}>
        <Text style={styles.controlLabel}>边界大小</Text>
        <View style={styles.buttonRow}>
          <ControlButton
            disabled={busy}
            label="收紧选框"
            onPress={() =>
              setFrame((current) => resizeCropFrame(current, 0.85, bounds))
            }
          />
          <ControlButton
            disabled={busy}
            label="放宽选框"
            onPress={() =>
              setFrame((current) => resizeCropFrame(current, 1.15, bounds))
            }
          />
          <ControlButton
            disabled={busy}
            label="恢复全框"
            onPress={() => setFrame(initialCropFrame(bounds))}
          />
        </View>
      </View>

      <View style={styles.controlGroup}>
        <Text style={styles.controlLabel}>精确移动</Text>
        <View style={styles.buttonRow}>
          <ControlButton
            disabled={busy}
            label="上移"
            onPress={() => nudge(0, -nudgeStep())}
          />
          <ControlButton
            disabled={busy}
            label="下移"
            onPress={() => nudge(0, nudgeStep())}
          />
          <ControlButton
            disabled={busy}
            label="左移"
            onPress={() => nudge(-nudgeStep(), 0)}
          />
          <ControlButton
            disabled={busy}
            label="右移"
            onPress={() => nudge(nudgeStep(), 0)}
          />
        </View>
      </View>

      <View style={styles.controlGroup}>
        <Text style={styles.controlLabel}>输出方向</Text>
        <View style={styles.buttonRow}>
          <ControlButton
            disabled={busy}
            label="向左转 90°"
            onPress={() => setRotation((current) => turnQuarter(current, -1))}
          />
          <ControlButton
            disabled={busy}
            label="向右转 90°"
            onPress={() => setRotation((current) => turnQuarter(current, 1))}
          />
        </View>
      </View>

      <View style={styles.actionRow}>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={onCancel}
          style={[styles.cancelButton, busy ? styles.disabledButton : null]}
        >
          <Text style={styles.cancelText}>取消</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => onConfirm(cropFrameToPixels(frame, bounds), rotation)}
          style={[styles.confirmButton, busy ? styles.disabledButton : null]}
        >
          <Text style={styles.confirmText}>
            {busy ? "正在生成…" : "确认裁切"}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function ControlButton({
  disabled,
  label,
  onPress,
}: {
  disabled: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.controlButton, disabled ? styles.disabledButton : null]}
    >
      <Text style={styles.controlButtonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actionRow: { flexDirection: "row", gap: 12, marginTop: 8 },
  buttonRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  cancelButton: {
    alignItems: "center",
    borderColor: "#8C3C2D",
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    padding: 14,
  },
  cancelText: { color: "#8C3C2D", fontSize: 16, fontWeight: "700" },
  canvas: {
    alignSelf: "center",
    aspectRatio: 1,
    backgroundColor: "#17130F",
    borderRadius: 12,
    maxWidth: 520,
    overflow: "hidden",
    position: "relative",
    width: "100%",
  },
  confirmButton: {
    alignItems: "center",
    backgroundColor: "#8C3C2D",
    borderRadius: 10,
    flex: 1,
    padding: 14,
  },
  confirmText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  container: { gap: 16, padding: 20, paddingBottom: 40 },
  controlButton: {
    backgroundColor: "#F4E8D8",
    borderColor: "#C9B59C",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  controlButtonText: { color: "#5B3028", fontSize: 14, fontWeight: "700" },
  controlGroup: { gap: 8 },
  controlLabel: { color: "#5E554E", fontSize: 14, fontWeight: "700" },
  cropFrame: {
    borderColor: "#FFFFFF",
    borderRadius: 2,
    borderWidth: 2,
    position: "absolute",
  },
  disabledButton: { opacity: 0.5 },
  eyebrow: {
    color: "#8C3C2D",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 2,
  },
  gridHorizontalOne: { left: 0, right: 0, top: "33.333%", height: 1 },
  gridHorizontalTwo: { left: 0, right: 0, top: "66.666%", height: 1 },
  gridLine: { backgroundColor: "rgba(255,255,255,0.55)", position: "absolute" },
  gridVerticalOne: { bottom: 0, left: "33.333%", top: 0, width: 1 },
  gridVerticalTwo: { bottom: 0, left: "66.666%", top: 0, width: 1 },
  helper: { color: "#5E554E", fontSize: 15, lineHeight: 23 },
  image: { bottom: 0, left: 0, position: "absolute", right: 0, top: 0 },
  mask: { backgroundColor: "rgba(0,0,0,0.58)", position: "absolute" },
  status: { color: "#5E554E", fontSize: 14, textAlign: "center" },
  title: { color: "#241E1A", fontSize: 28, fontWeight: "800" },
});
