import * as ImagePicker from "expo-image-picker";
import * as SecureStore from "expo-secure-store";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  type GestureResponderEvent,
  Image,
  PanResponder,
  Pressable,
  SafeAreaView,
  Share,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  addPracticeAttempt,
  ApiRequestError,
  cancelArtworkUpload,
  completeArtworkUpload,
  confirmArtworkCharacter,
  createAnonymousSession,
  createArtworkUpload,
  createFavoriteGroup,
  deleteArtwork,
  deleteFavoriteGroup,
  createPractice,
  createPracticeShare,
  type ArtworkMimeType,
  type CatalogFilters,
  type CatalogGlyph,
  type CatalogResult,
  fetchCatalog,
  fetchGlyphDetail,
  favoriteGlyph,
  type FavoriteGlyphItem,
  type FavoriteLibrary,
  type FeedbackKind,
  type FeedbackTicket,
  getPrivacyPreferences,
  type IdentitySession,
  type GlyphDetail,
  listPractices,
  listFavoriteLibrary,
  listFeedback,
  type QualityFinding,
  type StructureMetrics,
  refreshAnonymousSession,
  reorderFavoriteGlyph,
  reorderFavoriteGroup,
  revokePracticeShare,
  submitAdviceFeedback,
  submitFeedback,
  type PracticeView,
  type PrivacyPreferences,
  type ProductEventName,
  trackProductEvent,
  upgradeAnonymousSession,
  updatePrivacyPreferences,
  placeFavoriteGlyph,
  unfavoriteGlyph,
  waitForArtworkAnalysis,
  waitForArtworkDeletion,
  waitForPracticeAdvice,
} from "./api";
import {
  type ArtworkDraft,
  clearArtworkDraft,
  markArtworkDraftSubmitted,
  restoreArtworkDraft,
  saveArtworkDraft,
  updateArtworkDraft,
} from "./artwork-draft";
import { createExpoArtworkDraftStore } from "./artwork-draft-storage";
import {
  adjustComparisonRotation,
  adjustComparisonScale,
  beginComparisonGesture,
  type ComparisonTransform,
  defaultComparisonTransform,
  type GestureSnapshot,
  type TouchPoint,
  updateComparisonGesture,
} from "./comparison-transform";
import { toggleHistoricalAttempt } from "./history-comparison";

const accessTokenKey = "calligraphy-access-token";
const identitySessionKey = "calligraphy-identity-session-v1";
const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? "";
const artworkDraftStore = createExpoArtworkDraftStore();

const feedbackKindLabels: Record<FeedbackKind, string> = {
  CONTENT_ERROR: "范字或出处问题",
  PRODUCT: "产品建议",
  QUALITY_RESULT: "图片质量判断问题",
  RECOGNITION_ERROR: "识别错误",
  STRUCTURE_ADVICE: "结构提示问题",
};

const feedbackStatusLabels: Record<FeedbackTicket["status"], string> = {
  DISMISSED: "已关闭",
  IN_PROGRESS: "处理中",
  OPEN: "待处理",
  RESOLVED: "已解决",
};

interface StoredIdentitySession {
  accessExpiresAt: number;
  accessToken: string;
  refreshExpiresAt: number;
  refreshToken: string;
}

interface HistoricalAttemptView {
  artworkId: string;
  attempt: PracticeView["attempts"][number];
  character: string;
  practiceId: string;
}

type UploadState =
  | "idle"
  | "uploading"
  | "cancelling"
  | "analyzing"
  | "passed"
  | "fallback"
  | "retake"
  | "error";

interface ActiveUploadRun {
  artwork: ArtworkDraft;
  cancelPromise: Promise<void> | null;
  cancelRequested: boolean;
  cleanupFailed: boolean;
  controller: AbortController;
  renewPromise: Promise<boolean> | null;
  uploadId: string | null;
}

type PrivacyBooleanKey =
  "allowArtworkStorage" | "allowPublicSharing" | "allowModelTraining";

function isArtworkMimeType(value: string): value is ArtworkMimeType {
  return ["image/jpeg", "image/png", "image/webp"].includes(value);
}

function createUploadRequestId(): string {
  // This identifies retries of one local selection; it is not an auth token.
  return `mobile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function createProductEventId(): string {
  // Product-event idempotency only; authentication continues to use tokens.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (marker) => {
    const random = Math.floor(Math.random() * 16);
    return (marker === "x" ? random : (random & 0x3) | 0x8).toString(16);
  });
}

function isStructureMetrics(value: unknown): value is StructureMetrics {
  if (!value || typeof value !== "object") return false;
  const metrics = value as Record<string, unknown>;
  const unitFields = [
    "bbox_height_ratio",
    "bbox_left_ratio",
    "bbox_top_ratio",
    "bbox_width_ratio",
    "centroid_x",
    "centroid_y",
  ];
  return (
    unitFields.every(
      (field) =>
        typeof metrics[field] === "number" &&
        Number.isFinite(metrics[field]) &&
        (metrics[field] as number) >= 0 &&
        (metrics[field] as number) <= 1,
    ) &&
    typeof metrics.ink_aspect_ratio === "number" &&
    Number.isFinite(metrics.ink_aspect_ratio) &&
    metrics.ink_aspect_ratio > 0 &&
    (metrics.bbox_left_ratio as number) +
      (metrics.bbox_width_ratio as number) <=
      1.001 &&
    (metrics.bbox_top_ratio as number) +
      (metrics.bbox_height_ratio as number) <=
      1.001
  );
}

function touchPoints(event: GestureResponderEvent): TouchPoint[] {
  return event.nativeEvent.touches.slice(0, 2).map((touch) => ({
    x: touch.pageX,
    y: touch.pageY,
  }));
}

function StructureGuide({
  color,
  metrics,
}: {
  color: string;
  metrics: StructureMetrics;
}) {
  return (
    <View pointerEvents="none" style={styles.structureGuideLayer}>
      <View
        style={[
          styles.structureBoundingBox,
          {
            borderColor: color,
            height: `${metrics.bbox_height_ratio * 100}%`,
            left: `${metrics.bbox_left_ratio * 100}%`,
            top: `${metrics.bbox_top_ratio * 100}%`,
            width: `${metrics.bbox_width_ratio * 100}%`,
          },
        ]}
      />
      <View
        style={[
          styles.structureCentroid,
          {
            backgroundColor: color,
            left: `${metrics.centroid_x * 100}%`,
            top: `${metrics.centroid_y * 100}%`,
          },
        ]}
      />
    </View>
  );
}

export default function App() {
  const [artwork, setArtwork] = useState<ArtworkDraft | null>(null);
  const artworkSelectionStartedRef = useRef(false);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const activeUploadRunRef = useRef<ActiveUploadRun | null>(null);
  const [uploadCleanupPending, setUploadCleanupPending] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [qualityFindings, setQualityFindings] = useState<QualityFinding[]>([]);
  const [artworkId, setArtworkId] = useState<string | null>(null);
  const [characterInput, setCharacterInput] = useState("");
  const [glyphs, setGlyphs] = useState<CatalogGlyph[]>([]);
  const [catalogFacets, setCatalogFacets] = useState<CatalogResult["facets"]>({
    calligraphers: [],
    scriptStyles: [],
    works: [],
  });
  const [catalogFilters, setCatalogFilters] = useState<CatalogFilters>({});
  const [selectedGlyph, setSelectedGlyph] = useState<CatalogGlyph | null>(null);
  const [glyphDetail, setGlyphDetail] = useState<GlyphDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [comparisonMode, setComparisonMode] = useState<"side" | "overlay">(
    "side",
  );
  const [masterOpacity, setMasterOpacity] = useState(0.5);
  const [overlayTransform, setOverlayTransform] = useState<ComparisonTransform>(
    defaultComparisonTransform,
  );
  const overlayTransformRef = useRef<ComparisonTransform>(
    defaultComparisonTransform,
  );
  const gestureSnapshotRef = useRef<GestureSnapshot | null>(null);
  const [guidesVisible, setGuidesVisible] = useState(true);
  const [userSideScale, setUserSideScale] = useState(1);
  const [masterSideScale, setMasterSideScale] = useState(1);
  const overlayPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          gestureSnapshotRef.current = beginComparisonGesture(
            overlayTransformRef.current,
            touchPoints(event),
          );
        },
        onPanResponderMove: (event) => {
          const touches = touchPoints(event);
          const snapshot = gestureSnapshotRef.current;
          if (!snapshot) {
            gestureSnapshotRef.current = beginComparisonGesture(
              overlayTransformRef.current,
              touches,
            );
            return;
          }
          const next = updateComparisonGesture(snapshot, touches);
          if (!next) {
            gestureSnapshotRef.current = beginComparisonGesture(
              overlayTransformRef.current,
              touches,
            );
            return;
          }
          overlayTransformRef.current = next;
          setOverlayTransform(next);
        },
        onPanResponderRelease: () => {
          gestureSnapshotRef.current = null;
        },
        onPanResponderTerminate: () => {
          gestureSnapshotRef.current = null;
        },
        onPanResponderTerminationRequest: () => false,
        onStartShouldSetPanResponder: () => true,
      }),
    [],
  );
  const [practice, setPractice] = useState<PracticeView | null>(null);
  const [currentArtworkSaved, setCurrentArtworkSaved] = useState(false);
  const [activeShareId, setActiveShareId] = useState<string | null>(null);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackTickets, setFeedbackTickets] = useState<FeedbackTicket[]>([]);
  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [practiceHistory, setPracticeHistory] = useState<PracticeView[]>([]);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historicalComparison, setHistoricalComparison] = useState<
    HistoricalAttemptView[]
  >([]);
  const [favoriteLibrary, setFavoriteLibrary] =
    useState<FavoriteLibrary | null>(null);
  const [favoritesVisible, setFavoritesVisible] = useState(false);
  const [favoritesLoading, setFavoritesLoading] = useState(false);
  const [favoriteGroupName, setFavoriteGroupName] = useState("");
  const [privacy, setPrivacy] = useState<PrivacyPreferences | null>(null);
  const [privacyVisible, setPrivacyVisible] = useState(false);
  const [privacyLoading, setPrivacyLoading] = useState(false);

  useEffect(() => {
    let active = true;
    void restoreArtworkDraft(artworkDraftStore)
      .then((draft) => {
        if (!active || !draft || artworkSelectionStartedRef.current) return;
        setArtwork(draft);
        setStatusMessage(
          "已恢复上次未提交的本地草稿，可继续上传；图片尚未发送到服务器。",
        );
      })
      .catch(() => {
        if (active && !artworkSelectionStartedRef.current) {
          setStatusMessage(
            "本地草稿暂时无法读取，你仍可重新拍摄或从相册选择。",
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);

  async function loadPrivacyPreferences(): Promise<void> {
    if (privacyVisible) {
      setPrivacyVisible(false);
      return;
    }
    setPrivacyLoading(true);
    try {
      const accessToken = await getAccessToken();
      setPrivacy(await getPrivacyPreferences(apiBaseUrl, accessToken));
      setPrivacyVisible(true);
    } catch (error: unknown) {
      setStatusMessage(
        error instanceof Error ? error.message : "隐私设置加载失败。",
      );
    } finally {
      setPrivacyLoading(false);
    }
  }

  function changePrivacyPreference(
    key: PrivacyBooleanKey,
    enabled: boolean,
  ): void {
    if (key === "allowArtworkStorage" && !enabled) {
      Alert.alert(
        "关闭新作品存储？",
        "关闭后不能上传新的练习图片；已有图片不会自动删除，可在练习记录中逐张确认删除。",
        [
          { style: "cancel", text: "取消" },
          {
            onPress: () => void savePrivacyPreference(key, enabled),
            style: "destructive",
            text: "确认关闭",
          },
        ],
      );
      return;
    }
    void savePrivacyPreference(key, enabled);
  }

  async function savePrivacyPreference(
    key: PrivacyBooleanKey,
    enabled: boolean,
  ): Promise<void> {
    setPrivacyLoading(true);
    try {
      const accessToken = await getAccessToken();
      const updated = await updatePrivacyPreferences(apiBaseUrl, accessToken, {
        [key]: enabled,
      });
      setPrivacy(updated);
      if (key === "allowPublicSharing" && !enabled) {
        setActiveShareId(null);
        setStatusMessage("公开分享已关闭，现有分享链接也已撤销。");
      } else {
        setStatusMessage("隐私设置已保存，并记录授权变更时间。");
      }
    } catch (error: unknown) {
      setStatusMessage(
        error instanceof Error ? error.message : "隐私设置保存失败。",
      );
    } finally {
      setPrivacyLoading(false);
    }
  }

  async function loadPracticeHistory(): Promise<void> {
    if (historyVisible) {
      setHistoryVisible(false);
      return;
    }
    setHistoryLoading(true);
    try {
      const accessToken = await getAccessToken();
      setPracticeHistory(await listPractices(apiBaseUrl, accessToken));
      setHistoricalComparison([]);
      setHistoryVisible(true);
    } catch (error: unknown) {
      setStatusMessage(
        error instanceof Error ? error.message : "练习记录加载失败。",
      );
    } finally {
      setHistoryLoading(false);
    }
  }

  function toggleHistoryComparison(candidate: HistoricalAttemptView): void {
    const result = toggleHistoricalAttempt(historicalComparison, candidate);
    if (result.error === "CHARACTER_MISMATCH") {
      setStatusMessage("请选择同一个字的两次作品进行对比。");
      return;
    }
    setHistoricalComparison(result.selected);
    setStatusMessage(
      result.selected.length === 2
        ? "已选好两次作品，可在练习记录顶部并排查看。"
        : "请选择同一个字的另一次作品。",
    );
  }

  async function refreshFavoriteLibrary(accessToken?: string): Promise<void> {
    const token = accessToken ?? (await getAccessToken());
    setFavoriteLibrary(await listFavoriteLibrary(apiBaseUrl, token));
  }

  async function loadFavorites(): Promise<void> {
    if (favoritesVisible) {
      setFavoritesVisible(false);
      return;
    }
    setFavoritesLoading(true);
    try {
      await refreshFavoriteLibrary();
      setFavoritesVisible(true);
    } catch (error: unknown) {
      setStatusMessage(
        error instanceof Error ? error.message : "收藏字帖加载失败。",
      );
    } finally {
      setFavoritesLoading(false);
    }
  }

  async function updateFavorites(
    action: (accessToken: string) => Promise<void>,
    successMessage: string,
  ): Promise<void> {
    setFavoritesLoading(true);
    try {
      const accessToken = await getAccessToken();
      await action(accessToken);
      await refreshFavoriteLibrary(accessToken);
      setStatusMessage(successMessage);
    } catch (error: unknown) {
      setStatusMessage(
        error instanceof Error ? error.message : "收藏字帖更新失败。",
      );
    } finally {
      setFavoritesLoading(false);
    }
  }

  async function addFavoriteGroup(): Promise<void> {
    const name = favoriteGroupName.trim();
    if (!name) {
      setStatusMessage("请先填写分组名称。");
      return;
    }
    await updateFavorites(async (accessToken) => {
      await createFavoriteGroup(apiBaseUrl, accessToken, name);
      setFavoriteGroupName("");
    }, `已创建分组“${name}”。`);
  }

  function confirmDeleteFavoriteGroup(groupId: string, name: string): void {
    Alert.alert(`删除“${name}”？`, "分组中的范字会移到未分组，不会取消收藏。", [
      { style: "cancel", text: "取消" },
      {
        onPress: () =>
          void updateFavorites(
            (accessToken) =>
              deleteFavoriteGroup(apiBaseUrl, accessToken, groupId),
            `已删除分组“${name}”，其中范字已移到未分组。`,
          ),
        style: "destructive",
        text: "删除分组",
      },
    ]);
  }

  function chooseFavorite(item: FavoriteGlyphItem): void {
    const applySelection = (): void => {
      if (practice) {
        void clearArtworkDraft(artworkDraftStore);
        setPractice(null);
        setArtwork(null);
        setArtworkId(null);
        setUploadState("idle");
        setQualityFindings([]);
      }
      setCharacterInput(item.character);
      setGlyphs([item.glyph]);
      setSelectedGlyph(item.glyph);
      setGlyphDetail(null);
      setFavoritesVisible(false);
      setStatusMessage(`已选用“${item.character}”范字，请拍摄后开始临写。`);
    };

    if (!practice) {
      applySelection();
      return;
    }
    Alert.alert(
      "开始新的练习？",
      "当前练习已保存。开始新练习会清空当前页面中的作品与分析结果。",
      [
        { style: "cancel", text: "取消" },
        { onPress: applySelection, text: "开始新练习" },
      ],
    );
  }

  async function loadFeedbackTickets(): Promise<void> {
    if (feedbackVisible) {
      setFeedbackVisible(false);
      return;
    }
    setFeedbackLoading(true);
    try {
      const accessToken = await getAccessToken();
      setFeedbackTickets(await listFeedback(apiBaseUrl, accessToken));
      setFeedbackVisible(true);
    } catch (error: unknown) {
      setStatusMessage(
        error instanceof Error ? error.message : "反馈进度加载失败。",
      );
    } finally {
      setFeedbackLoading(false);
    }
  }

  function openHistoricalPractice(item: PracticeView): void {
    void clearArtworkDraft(artworkDraftStore);
    setPractice(item);
    setCharacterInput(item.character);
    setArtwork(null);
    setArtworkId(null);
    setGlyphs([]);
    setSelectedGlyph(null);
    setCurrentArtworkSaved(true);
    setActiveShareId(null);
    setFeedbackSent(false);
    setHistoryVisible(false);
    setStatusMessage(`已打开“${item.character}”的练习记录。`);
  }

  async function openCamera(): Promise<void> {
    const permission = await ImagePicker.requestCameraPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        "需要相机权限",
        "请允许使用相机，才能拍摄书法作品。你也可以改从相册选择。",
        [{ text: "知道了" }],
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      mediaTypes: ["images"],
      quality: 0.9,
    });

    await handlePickerResult(result);
  }

  async function openLibrary(): Promise<void> {
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [1, 1],
      mediaTypes: ["images"],
      quality: 0.9,
    });

    await handlePickerResult(result);
  }

  async function handlePickerResult(
    result: ImagePicker.ImagePickerResult,
  ): Promise<void> {
    if (result.canceled) {
      return;
    }

    const asset = result.assets[0];
    if (!asset) {
      Alert.alert("没有读取到图片", "请重新拍摄或选择一张图片。", [
        { text: "知道了" },
      ]);
      return;
    }

    artworkSelectionStartedRef.current = true;
    setStatusMessage("正在把裁切后的图片保存为本地草稿…");
    let savedArtwork: ArtworkDraft;
    try {
      savedArtwork = await saveArtworkDraft(artworkDraftStore, {
        fileSize: asset.fileSize ?? null,
        height: asset.height,
        mimeType: asset.mimeType ?? null,
        uploadRequestId: createUploadRequestId(),
        uri: asset.uri,
        width: asset.width,
      });
    } catch (error: unknown) {
      setStatusMessage(
        error instanceof Error
          ? error.message
          : "本地草稿保存失败，请重新选择图片。",
      );
      return;
    }

    setArtwork(savedArtwork);
    setUploadState("idle");
    setStatusMessage(null);
    setQualityFindings([]);
    setArtworkId(null);
    setCurrentArtworkSaved(false);
    if (practice) trackEvent("SECOND_ATTEMPT_STARTED", practice.id);
    if (!practice) {
      setCharacterInput("");
      setGlyphs([]);
      setCatalogFacets({ calligraphers: [], scriptStyles: [], works: [] });
      setCatalogFilters({});
      setSelectedGlyph(null);
      setGlyphDetail(null);
    }
  }

  async function discardLocalArtworkDraft(): Promise<void> {
    try {
      await clearArtworkDraft(artworkDraftStore);
      setArtwork(null);
      setArtworkId(null);
      setUploadState("idle");
      setQualityFindings([]);
      setCurrentArtworkSaved(false);
      setStatusMessage("本地草稿已删除，图片未上传到服务器。");
    } catch {
      setStatusMessage("本地草稿删除失败，请稍后重试。");
    }
  }

  function confirmDiscardLocalArtworkDraft(): void {
    Alert.alert(
      "放弃本地草稿？",
      "裁切后的本机副本会被删除，且无法恢复；尚未上传的图片不会发送到服务器。",
      [
        { style: "cancel", text: "取消" },
        {
          onPress: () => void discardLocalArtworkDraft(),
          style: "destructive",
          text: "放弃草稿",
        },
      ],
    );
  }

  function resetComparison(): void {
    overlayTransformRef.current = defaultComparisonTransform;
    setOverlayTransform(defaultComparisonTransform);
    setMasterOpacity(0.5);
    setUserSideScale(1);
    setMasterSideScale(1);
  }

  function changeOverlayScale(delta: number): void {
    const next = {
      ...overlayTransformRef.current,
      scale: adjustComparisonScale(overlayTransformRef.current.scale, delta),
    };
    overlayTransformRef.current = next;
    setOverlayTransform(next);
  }

  function changeOverlayRotation(delta: number): void {
    const next = {
      ...overlayTransformRef.current,
      rotation: adjustComparisonRotation(
        overlayTransformRef.current.rotation,
        delta,
      ),
    };
    overlayTransformRef.current = next;
    setOverlayTransform(next);
  }

  async function getAccessToken(): Promise<string> {
    const now = Date.now();
    const storedJson = await SecureStore.getItemAsync(identitySessionKey);
    if (storedJson) {
      let stored: StoredIdentitySession | null = null;
      try {
        stored = JSON.parse(storedJson) as StoredIdentitySession;
      } catch {
        // Corrupt local state is discarded below without exposing token data.
      }
      if (stored) {
        if (
          stored.accessToken &&
          stored.refreshToken &&
          stored.accessExpiresAt > now + 60_000
        ) {
          return stored.accessToken;
        }
        if (stored.refreshToken && stored.refreshExpiresAt > now) {
          try {
            const refreshed = await refreshAnonymousSession(
              apiBaseUrl,
              stored.refreshToken,
            );
            await persistIdentitySession(refreshed);
            return refreshed.accessToken;
          } catch (error: unknown) {
            if (!(error instanceof ApiRequestError) || error.status !== 401) {
              throw error;
            }
            setStatusMessage("原匿名学习会话已失效，将建立新的匿名会话。");
          }
        }
      }
      await SecureStore.deleteItemAsync(identitySessionKey);
    }

    const legacyToken = await SecureStore.getItemAsync(accessTokenKey);
    if (legacyToken) {
      try {
        const upgraded = await upgradeAnonymousSession(apiBaseUrl, legacyToken);
        await persistIdentitySession(upgraded);
        await SecureStore.deleteItemAsync(accessTokenKey);
        return upgraded.accessToken;
      } catch (error: unknown) {
        if (!(error instanceof ApiRequestError) || error.status !== 401) {
          throw error;
        }
        await SecureStore.deleteItemAsync(accessTokenKey);
        setStatusMessage("旧版匿名会话已过期，将建立新的匿名会话。");
      }
    }

    const session = await createAnonymousSession(apiBaseUrl);
    await persistIdentitySession(session);
    return session.accessToken;
  }

  async function persistIdentitySession(
    session: IdentitySession,
  ): Promise<void> {
    const issuedAt = Date.now();
    const stored: StoredIdentitySession = {
      accessExpiresAt: issuedAt + session.expiresInSeconds * 1_000,
      accessToken: session.accessToken,
      refreshExpiresAt: issuedAt + session.refreshExpiresInSeconds * 1_000,
      refreshToken: session.refreshToken,
    };
    await SecureStore.setItemAsync(identitySessionKey, JSON.stringify(stored));
  }

  function trackEvent(
    name: ProductEventName,
    practiceSessionId?: string,
  ): void {
    const input = {
      eventId: createProductEventId(),
      name,
      occurredAt: new Date().toISOString(),
      ...(practiceSessionId ? { practiceSessionId } : {}),
    };
    void getAccessToken()
      .then((accessToken) => trackProductEvent(apiBaseUrl, accessToken, input))
      .catch(() => undefined);
  }

  function applyPracticeAnalysisResult(
    advised: PracticeView,
    completesRepeatLoop: boolean,
  ): void {
    setPractice(advised);
    const latestAttempt = advised.attempts.at(-1);
    if (latestAttempt?.advice) {
      trackEvent("ADVICE_VIEWED", advised.id);
      if (completesRepeatLoop && advised.attempts.length >= 2) {
        trackEvent("PRACTICE_COMPLETED", advised.id);
      }
      return;
    }
    if (latestAttempt?.analysis?.status === "FAILED") {
      setStatusMessage(
        "结构分析暂时失败，练习记录已保留；仍可使用手动中心线和叠加对比。",
      );
    }
  }

  async function submitArtwork(): Promise<void> {
    if (
      !artwork ||
      ["uploading", "cancelling", "analyzing", "passed"].includes(
        uploadState,
      ) ||
      uploadCleanupPending
    ) {
      return;
    }
    const run: ActiveUploadRun = {
      artwork,
      cancelPromise: null,
      cancelRequested: false,
      cleanupFailed: false,
      controller: new AbortController(),
      renewPromise: null,
      uploadId: null,
    };
    activeUploadRunRef.current = run;
    setUploadState("uploading");
    setStatusMessage("正在准备安全上传…");

    try {
      if (!apiBaseUrl) {
        throw new Error(
          "尚未配置移动端 API 地址。请设置 EXPO_PUBLIC_API_BASE_URL。",
        );
      }

      const localFileResponse = await fetch(artwork.uri, {
        signal: run.controller.signal,
      });
      if (!localFileResponse.ok) {
        throw new Error("无法读取所选图片，请重新选择。");
      }
      const fileBody = await localFileResponse.blob();
      const mimeType = artwork.mimeType ?? fileBody.type;
      if (!isArtworkMimeType(mimeType)) {
        throw new Error("仅支持 JPEG、PNG 或 WebP 图片。");
      }

      const accessToken = await getAccessToken();
      const upload = await createArtworkUpload(apiBaseUrl, accessToken, {
        clientRequestId: artwork.uploadRequestId,
        height: artwork.height,
        mimeType,
        sizeBytes: artwork.fileSize ?? fileBody.size,
        width: artwork.width,
      });
      run.uploadId = upload.uploadId;
      if (run.cancelRequested) {
        await cancelServerUpload(run, accessToken);
        const retained = await renewDraftAfterCancelledUpload(run);
        setUploadState("idle");
        setStatusMessage(
          retained
            ? "上传已取消，所选图片仍保留在本机，可重新提交。"
            : "上传已取消，但本地草稿无法安全更新，已从当前页面移除。",
        );
        return;
      }

      setStatusMessage("正在上传原始作品…");
      const uploadResponse = await fetch(upload.uploadUrl, {
        body: fileBody,
        headers: upload.requiredHeaders,
        method: "PUT",
        signal: run.controller.signal,
      });
      if (!uploadResponse.ok) {
        throw new Error(`图片上传失败（${uploadResponse.status}）。`);
      }

      setStatusMessage("正在核验上传结果…");
      const completed = await completeArtworkUpload(
        apiBaseUrl,
        accessToken,
        upload.uploadId,
        fetch,
        run.controller.signal,
      );
      run.uploadId = null;
      let draftStateWarning = "";
      try {
        await markArtworkDraftSubmitted(artworkDraftStore, artwork);
      } catch {
        draftStateWarning =
          " 本机草稿状态未能更新；若重启后再次出现，请先放弃草稿，不要重复提交。";
      }
      trackEvent("ARTWORK_UPLOAD_COMPLETED");
      setUploadState("analyzing");
      setStatusMessage("作品已安全上传，正在检查清晰度和裁切…");
      const analysis = await waitForArtworkAnalysis(
        apiBaseUrl,
        accessToken,
        completed.artworkId,
        { signal: run.controller.signal },
      );
      if (run.cancelRequested) return;
      const quality = analysis.analysis;
      setArtworkId(completed.artworkId);
      setQualityFindings(quality?.findings ?? []);
      if (quality?.status === "PASSED") {
        setUploadState("passed");
        setStatusMessage(
          `图片质量通过。接下来确认你写的是哪个字。${draftStateWarning}`,
        );
      } else if (quality?.status === "NEEDS_RETAKE") {
        setUploadState("retake");
        setStatusMessage(
          `这张图片会影响分析准确性，请按下面提示重新拍摄。${draftStateWarning}`,
        );
      } else if (quality?.status === "FAILED") {
        setUploadState("fallback");
        setStatusMessage(
          `图片质检服务暂时不可用。本次不会生成质检结论，你仍可手动确认汉字并查看名家写法。${draftStateWarning}`,
        );
      } else {
        setUploadState("error");
        setStatusMessage(
          `图片分析暂时未完成，你可以稍后在练习记录中查看。${draftStateWarning}`,
        );
      }
    } catch (error: unknown) {
      if (run.cancelRequested || isAbortError(error)) {
        try {
          const accessToken = await getAccessToken();
          await cancelServerUpload(run, accessToken);
          const retained = await renewDraftAfterCancelledUpload(run);
          setUploadState("idle");
          setStatusMessage(
            retained
              ? "上传已取消，服务器待上传记录和私有对象已清理；本地草稿可重新提交。"
              : "服务器上传已取消，但本地草稿无法安全更新，已从当前页面移除。",
          );
        } catch (cleanupError: unknown) {
          run.cleanupFailed = true;
          setUploadCleanupPending(true);
          setUploadState("error");
          setStatusMessage(
            cleanupError instanceof Error
              ? `本机已停止上传，但服务器清理失败：${cleanupError.message}`
              : "本机已停止上传，但服务器清理失败，请重试。",
          );
        }
        return;
      }
      setUploadState("error");
      setStatusMessage(
        error instanceof Error ? error.message : "上传失败，请稍后重试。",
      );
    } finally {
      if (activeUploadRunRef.current === run && !run.cleanupFailed) {
        activeUploadRunRef.current = null;
      }
    }
  }

  function isAbortError(error: unknown): boolean {
    return error instanceof Error && error.name === "AbortError";
  }

  function cancelServerUpload(
    run: ActiveUploadRun,
    accessToken: string,
  ): Promise<void> {
    if (!run.uploadId) return Promise.resolve();
    run.cancelPromise ??= cancelArtworkUpload(
      apiBaseUrl,
      accessToken,
      run.uploadId,
    )
      .then(() => {
        run.uploadId = null;
        run.cleanupFailed = false;
        setUploadCleanupPending(false);
      })
      .catch((error: unknown) => {
        run.cancelPromise = null;
        throw error;
      });
    return run.cancelPromise;
  }

  async function renewDraftAfterCancelledUpload(
    run: ActiveUploadRun,
  ): Promise<boolean> {
    run.renewPromise ??= (async () => {
      const renewed = {
        ...run.artwork,
        uploadRequestId: createUploadRequestId(),
      };
      try {
        await updateArtworkDraft(artworkDraftStore, renewed);
        run.artwork = renewed;
        setArtwork((current) =>
          current?.uri === renewed.uri ? renewed : current,
        );
        return true;
      } catch {
        await clearArtworkDraft(artworkDraftStore).catch(() => undefined);
        setArtwork((current) =>
          current?.uri === renewed.uri ? null : current,
        );
        return false;
      }
    })();
    return run.renewPromise;
  }

  async function cancelArtworkSubmission(): Promise<void> {
    const run = activeUploadRunRef.current;
    if (!run || (uploadState !== "uploading" && !uploadCleanupPending)) return;
    run.cancelRequested = true;
    run.controller.abort();
    setUploadState("cancelling");
    setStatusMessage("正在停止上传并清理服务器待上传记录…");
    if (!run.uploadId) return;
    try {
      const accessToken = await getAccessToken();
      await cancelServerUpload(run, accessToken);
      const retained = await renewDraftAfterCancelledUpload(run);
      if (activeUploadRunRef.current === run) {
        activeUploadRunRef.current = null;
        setUploadState("idle");
        setStatusMessage(
          retained
            ? "上传已取消，所选图片仍保留在本机，可重新提交。"
            : "上传已取消，但本地草稿无法安全更新，已从当前页面移除。",
        );
      }
    } catch (error: unknown) {
      run.cleanupFailed = true;
      setUploadCleanupPending(true);
      setUploadState("error");
      setStatusMessage(
        error instanceof Error ? error.message : "取消上传失败，请稍后重试。",
      );
    }
  }

  async function confirmAndSearch(): Promise<void> {
    if (!artworkId || isSearching) {
      return;
    }
    setIsSearching(true);
    setStatusMessage("正在检索已审核的名家同字范字…");
    try {
      const accessToken = await getAccessToken();
      if (practice) {
        await confirmArtworkCharacter(
          apiBaseUrl,
          accessToken,
          artworkId,
          practice.character,
        );
        trackEvent("CHARACTER_CONFIRMED");
        const updated = await addPracticeAttempt(
          apiBaseUrl,
          accessToken,
          practice.id,
          artworkId,
        );
        setPractice(updated);
        void waitForPracticeAdvice(apiBaseUrl, accessToken, updated.id)
          .then((advised) => applyPracticeAnalysisResult(advised, true))
          .catch(() => undefined);
        setCurrentArtworkSaved(true);
        setStatusMessage(
          `第 ${updated.attempts.length} 次练习已保存，可以查看前后变化。`,
        );
        return;
      }
      const character = await confirmArtworkCharacter(
        apiBaseUrl,
        accessToken,
        artworkId,
        characterInput,
      );
      trackEvent("CHARACTER_CONFIRMED");
      const catalog = await fetchCatalog(apiBaseUrl, character);
      trackEvent("CATALOG_RESULTS_VIEWED");
      setCharacterInput(character);
      setGlyphs(catalog.glyphs);
      setCatalogFacets(catalog.facets);
      setCatalogFilters(catalog.filters);
      setSelectedGlyph(null);
      setGlyphDetail(null);
      setStatusMessage(
        catalog.glyphs.length > 0
          ? `找到 ${catalog.glyphs.length} 个来源可靠的范字。`
          : "暂未找到权利和来源均已审核通过的同字范字。",
      );
    } catch (error: unknown) {
      setStatusMessage(
        error instanceof Error ? error.message : "检索失败，请稍后重试。",
      );
    } finally {
      setIsSearching(false);
    }
  }

  async function applyCatalogFilters(next: CatalogFilters): Promise<void> {
    if (isSearching || !characterInput) return;
    setIsSearching(true);
    try {
      const catalog = await fetchCatalog(apiBaseUrl, characterInput, next);
      setGlyphs(catalog.glyphs);
      setCatalogFacets(catalog.facets);
      setCatalogFilters(catalog.filters);
      setSelectedGlyph(null);
      setGlyphDetail(null);
      setStatusMessage(
        catalog.glyphs.length > 0
          ? `筛选后有 ${catalog.glyphs.length} 个可靠范字。`
          : "当前筛选下没有经过审核的同字范字。",
      );
    } catch (error: unknown) {
      setStatusMessage(
        error instanceof Error ? error.message : "筛选失败，请稍后重试。",
      );
    } finally {
      setIsSearching(false);
    }
  }

  async function showGlyphDetail(): Promise<void> {
    if (!selectedGlyph || detailLoading) return;
    setDetailLoading(true);
    try {
      setGlyphDetail(await fetchGlyphDetail(apiBaseUrl, selectedGlyph.id));
    } catch (error: unknown) {
      setStatusMessage(
        error instanceof Error ? error.message : "范字详情加载失败。",
      );
    } finally {
      setDetailLoading(false);
    }
  }

  async function savePractice(): Promise<void> {
    if (!artworkId || !selectedGlyph || isSearching) return;
    setIsSearching(true);
    try {
      const accessToken = await getAccessToken();
      const saved = await createPractice(
        apiBaseUrl,
        accessToken,
        artworkId,
        selectedGlyph.id,
      );
      await favoriteGlyph(apiBaseUrl, accessToken, selectedGlyph.id);
      setPractice(saved);
      trackEvent("PRACTICE_CREATED", saved.id);
      void waitForPracticeAdvice(apiBaseUrl, accessToken, saved.id)
        .then((advised) => applyPracticeAnalysisResult(advised, false))
        .catch(() => undefined);
      setCurrentArtworkSaved(true);
      setStatusMessage(
        "练习记录已保存，范字也已收藏。你可以再写一次或主动分享。",
      );
    } catch (error: unknown) {
      setStatusMessage(error instanceof Error ? error.message : "保存失败。");
    } finally {
      setIsSearching(false);
    }
  }

  async function sharePractice(): Promise<void> {
    if (!practice) return;
    try {
      const accessToken = await getAccessToken();
      const share = await createPracticeShare(
        apiBaseUrl,
        accessToken,
        practice.id,
      );
      setActiveShareId(share.id);
      await Share.share({
        message: `看看我的“${practice.character}”字练习：${share.url}`,
        title: "书法练习记录",
        url: share.url,
      });
    } catch (error: unknown) {
      setStatusMessage(error instanceof Error ? error.message : "分享失败。");
    }
  }

  async function revokeShare(): Promise<void> {
    if (!activeShareId) return;
    try {
      const accessToken = await getAccessToken();
      await revokePracticeShare(apiBaseUrl, accessToken, activeShareId);
      setActiveShareId(null);
      setStatusMessage("分享已撤销，原链接现在不可访问。");
    } catch (error: unknown) {
      setStatusMessage(error instanceof Error ? error.message : "撤销失败。");
    }
  }

  async function sendAdviceFeedback(accurate: boolean): Promise<void> {
    if (!practice || feedbackSent) return;
    try {
      const accessToken = await getAccessToken();
      await submitAdviceFeedback(
        apiBaseUrl,
        accessToken,
        practice.id,
        accurate,
      );
      setFeedbackSent(true);
      setStatusMessage("谢谢，你的反馈会进入结构提示评测集。");
    } catch (error: unknown) {
      setStatusMessage(
        error instanceof Error ? error.message : "反馈提交失败。",
      );
    }
  }

  async function sendIssueFeedback(
    kind: "CONTENT_ERROR" | "RECOGNITION_ERROR",
  ): Promise<void> {
    const message = feedbackMessage.trim();
    const referenceId =
      kind === "CONTENT_ERROR" ? selectedGlyph?.id : artworkId;
    if (!message) {
      setStatusMessage("请先说明具体问题，便于后台复核。");
      return;
    }
    if (!referenceId) {
      setStatusMessage(
        kind === "CONTENT_ERROR"
          ? "请先选择需要反馈的范字。"
          : "请先完成一次图片上传和识别。",
      );
      return;
    }
    try {
      const accessToken = await getAccessToken();
      await submitFeedback(apiBaseUrl, accessToken, {
        kind,
        message,
        referenceId,
        referenceType: kind === "CONTENT_ERROR" ? "Glyph" : "Artwork",
      });
      setFeedbackMessage("");
      setFeedbackVisible(false);
      setStatusMessage("反馈已进入工单，可在“反馈处理进度”中查看状态。");
    } catch (error: unknown) {
      setStatusMessage(
        error instanceof Error ? error.message : "问题反馈提交失败。",
      );
    }
  }

  function confirmDeleteLatestArtwork(): void {
    const latest = practice?.attempts.at(-1);
    if (!latest) return;
    Alert.alert(
      "删除本次原图？",
      "确认后会立即撤销图片访问和相关分享，再由后台安全清理原图；物理清理完成后无法恢复。",
      [
        { style: "cancel", text: "取消" },
        {
          onPress: () => void removeArtwork(latest.artworkId),
          style: "destructive",
          text: "确认删除",
        },
      ],
    );
  }

  async function removeArtwork(artworkToDelete: string): Promise<void> {
    if (!practice) return;
    try {
      const accessToken = await getAccessToken();
      let deletion = await deleteArtwork(
        apiBaseUrl,
        accessToken,
        artworkToDelete,
      );
      setPractice({
        ...practice,
        attempts: practice.attempts.filter(
          (attempt) => attempt.artworkId !== artworkToDelete,
        ),
      });
      setActiveShareId(null);
      if (deletion.status === "FAILED") {
        deletion = await deleteArtwork(
          apiBaseUrl,
          accessToken,
          artworkToDelete,
        );
      }
      setStatusMessage(
        deletion.status === "DELETED"
          ? "原图已完成物理清理，相关分享保持失效。"
          : deletion.status === "FAILED"
            ? "原图仍不可访问，但清理任务暂时无法排队；请稍后重试。"
            : "原图访问和相关分享已撤销，正在后台安全清理。",
      );
      if (deletion.status === "DELETION_PENDING") {
        void waitForArtworkDeletion(
          apiBaseUrl,
          accessToken,
          deletion.deletionId,
        )
          .then(async (result) => {
            if (result.status === "DELETED") {
              setStatusMessage("原图已完成物理清理，相关分享保持失效。");
              return;
            }
            if (result.status === "FAILED") {
              const retried = await deleteArtwork(
                apiBaseUrl,
                accessToken,
                artworkToDelete,
              );
              setStatusMessage(
                retried.status === "DELETION_PENDING"
                  ? "原图仍不可访问，物理清理已自动重新排队。"
                  : "原图已完成物理清理，相关分享保持失效。",
              );
            }
          })
          .catch(() =>
            setStatusMessage(
              "原图仍不可访问；后台清理状态暂时无法读取，稍后会继续处理。",
            ),
          );
      }
    } catch (error: unknown) {
      setStatusMessage(error instanceof Error ? error.message : "删除失败。");
    }
  }

  const latestAdvice = practice?.attempts.at(-1)?.advice ?? null;
  const latestAdviceLowConfidence = latestAdvice?.status === "LOW_CONFIDENCE";
  const latestStructureAdvice =
    latestAdvice &&
    !latestAdviceLowConfidence &&
    isStructureMetrics(latestAdvice.user) &&
    isStructureMetrics(latestAdvice.master)
      ? latestAdvice
      : null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.container}>
        <View>
          <Text style={styles.eyebrow}>AI 书法学习</Text>
          <Text style={styles.title}>写一个字，看看名家怎么写</Text>
          <Text style={styles.body}>
            先拍摄一个完整、清晰的毛笔楷书单字。图片只会在你确认后上传。
          </Text>
        </View>

        <View style={styles.historySection}>
          <Pressable
            accessibilityRole="button"
            disabled={historyLoading}
            onPress={loadPracticeHistory}
            style={styles.historyToggle}
          >
            <Text style={styles.textButtonText}>
              {historyLoading
                ? "加载中…"
                : historyVisible
                  ? "收起练习记录"
                  : "查看练习记录"}
            </Text>
          </Pressable>
          {historyVisible ? (
            <View style={styles.historyList}>
              {practiceHistory.length === 0 ? (
                <Text style={styles.helperText}>还没有保存过练习。</Text>
              ) : null}
              {historicalComparison.length === 2 ? (
                <View style={styles.historyComparisonCard}>
                  <View style={styles.historyComparisonHeader}>
                    <Text style={styles.glyphTitle}>
                      “{historicalComparison[0]?.character}”两次作品对比
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setHistoricalComparison([])}
                      style={styles.favoriteIconButton}
                    >
                      <Text style={styles.textButtonText}>清空</Text>
                    </Pressable>
                  </View>
                  <View style={styles.historyComparisonImages}>
                    {historicalComparison.map((selection, index) => (
                      <View
                        key={selection.artworkId}
                        style={styles.historyComparisonCell}
                      >
                        <Image
                          accessibilityLabel={`历史对比作品${index + 1}`}
                          source={{ uri: selection.attempt.imageUrl }}
                          style={styles.historyComparisonImage}
                        />
                        <Text style={styles.caption}>
                          {new Date(selection.attempt.createdAt).toLocaleString(
                            "zh-CN",
                          )}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : historicalComparison.length === 1 ? (
                <Text style={styles.helperText}>
                  已选择一次作品，请再选同一个字的另一次作品。
                </Text>
              ) : (
                <Text style={styles.helperText}>
                  点击作品缩略图可选择两次同字练习并排对比。
                </Text>
              )}
              {practiceHistory.map((item) => (
                <View key={item.id} style={styles.historyPracticeCard}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => openHistoricalPractice(item)}
                    style={styles.historyRow}
                  >
                    <Text style={styles.historyCharacter}>
                      {item.character}
                    </Text>
                    <View style={styles.historyDetails}>
                      <Text style={styles.historyTitle}>
                        {item.master.calligrapherName}《{item.master.workTitle}
                        》
                      </Text>
                      <Text style={styles.caption}>
                        {new Date(item.createdAt).toLocaleDateString("zh-CN")} ·{" "}
                        {item.attempts.length} 次练习 · 点击打开
                      </Text>
                    </View>
                  </Pressable>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.historyAttemptPicker}>
                      {item.attempts.map((attempt) => {
                        const selected = historicalComparison.some(
                          (selection) =>
                            selection.artworkId === attempt.artworkId,
                        );
                        return (
                          <Pressable
                            accessibilityLabel={`选择${item.character}第${attempt.sequence}次练习进行对比`}
                            accessibilityRole="button"
                            key={attempt.artworkId}
                            onPress={() =>
                              toggleHistoryComparison({
                                artworkId: attempt.artworkId,
                                attempt,
                                character: item.character,
                                practiceId: item.id,
                              })
                            }
                            style={[
                              styles.historyAttemptChoice,
                              selected
                                ? styles.selectedHistoryAttemptChoice
                                : null,
                            ]}
                          >
                            <Image
                              source={{ uri: attempt.imageUrl }}
                              style={styles.historyAttemptImage}
                            />
                            <Text style={styles.sourceText}>
                              第 {attempt.sequence} 次 ·{" "}
                              {selected ? "已选" : "选择"}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </ScrollView>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        <View style={styles.favoritesSection}>
          <Pressable
            accessibilityRole="button"
            disabled={favoritesLoading}
            onPress={loadFavorites}
            style={styles.historyToggle}
          >
            <Text style={styles.textButtonText}>
              {favoritesLoading
                ? "整理中…"
                : favoritesVisible
                  ? "收起我的收藏字帖"
                  : "我的收藏字帖"}
            </Text>
          </Pressable>
          {favoritesVisible && favoriteLibrary ? (
            <View style={styles.favoriteLibrary}>
              <View style={styles.favoriteGroupCreator}>
                <TextInput
                  maxLength={40}
                  onChangeText={setFavoriteGroupName}
                  placeholder="新分组，如：颜体入门"
                  style={styles.favoriteGroupInput}
                  value={favoriteGroupName}
                />
                <Pressable
                  accessibilityRole="button"
                  disabled={favoritesLoading}
                  onPress={() => void addFavoriteGroup()}
                  style={styles.favoriteCompactButton}
                >
                  <Text style={styles.modeButtonText}>新建</Text>
                </Pressable>
              </View>
              {favoriteLibrary.groups.length === 0 &&
              favoriteLibrary.ungrouped.length === 0 ? (
                <Text style={styles.helperText}>
                  还没有收藏范字。保存一次练习后，所选范字会自动加入这里。
                </Text>
              ) : null}
              {[
                ...favoriteLibrary.groups,
                {
                  id: null,
                  items: favoriteLibrary.ungrouped,
                  name: "未分组",
                  sortOrder: Number.MAX_SAFE_INTEGER,
                },
              ].map((group) =>
                group.items.length > 0 || group.id ? (
                  <View
                    key={group.id ?? "ungrouped"}
                    style={styles.favoriteGroupCard}
                  >
                    <View style={styles.favoriteGroupHeader}>
                      <Text style={styles.glyphTitle}>
                        {group.name}（{group.items.length}）
                      </Text>
                      {group.id ? (
                        <View style={styles.favoriteInlineActions}>
                          <Pressable
                            accessibilityLabel={`上移分组${group.name}`}
                            accessibilityRole="button"
                            onPress={() =>
                              void updateFavorites(
                                (accessToken) =>
                                  reorderFavoriteGroup(
                                    apiBaseUrl,
                                    accessToken,
                                    group.id!,
                                    "UP",
                                  ),
                                "分组顺序已更新。",
                              )
                            }
                            style={styles.favoriteIconButton}
                          >
                            <Text style={styles.modeButtonText}>↑</Text>
                          </Pressable>
                          <Pressable
                            accessibilityLabel={`下移分组${group.name}`}
                            accessibilityRole="button"
                            onPress={() =>
                              void updateFavorites(
                                (accessToken) =>
                                  reorderFavoriteGroup(
                                    apiBaseUrl,
                                    accessToken,
                                    group.id!,
                                    "DOWN",
                                  ),
                                "分组顺序已更新。",
                              )
                            }
                            style={styles.favoriteIconButton}
                          >
                            <Text style={styles.modeButtonText}>↓</Text>
                          </Pressable>
                          <Pressable
                            accessibilityLabel={`删除分组${group.name}`}
                            accessibilityRole="button"
                            onPress={() =>
                              confirmDeleteFavoriteGroup(group.id!, group.name)
                            }
                            style={styles.favoriteIconButton}
                          >
                            <Text style={styles.destructiveButtonText}>删</Text>
                          </Pressable>
                        </View>
                      ) : null}
                    </View>
                    {group.items.map((item) => (
                      <View key={item.favoriteId} style={styles.favoriteItem}>
                        {item.glyph.image ? (
                          <Image
                            accessibilityLabel={`${item.character}的收藏范字`}
                            source={{ uri: item.glyph.image.url }}
                            style={styles.favoriteImage}
                          />
                        ) : (
                          <View style={styles.favoriteMissingImage}>
                            <Text style={styles.historyCharacter}>
                              {item.character}
                            </Text>
                          </View>
                        )}
                        <View style={styles.favoriteItemBody}>
                          <Text style={styles.historyTitle}>
                            {item.character} · {item.glyph.calligrapher.name}《
                            {item.glyph.work.title}》
                          </Text>
                          <View style={styles.favoriteInlineActions}>
                            <Pressable
                              accessibilityRole="button"
                              onPress={() => chooseFavorite(item)}
                              style={styles.favoriteCompactButton}
                            >
                              <Text style={styles.modeButtonText}>
                                练这个字
                              </Text>
                            </Pressable>
                            <Pressable
                              accessibilityLabel={`上移${item.character}`}
                              accessibilityRole="button"
                              onPress={() =>
                                void updateFavorites(
                                  (accessToken) =>
                                    reorderFavoriteGlyph(
                                      apiBaseUrl,
                                      accessToken,
                                      item.glyph.id,
                                      "UP",
                                    ),
                                  "范字顺序已更新。",
                                )
                              }
                              style={styles.favoriteIconButton}
                            >
                              <Text style={styles.modeButtonText}>↑</Text>
                            </Pressable>
                            <Pressable
                              accessibilityLabel={`下移${item.character}`}
                              accessibilityRole="button"
                              onPress={() =>
                                void updateFavorites(
                                  (accessToken) =>
                                    reorderFavoriteGlyph(
                                      apiBaseUrl,
                                      accessToken,
                                      item.glyph.id,
                                      "DOWN",
                                    ),
                                  "范字顺序已更新。",
                                )
                              }
                              style={styles.favoriteIconButton}
                            >
                              <Text style={styles.modeButtonText}>↓</Text>
                            </Pressable>
                            <Pressable
                              accessibilityRole="button"
                              onPress={() =>
                                void updateFavorites(
                                  (accessToken) =>
                                    unfavoriteGlyph(
                                      apiBaseUrl,
                                      accessToken,
                                      item.glyph.id,
                                    ),
                                  `已取消收藏“${item.character}”。`,
                                )
                              }
                              style={styles.favoriteIconButton}
                            >
                              <Text style={styles.destructiveButtonText}>
                                取消
                              </Text>
                            </Pressable>
                          </View>
                          <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                          >
                            <View style={styles.favoriteMoveRow}>
                              <Text style={styles.sourceText}>移动到：</Text>
                              {[
                                { id: null, name: "未分组" },
                                ...favoriteLibrary.groups,
                              ].map((target) => (
                                <Pressable
                                  accessibilityRole="button"
                                  disabled={item.groupId === target.id}
                                  key={target.id ?? "ungrouped"}
                                  onPress={() =>
                                    void updateFavorites(
                                      (accessToken) =>
                                        placeFavoriteGlyph(
                                          apiBaseUrl,
                                          accessToken,
                                          item.glyph.id,
                                          target.id,
                                        ),
                                      `已将“${item.character}”移到${target.name}。`,
                                    )
                                  }
                                  style={[
                                    styles.favoriteMoveChip,
                                    item.groupId === target.id
                                      ? styles.activeFilterChip
                                      : null,
                                  ]}
                                >
                                  <Text style={styles.filterChipText}>
                                    {target.name}
                                  </Text>
                                </Pressable>
                              ))}
                            </View>
                          </ScrollView>
                        </View>
                      </View>
                    ))}
                  </View>
                ) : null,
              )}
            </View>
          ) : null}
        </View>

        <View style={styles.feedbackSection}>
          <Pressable
            accessibilityRole="button"
            disabled={feedbackLoading}
            onPress={loadFeedbackTickets}
            style={styles.historyToggle}
          >
            <Text style={styles.textButtonText}>
              {feedbackLoading
                ? "加载中…"
                : feedbackVisible
                  ? "收起反馈处理进度"
                  : "反馈处理进度"}
            </Text>
          </Pressable>
          {feedbackVisible ? (
            <View style={styles.feedbackTicketList}>
              {feedbackTickets.length === 0 ? (
                <Text style={styles.helperText}>还没有提交过反馈。</Text>
              ) : null}
              {feedbackTickets.map((ticket) => (
                <View key={ticket.id} style={styles.feedbackTicketRow}>
                  <View style={styles.feedbackTicketHeader}>
                    <Text style={styles.historyTitle}>
                      {feedbackKindLabels[ticket.kind]}
                    </Text>
                    <Text style={styles.feedbackStatus}>
                      {feedbackStatusLabels[ticket.status]}
                    </Text>
                  </View>
                  {ticket.message ? (
                    <Text style={styles.helperText}>{ticket.message}</Text>
                  ) : null}
                  {ticket.resolutionNote ? (
                    <Text style={styles.sourceText}>
                      处理说明：{ticket.resolutionNote}
                    </Text>
                  ) : null}
                  <Text style={styles.caption}>
                    更新于 {new Date(ticket.updatedAt).toLocaleString("zh-CN")}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        <View style={styles.privacySection}>
          <Pressable
            accessibilityRole="button"
            disabled={privacyLoading}
            onPress={loadPrivacyPreferences}
            style={styles.historyToggle}
          >
            <Text style={styles.textButtonText}>
              {privacyLoading
                ? "保存中…"
                : privacyVisible
                  ? "收起隐私与授权"
                  : "隐私与授权"}
            </Text>
          </Pressable>
          {privacyVisible && privacy ? (
            <View style={styles.privacyCard}>
              <View style={styles.privacyRow}>
                <View style={styles.privacyCopy}>
                  <Text style={styles.historyTitle}>保存练习作品</Text>
                  <Text style={styles.helperText}>
                    用于质检、对比和练习历史；关闭后停止新上传。
                  </Text>
                </View>
                <Switch
                  accessibilityLabel="允许保存练习作品"
                  disabled={privacyLoading}
                  onValueChange={(value) =>
                    changePrivacyPreference("allowArtworkStorage", value)
                  }
                  value={privacy.allowArtworkStorage}
                />
              </View>
              <View style={styles.privacyRow}>
                <View style={styles.privacyCopy}>
                  <Text style={styles.historyTitle}>允许公开分享</Text>
                  <Text style={styles.helperText}>
                    默认关闭；关闭时会撤销已有公开分享链接。
                  </Text>
                </View>
                <Switch
                  accessibilityLabel="允许公开分享练习"
                  disabled={privacyLoading}
                  onValueChange={(value) =>
                    changePrivacyPreference("allowPublicSharing", value)
                  }
                  value={privacy.allowPublicSharing}
                />
              </View>
              <View style={styles.privacyRow}>
                <View style={styles.privacyCopy}>
                  <Text style={styles.historyTitle}>允许用于模型训练</Text>
                  <Text style={styles.helperText}>
                    默认关闭，独立于产品存储；当前系统不会自动导出训练数据。
                  </Text>
                </View>
                <Switch
                  accessibilityLabel="允许作品用于模型训练"
                  disabled={privacyLoading}
                  onValueChange={(value) =>
                    changePrivacyPreference("allowModelTraining", value)
                  }
                  value={privacy.allowModelTraining}
                />
              </View>
              <Text style={styles.privacyPolicy}>
                授权版本：{privacy.policyVersion}。每次变更均单独记录时间。
              </Text>
            </View>
          ) : null}
        </View>

        {artwork ? (
          <View style={styles.previewCard}>
            <Image
              accessibilityLabel="已选择的书法作品"
              resizeMode="contain"
              source={{ uri: artwork.uri }}
              style={styles.previewImage}
            />
            <Text style={styles.caption}>
              已选择 {artwork.width} × {artwork.height} 图片
            </Text>
          </View>
        ) : (
          <View style={styles.guideCard}>
            <Text style={styles.guideCharacter}>永</Text>
            <Text style={styles.caption}>
              让字迹完整出现在方框内，四周保留少量纸面。
            </Text>
          </View>
        )}

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            disabled={
              ["uploading", "cancelling", "analyzing"].includes(uploadState) ||
              uploadCleanupPending
            }
            onPress={openCamera}
            style={[
              styles.primaryButton,
              ["uploading", "cancelling", "analyzing"].includes(uploadState) ||
              uploadCleanupPending
                ? styles.disabledButton
                : null,
            ]}
          >
            <Text style={styles.primaryButtonText}>
              {artwork ? "重新拍摄" : "拍摄单字"}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={
              ["uploading", "cancelling", "analyzing"].includes(uploadState) ||
              uploadCleanupPending
            }
            onPress={openLibrary}
            style={[
              styles.secondaryButton,
              ["uploading", "cancelling", "analyzing"].includes(uploadState) ||
              uploadCleanupPending
                ? styles.disabledButton
                : null,
            ]}
          >
            <Text style={styles.secondaryButtonText}>从相册选择</Text>
          </Pressable>
          {artwork && uploadState === "idle" && !uploadCleanupPending ? (
            <Pressable
              accessibilityRole="button"
              onPress={confirmDiscardLocalArtworkDraft}
              style={styles.cancelUploadButton}
            >
              <Text style={styles.cancelUploadText}>放弃本地草稿</Text>
            </Pressable>
          ) : null}
          {artwork ? (
            <Pressable
              accessibilityRole="button"
              disabled={
                uploadState === "uploading" ||
                uploadState === "cancelling" ||
                uploadState === "analyzing" ||
                uploadState === "passed" ||
                uploadState === "fallback" ||
                uploadCleanupPending
              }
              onPress={submitArtwork}
              style={[
                styles.uploadButton,
                uploadState === "uploading" ||
                uploadState === "cancelling" ||
                uploadState === "analyzing" ||
                uploadState === "passed" ||
                uploadState === "fallback" ||
                uploadCleanupPending
                  ? styles.disabledButton
                  : null,
              ]}
            >
              <Text style={styles.primaryButtonText}>
                {uploadState === "cancelling"
                  ? "正在取消…"
                  : uploadState === "uploading" || uploadState === "analyzing"
                    ? "正在处理…"
                    : uploadState === "passed"
                      ? "质检通过"
                      : uploadState === "fallback"
                        ? "可手动确认"
                        : "确认并继续"}
              </Text>
            </Pressable>
          ) : null}
          {artwork &&
          (["uploading", "cancelling"].includes(uploadState) ||
            uploadCleanupPending) ? (
            <Pressable
              accessibilityRole="button"
              disabled={uploadState === "cancelling"}
              onPress={cancelArtworkSubmission}
              style={[
                styles.cancelUploadButton,
                uploadState === "cancelling" ? styles.disabledButton : null,
              ]}
            >
              <Text style={styles.cancelUploadText}>
                {uploadState === "cancelling"
                  ? "正在清理…"
                  : uploadCleanupPending
                    ? "重试服务器清理"
                    : "取消上传"}
              </Text>
            </Pressable>
          ) : null}
        </View>

        {statusMessage ? (
          <Text
            accessibilityLiveRegion="polite"
            style={[
              styles.nextStep,
              uploadState === "error" ? styles.errorText : null,
            ]}
          >
            {statusMessage}
          </Text>
        ) : null}
        {qualityFindings.length > 0 ? (
          <View style={styles.findingsCard}>
            {qualityFindings.map((finding) => (
              <Text key={finding.code} style={styles.findingText}>
                · {finding.message}
              </Text>
            ))}
          </View>
        ) : null}

        {(uploadState === "passed" || uploadState === "fallback") &&
        !currentArtworkSaved ? (
          <View style={styles.characterCard}>
            <Text style={styles.sectionTitle}>确认你写的字</Text>
            <Text style={styles.helperText}>
              {practice
                ? `这是“${practice.character}”的再练作品，确认后会加入同一条练习记录。`
                : "当前版本在识别模型通过真实样本验证前，先由你手动确认，不会猜测文字。"}
            </Text>
            <View style={styles.characterRow}>
              <TextInput
                accessibilityLabel="输入所写汉字"
                autoCorrect={false}
                maxLength={2}
                onChangeText={setCharacterInput}
                placeholder="永"
                style={styles.characterInput}
                textAlign="center"
                value={characterInput}
              />
              <Pressable
                accessibilityRole="button"
                disabled={
                  isSearching || (uploadState === "fallback" && !!practice)
                }
                onPress={confirmAndSearch}
                style={[
                  styles.searchButton,
                  isSearching ? styles.disabledButton : null,
                ]}
              >
                <Text style={styles.primaryButtonText}>
                  {isSearching
                    ? "处理中…"
                    : uploadState === "fallback" && practice
                      ? "请重新拍摄后保存"
                      : practice
                        ? "确认并保存再练"
                        : "找名家写法"}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {glyphs.length > 0 || catalogFacets.calligraphers.length > 0 ? (
          <View style={styles.catalogSection}>
            <Text style={styles.sectionTitle}>名家同字范字</Text>
            <Text style={styles.filterLabel}>按书家筛选</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.filterRow}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    const next = { ...catalogFilters };
                    delete next.calligrapherId;
                    delete next.workId;
                    void applyCatalogFilters(next);
                  }}
                  style={[
                    styles.filterChip,
                    !catalogFilters.calligrapherId
                      ? styles.activeFilterChip
                      : null,
                  ]}
                >
                  <Text style={styles.filterChipText}>全部</Text>
                </Pressable>
                {catalogFacets.calligraphers.map((item) => (
                  <Pressable
                    accessibilityRole="button"
                    key={item.id}
                    onPress={() => {
                      const next = {
                        ...catalogFilters,
                        calligrapherId: item.id,
                      };
                      delete next.workId;
                      void applyCatalogFilters(next);
                    }}
                    style={[
                      styles.filterChip,
                      catalogFilters.calligrapherId === item.id
                        ? styles.activeFilterChip
                        : null,
                    ]}
                  >
                    <Text style={styles.filterChipText}>{item.name}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
            <Text style={styles.filterLabel}>按碑帖筛选</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.filterRow}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    const next = { ...catalogFilters };
                    delete next.workId;
                    void applyCatalogFilters(next);
                  }}
                  style={[
                    styles.filterChip,
                    !catalogFilters.workId ? styles.activeFilterChip : null,
                  ]}
                >
                  <Text style={styles.filterChipText}>全部</Text>
                </Pressable>
                {catalogFacets.works
                  .filter(
                    (item) =>
                      !catalogFilters.calligrapherId ||
                      item.calligrapherId === catalogFilters.calligrapherId,
                  )
                  .map((item) => (
                    <Pressable
                      accessibilityRole="button"
                      key={item.id}
                      onPress={() =>
                        void applyCatalogFilters({
                          ...catalogFilters,
                          workId: item.id,
                        })
                      }
                      style={[
                        styles.filterChip,
                        catalogFilters.workId === item.id
                          ? styles.activeFilterChip
                          : null,
                      ]}
                    >
                      <Text style={styles.filterChipText}>{item.title}</Text>
                    </Pressable>
                  ))}
              </View>
            </ScrollView>
            <View style={styles.filterRow}>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  const next = { ...catalogFilters };
                  if (next.scriptStyle) delete next.scriptStyle;
                  else next.scriptStyle = "REGULAR";
                  void applyCatalogFilters(next);
                }}
                style={[
                  styles.filterChip,
                  catalogFilters.scriptStyle === "REGULAR"
                    ? styles.activeFilterChip
                    : null,
                ]}
              >
                <Text style={styles.filterChipText}>只看楷书</Text>
              </Pressable>
            </View>
            {glyphs.length === 0 ? (
              <Text style={styles.helperText}>当前筛选下暂无可靠范字。</Text>
            ) : null}
            {glyphs.map((glyph) => (
              <Pressable
                accessibilityRole="button"
                key={glyph.id}
                onPress={() => {
                  setSelectedGlyph(glyph);
                  setGlyphDetail(null);
                  resetComparison();
                  trackEvent("GLYPH_SELECTED");
                }}
                style={[
                  styles.glyphCard,
                  selectedGlyph?.id === glyph.id
                    ? styles.selectedGlyphCard
                    : null,
                ]}
              >
                {glyph.image ? (
                  <Image
                    accessibilityLabel={`${glyph.calligrapher.name}《${glyph.work.title}》中的${characterInput}字`}
                    resizeMode="contain"
                    source={{ uri: glyph.image.url }}
                    style={styles.glyphThumbnail}
                  />
                ) : (
                  <View style={styles.missingImage}>
                    <Text style={styles.helperText}>暂无公开缩略图</Text>
                  </View>
                )}
                <View style={styles.glyphMeta}>
                  <Text style={styles.glyphTitle}>
                    {glyph.calligrapher.dynasty} · {glyph.calligrapher.name}
                  </Text>
                  <Text style={styles.helperText}>《{glyph.work.title}》</Text>
                  <Text style={styles.sourceText}>
                    来源：{glyph.rights.sourceName}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        ) : null}

        {selectedGlyph?.image && artwork ? (
          <View style={styles.compareSection}>
            <Text style={styles.sectionTitle}>与范字对比</Text>
            <View style={styles.modeRow}>
              {(["side", "overlay"] as const).map((mode) => (
                <Pressable
                  accessibilityRole="button"
                  key={mode}
                  onPress={() => setComparisonMode(mode)}
                  style={[
                    styles.modeButton,
                    comparisonMode === mode ? styles.activeModeButton : null,
                  ]}
                >
                  <Text style={styles.modeButtonText}>
                    {mode === "side" ? "并排" : "叠加"}
                  </Text>
                </Pressable>
              ))}
            </View>
            {comparisonMode === "side" ? (
              <View style={styles.sideBySide}>
                <View style={styles.compareCell}>
                  <View style={styles.compareImageViewport}>
                    <Image
                      source={{ uri: artwork.uri }}
                      style={[
                        styles.compareImage,
                        { transform: [{ scale: userSideScale }] },
                      ]}
                    />
                  </View>
                  <Text style={styles.caption}>我的字</Text>
                  <View style={styles.zoomControls}>
                    <Pressable
                      accessibilityLabel="缩小我的字"
                      accessibilityRole="button"
                      onPress={() =>
                        setUserSideScale((value) =>
                          adjustComparisonScale(value, -0.25),
                        )
                      }
                      style={styles.compactControl}
                    >
                      <Text style={styles.modeButtonText}>−</Text>
                    </Pressable>
                    <Text style={styles.zoomValue}>
                      {Math.round(userSideScale * 100)}%
                    </Text>
                    <Pressable
                      accessibilityLabel="放大我的字"
                      accessibilityRole="button"
                      onPress={() =>
                        setUserSideScale((value) =>
                          adjustComparisonScale(value, 0.25),
                        )
                      }
                      style={styles.compactControl}
                    >
                      <Text style={styles.modeButtonText}>＋</Text>
                    </Pressable>
                  </View>
                </View>
                <View style={styles.compareCell}>
                  <View style={styles.compareImageViewport}>
                    <Image
                      source={{ uri: selectedGlyph.image.url }}
                      style={[
                        styles.compareImage,
                        { transform: [{ scale: masterSideScale }] },
                      ]}
                    />
                  </View>
                  <Text style={styles.caption}>
                    {selectedGlyph.calligrapher.name}
                  </Text>
                  <View style={styles.zoomControls}>
                    <Pressable
                      accessibilityLabel="缩小范字"
                      accessibilityRole="button"
                      onPress={() =>
                        setMasterSideScale((value) =>
                          adjustComparisonScale(value, -0.25),
                        )
                      }
                      style={styles.compactControl}
                    >
                      <Text style={styles.modeButtonText}>−</Text>
                    </Pressable>
                    <Text style={styles.zoomValue}>
                      {Math.round(masterSideScale * 100)}%
                    </Text>
                    <Pressable
                      accessibilityLabel="放大范字"
                      accessibilityRole="button"
                      onPress={() =>
                        setMasterSideScale((value) =>
                          adjustComparisonScale(value, 0.25),
                        )
                      }
                      style={styles.compactControl}
                    >
                      <Text style={styles.modeButtonText}>＋</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            ) : (
              <>
                <View
                  {...overlayPanResponder.panHandlers}
                  accessibilityLabel="叠加对比画布，单指移动，双指缩放和旋转"
                  style={styles.overlayCanvas}
                >
                  <Image
                    source={{ uri: artwork.uri }}
                    style={styles.overlayImage}
                  />
                  {guidesVisible && latestStructureAdvice ? (
                    <StructureGuide
                      color="#2E7D5B"
                      metrics={latestStructureAdvice.user}
                    />
                  ) : null}
                  <View
                    pointerEvents="none"
                    style={[
                      styles.overlayTransformLayer,
                      {
                        opacity: masterOpacity,
                        transform: [
                          { translateX: overlayTransform.translateX },
                          { translateY: overlayTransform.translateY },
                          { scale: overlayTransform.scale },
                          { rotate: `${overlayTransform.rotation}deg` },
                        ],
                      },
                    ]}
                  >
                    <Image
                      source={{ uri: selectedGlyph.image.url }}
                      style={styles.overlayImage}
                    />
                    {guidesVisible && latestStructureAdvice ? (
                      <StructureGuide
                        color="#B54232"
                        metrics={latestStructureAdvice.master}
                      />
                    ) : null}
                  </View>
                  {guidesVisible ? (
                    <View pointerEvents="none" style={styles.centerGuideLayer}>
                      <View style={styles.centerGuideVertical} />
                      <View style={styles.centerGuideHorizontal} />
                    </View>
                  ) : null}
                </View>
                <Text style={styles.gestureHelp}>
                  单指移动范字，双指缩放并旋转；原图和范字文件不会被修改。
                </Text>
                <View style={styles.opacityRow}>
                  {[0.25, 0.5, 0.75].map((opacity) => (
                    <Pressable
                      accessibilityRole="button"
                      key={opacity}
                      onPress={() => setMasterOpacity(opacity)}
                      style={[
                        styles.opacityButton,
                        masterOpacity === opacity
                          ? styles.activeModeButton
                          : null,
                      ]}
                    >
                      <Text style={styles.modeButtonText}>
                        {opacity * 100}%
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.transformControls}>
                  <Pressable
                    accessibilityLabel="缩小叠加范字"
                    accessibilityRole="button"
                    onPress={() => changeOverlayScale(-0.1)}
                    style={styles.compactControl}
                  >
                    <Text style={styles.modeButtonText}>缩小</Text>
                  </Pressable>
                  <Pressable
                    accessibilityLabel="放大叠加范字"
                    accessibilityRole="button"
                    onPress={() => changeOverlayScale(0.1)}
                    style={styles.compactControl}
                  >
                    <Text style={styles.modeButtonText}>放大</Text>
                  </Pressable>
                  <Pressable
                    accessibilityLabel="逆时针旋转范字"
                    accessibilityRole="button"
                    onPress={() => changeOverlayRotation(-5)}
                    style={styles.compactControl}
                  >
                    <Text style={styles.modeButtonText}>左转</Text>
                  </Pressable>
                  <Pressable
                    accessibilityLabel="顺时针旋转范字"
                    accessibilityRole="button"
                    onPress={() => changeOverlayRotation(5)}
                    style={styles.compactControl}
                  >
                    <Text style={styles.modeButtonText}>右转</Text>
                  </Pressable>
                </View>
                <View style={styles.transformStatusRow}>
                  <Text style={styles.helperText}>
                    {Math.round(overlayTransform.scale * 100)}% ·{" "}
                    {Math.round(overlayTransform.rotation)}° · X{" "}
                    {Math.round(overlayTransform.translateX)} / Y{" "}
                    {Math.round(overlayTransform.translateY)}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={resetComparison}
                    style={styles.resetControl}
                  >
                    <Text style={styles.secondaryButtonText}>恢复默认对齐</Text>
                  </Pressable>
                </View>
                <View style={styles.guideToggleRow}>
                  <View style={styles.guideToggleCopy}>
                    <Text style={styles.glyphTitle}>辅助线与测量框</Text>
                    <Text style={styles.helperText}>
                      绿框为我的字，红框为范字；圆点是结构测量重心。
                    </Text>
                  </View>
                  <Switch
                    accessibilityLabel="显示叠加辅助线"
                    onValueChange={setGuidesVisible}
                    value={guidesVisible}
                  />
                </View>
                {guidesVisible && !latestStructureAdvice ? (
                  <Text style={styles.helperText}>
                    {latestAdviceLowConfidence
                      ? "本次图像结构测量置信度不足，仅保留手动中心线和叠加对比。"
                      : "当前显示中心线；保存练习并完成结构分析后会显示外框和重心。"}
                  </Text>
                ) : null}
                <Text style={styles.overlayDisclaimer}>
                  叠加相似不等于书法水平；请结合结构依据和下一遍练习动作判断。
                </Text>
              </>
            )}
            <Text style={styles.sourceText}>
              范字出处：{selectedGlyph.calligrapher.name}《
              {selectedGlyph.work.title}》 ·{selectedGlyph.edition.name} ·{" "}
              {selectedGlyph.rights.sourceName}
            </Text>
            <Pressable
              accessibilityRole="button"
              disabled={detailLoading}
              onPress={showGlyphDetail}
              style={styles.detailButton}
            >
              <Text style={styles.secondaryButtonText}>
                {detailLoading ? "加载出处…" : "查看完整出处与原帖位置"}
              </Text>
            </Pressable>
            {glyphDetail ? (
              <View style={styles.glyphDetailCard}>
                <Text style={styles.glyphTitle}>范字出处详情</Text>
                <Text style={styles.helperText}>
                  {glyphDetail.calligrapher.dynasty} ·{" "}
                  {glyphDetail.calligrapher.name}《{glyphDetail.work.title}》 ·{" "}
                  {glyphDetail.edition.name}
                </Text>
                <Text style={styles.helperText}>
                  原帖位置：{glyphDetail.sourceContext.pageLabel ?? "未标页码"}
                  ； x={glyphDetail.sourceContext.boundingBox.x}, y=
                  {glyphDetail.sourceContext.boundingBox.y}, 范围{" "}
                  {glyphDetail.sourceContext.boundingBox.width}×
                  {glyphDetail.sourceContext.boundingBox.height}
                </Text>
                <Text style={styles.helperText}>
                  来源：{glyphDetail.rights.sourceName}；许可：
                  {glyphDetail.rights.licenseName ?? "按来源权利记录审核"}
                </Text>
                {glyphDetail.rights.attributionText ? (
                  <Text style={styles.sourceText}>
                    署名：{glyphDetail.rights.attributionText}
                  </Text>
                ) : null}
                <Text style={styles.sourceText}>
                  原帖档案图保持私有，仅显示审核后的单字图和位置数据。
                </Text>
              </View>
            ) : null}
            {!practice && uploadState !== "fallback" ? (
              <Pressable
                accessibilityRole="button"
                disabled={isSearching}
                onPress={savePractice}
                style={[
                  styles.uploadButton,
                  isSearching ? styles.disabledButton : null,
                ]}
              >
                <Text style={styles.primaryButtonText}>
                  {isSearching ? "保存中…" : "收藏范字并保存练习"}
                </Text>
              </Pressable>
            ) : null}
            {uploadState === "fallback" ? (
              <Text style={styles.helperText}>
                质检未完成时仅提供手动对比，不保存为可分析练习，也不会生成结构建议。
              </Text>
            ) : null}
          </View>
        ) : null}

        {artworkId ? (
          <View style={styles.issueFeedbackCard}>
            <Text style={styles.glyphTitle}>发现识别或内容问题？</Text>
            <Text style={styles.helperText}>
              请描述具体问题。反馈只关联当前作品或所选范字，不会公开你的原图。
            </Text>
            <TextInput
              maxLength={2000}
              multiline
              onChangeText={setFeedbackMessage}
              placeholder="例如：识别候选没有“永”，或范字出处页码不正确"
              style={styles.feedbackInput}
              value={feedbackMessage}
            />
            <View style={styles.feedbackRow}>
              <Pressable
                accessibilityRole="button"
                onPress={() => sendIssueFeedback("RECOGNITION_ERROR")}
                style={styles.feedbackButton}
              >
                <Text style={styles.modeButtonText}>报告识别错误</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => sendIssueFeedback("CONTENT_ERROR")}
                style={styles.feedbackButton}
              >
                <Text style={styles.modeButtonText}>报告范字/出处错误</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {practice ? (
          <View style={styles.practiceCard}>
            <Text style={styles.sectionTitle}>
              “{practice.character}”练习记录
            </Text>
            <Text style={styles.helperText}>
              临写范字：{practice.master.calligrapherName}《
              {practice.master.workTitle}》
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.attemptRow}>
                {practice.master.imageUrl ? (
                  <View style={styles.attemptCard}>
                    <Image
                      accessibilityLabel="本次临写范字"
                      source={{ uri: practice.master.imageUrl }}
                      style={styles.attemptImage}
                    />
                    <Text style={styles.caption}>临写范字</Text>
                  </View>
                ) : null}
                {practice.attempts.map((attempt) => (
                  <View key={attempt.artworkId} style={styles.attemptCard}>
                    <Image
                      accessibilityLabel={`第 ${attempt.sequence} 次练习`}
                      source={{ uri: attempt.imageUrl }}
                      style={styles.attemptImage}
                    />
                    <Text style={styles.caption}>第 {attempt.sequence} 次</Text>
                  </View>
                ))}
              </View>
            </ScrollView>
            {practice.attempts.at(-1)?.advice ? (
              <View style={styles.adviceCard}>
                <Text style={styles.adviceTitle}>基础结构提示</Text>
                <Text style={styles.adviceDisclaimer}>
                  仅比较几何位置与比例，不评价笔法、气韵或艺术高下。
                </Text>
                {practice.attempts.at(-1)?.advice?.suggestions.length === 0 ? (
                  <Text style={styles.helperText}>
                    本次没有达到提示阈值的明显几何差异。
                  </Text>
                ) : null}
                {practice.attempts
                  .at(-1)
                  ?.advice?.suggestions.map((suggestion) => (
                    <View key={suggestion.code} style={styles.suggestionItem}>
                      <Text style={styles.suggestionPhenomenon}>
                        {suggestion.phenomenon}
                      </Text>
                      <Text style={styles.helperText}>
                        {suggestion.evidence}
                      </Text>
                      <Text style={styles.suggestionAction}>
                        {suggestion.action}
                      </Text>
                    </View>
                  ))}
                <View style={styles.feedbackRow}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={feedbackSent}
                    onPress={() => sendAdviceFeedback(true)}
                    style={styles.feedbackButton}
                  >
                    <Text style={styles.modeButtonText}>有帮助</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={feedbackSent}
                    onPress={() => sendAdviceFeedback(false)}
                    style={styles.feedbackButton}
                  >
                    <Text style={styles.modeButtonText}>不准确</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Text style={styles.helperText}>
                结构提示正在后台生成，稍后刷新记录即可查看。
              </Text>
            )}
            <View style={styles.practiceActions}>
              <Pressable
                accessibilityRole="button"
                onPress={openCamera}
                style={styles.primaryButton}
              >
                <Text style={styles.primaryButtonText}>再练一次</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={sharePractice}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>主动分享</Text>
              </Pressable>
              {activeShareId ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={revokeShare}
                  style={styles.textButton}
                >
                  <Text style={styles.textButtonText}>撤销最近一次分享</Text>
                </Pressable>
              ) : null}
              {practice.attempts.length > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={confirmDeleteLatestArtwork}
                  style={styles.textButton}
                >
                  <Text style={styles.destructiveButtonText}>
                    删除最近一次原图
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: "#F3EBDD", flex: 1 },
  container: {
    gap: 28,
    justifyContent: "center",
    minHeight: "100%",
    padding: 28,
  },
  eyebrow: {
    color: "#8C3C2D",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
  },
  title: { color: "#241E1A", fontSize: 34, fontWeight: "700", lineHeight: 44 },
  body: { color: "#5E554E", fontSize: 17, lineHeight: 28, marginTop: 18 },
  previewCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#D8CCBB",
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
    padding: 12,
  },
  previewImage: {
    aspectRatio: 1,
    backgroundColor: "#E8DFD1",
    borderRadius: 12,
    width: "100%",
  },
  guideCard: {
    alignItems: "center",
    aspectRatio: 1,
    backgroundColor: "#E8DFD1",
    borderColor: "#B9AD9B",
    borderRadius: 18,
    borderStyle: "dashed",
    borderWidth: 1,
    justifyContent: "center",
    padding: 28,
  },
  guideCharacter: { color: "#7B7067", fontSize: 120, opacity: 0.32 },
  caption: {
    color: "#6B6159",
    fontSize: 14,
    lineHeight: 22,
    padding: 10,
    textAlign: "center",
  },
  actions: { gap: 12 },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#8C3C2D",
    borderRadius: 12,
    padding: 17,
  },
  primaryButtonText: { color: "#FFFFFF", fontSize: 17, fontWeight: "700" },
  secondaryButton: {
    alignItems: "center",
    borderColor: "#8C3C2D",
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
  },
  secondaryButtonText: { color: "#8C3C2D", fontSize: 17, fontWeight: "700" },
  uploadButton: {
    alignItems: "center",
    backgroundColor: "#2E5D43",
    borderRadius: 12,
    marginTop: 4,
    padding: 17,
  },
  cancelUploadButton: {
    alignItems: "center",
    borderColor: "#9E2A2B",
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  cancelUploadText: { color: "#9E2A2B", fontSize: 16, fontWeight: "700" },
  disabledButton: { opacity: 0.55 },
  nextStep: {
    color: "#5E554E",
    fontSize: 14,
    lineHeight: 22,
    textAlign: "center",
  },
  errorText: { color: "#9E2A2B" },
  findingsCard: {
    backgroundColor: "#FFF8E8",
    borderColor: "#D8B66D",
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    padding: 16,
  },
  findingText: { color: "#604B24", fontSize: 15, lineHeight: 24 },
  characterCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    gap: 14,
    padding: 18,
  },
  sectionTitle: { color: "#241E1A", fontSize: 22, fontWeight: "700" },
  helperText: { color: "#6B6159", fontSize: 14, lineHeight: 22 },
  characterRow: { flexDirection: "row", gap: 12 },
  characterInput: {
    backgroundColor: "#F7F2E9",
    borderColor: "#B9AD9B",
    borderRadius: 10,
    borderWidth: 1,
    color: "#241E1A",
    fontSize: 30,
    height: 58,
    width: 72,
  },
  searchButton: {
    alignItems: "center",
    backgroundColor: "#2E5D43",
    borderRadius: 10,
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  catalogSection: { gap: 12 },
  filterLabel: { color: "#6B6159", fontSize: 13, fontWeight: "600" },
  filterRow: { flexDirection: "row", gap: 8 },
  filterChip: {
    backgroundColor: "#EEE6D8",
    borderColor: "#D0C2AF",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  activeFilterChip: { backgroundColor: "#D9C1A9", borderColor: "#8C3C2D" },
  filterChipText: { color: "#4E4036", fontSize: 13 },
  glyphCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#D8CCBB",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 14,
    padding: 12,
  },
  selectedGlyphCard: { borderColor: "#8C3C2D", borderWidth: 2 },
  glyphThumbnail: {
    backgroundColor: "#F0EBE2",
    borderRadius: 8,
    height: 100,
    width: 100,
  },
  missingImage: {
    alignItems: "center",
    backgroundColor: "#F0EBE2",
    borderRadius: 8,
    height: 100,
    justifyContent: "center",
    padding: 8,
    width: 100,
  },
  glyphMeta: { flex: 1, gap: 5, justifyContent: "center" },
  glyphTitle: { color: "#241E1A", fontSize: 17, fontWeight: "700" },
  sourceText: { color: "#776E66", fontSize: 12, lineHeight: 19 },
  detailButton: {
    alignItems: "center",
    borderColor: "#8C3C2D",
    borderRadius: 9,
    borderWidth: 1,
    padding: 10,
  },
  glyphDetailCard: {
    backgroundColor: "#F7F2E9",
    borderColor: "#D8CCBB",
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    padding: 14,
  },
  issueFeedbackCard: {
    backgroundColor: "#F7F2E9",
    borderRadius: 12,
    gap: 10,
    padding: 14,
  },
  feedbackInput: {
    backgroundColor: "#FFFFFF",
    borderColor: "#D0C2AF",
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 76,
    padding: 10,
    textAlignVertical: "top",
  },
  compareSection: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    gap: 16,
    padding: 18,
  },
  modeRow: { flexDirection: "row", gap: 10 },
  modeButton: {
    alignItems: "center",
    backgroundColor: "#EEE6D8",
    borderRadius: 8,
    flex: 1,
    padding: 10,
  },
  activeModeButton: { backgroundColor: "#D9C1A9" },
  modeButtonText: { color: "#4E4036", fontSize: 14, fontWeight: "600" },
  sideBySide: { flexDirection: "row", gap: 10 },
  compareCell: { flex: 1 },
  compareImageViewport: {
    aspectRatio: 1,
    backgroundColor: "#F0EBE2",
    borderRadius: 8,
    overflow: "hidden",
    width: "100%",
  },
  compareImage: {
    height: "100%",
    resizeMode: "contain",
    width: "100%",
  },
  zoomControls: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
  },
  zoomValue: {
    color: "#5E554E",
    fontSize: 12,
    minWidth: 42,
    textAlign: "center",
  },
  overlayCanvas: {
    aspectRatio: 1,
    backgroundColor: "#F0EBE2",
    borderRadius: 8,
    overflow: "hidden",
    position: "relative",
    width: "100%",
  },
  overlayTransformLayer: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  overlayImage: {
    height: "100%",
    left: 0,
    position: "absolute",
    resizeMode: "contain",
    top: 0,
    width: "100%",
  },
  gestureHelp: {
    color: "#6B6159",
    fontSize: 12,
    lineHeight: 19,
    textAlign: "center",
  },
  opacityRow: { flexDirection: "row", gap: 8 },
  opacityButton: {
    alignItems: "center",
    backgroundColor: "#EEE6D8",
    borderRadius: 8,
    flex: 1,
    padding: 9,
  },
  transformControls: { flexDirection: "row", gap: 8 },
  compactControl: {
    alignItems: "center",
    backgroundColor: "#EEE6D8",
    borderRadius: 8,
    flex: 1,
    justifyContent: "center",
    minHeight: 36,
    paddingHorizontal: 8,
  },
  transformStatusRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
  },
  resetControl: {
    borderColor: "#8C3C2D",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  guideToggleRow: {
    alignItems: "center",
    backgroundColor: "#F7F2E9",
    borderRadius: 10,
    flexDirection: "row",
    gap: 12,
    padding: 12,
  },
  guideToggleCopy: { flex: 1, gap: 3 },
  centerGuideLayer: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  centerGuideVertical: {
    backgroundColor: "rgba(57, 66, 61, 0.45)",
    bottom: 0,
    left: "50%",
    position: "absolute",
    top: 0,
    width: 1,
  },
  centerGuideHorizontal: {
    backgroundColor: "rgba(57, 66, 61, 0.45)",
    height: 1,
    left: 0,
    position: "absolute",
    right: 0,
    top: "50%",
  },
  structureGuideLayer: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  structureBoundingBox: {
    borderWidth: 2,
    position: "absolute",
  },
  structureCentroid: {
    borderColor: "#FFFFFF",
    borderRadius: 6,
    borderWidth: 1,
    height: 12,
    marginLeft: -6,
    marginTop: -6,
    position: "absolute",
    width: 12,
  },
  overlayDisclaimer: {
    backgroundColor: "#FFF8E8",
    borderRadius: 8,
    color: "#604B24",
    fontSize: 12,
    lineHeight: 19,
    padding: 10,
  },
  practiceCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    gap: 14,
    padding: 18,
  },
  attemptRow: { flexDirection: "row", gap: 12 },
  attemptCard: { width: 150 },
  attemptImage: {
    aspectRatio: 1,
    backgroundColor: "#F0EBE2",
    borderRadius: 8,
    resizeMode: "contain",
    width: 150,
  },
  practiceActions: { gap: 10 },
  feedbackSection: { gap: 10 },
  feedbackTicketList: { gap: 8 },
  feedbackTicketRow: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    gap: 5,
    padding: 12,
  },
  feedbackTicketHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  feedbackStatus: {
    backgroundColor: "#EEE6D8",
    borderRadius: 999,
    color: "#6A4A34",
    fontSize: 12,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  historySection: { gap: 10 },
  favoritesSection: { gap: 10 },
  favoriteLibrary: { gap: 12 },
  favoriteGroupCreator: { flexDirection: "row", gap: 8 },
  favoriteGroupInput: {
    backgroundColor: "#FFFFFF",
    borderColor: "#D0C2AF",
    borderRadius: 9,
    borderWidth: 1,
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  favoriteCompactButton: {
    alignItems: "center",
    backgroundColor: "#EEE6D8",
    borderRadius: 8,
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  favoriteGroupCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#D8CCBB",
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  favoriteGroupHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  favoriteInlineActions: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  favoriteIconButton: {
    alignItems: "center",
    borderColor: "#D0C2AF",
    borderRadius: 7,
    borderWidth: 1,
    minWidth: 34,
    paddingHorizontal: 7,
    paddingVertical: 6,
  },
  favoriteItem: {
    borderTopColor: "#E8DED0",
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 10,
    paddingTop: 10,
  },
  favoriteImage: {
    backgroundColor: "#F0EBE2",
    borderRadius: 8,
    height: 64,
    resizeMode: "contain",
    width: 64,
  },
  favoriteMissingImage: {
    alignItems: "center",
    backgroundColor: "#F0EBE2",
    borderRadius: 8,
    height: 64,
    justifyContent: "center",
    width: 64,
  },
  favoriteItemBody: { flex: 1, gap: 8 },
  favoriteMoveRow: { alignItems: "center", flexDirection: "row", gap: 6 },
  favoriteMoveChip: {
    backgroundColor: "#F7F2E9",
    borderColor: "#D0C2AF",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  privacySection: { gap: 10 },
  privacyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    gap: 4,
    padding: 14,
  },
  privacyRow: {
    alignItems: "center",
    borderBottomColor: "#E8DED0",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    paddingVertical: 12,
  },
  privacyCopy: { flex: 1, gap: 3 },
  privacyPolicy: {
    color: "#776E66",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },
  historyToggle: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderColor: "#C8AA88",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  historyList: { gap: 8 },
  historyPracticeCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    gap: 8,
    overflow: "hidden",
    paddingBottom: 10,
  },
  historyRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14,
    padding: 12,
  },
  historyAttemptPicker: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
  },
  historyAttemptChoice: {
    borderColor: "#D8CCBB",
    borderRadius: 9,
    borderWidth: 1,
    gap: 4,
    padding: 5,
    width: 86,
  },
  selectedHistoryAttemptChoice: {
    backgroundColor: "#F3E3D8",
    borderColor: "#8C3C2D",
    borderWidth: 2,
  },
  historyAttemptImage: {
    aspectRatio: 1,
    backgroundColor: "#F0EBE2",
    borderRadius: 6,
    resizeMode: "contain",
    width: "100%",
  },
  historyComparisonCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#8C3C2D",
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  historyComparisonHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  historyComparisonImages: { flexDirection: "row", gap: 10 },
  historyComparisonCell: { flex: 1 },
  historyComparisonImage: {
    aspectRatio: 1,
    backgroundColor: "#F0EBE2",
    borderRadius: 8,
    resizeMode: "contain",
    width: "100%",
  },
  historyCharacter: { color: "#241E1A", fontSize: 30, fontWeight: "700" },
  historyDetails: { flex: 1, gap: 3 },
  historyTitle: { color: "#3A302A", fontSize: 15, fontWeight: "600" },
  adviceCard: {
    backgroundColor: "#EEF3EC",
    borderColor: "#B8C9B5",
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
    padding: 14,
  },
  adviceTitle: { color: "#294932", fontSize: 17, fontWeight: "700" },
  adviceDisclaimer: { color: "#5A6C5D", fontSize: 12, lineHeight: 19 },
  suggestionItem: {
    borderTopColor: "#CFDCCB",
    borderTopWidth: 1,
    gap: 5,
    paddingTop: 10,
  },
  suggestionPhenomenon: {
    color: "#294932",
    fontSize: 15,
    fontWeight: "700",
  },
  suggestionAction: { color: "#2E5D43", fontSize: 14, lineHeight: 22 },
  feedbackRow: { flexDirection: "row", gap: 8 },
  feedbackButton: {
    alignItems: "center",
    backgroundColor: "#DDE8D9",
    borderRadius: 8,
    flex: 1,
    padding: 9,
  },
  textButton: { alignItems: "center", padding: 8 },
  textButtonText: { color: "#8C3C2D", fontSize: 14 },
  destructiveButtonText: { color: "#B3261E", fontSize: 14 },
});
