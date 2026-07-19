"use client";

import {
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  type AdminAdviceSample,
  type AdminCalligrapher,
  type AdminContentImportBatch,
  type AdminContentHistoryEntry,
  type AdminEdition,
  type AdminFeedbackTicket,
  type AdminFunnelReport,
  type AdminGlyph,
  type AdminRights,
  type AdminSegmentationJob,
  type AdminSourceAsset,
  type AdminSession,
  type AdminWork,
  type PrivateSourceView,
  createAdminContent,
  createAdminSession,
  getAdminAdviceSamples,
  getAdminContent,
  getAdminContentText,
  getAdminFeedback,
  getAdminFunnel,
  reviewAdminAdvice,
  updateAdminContent,
  updateAdminFeedback,
} from "../lib/api";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

type AnnotationBox = {
  bboxHeight: number;
  bboxWidth: number;
  bboxX: number;
  bboxY: number;
};

type AnnotationTarget = {
  candidate: AdminSegmentationJob["candidates"][number];
  job: AdminSegmentationJob;
};

const feedbackKindLabels: Record<AdminFeedbackTicket["kind"], string> = {
  CONTENT_ERROR: "范字或出处错误",
  PRODUCT: "产品建议",
  QUALITY_RESULT: "图片质量判断问题",
  RECOGNITION_ERROR: "识别错误",
  STRUCTURE_ADVICE: "结构提示问题",
};

const funnelStageLabels: Record<
  AdminFunnelReport["stages"][number]["name"],
  string
> = {
  ADVICE_VIEWED: "看到结构建议",
  ARTWORK_UPLOAD_COMPLETED: "完成作品上传",
  CATALOG_RESULTS_VIEWED: "看到同字检索结果",
  CHARACTER_CONFIRMED: "确认所写汉字",
  GLYPH_SELECTED: "选择参照范字",
  PRACTICE_COMPLETED: "完成再次练习闭环",
  PRACTICE_CREATED: "保存首次练习",
  SECOND_ATTEMPT_STARTED: "开始再次练习",
};

function formValues(form: HTMLFormElement): Record<string, unknown> {
  return Object.fromEntries(new FormData(form).entries());
}

function displayHistoryValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function formatRate(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

export default function AdminHomePage() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [calligraphers, setCalligraphers] = useState<AdminCalligrapher[]>([]);
  const [works, setWorks] = useState<AdminWork[]>([]);
  const [editions, setEditions] = useState<AdminEdition[]>([]);
  const [rights, setRights] = useState<AdminRights[]>([]);
  const [sourceAssets, setSourceAssets] = useState<AdminSourceAsset[]>([]);
  const [importBatches, setImportBatches] = useState<AdminContentImportBatch[]>(
    [],
  );
  const [segmentationJobs, setSegmentationJobs] = useState<
    AdminSegmentationJob[]
  >([]);
  const [annotationTarget, setAnnotationTarget] =
    useState<AnnotationTarget | null>(null);
  const [annotationBox, setAnnotationBox] = useState<AnnotationBox | null>(
    null,
  );
  const [sourceView, setSourceView] = useState<PrivateSourceView | null>(null);
  const [annotationZoom, setAnnotationZoom] = useState(1);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const [glyphs, setGlyphs] = useState<AdminGlyph[]>([]);
  const [feedbackTickets, setFeedbackTickets] = useState<AdminFeedbackTicket[]>(
    [],
  );
  const [adviceSamples, setAdviceSamples] = useState<AdminAdviceSample[]>([]);
  const [adviceSampleStatus, setAdviceSampleStatus] = useState<
    "ALL" | "REVIEWED" | "UNREVIEWED"
  >("UNREVIEWED");
  const [funnelReport, setFunnelReport] = useState<AdminFunnelReport | null>(
    null,
  );
  const [contentHistory, setContentHistory] = useState<
    AdminContentHistoryEntry[]
  >([]);
  const [historyTarget, setHistoryTarget] = useState<{
    entityId: string;
    entityType: string;
    label: string;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [glyphNotes, setGlyphNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function refreshContent(
    token: string,
    staffRoles: string[] = session?.staff.roles ?? [],
  ): Promise<void> {
    const canLoadAdvice =
      staffRoles.includes("ADMIN") || staffRoles.includes("REVIEWER");
    const canLoadFunnel = canLoadAdvice || staffRoles.includes("EDITOR");
    const [
      nextCalligraphers,
      nextWorks,
      nextEditions,
      nextRights,
      nextSourceAssets,
      nextImportBatches,
      nextSegmentationJobs,
      nextGlyphs,
      nextFeedbackTickets,
      nextAdviceSamples,
      nextFunnelReport,
    ] = await Promise.all([
      getAdminContent<AdminCalligrapher[]>(apiBaseUrl, token, "calligraphers"),
      getAdminContent<AdminWork[]>(apiBaseUrl, token, "works"),
      getAdminContent<AdminEdition[]>(apiBaseUrl, token, "editions"),
      getAdminContent<AdminRights[]>(apiBaseUrl, token, "rights"),
      getAdminContent<AdminSourceAsset[]>(apiBaseUrl, token, "source-assets"),
      getAdminContent<AdminContentImportBatch[]>(
        apiBaseUrl,
        token,
        "import-batches",
      ),
      getAdminContent<AdminSegmentationJob[]>(
        apiBaseUrl,
        token,
        "segmentation-jobs",
      ),
      getAdminContent<AdminGlyph[]>(apiBaseUrl, token, "glyphs"),
      getAdminFeedback(apiBaseUrl, token),
      canLoadAdvice
        ? getAdminAdviceSamples(apiBaseUrl, token, adviceSampleStatus)
        : Promise.resolve([]),
      canLoadFunnel ? getAdminFunnel(apiBaseUrl, token) : Promise.resolve(null),
    ]);
    setCalligraphers(nextCalligraphers);
    setWorks(nextWorks);
    setEditions(nextEditions);
    setRights(nextRights);
    setSourceAssets(nextSourceAssets);
    setImportBatches(nextImportBatches);
    setSegmentationJobs(nextSegmentationJobs);
    setGlyphs(nextGlyphs);
    setFeedbackTickets(nextFeedbackTickets);
    setAdviceSamples(nextAdviceSamples);
    setFunnelReport(nextFunnelReport);
  }

  const hasActiveSegmentation = segmentationJobs.some((job) =>
    ["PENDING", "PROCESSING"].includes(job.status),
  );

  useEffect(() => {
    if (!session || !hasActiveSegmentation) return;
    const interval = window.setInterval(() => {
      void getAdminContent<AdminSegmentationJob[]>(
        apiBaseUrl,
        session.accessToken,
        "segmentation-jobs",
      )
        .then(setSegmentationJobs)
        .catch((error: unknown) => {
          setMessage(
            error instanceof Error ? error.message : "预切分状态刷新失败。",
          );
        });
    }, 3_000);
    return () => window.clearInterval(interval);
  }, [hasActiveSegmentation, session]);

  async function login(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const values = formValues(event.currentTarget);
    try {
      const nextSession = await createAdminSession(
        apiBaseUrl,
        String(values.email ?? ""),
        String(values.password ?? ""),
      );
      setSession(nextSession);
      await refreshContent(nextSession.accessToken, nextSession.staff.roles);
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "登录失败。");
    } finally {
      setBusy(false);
    }
  }

  async function createContent(
    event: FormEvent<HTMLFormElement>,
    resource: string,
  ): Promise<void> {
    event.preventDefault();
    if (!session) return;
    setBusy(true);
    setMessage(null);
    const form = event.currentTarget;
    const values = formValues(form);
    if (resource === "rights") {
      values.allowCommercial = new FormData(form).has("allowCommercial");
    }
    try {
      await createAdminContent(
        apiBaseUrl,
        session.accessToken,
        resource,
        values,
      );
      form.reset();
      await refreshContent(session.accessToken);
      setMessage("已保存，并写入内容审计记录。");
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "保存失败。");
    } finally {
      setBusy(false);
    }
  }

  async function updateMasterData(
    event: FormEvent<HTMLFormElement>,
    resource: "calligraphers" | "works" | "editions" | "rights",
    id: string,
  ): Promise<void> {
    event.preventDefault();
    if (!session) return;
    setBusy(true);
    setMessage(null);
    const values = formValues(event.currentTarget);
    if (Object.hasOwn(values, "isActive")) {
      values.isActive = values.isActive === "true";
    }
    if (resource === "rights") {
      values.allowCommercial = values.allowCommercial === "true";
    }
    try {
      await updateAdminContent(
        apiBaseUrl,
        session.accessToken,
        `${resource}/${encodeURIComponent(id)}`,
        values,
      );
      await refreshContent(session.accessToken);
      setMessage("主数据已更新；受影响的公开字图已安全归档。");
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "更新失败。");
    } finally {
      setBusy(false);
    }
  }

  async function loadContentHistory(
    entityType: string,
    entityId: string,
    label: string,
  ): Promise<void> {
    if (!session) return;
    setBusy(true);
    setMessage(null);
    try {
      const query = new URLSearchParams({ entityId, entityType });
      const history = await getAdminContent<AdminContentHistoryEntry[]>(
        apiBaseUrl,
        session.accessToken,
        `history?${query.toString()}`,
      );
      setHistoryTarget({ entityId, entityType, label });
      setContentHistory(history);
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "历史加载失败。");
    } finally {
      setBusy(false);
    }
  }

  async function restoreContentHistory(auditId: string): Promise<void> {
    if (!session || !historyTarget) return;
    setBusy(true);
    setMessage(null);
    try {
      await createAdminContent(
        apiBaseUrl,
        session.accessToken,
        `history/${encodeURIComponent(auditId)}/restore`,
        {},
      );
      await refreshContent(session.accessToken);
      const query = new URLSearchParams({
        entityId: historyTarget.entityId,
        entityType: historyTarget.entityType,
      });
      setContentHistory(
        await getAdminContent<AdminContentHistoryEntry[]>(
          apiBaseUrl,
          session.accessToken,
          `history?${query.toString()}`,
        ),
      );
      setMessage("历史版本已通过正常编辑流程恢复，并生成新的审计记录。");
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "恢复失败。");
    } finally {
      setBusy(false);
    }
  }

  async function uploadSource(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (!session) return;
    setBusy(true);
    setMessage(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    try {
      if (!(file instanceof File) || file.size === 0) {
        throw new Error("请选择一张原帖图片。");
      }
      const bitmap = await createImageBitmap(file);
      const digest = await crypto.subtle.digest(
        "SHA-256",
        await file.arrayBuffer(),
      );
      const checksumSha256 = Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      const upload = await createAdminContent<{
        requiredHeaders: Record<string, string>;
        uploadId: string;
        uploadUrl: string;
      }>(apiBaseUrl, session.accessToken, "source-uploads", {
        checksumSha256,
        editionId: String(data.get("editionId") ?? ""),
        height: bitmap.height,
        mimeType: file.type,
        pageLabel: String(data.get("pageLabel") ?? ""),
        rightsRecordId: String(data.get("rightsRecordId") ?? ""),
        sizeBytes: file.size,
        width: bitmap.width,
      });
      bitmap.close();
      const put = await fetch(upload.uploadUrl, {
        body: file,
        headers: upload.requiredHeaders,
        method: "PUT",
      });
      if (!put.ok) throw new Error(`原帖上传失败（${put.status}）。`);
      const completed = await createAdminContent<{ sourceAssetId: string }>(
        apiBaseUrl,
        session.accessToken,
        `source-uploads/${upload.uploadId}/complete`,
        {},
      );
      form.reset();
      await refreshContent(session.accessToken);
      setMessage(`原帖已核验入库，来源资产 ID：${completed.sourceAssetId}`);
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "原帖上传失败。");
    } finally {
      setBusy(false);
    }
  }

  async function startSegmentation(sourceAssetId: string): Promise<void> {
    if (!session) return;
    setBusy(true);
    setMessage(null);
    try {
      await createAdminContent(
        apiBaseUrl,
        session.accessToken,
        `source-assets/${encodeURIComponent(sourceAssetId)}/segmentation-jobs`,
        {},
      );
      setSegmentationJobs(
        await getAdminContent<AdminSegmentationJob[]>(
          apiBaseUrl,
          session.accessToken,
          "segmentation-jobs",
        ),
      );
      setMessage("预切分任务已提交；候选框只用于人工复核，不会自动发布。");
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "预切分提交失败。");
    } finally {
      setBusy(false);
    }
  }

  async function downloadImportTemplate(): Promise<void> {
    if (!session) return;
    setBusy(true);
    setMessage(null);
    try {
      const content = await getAdminContentText(
        apiBaseUrl,
        session.accessToken,
        "import-template",
      );
      const url = URL.createObjectURL(
        new Blob([content], { type: "text/csv;charset=utf-8" }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "calligraphy-glyph-import.csv";
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage("批量导入模板已下载。");
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "模板下载失败。");
    } finally {
      setBusy(false);
    }
  }

  async function previewContentImport(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (!session) return;
    const form = event.currentTarget;
    const file = new FormData(form).get("csvFile");
    if (!(file instanceof File) || file.size === 0) {
      setMessage("请选择填写完成的 CSV 文件。");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await createAdminContent(
        apiBaseUrl,
        session.accessToken,
        "import-batches/preview",
        { csvText: await file.text(), fileName: file.name },
      );
      setImportBatches(
        await getAdminContent<AdminContentImportBatch[]>(
          apiBaseUrl,
          session.accessToken,
          "import-batches",
        ),
      );
      form.reset();
      setMessage("预检完成；请查看逐行报告，全部通过后再提交导入。");
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "批量预检失败。");
    } finally {
      setBusy(false);
    }
  }

  async function commitContentImport(batchId: string): Promise<void> {
    if (!session) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await createAdminContent<{
        glyphCount: number;
        status: "COMMITTED";
      }>(
        apiBaseUrl,
        session.accessToken,
        `import-batches/${encodeURIComponent(batchId)}/commit`,
        {},
      );
      await refreshContent(session.accessToken);
      setMessage(
        `已原子导入 ${result.glyphCount} 个单字，当前进入裁切与双人审核流程。`,
      );
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "批量提交失败。");
    } finally {
      setBusy(false);
    }
  }

  async function openAnnotation(
    job: AdminSegmentationJob,
    candidate: AdminSegmentationJob["candidates"][number],
  ): Promise<void> {
    if (!session || candidate.status !== "PENDING") return;
    setBusy(true);
    setMessage(null);
    try {
      const view = await getAdminContent<PrivateSourceView>(
        apiBaseUrl,
        session.accessToken,
        `source-assets/${encodeURIComponent(job.sourceAsset.id)}/view`,
      );
      setSourceView(view);
      setAnnotationTarget({ candidate, job });
      setAnnotationBox({
        bboxHeight: candidate.bboxHeight,
        bboxWidth: candidate.bboxWidth,
        bboxX: candidate.bboxX,
        bboxY: candidate.bboxY,
      });
      setAnnotationZoom(1);
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "原帖加载失败。");
    } finally {
      setBusy(false);
    }
  }

  function sourcePoint(
    event: ReactPointerEvent<HTMLDivElement>,
  ): { x: number; y: number } | null {
    if (!sourceView) return null;
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(
        0,
        Math.min(
          sourceView.width - 1,
          Math.round(
            ((event.clientX - bounds.left) / bounds.width) * sourceView.width,
          ),
        ),
      ),
      y: Math.max(
        0,
        Math.min(
          sourceView.height - 1,
          Math.round(
            ((event.clientY - bounds.top) / bounds.height) * sourceView.height,
          ),
        ),
      ),
    };
  }

  function beginAnnotationBox(event: ReactPointerEvent<HTMLDivElement>): void {
    const point = sourcePoint(event);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStart.current = point;
    setAnnotationBox({
      bboxHeight: 1,
      bboxWidth: 1,
      bboxX: point.x,
      bboxY: point.y,
    });
  }

  function moveAnnotationBox(event: ReactPointerEvent<HTMLDivElement>): void {
    const start = dragStart.current;
    const point = sourcePoint(event);
    if (!start || !point) return;
    setAnnotationBox({
      bboxHeight: Math.max(1, Math.abs(point.y - start.y)),
      bboxWidth: Math.max(1, Math.abs(point.x - start.x)),
      bboxX: Math.min(start.x, point.x),
      bboxY: Math.min(start.y, point.y),
    });
  }

  function finishAnnotationBox(): void {
    dragStart.current = null;
  }

  function updateAnnotationCoordinate(
    field: keyof AnnotationBox,
    value: string,
  ): void {
    if (!sourceView) return;
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) return;
    setAnnotationBox((current) => {
      if (!current) return current;
      const next = { ...current, [field]: Math.max(0, parsed) };
      next.bboxWidth = Math.max(
        1,
        Math.min(next.bboxWidth, sourceView.width - next.bboxX),
      );
      next.bboxHeight = Math.max(
        1,
        Math.min(next.bboxHeight, sourceView.height - next.bboxY),
      );
      next.bboxX = Math.min(next.bboxX, sourceView.width - 1);
      next.bboxY = Math.min(next.bboxY, sourceView.height - 1);
      return next;
    });
  }

  async function annotateCandidate(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (!session || !annotationTarget || !annotationBox) return;
    const submitter = (event.nativeEvent as SubmitEvent)
      .submitter as HTMLButtonElement | null;
    const action = submitter?.value ?? "accept";
    const values = formValues(event.currentTarget);
    setBusy(true);
    setMessage(null);
    try {
      if (action === "reject") {
        await createAdminContent(
          apiBaseUrl,
          session.accessToken,
          `segmentation-candidates/${encodeURIComponent(annotationTarget.candidate.id)}/reject`,
          { note: values.rejectionNote },
        );
      } else {
        await createAdminContent(
          apiBaseUrl,
          session.accessToken,
          `segmentation-candidates/${encodeURIComponent(annotationTarget.candidate.id)}/accept`,
          { ...values, ...annotationBox },
        );
      }
      await refreshContent(session.accessToken);
      setAnnotationTarget(null);
      setAnnotationBox(null);
      setSourceView(null);
      setMessage(
        action === "reject"
          ? "候选框已驳回并记录原因。"
          : "标注已保存，单字裁切任务已提交审核链路。",
      );
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "标注保存失败。");
    } finally {
      setBusy(false);
    }
  }

  async function operateGlyph(
    glyphId: string,
    action: "approve" | "changes" | "publish" | "reject" | "unpublish",
  ): Promise<void> {
    if (!session) return;
    setBusy(true);
    setMessage(null);
    try {
      const note = glyphNotes[glyphId]?.trim() ?? "";
      const reviewDecision =
        action === "approve"
          ? "APPROVED"
          : action === "changes"
            ? "CHANGES_REQUESTED"
            : action === "reject"
              ? "REJECTED"
              : null;
      const resource = reviewDecision
        ? `glyphs/${glyphId}/reviews`
        : `glyphs/${glyphId}/${action}`;
      await createAdminContent(apiBaseUrl, session.accessToken, resource, {
        ...(reviewDecision ? { decision: reviewDecision, note } : {}),
        ...(action === "unpublish" ? { reason: note } : {}),
      });
      await refreshContent(session.accessToken);
      setGlyphNotes((current) => ({ ...current, [glyphId]: "" }));
      setMessage(
        {
          approve: "单字审核通过。",
          changes: "已退回修改并记录原因。",
          publish: "单字已发布，公开查字缓存已失效。",
          reject: "单字已驳回归档。",
          unpublish: "单字已下架，公开衍生图和查字缓存已清理。",
        }[action],
      );
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "操作失败。");
    } finally {
      setBusy(false);
    }
  }

  async function correctGlyph(
    event: FormEvent<HTMLFormElement>,
    glyphId: string,
  ): Promise<void> {
    event.preventDefault();
    if (!session) return;
    setBusy(true);
    setMessage(null);
    try {
      await updateAdminContent(
        apiBaseUrl,
        session.accessToken,
        `glyphs/${glyphId}`,
        formValues(event.currentTarget),
      );
      await refreshContent(session.accessToken);
      setMessage("纠错已保存；坐标变化会重新裁切，之后必须重新审核。");
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "纠错保存失败。");
    } finally {
      setBusy(false);
    }
  }

  async function updateFeedbackTicket(
    event: FormEvent<HTMLFormElement>,
    feedbackId: string,
  ): Promise<void> {
    event.preventDefault();
    if (!session) return;
    setBusy(true);
    setMessage(null);
    try {
      await updateAdminFeedback(
        apiBaseUrl,
        session.accessToken,
        feedbackId,
        formValues(event.currentTarget),
      );
      await refreshContent(session.accessToken);
      setMessage("反馈工单已更新；处理说明会显示在用户的 App 内进度中。");
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "反馈工单更新失败。");
    } finally {
      setBusy(false);
    }
  }

  async function loadAdviceSampleStatus(
    status: "ALL" | "REVIEWED" | "UNREVIEWED",
  ): Promise<void> {
    if (!session) return;
    setBusy(true);
    setMessage(null);
    try {
      setAdviceSamples(
        await getAdminAdviceSamples(apiBaseUrl, session.accessToken, status),
      );
      setAdviceSampleStatus(status);
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "建议样本加载失败。");
    } finally {
      setBusy(false);
    }
  }

  async function reviewAdviceSample(
    event: FormEvent<HTMLFormElement>,
    attemptId: string,
  ): Promise<void> {
    event.preventDefault();
    if (!session) return;
    const values = formValues(event.currentTarget);
    setBusy(true);
    setMessage(null);
    try {
      await reviewAdminAdvice(apiBaseUrl, session.accessToken, attemptId, {
        comment: String(values.comment ?? ""),
        verdict: String(values.verdict ?? ""),
      });
      setAdviceSamples(
        await getAdminAdviceSamples(
          apiBaseUrl,
          session.accessToken,
          adviceSampleStatus,
        ),
      );
      setMessage("教师抽检意见已保存，并写入不可变审计记录。");
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "建议抽检保存失败。");
    } finally {
      setBusy(false);
    }
  }

  if (!session) {
    return (
      <main className="login-shell">
        <form className="panel login-panel" onSubmit={login}>
          <p className="eyebrow">内容基础设施</p>
          <h1>书法内容管理后台</h1>
          <label>
            工作邮箱
            <input autoComplete="username" name="email" required type="email" />
          </label>
          <label>
            密码
            <input
              autoComplete="current-password"
              name="password"
              required
              type="password"
            />
          </label>
          <button disabled={busy} type="submit">
            {busy ? "登录中…" : "登录"}
          </button>
          {message ? <p className="error">{message}</p> : null}
        </form>
      </main>
    );
  }

  const roles = new Set(session.staff.roles);
  const canEdit = roles.has("ADMIN") || roles.has("EDITOR");
  const canReview = roles.has("ADMIN") || roles.has("REVIEWER");
  const canUnpublish =
    roles.has("ADMIN") || roles.has("REVIEWER") || roles.has("RIGHTS");
  const canManageRights = roles.has("ADMIN") || roles.has("RIGHTS");
  const canRestoreSelectedHistory =
    historyTarget?.entityType === "RightsRecord" ? canManageRights : canEdit;
  const canManageFeedback =
    roles.has("ADMIN") ||
    roles.has("EDITOR") ||
    roles.has("REVIEWER") ||
    roles.has("RIGHTS");
  const canViewAnalytics = canEdit || canReview;

  return (
    <main>
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">内容基础设施</p>
          <h1>书法内容管理后台</h1>
        </div>
        <div className="staff-badge">
          {session.staff.email}
          <small>{session.staff.roles.join(" / ")}</small>
        </div>
      </header>
      {message ? <p className="notice">{message}</p> : null}
      <section className="module-grid">
        <section className="panel master-data-panel">
          <div>
            <p className="eyebrow">主数据生命周期</p>
            <h2>编辑与停用</h2>
            <p className="form-help">
              停用书家、作品或版本会立即归档其已发布字图并清理公开衍生文件；重新启用不会自动恢复发布。
            </p>
          </div>

          {canEdit ? (
            <div className="master-data-group">
              <h3>书家</h3>
              {calligraphers.map((item) => (
                <form
                  className="master-data-row"
                  key={JSON.stringify(item)}
                  onSubmit={(event) =>
                    updateMasterData(event, "calligraphers", item.id)
                  }
                >
                  <label>
                    姓名
                    <input defaultValue={item.name} name="name" required />
                  </label>
                  <label>
                    朝代
                    <input
                      defaultValue={item.dynasty}
                      name="dynasty"
                      required
                    />
                  </label>
                  <label className="master-data-wide">
                    简介
                    <input
                      defaultValue={item.biography ?? ""}
                      name="biography"
                    />
                  </label>
                  <label>
                    状态
                    <select
                      defaultValue={String(item.isActive)}
                      name="isActive"
                    >
                      <option value="true">启用</option>
                      <option value="false">停用并下架</option>
                    </select>
                  </label>
                  <button disabled={busy} type="submit">
                    保存
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      loadContentHistory("Calligrapher", item.id, item.name)
                    }
                    type="button"
                  >
                    历史
                  </button>
                </form>
              ))}
            </div>
          ) : null}

          {canEdit ? (
            <div className="master-data-group">
              <h3>作品</h3>
              {works.map((item) => (
                <form
                  className="master-data-row"
                  key={JSON.stringify(item)}
                  onSubmit={(event) =>
                    updateMasterData(event, "works", item.id)
                  }
                >
                  <label>
                    书家
                    <input disabled value={item.calligrapher.name} />
                  </label>
                  <label>
                    名称
                    <input defaultValue={item.title} name="title" required />
                  </label>
                  <label>
                    朝代
                    <input
                      defaultValue={item.dynasty}
                      name="dynasty"
                      required
                    />
                  </label>
                  <label className="master-data-wide">
                    说明
                    <input
                      defaultValue={item.description ?? ""}
                      name="description"
                    />
                  </label>
                  <label>
                    状态
                    <select
                      defaultValue={String(item.isActive)}
                      name="isActive"
                    >
                      <option value="true">启用</option>
                      <option value="false">停用并下架</option>
                    </select>
                  </label>
                  <button disabled={busy} type="submit">
                    保存
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      loadContentHistory("Work", item.id, item.title)
                    }
                    type="button"
                  >
                    历史
                  </button>
                </form>
              ))}
            </div>
          ) : null}

          {canEdit ? (
            <div className="master-data-group">
              <h3>版本</h3>
              {editions.map((item) => (
                <form
                  className="master-data-row"
                  key={JSON.stringify(item)}
                  onSubmit={(event) =>
                    updateMasterData(event, "editions", item.id)
                  }
                >
                  <label>
                    作品
                    <input disabled value={item.work.title} />
                  </label>
                  <label>
                    版本名称
                    <input defaultValue={item.name} name="name" required />
                  </label>
                  <label>
                    收藏机构
                    <input
                      defaultValue={item.holdingInstitution ?? ""}
                      name="holdingInstitution"
                    />
                  </label>
                  <label>
                    出版信息
                    <input
                      defaultValue={item.publication ?? ""}
                      name="publication"
                    />
                  </label>
                  <label className="master-data-wide">
                    来源链接
                    <input
                      defaultValue={item.sourceUrl ?? ""}
                      name="sourceUrl"
                      type="url"
                    />
                  </label>
                  <label>
                    状态
                    <select
                      defaultValue={String(item.isActive)}
                      name="isActive"
                    >
                      <option value="true">启用</option>
                      <option value="false">停用并下架</option>
                    </select>
                  </label>
                  <button disabled={busy} type="submit">
                    保存
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      loadContentHistory("WorkEdition", item.id, item.name)
                    }
                    type="button"
                  >
                    历史
                  </button>
                </form>
              ))}
            </div>
          ) : null}

          {canManageRights ? (
            <div className="master-data-group">
              <h3>权利记录</h3>
              {rights.map((item) => (
                <form
                  className="master-data-row rights-data-row"
                  key={JSON.stringify(item)}
                  onSubmit={(event) =>
                    updateMasterData(event, "rights", item.id)
                  }
                >
                  <label>
                    来源名称
                    <input
                      defaultValue={item.sourceName}
                      name="sourceName"
                      required
                    />
                  </label>
                  <label>
                    状态
                    <select defaultValue={item.status} name="status">
                      <option value="INTERNAL_TEST_ONLY">仅内部验证</option>
                      <option value="CLEARED_PUBLIC">允许公开</option>
                      <option value="RESTRICTED">受限</option>
                      <option value="EXPIRED">已过期</option>
                    </select>
                  </label>
                  <label>
                    许可名称
                    <input
                      defaultValue={item.licenseName ?? ""}
                      name="licenseName"
                    />
                  </label>
                  <label>
                    最大公开宽度
                    <input
                      defaultValue={item.maxPublicWidth ?? ""}
                      min="1"
                      name="maxPublicWidth"
                      type="number"
                    />
                  </label>
                  <label>
                    生效日期
                    <input
                      defaultValue={item.validFrom?.slice(0, 10) ?? ""}
                      name="validFrom"
                      type="date"
                    />
                  </label>
                  <label>
                    截止日期
                    <input
                      defaultValue={item.validUntil?.slice(0, 10) ?? ""}
                      name="validUntil"
                      type="date"
                    />
                  </label>
                  <label>
                    商业使用
                    <select
                      defaultValue={String(item.allowCommercial)}
                      name="allowCommercial"
                    >
                      <option value="false">不允许</option>
                      <option value="true">允许</option>
                    </select>
                  </label>
                  <label className="master-data-wide">
                    来源链接
                    <input
                      defaultValue={item.sourceUrl ?? ""}
                      name="sourceUrl"
                      type="url"
                    />
                  </label>
                  <label className="master-data-wide">
                    署名要求
                    <input
                      defaultValue={item.attributionText ?? ""}
                      name="attributionText"
                    />
                  </label>
                  <label className="master-data-wide">
                    内部备注
                    <input defaultValue={item.notes ?? ""} name="notes" />
                  </label>
                  <button disabled={busy} type="submit">
                    保存
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      loadContentHistory(
                        "RightsRecord",
                        item.id,
                        item.sourceName,
                      )
                    }
                    type="button"
                  >
                    历史
                  </button>
                </form>
              ))}
            </div>
          ) : null}
        </section>

        {historyTarget ? (
          <section className="panel content-history-panel">
            <div className="history-heading">
              <div>
                <p className="eyebrow">内容版本</p>
                <h2>{historyTarget.label}</h2>
              </div>
              <button
                onClick={() => {
                  setHistoryTarget(null);
                  setContentHistory([]);
                }}
                type="button"
              >
                关闭
              </button>
            </div>
            {contentHistory.length === 0 ? <p>暂无审计记录。</p> : null}
            {contentHistory.map((entry) => (
              <article className="content-history-entry" key={entry.id}>
                <div className="history-heading">
                  <strong>{entry.action}</strong>
                  <small>
                    {new Date(entry.createdAt).toLocaleString("zh-CN")} ·{" "}
                    {entry.actorKey}
                  </small>
                </div>
                {entry.changes.length > 0 ? (
                  <div className="history-changes">
                    {entry.changes.map((change) => (
                      <div key={change.field}>
                        <strong>{change.field}</strong>
                        <span>{displayHistoryValue(change.before)}</span>
                        <span>→</span>
                        <span>{displayHistoryValue(change.after)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="form-help">该操作没有可展示的字段差异。</p>
                )}
                {entry.canRestore ? (
                  <button
                    disabled={busy || !canRestoreSelectedHistory}
                    onClick={() => restoreContentHistory(entry.id)}
                    type="button"
                  >
                    恢复到修改前
                  </button>
                ) : null}
              </article>
            ))}
          </section>
        ) : null}

        <form
          className="panel"
          onSubmit={(event) => createContent(event, "calligraphers")}
        >
          <h2>新增书家</h2>
          <label>
            姓名
            <input name="name" required />
          </label>
          <label>
            朝代
            <input name="dynasty" required />
          </label>
          <label>
            简介
            <textarea name="biography" rows={4} />
          </label>
          <button disabled={busy} type="submit">
            保存书家
          </button>
        </form>

        <section className="panel segmentation-panel">
          <div>
            <p className="eyebrow">机器预切分</p>
            <h2>原帖候选框任务</h2>
            <p className="form-help">
              算法只定位可能的单字区域。字符、异体字、出处与真实性仍需人工标注和双人审核。
            </p>
          </div>
          <div className="segmentation-source-list">
            {sourceAssets.map((source) => {
              const activeJob = segmentationJobs.find(
                (job) =>
                  job.sourceAsset.id === source.id &&
                  ["PENDING", "PROCESSING"].includes(job.status),
              );
              return (
                <div key={source.id}>
                  <span>
                    {source.edition.work.title} · {source.edition.name}
                    {source.pageLabel ? ` · ${source.pageLabel}` : ""}
                  </span>
                  <button
                    disabled={
                      busy || !canEdit || activeJob?.status === "PROCESSING"
                    }
                    onClick={() => startSegmentation(source.id)}
                    type="button"
                  >
                    {activeJob?.status === "PROCESSING"
                      ? "PROCESSING"
                      : activeJob?.status === "PENDING"
                        ? "重新入队"
                        : "提交预切分"}
                  </button>
                </div>
              );
            })}
          </div>
          {segmentationJobs.map((job) => (
            <article className="segmentation-job" key={job.id}>
              <div className="history-heading">
                <strong>
                  {job.sourceAsset.edition.work.title} ·{" "}
                  {job.sourceAsset.edition.name}
                </strong>
                <small>{job.status}</small>
              </div>
              <p className="form-help">
                {new Date(job.createdAt).toLocaleString("zh-CN")} ·{" "}
                {job.requestedBy}
                {job.algorithmVersion ? ` · ${job.algorithmVersion}` : ""}
              </p>
              {job.failureMessage ? (
                <p className="error">
                  {job.failureCode}：{job.failureMessage}
                </p>
              ) : null}
              {job.status === "COMPLETED" ? (
                <>
                  <div
                    className="segmentation-preview"
                    style={{
                      aspectRatio: `${job.sourceAsset.width} / ${job.sourceAsset.height}`,
                    }}
                  >
                    {job.candidates.map((candidate) => (
                      <span
                        key={candidate.id}
                        style={{
                          height: `${(candidate.bboxHeight / job.sourceAsset.height) * 100}%`,
                          left: `${(candidate.bboxX / job.sourceAsset.width) * 100}%`,
                          top: `${(candidate.bboxY / job.sourceAsset.height) * 100}%`,
                          width: `${(candidate.bboxWidth / job.sourceAsset.width) * 100}%`,
                        }}
                        title={`#${candidate.sortOrder + 1} · ${Math.round(candidate.confidence / 10)}%`}
                      />
                    ))}
                  </div>
                  <p className="form-help">
                    共 {job.candidates.length}{" "}
                    个候选框；待处理候选必须人工确认后才能进入裁切与审核链路。
                  </p>
                  <div className="segmentation-candidate-list">
                    {job.candidates.map((candidate) => (
                      <div
                        className="segmentation-candidate"
                        key={candidate.id}
                      >
                        <span>
                          #{candidate.sortOrder + 1} · ({candidate.bboxX},{" "}
                          {candidate.bboxY}) {candidate.bboxWidth}×
                          {candidate.bboxHeight} · 置信度
                          {Math.round(candidate.confidence / 10)}%
                        </span>
                        <small>{candidate.status}</small>
                        {candidate.glyphId ? (
                          <a href={`#glyph-${candidate.glyphId}`}>查看单字</a>
                        ) : null}
                        {candidate.rejectionNote ? (
                          <span className="candidate-note">
                            原因：{candidate.rejectionNote}
                          </span>
                        ) : null}
                        {candidate.status === "PENDING" && canEdit ? (
                          <button
                            disabled={busy}
                            onClick={() => openAnnotation(job, candidate)}
                            type="button"
                          >
                            人工标注
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
            </article>
          ))}
        </section>

        {annotationTarget && annotationBox && sourceView ? (
          <section className="panel annotation-workbench">
            <div className="annotation-heading">
              <div>
                <p className="eyebrow">人工框选与字符标注</p>
                <h2>
                  {annotationTarget.job.sourceAsset.edition.work.title} · 候选 #
                  {annotationTarget.candidate.sortOrder + 1}
                </h2>
                <p className="form-help">
                  原帖链接五分钟内有效。可在画面拖出新框，也可输入原图像素精确调整。
                </p>
              </div>
              <button
                onClick={() => {
                  setAnnotationTarget(null);
                  setAnnotationBox(null);
                  setSourceView(null);
                }}
                type="button"
              >
                关闭
              </button>
            </div>
            <label className="annotation-zoom">
              缩放 {Math.round(annotationZoom * 100)}%
              <input
                max="2.5"
                min="0.5"
                onChange={(event) =>
                  setAnnotationZoom(Number(event.target.value))
                }
                step="0.1"
                type="range"
                value={annotationZoom}
              />
            </label>
            <div className="annotation-viewport">
              <div
                className="annotation-canvas"
                style={{
                  aspectRatio: `${sourceView.width} / ${sourceView.height}`,
                  width: `${Math.min(sourceView.width, 900) * annotationZoom}px`,
                }}
              >
                <img alt="待标注原帖" draggable={false} src={sourceView.url} />
                <div
                  className="annotation-drag-layer"
                  onPointerCancel={finishAnnotationBox}
                  onPointerDown={beginAnnotationBox}
                  onPointerMove={moveAnnotationBox}
                  onPointerUp={finishAnnotationBox}
                  role="presentation"
                >
                  <span
                    className="annotation-box"
                    style={{
                      height: `${(annotationBox.bboxHeight / sourceView.height) * 100}%`,
                      left: `${(annotationBox.bboxX / sourceView.width) * 100}%`,
                      top: `${(annotationBox.bboxY / sourceView.height) * 100}%`,
                      width: `${(annotationBox.bboxWidth / sourceView.width) * 100}%`,
                    }}
                  />
                </div>
              </div>
            </div>
            <form className="annotation-form" onSubmit={annotateCandidate}>
              <div className="coordinate-grid annotation-coordinates">
                {(
                  [
                    ["bboxX", "X", 0],
                    ["bboxY", "Y", 0],
                    ["bboxWidth", "宽", 1],
                    ["bboxHeight", "高", 1],
                  ] as const
                ).map(([field, label, min]) => (
                  <label key={field}>
                    {label}
                    <input
                      min={min}
                      onChange={(event) =>
                        updateAnnotationCoordinate(field, event.target.value)
                      }
                      required
                      type="number"
                      value={annotationBox[field]}
                    />
                  </label>
                ))}
              </div>
              <label>
                原帖字（保留异体）
                <input maxLength={2} name="observedCharacter" required />
              </label>
              <label>
                最终规范字
                <input maxLength={2} name="canonicalCharacter" required />
              </label>
              <label>
                机器/人工候选字（逗号分隔）
                <input name="characterCandidates" placeholder="如：吉, 古" />
              </label>
              <label>
                异体关系
                <select defaultValue="" name="variantType">
                  <option value="">同一字/无需映射</option>
                  <option value="SIMPLIFIED">简化字</option>
                  <option value="TRADITIONAL">繁体字</option>
                  <option value="HISTORICAL">历史异体</option>
                  <option value="COMPATIBILITY">兼容字形</option>
                </select>
              </label>
              <label className="annotation-wide">
                释文/上下文
                <textarea name="transcription" rows={3} />
              </label>
              <label>
                真实性等级
                <select
                  defaultValue="B_RUBBING_OR_AUTHORIZED_EDITION"
                  name="authenticityGrade"
                >
                  <option value="A_ORIGINAL">原作</option>
                  <option value="B_RUBBING_OR_AUTHORIZED_EDITION">
                    拓本/授权版本
                  </option>
                  <option value="C_MODERN_COPY">现代临本</option>
                </select>
              </label>
              <label>
                图片质量（0-100）
                <input
                  defaultValue="50"
                  max="100"
                  min="0"
                  name="imageQuality"
                  type="number"
                />
              </label>
              <label>
                初学者权重（0-100）
                <input
                  defaultValue="50"
                  max="100"
                  min="0"
                  name="beginnerWeight"
                  type="number"
                />
              </label>
              <label className="annotation-wide">
                驳回原因（驳回时必填）
                <input name="rejectionNote" />
              </label>
              <div className="row-actions annotation-actions">
                <button
                  disabled={busy}
                  name="action"
                  type="submit"
                  value="accept"
                >
                  接受并进入裁切
                </button>
                <button
                  className="secondary-action"
                  disabled={busy}
                  formNoValidate
                  name="action"
                  type="submit"
                  value="reject"
                >
                  驳回候选
                </button>
              </div>
            </form>
          </section>
        ) : null}

        <section className="panel import-workbench">
          <div className="import-heading">
            <div>
              <p className="eyebrow">M4-12 批量导入</p>
              <h2>模板、预检与逐行报告</h2>
              <p className="form-help">
                每批最多 200
                行。只要一行错误，整批就不能提交；提交后仍需裁切和双人审核，不会自动发布。
              </p>
            </div>
            {canEdit ? (
              <button
                disabled={busy}
                onClick={downloadImportTemplate}
                type="button"
              >
                下载 CSV 模板
              </button>
            ) : null}
          </div>
          <details className="import-source-reference">
            <summary>模板字段填写说明</summary>
            <div className="import-field-help">
              <p>
                <code>observed_character</code>
                <span>原帖实际字形；必须是一个汉字。</span>
              </p>
              <p>
                <code>canonical_character</code>
                <span>最终规范字；与原帖字不同时必须填写异体关系。</span>
              </p>
              <p>
                <code>variant_type</code>
                <span>
                  留空或填写
                  SIMPLIFIED、TRADITIONAL、HISTORICAL、COMPATIBILITY。
                </span>
              </p>
              <p>
                <code>authenticity_grade</code>
                <span>
                  仅允许
                  A_ORIGINAL、B_RUBBING_OR_AUTHORIZED_EDITION、C_MODERN_COPY；AI
                  内容禁止进入字库。
                </span>
              </p>
              <p>
                <code>bbox_x / y / width / height</code>
                <span>使用原帖像素坐标；宽高必须大于零且不能越界。</span>
              </p>
              <p>
                <code>image_quality / beginner_weight</code>
                <span>填写 0～100 的整数。</span>
              </p>
            </div>
          </details>
          <details className="import-source-reference">
            <summary>查看可填写的来源资产 ID（{sourceAssets.length}）</summary>
            <div>
              {sourceAssets.map((source) => (
                <p key={source.id}>
                  <code>{source.id}</code>
                  <span>
                    {source.edition.work.title} · {source.edition.name}
                    {source.pageLabel ? ` · ${source.pageLabel}` : ""} ·{" "}
                    {source.width}×{source.height}
                  </span>
                </p>
              ))}
            </div>
          </details>
          {canEdit ? (
            <form className="import-upload" onSubmit={previewContentImport}>
              <label>
                填写完成的 CSV
                <input
                  accept=".csv,text/csv"
                  name="csvFile"
                  required
                  type="file"
                />
              </label>
              <button disabled={busy} type="submit">
                只预检，不导入
              </button>
            </form>
          ) : null}
          <div className="import-batch-list">
            {importBatches.length === 0 ? <p>暂无批量预检记录。</p> : null}
            {importBatches.map((batch) => (
              <article className="import-batch" key={batch.id}>
                <div className="history-heading">
                  <strong>{batch.fileName}</strong>
                  <small
                    className={`import-status import-${batch.status.toLowerCase()}`}
                  >
                    {batch.status}
                  </small>
                </div>
                <p className="form-help">
                  {new Date(batch.createdAt).toLocaleString("zh-CN")} ·{" "}
                  {batch.actorKey} · SHA-256 {batch.checksumSha256.slice(0, 12)}
                  …
                </p>
                <p>
                  总计 {batch.totalRows} 行，通过 {batch.validRows} 行，错误{" "}
                  {batch.invalidRows} 行。
                </p>
                {batch.status === "READY" && canEdit ? (
                  <button
                    disabled={busy}
                    onClick={() => commitContentImport(batch.id)}
                    type="button"
                  >
                    原子提交整批
                  </button>
                ) : null}
                {batch.status === "COMMITTED" ? (
                  <p className="success-note">
                    已提交，正在通过现有裁切与审核状态机处理。
                  </p>
                ) : null}
                <div className="import-report">
                  {batch.rows.map((row) => (
                    <div
                      className={
                        row.errors.length > 0 ? "import-row-error" : ""
                      }
                      key={`${batch.id}-${row.rowNumber}`}
                    >
                      <strong>第 {row.rowNumber} 行</strong>
                      <span>
                        {row.rawData.observed_character || "—"} →{" "}
                        {row.rawData.canonical_character || "—"}
                      </span>
                      <code>{row.rawData.source_asset_id || "—"}</code>
                      <span>
                        {row.errors.length > 0
                          ? row.errors.join("；")
                          : "校验通过"}
                      </span>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        <form
          className="panel"
          onSubmit={(event) => createContent(event, "works")}
        >
          <h2>新增作品</h2>
          <label>
            书家
            <select name="calligrapherId" required>
              <option value="">请选择</option>
              {calligraphers
                .filter((item) => item.isActive)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.dynasty} · {item.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            作品名称
            <input name="title" required />
          </label>
          <label>
            作品朝代
            <input name="dynasty" required />
          </label>
          <label>
            说明
            <textarea name="description" rows={3} />
          </label>
          <button disabled={busy} type="submit">
            保存作品
          </button>
        </form>

        <form
          className="panel"
          onSubmit={(event) => createContent(event, "editions")}
        >
          <h2>新增版本</h2>
          <label>
            作品
            <select name="workId" required>
              <option value="">请选择</option>
              {works
                .filter((item) => item.isActive && item.calligrapher.isActive)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.calligrapher.name} · {item.title}
                  </option>
                ))}
            </select>
          </label>
          <label>
            版本名称
            <input name="name" required />
          </label>
          <label>
            收藏机构
            <input name="holdingInstitution" />
          </label>
          <label>
            出版信息
            <input name="publication" />
          </label>
          <label>
            来源链接
            <input name="sourceUrl" type="url" />
          </label>
          <button disabled={busy} type="submit">
            保存版本
          </button>
        </form>

        <form
          className="panel"
          onSubmit={(event) => createContent(event, "rights")}
        >
          <h2>新增权利记录</h2>
          <label>
            来源名称
            <input name="sourceName" required />
          </label>
          <label>
            来源链接
            <input name="sourceUrl" type="url" />
          </label>
          <label>
            权利状态
            <select defaultValue="INTERNAL_TEST_ONLY" name="status">
              <option value="INTERNAL_TEST_ONLY">仅内部验证</option>
              <option value="CLEARED_PUBLIC">允许公开</option>
              <option value="RESTRICTED">受限</option>
            </select>
          </label>
          <label>
            许可名称
            <input name="licenseName" />
          </label>
          <label>
            署名要求
            <textarea name="attributionText" rows={3} />
          </label>
          <label>
            授权生效
            <input name="validFrom" type="date" />
          </label>
          <label>
            授权截止
            <input name="validUntil" type="date" />
          </label>
          <label>
            最大公开宽度
            <input min="1" name="maxPublicWidth" type="number" />
          </label>
          <label>
            内部备注
            <textarea name="notes" rows={2} />
          </label>
          <label className="checkbox">
            <input name="allowCommercial" type="checkbox" />
            允许商业使用
          </label>
          <button disabled={busy} type="submit">
            保存权利记录
          </button>
        </form>

        <form className="panel" onSubmit={uploadSource}>
          <h2>上传原帖</h2>
          <label>
            作品版本
            <select name="editionId" required>
              <option value="">请选择</option>
              {editions
                .filter(
                  (item) =>
                    item.isActive &&
                    item.work.isActive &&
                    item.work.calligrapher.isActive,
                )
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.work.title} · {item.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            权利记录
            <select name="rightsRecordId" required>
              <option value="">请选择</option>
              {rights.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.sourceName} · {item.status}
                </option>
              ))}
            </select>
          </label>
          <label>
            页码或位置
            <input name="pageLabel" />
          </label>
          <label>
            原帖图片
            <input
              accept="image/jpeg,image/png,image/webp"
              name="file"
              required
              type="file"
            />
          </label>
          <p className="form-help">
            浏览器会计算 SHA-256，服务端核验大小、格式和校验值后才入库。
          </p>
          <button disabled={busy} type="submit">
            上传并核验
          </button>
        </form>

        <form
          className="panel"
          onSubmit={(event) => createContent(event, "glyphs")}
        >
          <h2>登记单字框</h2>
          <label>
            原帖来源资产
            <select name="sourceAssetId" required>
              <option value="">请选择</option>
              {sourceAssets.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.edition.work.title} · {item.edition.name} · {item.width}
                  ×{item.height}
                </option>
              ))}
            </select>
          </label>
          <label>
            汉字
            <input maxLength={2} name="character" required />
          </label>
          <label>
            真实性等级
            <select
              defaultValue="B_RUBBING_OR_AUTHORIZED_EDITION"
              name="authenticityGrade"
            >
              <option value="A_ORIGINAL">原作</option>
              <option value="B_RUBBING_OR_AUTHORIZED_EDITION">
                拓本/授权版本
              </option>
              <option value="C_MODERN_COPY">现代临本</option>
            </select>
          </label>
          <div className="coordinate-grid">
            <label>
              X<input min="0" name="bboxX" required type="number" />
            </label>
            <label>
              Y<input min="0" name="bboxY" required type="number" />
            </label>
            <label>
              宽<input min="1" name="bboxWidth" required type="number" />
            </label>
            <label>
              高<input min="1" name="bboxHeight" required type="number" />
            </label>
          </div>
          <label>
            图片质量（0-100）
            <input
              defaultValue="50"
              max="100"
              min="0"
              name="imageQuality"
              type="number"
            />
          </label>
          <label>
            初学者权重（0-100）
            <input
              defaultValue="50"
              max="100"
              min="0"
              name="beginnerWeight"
              type="number"
            />
          </label>
          <button disabled={busy} type="submit">
            提交裁切任务
          </button>
        </form>

        <section className="panel glyph-review-panel">
          <h2>审核与发布</h2>
          <p className="form-help">
            录入人与审核人必须使用不同账号；只有公开权利有效的内容可以发布。
          </p>
          {glyphs.length === 0 ? <p>暂无单字任务。</p> : null}
          {glyphs.map((glyph) => (
            <article
              className="glyph-review-row"
              id={`glyph-${glyph.id}`}
              key={glyph.id}
            >
              <div>
                <strong>{glyph.character.value}</strong>
                <span>{glyph.sourceAsset.edition.work.title}</span>
                <small>{glyph.contentStatus}</small>
              </div>
              <form
                className="glyph-correction-form"
                onSubmit={(event) => correctGlyph(event, glyph.id)}
              >
                <label>
                  字符
                  <input
                    defaultValue={glyph.character.value}
                    maxLength={1}
                    name="character"
                    required
                  />
                </label>
                <label>
                  真实性
                  <select
                    defaultValue={glyph.authenticityGrade}
                    name="authenticityGrade"
                  >
                    <option value="A_ORIGINAL">原作</option>
                    <option value="B_RUBBING_OR_AUTHORIZED_EDITION">
                      拓本/授权版本
                    </option>
                    <option value="C_MODERN_COPY">现代临本</option>
                    <option disabled value="D_AI_GENERATED">
                      AI 生成（禁止发布）
                    </option>
                  </select>
                </label>
                {(
                  [
                    ["bboxX", "X", glyph.bboxX, 0, undefined],
                    ["bboxY", "Y", glyph.bboxY, 0, undefined],
                    ["bboxWidth", "宽", glyph.bboxWidth, 1, undefined],
                    ["bboxHeight", "高", glyph.bboxHeight, 1, undefined],
                    ["imageQuality", "清晰度", glyph.imageQuality, 0, 100],
                    [
                      "beginnerWeight",
                      "初学权重",
                      glyph.beginnerWeight,
                      0,
                      100,
                    ],
                  ] as const
                ).map(([name, label, value, min, max]) => (
                  <label key={name}>
                    {label}
                    <input
                      defaultValue={value}
                      max={max}
                      min={min}
                      name={name}
                      required
                      type="number"
                    />
                  </label>
                ))}
                <button
                  disabled={
                    busy ||
                    !canEdit ||
                    glyph.contentStatus === "PUBLISHED" ||
                    glyph.contentStatus === "PROCESSING"
                  }
                  type="submit"
                >
                  保存纠错
                </button>
              </form>
              <label className="glyph-note">
                审核、驳回或下架原因
                <input
                  maxLength={2000}
                  onChange={(event) =>
                    setGlyphNotes((current) => ({
                      ...current,
                      [glyph.id]: event.target.value,
                    }))
                  }
                  placeholder="退回、驳回和下架时必填"
                  value={glyphNotes[glyph.id] ?? ""}
                />
              </label>
              <div className="row-actions">
                <button
                  disabled={busy}
                  onClick={() =>
                    loadContentHistory(
                      "Glyph",
                      glyph.id,
                      `${glyph.character.value} · ${glyph.sourceAsset.edition.work.title}`,
                    )
                  }
                  type="button"
                >
                  修改历史
                </button>
                <button
                  disabled={
                    busy || !canReview || glyph.contentStatus !== "NEEDS_REVIEW"
                  }
                  onClick={() => operateGlyph(glyph.id, "approve")}
                  type="button"
                >
                  审核通过
                </button>
                <button
                  disabled={
                    busy ||
                    !canReview ||
                    glyph.contentStatus !== "NEEDS_REVIEW" ||
                    !(glyphNotes[glyph.id]?.trim() ?? "")
                  }
                  onClick={() => operateGlyph(glyph.id, "changes")}
                  type="button"
                >
                  退回修改
                </button>
                <button
                  disabled={
                    busy ||
                    !canReview ||
                    glyph.contentStatus !== "NEEDS_REVIEW" ||
                    !(glyphNotes[glyph.id]?.trim() ?? "")
                  }
                  onClick={() => operateGlyph(glyph.id, "reject")}
                  type="button"
                >
                  驳回归档
                </button>
                <button
                  disabled={
                    busy || !canReview || glyph.contentStatus !== "APPROVED"
                  }
                  onClick={() => operateGlyph(glyph.id, "publish")}
                  type="button"
                >
                  发布
                </button>
                <button
                  disabled={
                    busy ||
                    !canUnpublish ||
                    glyph.contentStatus !== "PUBLISHED" ||
                    !(glyphNotes[glyph.id]?.trim() ?? "")
                  }
                  onClick={() => operateGlyph(glyph.id, "unpublish")}
                  type="button"
                >
                  立即下架
                </button>
              </div>
            </article>
          ))}
        </section>

        {canViewAnalytics && funnelReport ? (
          <section className="panel analytics-panel">
            <div>
              <p className="eyebrow">最近 30 天</p>
              <h2>完整练习闭环漏斗</h2>
              <p className="form-help">
                只统计固定业务事件，不采集作品文字、图片内容或自由文本。总体闭环完成率：
                {formatRate(funnelReport.completionRate)}
              </p>
            </div>
            <div className="funnel-grid">
              {funnelReport.stages.map((stage) => (
                <div key={stage.name}>
                  <strong>{stage.count}</strong>
                  <span>{funnelStageLabels[stage.name]}</span>
                  <small>
                    上一步转化 {formatRate(stage.conversionFromPrevious)}
                  </small>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {canReview ? (
          <section className="panel advice-review-panel">
            <div className="advice-review-heading">
              <div>
                <p className="eyebrow">专业质量抽检</p>
                <h2>结构建议教师复核</h2>
                <p className="form-help">
                  用户原图使用五分钟私有签名地址；复核结论不会改写用户已经看到的建议快照。
                </p>
              </div>
              <label>
                样本状态
                <select
                  disabled={busy}
                  onChange={(event) =>
                    void loadAdviceSampleStatus(
                      event.target.value as "ALL" | "REVIEWED" | "UNREVIEWED",
                    )
                  }
                  value={adviceSampleStatus}
                >
                  <option value="UNREVIEWED">待抽检</option>
                  <option value="REVIEWED">已抽检</option>
                  <option value="ALL">全部</option>
                </select>
              </label>
            </div>
            {adviceSamples.length === 0 ? <p>当前没有相应样本。</p> : null}
            {adviceSamples.map((sample) => (
              <article className="advice-sample" key={sample.attemptId}>
                <div className="advice-sample-title">
                  <strong>
                    “{sample.character}”第 {sample.sequence} 次练习
                  </strong>
                  <small>
                    {sample.master.calligrapherName}《{sample.master.workTitle}
                    》
                  </small>
                </div>
                <div className="advice-image-pair">
                  <figure>
                    {/* Signed private URL is intentionally never persisted. */}
                    <img alt="用户练习原图" src={sample.userImageUrl} />
                    <figcaption>用户练习</figcaption>
                  </figure>
                  <figure>
                    {sample.master.imageUrl ? (
                      <img alt="参照范字" src={sample.master.imageUrl} />
                    ) : (
                      <div className="missing-review-image">范字暂不可用</div>
                    )}
                    <figcaption>参照范字</figcaption>
                  </figure>
                </div>
                <div className="advice-evidence-list">
                  {(sample.advice.suggestions ?? []).map(
                    (suggestion, index) => (
                      <div key={`${sample.attemptId}-${index}`}>
                        <strong>{suggestion.phenomenon ?? "结构现象"}</strong>
                        <span>依据：{suggestion.evidence ?? "—"}</span>
                        <span>动作：{suggestion.action ?? "—"}</span>
                      </div>
                    ),
                  )}
                </div>
                <p className="advice-version-line">
                  状态：{sample.advice.status ?? "未知"} · 归一化：
                  {sample.advice.normalization_version ?? "未知"} · 测量：
                  {sample.advice.measurement_version ?? "未知"} · 规则：
                  {sample.advice.threshold_version ?? "未知"} · 模型：
                  {sample.advice.model_version ?? "未知"}
                </p>
                <form
                  className="advice-review-form"
                  onSubmit={(event) =>
                    reviewAdviceSample(event, sample.attemptId)
                  }
                >
                  <label>
                    复核结论
                    <select
                      defaultValue={sample.review?.verdict ?? "APPROVED"}
                      name="verdict"
                    >
                      <option value="APPROVED">建议与证据一致</option>
                      <option value="NEEDS_ADJUSTMENT">阈值或措辞需调整</option>
                      <option value="NOT_APPLICABLE">该字不适用当前规则</option>
                    </select>
                  </label>
                  <label className="advice-review-comment">
                    教师意见
                    <textarea
                      defaultValue={sample.review?.comment ?? ""}
                      maxLength={2000}
                      minLength={3}
                      name="comment"
                      placeholder="说明证据、阈值或适用范围问题。"
                      required
                      rows={3}
                    />
                  </label>
                  <button disabled={busy} type="submit">
                    保存抽检意见
                  </button>
                </form>
                {sample.review ? (
                  <p className="form-help">
                    最近复核：{sample.review.reviewerKey} ·{" "}
                    {new Date(sample.review.reviewedAt).toLocaleString("zh-CN")}
                  </p>
                ) : null}
              </article>
            ))}
          </section>
        ) : null}

        <section className="panel feedback-workbench">
          <h2>用户反馈工单</h2>
          <p className="form-help">
            处理说明会显示给提交者；内容错误请先定位关联单字完成纠错或下架，再关闭工单。
          </p>
          {feedbackTickets.length === 0 ? <p>暂无用户反馈。</p> : null}
          {feedbackTickets.map((ticket) => (
            <article
              className="feedback-ticket"
              key={`${ticket.id}-${ticket.updatedAt}`}
            >
              <div className="feedback-ticket-heading">
                <strong>{feedbackKindLabels[ticket.kind]}</strong>
                <small>{ticket.status}</small>
              </div>
              <p>{ticket.message ?? "用户未补充文字说明。"}</p>
              <p className="form-help">
                提交时间：{new Date(ticket.createdAt).toLocaleString("zh-CN")}
                {ticket.accurate === null
                  ? ""
                  : ` · 准确性反馈：${ticket.accurate ? "有帮助" : "不准确"}`}
              </p>
              {ticket.referenceType === "Glyph" && ticket.referenceId ? (
                <a href={`#glyph-${ticket.referenceId}`}>
                  定位关联单字：{ticket.referenceId}
                </a>
              ) : ticket.referenceType && ticket.referenceId ? (
                <p className="form-help">
                  关联对象：{ticket.referenceType} / {ticket.referenceId}
                </p>
              ) : null}
              <form
                className="feedback-ticket-form"
                onSubmit={(event) => updateFeedbackTicket(event, ticket.id)}
              >
                <label>
                  负责人邮箱
                  <input
                    defaultValue={ticket.assignedTo ?? ""}
                    maxLength={100}
                    name="assignedTo"
                    placeholder="editor@example.com"
                    type="email"
                  />
                </label>
                <label>
                  状态
                  <select defaultValue={ticket.status} name="status">
                    <option value="OPEN">待处理</option>
                    <option value="IN_PROGRESS">处理中</option>
                    <option value="RESOLVED">已解决</option>
                    <option value="DISMISSED">已关闭</option>
                  </select>
                </label>
                <label className="feedback-resolution">
                  用户可见处理说明
                  <textarea
                    defaultValue={ticket.resolutionNote ?? ""}
                    maxLength={2000}
                    name="resolutionNote"
                    placeholder="解决或关闭时必填，例如：已核对出处并下架错误范字。"
                    rows={3}
                  />
                </label>
                <button disabled={busy || !canManageFeedback} type="submit">
                  保存工单
                </button>
              </form>
            </article>
          ))}
        </section>
      </section>
    </main>
  );
}
