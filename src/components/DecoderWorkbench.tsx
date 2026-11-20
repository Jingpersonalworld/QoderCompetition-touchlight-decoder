import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AudioLines,
  Check,
  CircleAlert,
  Copy,
  ExternalLink,
  Link2,
  LoaderCircle,
  RotateCcw,
  Square,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSpeechReader } from "@/lib/speech";
import { TactileButton } from "@/components/ui/TactileButton";
import {
  getBlockingIssues,
  type AccessibleContentFields,
  type ContentField,
  type EditableField,
  type VerificationWarning,
  type WarningStatus,
} from "@/types/accessibility";

const SAMPLE = {
  title: "2026 百团大战 · AI创造社招新",
  blurryTime: "本周*晚 7 点左右",
  location: "大学生活动中心 302",
  points: [
    "面向全校招募新成员，不限专业与年级",
    "现场体验图像识别与语音交互小项目",
    "提供零基础入门培训与学长学姐带教",
  ],
  visualAlt: "海报右下角有一个二维码",
  actionGuide: "扫描海报二维码或点击报名链接填写报名表",
};

const INITIAL_WARNINGS: VerificationWarning[] = [
  {
    id: "w-time",
    field: "datetime",
    fieldLabel: "时间",
    severity: "ambiguous",
    blocking: true,
    message: "海报时间区域模糊（本周*晚7点左右），请核对并填写精确日期与时间",
    status: "pending",
  },
  {
    id: "w-action",
    field: "actionUrl",
    fieldLabel: "视觉与报名入口",
    severity: "unverified_qr",
    blocking: true,
    message: "视障读者无法扫描图片二维码，请补充带明确名称的报名链接或联系方式",
    status: "pending",
  },
];

const INITIAL_DRAFT: AccessibleContentFields = {
  title: SAMPLE.title,
  datetime: SAMPLE.blurryTime,
  location: SAMPLE.location,
  summaryPoints: SAMPLE.points,
  visualAlt: SAMPLE.visualAlt,
  actionGuide: SAMPLE.actionGuide,
  actionLabel: "",
  actionUrl: "",
  contactInfo: "",
};

type CardId = "title" | "time" | "location" | "points" | "action";

const CARD_ORDER: CardId[] = ["title", "time", "location", "points", "action"];

const CARD_LABELS: Record<CardId, string> = {
  title: "标题",
  time: "时间",
  location: "地点",
  points: "正文要点",
  action: "视觉与报名入口",
};

const CARD_FIELDS: Record<CardId, ContentField[]> = {
  title: ["title"],
  time: ["datetime"],
  location: ["location"],
  points: ["summaryPoints"],
  action: ["visualAlt", "actionGuide", "actionLabel", "actionUrl", "contactInfo"],
};

const SAMPLE_CARD_STATUS: Record<CardId, WarningStatus> = {
  title: "confirmed",
  time: "pending",
  location: "confirmed",
  points: "confirmed",
  action: "pending",
};

const REAL_CARD_STATUS: Record<CardId, WarningStatus> = {
  title: "pending",
  time: "pending",
  location: "pending",
  points: "pending",
  action: "pending",
};

const STATUS_META: Record<
  WarningStatus,
  { bg: string; left: string; badge: string; badgeText: string }
> = {
  pending: {
    bg: "bg-warn-bg",
    left: "border-l-warn-border",
    badge: "border border-warn-border bg-warn-bg text-warn-fg",
    badgeText: "待确认",
  },
  edited: {
    bg: "bg-edited-bg",
    left: "border-l-cobalt",
    badge: "border border-cobalt bg-edited-bg text-cobalt",
    badgeText: "已修改，待确认",
  },
  confirmed: {
    bg: "bg-surface",
    left: "border-l-transparent",
    badge: "border border-ok-border bg-ok-bg text-ok-fg",
    badgeText: "✓ 已确认",
  },
};

const INPUT_CLASS =
  "w-full rounded-[10px] border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-soft/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt";

const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_TEXT_CHARS = 10_000;

type AnalyzePayload =
  | { sourceType: "image"; image: string }
  | { sourceType: "text"; text: string };

function isAnalyzeSuccess(
  data: unknown,
): data is { ok: true; content: unknown; warnings: VerificationWarning[] } {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;
  return (
    d.ok === true &&
    typeof d.content === "object" &&
    d.content !== null &&
    Array.isArray(d.warnings)
  );
}

function toDraft(content: unknown): AccessibleContentFields {
  const c = (content ?? {}) as Record<string, unknown>;
  const str = (key: string) => (typeof c[key] === "string" ? (c[key] as string) : "");
  return {
    title: str("title"),
    datetime: str("datetime"),
    location: str("location"),
    visualAlt: str("visualAlt"),
    actionGuide: str("actionGuide"),
    actionLabel: str("actionLabel"),
    actionUrl: str("actionUrl"),
    contactInfo: str("contactInfo"),
    summaryPoints: Array.isArray(c.summaryPoints)
      ? c.summaryPoints.filter((p): p is string => typeof p === "string")
      : [],
  };
}

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

const DATETIME_PATTERNS = [
  /^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})$/,
  /^(\d{4})年(\d{1,2})月(\d{1,2})日\s*(\d{1,2}):(\d{2})$/,
];

/** 仅用于内置样例的「模糊时间存疑」核对：要求明确且合法的日历日期 + 具体时刻。 */
function explicitDateTimeError(value: string): string | null {
  const trimmed = value.trim();
  for (const pattern of DATETIME_PATTERNS) {
    const match = trimmed.match(pattern);
    if (!match) continue;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = Number(match[4]);
    const minute = Number(match[5]);
    if (month < 1 || month > 12) return "月份需在 1–12 之间。";
    const maxDay = new Date(year, month, 0).getDate();
    if (day < 1 || day > maxDay) {
      return `${year} 年 ${month} 月只有 ${maxDay} 天，该日期不存在。`;
    }
    if (hour > 23) return "小时需在 0–23 之间（24 小时制）。";
    if (minute > 59) return "分钟需在 0–59 之间。";
    return null;
  }
  return "格式不符：请填写明确日期与时刻，示例：2026-11-21 19:00";
}

function SamplePoster() {
  return (
    <figure className="m-0">
      <div className="relative overflow-hidden rounded-tactile border border-line shadow-[var(--tl-card-shadow)]">
        <svg viewBox="0 0 300 400" className="block w-full" aria-hidden="true">
          <defs>
            <linearGradient id="poster-bg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ff2d78" />
              <stop offset="0.5" stopColor="#ff8a00" />
              <stop offset="1" stopColor="#00c2d1" />
            </linearGradient>
            <filter id="smear" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2.4" />
            </filter>
          </defs>
          <rect width="300" height="400" fill="url(#poster-bg)" />
          <circle cx="250" cy="60" r="70" fill="#ffffff" opacity="0.14" />
          <circle cx="40" cy="330" r="90" fill="#111418" opacity="0.12" />
          <g transform="rotate(-6 150 110)">
            <text
              x="150"
              y="95"
              textAnchor="middle"
              fontSize="30"
              fontWeight="900"
              fill="#ffffff"
              stroke="#111418"
              strokeWidth="1"
            >
              2026 百团大战
            </text>
            <text
              x="150"
              y="135"
              textAnchor="middle"
              fontSize="26"
              fontWeight="900"
              fill="#ffe600"
              stroke="#111418"
              strokeWidth="0.8"
            >
              AI创造社招新
            </text>
          </g>
          <g filter="url(#smear)">
            <text x="30" y="215" fontSize="20" fontWeight="700" fill="#ffffff">
              本周*晚 7 点左右
            </text>
          </g>
          <rect x="26" y="198" width="180" height="26" fill="#ff2d78" opacity="0.35" />
          <text x="30" y="262" fontSize="16" fontWeight="600" fill="#ffffff">
            大学生活动中心 302
          </text>
          <g transform="translate(210 300)">
            <rect width="70" height="70" fill="#ffffff" />
            <rect x="6" y="6" width="18" height="18" fill="#111418" />
            <rect x="46" y="6" width="18" height="18" fill="#111418" />
            <rect x="6" y="46" width="18" height="18" fill="#111418" />
            <rect x="30" y="30" width="8" height="8" fill="#111418" />
            <rect x="46" y="34" width="8" height="8" fill="#111418" />
            <rect x="34" y="48" width="8" height="8" fill="#111418" />
            <rect x="52" y="52" width="12" height="12" fill="#111418" />
          </g>
        </svg>
      </div>
      <figcaption className="mt-2 text-xs text-ink-soft">
        普通读屏软件仅能读取：<code className="font-mono">image_poster.png</code>
      </figcaption>
    </figure>
  );
}

function CardShell({
  kicker,
  status,
  speaking,
  delay,
  badgeRef,
  children,
}: {
  kicker: string;
  status: WarningStatus;
  speaking: boolean;
  delay: number;
  badgeRef?: (el: HTMLSpanElement | null) => void;
  children: ReactNode;
}) {
  const meta = STATUS_META[status];
  return (
    <section
      className={cn(
        "tl-rise rounded-tactile border border-line border-l-4 p-5 transition-all",
        meta.bg,
        meta.left,
        speaking &&
          "-translate-y-0.5 border-l-cobalt shadow-[0_10px_26px_rgba(29,78,216,0.16)]",
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-xs text-ink-soft">{kicker}</p>
        <span
          ref={badgeRef}
          tabIndex={-1}
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt",
            meta.badge,
          )}
        >
          {meta.badgeText}
        </span>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-semibold text-ink-soft">
        {label}
      </label>
      {children}
    </div>
  );
}

export function DecoderWorkbench() {
  const [inputMode, setInputMode] = useState<"poster" | "text">("poster");
  const [scanning, setScanning] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [sampleMode, setSampleMode] = useState(true);
  const [sourceType, setSourceType] = useState<"image" | "text" | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageName, setImageName] = useState("");
  const [imageSize, setImageSize] = useState(0);
  const [reading, setReading] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);

  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  const [draft, setDraft] = useState(INITIAL_DRAFT);
  const [warnings, setWarnings] = useState(INITIAL_WARNINGS);
  const [cardStatus, setCardStatus] = useState(SAMPLE_CARD_STATUS);
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});

  const [previewOpen, setPreviewOpen] = useState(false);
  const [largeText, setLargeText] = useState(false);
  const [highContrast, setHighContrast] = useState(false);

  const [consentOpen, setConsentOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [published, setPublished] = useState<
    { id: string; shareUrl: string; publishedAt: string } | null
  >(null);
  const [copied, setCopied] = useState(false);

  const {
    supported: speechSupported,
    speaking,
    index: readIndex,
    subtitle,
    stop: stopSpeech,
    toggle: toggleSpeech,
  } = useSpeechReader();

  const scanTimer = useRef<number | null>(null);
  const copyTimer = useRef<number | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const payloadRef = useRef<AnalyzePayload | null>(null);
  const statusRefs = useRef<Record<string, HTMLSpanElement | null>>({});
  const prevCardStatus = useRef(cardStatus);

  // 确认按钮随状态卸载会把焦点丢回 BODY；在渲染后把焦点落到同卡的状态徽章上。
  useEffect(() => {
    for (const card of CARD_ORDER) {
      const prev = prevCardStatus.current[card];
      if (prev && prev !== "confirmed" && cardStatus[card] === "confirmed") {
        statusRefs.current[card]?.focus();
      }
      prevCardStatus.current[card] = cardStatus[card];
    }
  }, [cardStatus]);

  useEffect(() => {
    return () => {
      if (scanTimer.current !== null) window.clearTimeout(scanTimer.current);
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    };
  }, []);

  useEffect(() => {
    if (previewOpen) dialogRef.current?.showModal();
  }, [previewOpen]);

  const issues = getBlockingIssues(warnings, draft, {
    requireActionContact: sampleMode,
  });
  if (!sampleMode) {
    for (const card of CARD_ORDER) {
      if (cardStatus[card] === "confirmed") continue;
      const hasWarning = warnings.some(
        (w) => w.blocking && CARD_FIELDS[card].includes(w.field),
      );
      if (!hasWarning) {
        issues.push(`${CARD_LABELS[card]}：请核对 AI 提取结果后点击确认`);
      }
    }
  }
  const pendingCount = CARD_ORDER.filter(
    (card) => cardStatus[card] !== "confirmed",
  ).length;

  function markCard(card: CardId, status: WarningStatus) {
    setCardStatus((prev) => ({ ...prev, [card]: status }));
    setWarnings((prev) =>
      prev.map((w) =>
        CARD_FIELDS[card].includes(w.field) ? { ...w, status } : w,
      ),
    );
  }

  function edit(field: EditableField, value: string) {
    setDraft((prev) => ({ ...prev, [field]: value }));
    const card = CARD_ORDER.find((c) => CARD_FIELDS[c].includes(field));
    if (card) {
      markCard(card, "edited");
      setCardErrors((prev) => ({ ...prev, [card]: "" }));
    }
  }

  function editPoints(value: string) {
    setDraft((prev) => ({ ...prev, summaryPoints: value.split("\n") }));
    markCard("points", "edited");
    setCardErrors((prev) => ({ ...prev, points: "" }));
  }

  function confirm(card: CardId) {
    let error = "";
    if (card === "time" && sampleMode) {
      // 严格日历格式只约束内置样例；真实通知允许简明时间描述，由核对者负责。
      if (!draft.datetime.trim()) {
        error = "请填写精确的日期与时间后再确认。";
      } else {
        error = explicitDateTimeError(draft.datetime) ?? "";
      }
    }
    if (card === "action") {
      const url = draft.actionUrl.trim();
      const contact = draft.contactInfo.trim();
      if (url && !isValidUrl(url)) {
        error = "报名链接格式不正确，需以 http:// 或 https:// 开头。";
      } else if (url && !draft.actionLabel.trim()) {
        error = "请为报名链接填写一个明确的名称，方便读屏读者理解。";
      } else if (sampleMode && !url && !contact) {
        error = "请补充带明确名称的报名链接，或填写备用联系方式后再确认。";
      }
    }
    if (error) {
      setCardErrors((prev) => ({ ...prev, [card]: error }));
      return;
    }
    setCardErrors((prev) => ({ ...prev, [card]: "" }));
    markCard(card, "confirmed");
  }

  function resetPublish() {
    setConsentOpen(false);
    setPublishing(false);
    setPublishError(null);
    setPublished(null);
    setCopied(false);
  }

  function loadSample() {
    if (scanTimer.current !== null) window.clearTimeout(scanTimer.current);
    stopSpeech();
    resetPublish();
    setScanning(true);
    setLoaded(false);
    setAnalyzeError(null);
    scanTimer.current = window.setTimeout(() => {
      setDraft(INITIAL_DRAFT);
      setWarnings(INITIAL_WARNINGS);
      setCardStatus(SAMPLE_CARD_STATUS);
      setCardErrors({});
      setSampleMode(true);
      setSourceType(null);
      setScanning(false);
      setLoaded(true);
    }, 500);
  }

  function acceptFile(file: File | null | undefined) {
    // 第一时间清空旧图预览、Data URL 与可提交状态，杜绝误送上一张旧图。
    setImageDataUrl(null);
    setImageName("");
    setImageSize(0);
    setInputError(null);
    setAnalyzeError(null);
    setReading(false);
    if (!file) return;
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setInputError("仅支持 JPG / PNG / WebP 图片，请重新选择。");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setInputError("图片超过 4MB，请压缩后再试。");
      return;
    }
    setReading(true);
    const reader = new FileReader();
    reader.onload = () => {
      setReading(false);
      if (typeof reader.result !== "string") {
        setInputError("图片读取失败，请重试。");
        return;
      }
      setImageDataUrl(reader.result);
      setImageName(file.name);
      setImageSize(file.size);
    };
    reader.onerror = () => {
      setReading(false);
      setInputError("图片读取失败，请重试。");
    };
    reader.readAsDataURL(file);
  }

  async function runAnalyze(payload: AnalyzePayload) {
    setAnalyzing(true);
    setAnalyzeError(null);
    // 新提交开始即撤下旧结果，避免把上一份输入的结果当作本次结果。
    setLoaded(false);
    resetPublish();
    stopSpeech();
    try {
      const res = await fetch("/functions/v1/app/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload),
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok || !isAnalyzeSuccess(data)) {
        const message =
          data && typeof data === "object" && "error" in data &&
          typeof (data as { error: unknown }).error === "string"
            ? (data as { error: string }).error
            : `请求失败（HTTP ${res.status}）`;
        throw new Error(message);
      }
      setDraft(toDraft(data.content));
      setWarnings(data.warnings);
      setCardStatus({ ...REAL_CARD_STATUS });
      setCardErrors({});
      setSampleMode(false);
      setSourceType(payload.sourceType);
      setLoaded(true);
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : "请求失败，请重试");
    } finally {
      setAnalyzing(false);
    }
  }

  function submitReal() {
    if (analyzing || reading) return;
    let payload: AnalyzePayload | null = null;
    if (inputMode === "poster") {
      if (imageDataUrl) payload = { sourceType: "image", image: imageDataUrl };
    } else {
      const text = pasteText.trim();
      if (text && pasteText.length <= MAX_TEXT_CHARS) {
        payload = { sourceType: "text", text };
      }
    }
    if (!payload) {
      setAnalyzeError(
        inputMode === "poster"
          ? "请先选择一张 JPG / PNG / WebP 图片（≤4MB）。"
          : `请先粘贴不超过 ${MAX_TEXT_CHARS} 字符的通知文本。`,
      );
      return;
    }
    payloadRef.current = payload;
    void runAnalyze(payload);
  }

  function retryAnalyze() {
    if (payloadRef.current) void runAnalyze(payloadRef.current);
  }

  function switchMode(mode: "poster" | "text") {
    setInputMode(mode);
    setAnalyzeError(null);
  }

  async function confirmPublish() {
    setPublishing(true);
    setPublishError(null);
    try {
      const res = await fetch("/functions/v1/app/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          confirmed: true,
          sourceType: sourceType ?? "text",
          warningsResolvedCount: warnings.length,
          confirmedAt: new Date().toISOString(),
          content: {
            title: draft.title,
            datetime: draft.datetime,
            location: draft.location,
            summaryPoints: draft.summaryPoints.filter(Boolean),
            visualAlt: draft.visualAlt,
            actionGuide: draft.actionGuide,
            actionLabel: draft.actionLabel,
            actionUrl: draft.actionUrl,
            contactInfo: draft.contactInfo,
          },
        }),
      });
      const data: unknown = await res.json().catch(() => null);
      const d = (data ?? {}) as Record<string, unknown>;
      if (!res.ok || d.ok !== true || typeof d.id !== "string" || typeof d.shareUrl !== "string") {
        throw new Error(typeof d.error === "string" ? d.error : `发布失败（HTTP ${res.status}）`);
      }
      setPublished({
        id: d.id,
        shareUrl: d.shareUrl,
        publishedAt: typeof d.publishedAt === "string" ? d.publishedAt : "",
      });
      setConsentOpen(false);
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : "发布失败，请重试");
    } finally {
      setPublishing(false);
    }
  }

  function copyLink() {
    if (!published) return;
    const absolute = `${window.location.origin}${published.shareUrl}`;
    void navigator.clipboard?.writeText(absolute).then(() => {
      setCopied(true);
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(false), 2000);
    });
  }

  function readScript(): { card: number; text: string }[] {
    return [
      { card: 0, text: draft.title },
      { card: 1, text: `活动时间：${draft.datetime}` },
      { card: 2, text: `活动地点：${draft.location}` },
      { card: 3, text: `核心信息：${draft.summaryPoints.filter(Boolean).join("。")}` },
      {
        card: 4,
        text: `${draft.visualAlt}。报名方式：${draft.actionLabel || "报名链接"}，${
          draft.actionUrl || draft.contactInfo
        }`,
      },
    ];
  }

  const confirmButton = (card: CardId) =>
    cardStatus[card] !== "confirmed" && (
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <TactileButton onClick={() => confirm(card)} className="px-3 py-1.5 text-xs">
          确认此项无误
        </TactileButton>
        {cardErrors[card] && (
          <p id={`err-${card}`} role="alert" className="text-xs font-semibold text-warn-fg">
            {cardErrors[card]}
          </p>
        )}
      </div>
    );

  const cardMessages = (card: CardId) => {
    if (cardStatus[card] === "confirmed") return null;
    const list = warnings.filter((w) => CARD_FIELDS[card].includes(w.field));
    if (list.length === 0) return null;
    return (
      <ul className="mt-2 space-y-1 text-xs text-warn-fg">
        {list.map((w) => (
          <li key={w.id}>• {w.message}</li>
        ))}
      </ul>
    );
  };

  const badgeRefFor = (card: CardId) => (el: HTMLSpanElement | null) => {
    statusRefs.current[card] = el;
  };

  const realReady =
    inputMode === "poster"
      ? Boolean(imageDataUrl) && !reading
      : pasteText.trim().length > 0 && pasteText.length <= MAX_TEXT_CHARS;

  return (
    <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-6 lg:grid-cols-[42fr_58fr]">
      {/* 左栏：原始输入与样例舱 */}
      <div className="flex flex-col gap-6">
        <div
          role="group"
          aria-label="输入方式"
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
              switchMode(inputMode === "poster" ? "text" : "poster");
            }
          }}
          className="relative grid grid-cols-2 rounded-full border border-line bg-surface p-1"
        >
          <span
            aria-hidden="true"
            className={cn(
              "absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-amber shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] transition-transform",
              inputMode === "text" && "translate-x-full",
            )}
          />
          {(
            [
              ["poster", "海报/截图输入"],
              ["text", "通知文本输入"],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              aria-pressed={inputMode === mode}
              onClick={() => switchMode(mode)}
              className={cn(
                "relative z-10 rounded-full px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt",
                inputMode === mode ? "text-on-amber" : "text-ink-soft",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          <p className="inline-flex w-fit items-center rounded-full border border-warn-border bg-warn-bg px-3 py-1 text-xs font-semibold text-warn-fg">
            内置样例 · 固定验收场景
          </p>
          <div className="relative">
            <SamplePoster />
            {scanning && (
              <span
                aria-hidden="true"
                className="tl-scan-beam pointer-events-none absolute inset-x-0 h-24 bg-gradient-to-b from-transparent via-amber/70 to-transparent"
              />
            )}
          </div>
          <TactileButton onClick={loadSample} className="w-full">
            载入内置样例：时间模糊 + 仅二维码海报
          </TactileButton>
        </div>

        {inputMode === "poster" ? (
          <div className="flex flex-col gap-3 rounded-tactile border border-line bg-surface p-4">
            <p className="text-xs font-semibold text-ink-soft">
              真实识别 · 选择一张通知图片
            </p>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                acceptFile(e.dataTransfer.files?.[0]);
              }}
              className={cn(
                "rounded-tactile border-2 border-dashed border-line bg-surface/60 p-6 text-center text-xs text-ink-soft transition-colors hover:border-amber",
                dragOver && "border-amber",
              )}
            >
              {reading ? (
                <span className="flex items-center justify-center gap-2">
                  <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                  正在读取图片…
                </span>
              ) : imageDataUrl ? (
                <figure className="m-0 flex flex-col items-center gap-2">
                  <img
                    src={imageDataUrl}
                    alt={`已选择图片：${imageName}`}
                    className="max-h-40 rounded-[8px] border border-line object-contain"
                  />
                  <figcaption className="text-xs text-ink-soft">
                    {imageName} · {(imageSize / 1024 / 1024).toFixed(2)} MB
                  </figcaption>
                </figure>
              ) : (
                <>
                  拖拽 JPG / PNG / WebP 图片到此处
                  <span className="mt-1 block opacity-70">
                    单张 ≤ 4MB，仅在本次请求内存中处理，不落盘
                  </span>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="选择通知图片"
              className="sr-only"
              onChange={(e) => {
                acceptFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <TactileButton
              onClick={() => fileInputRef.current?.click()}
              className="w-full"
            >
              <Upload aria-hidden="true" className="size-4" />
              选择图片（JPG/PNG/WebP ≤4MB）
            </TactileButton>
            {inputError && (
              <p role="alert" className="text-xs font-semibold text-warn-fg">
                {inputError}
              </p>
            )}
          </div>
        ) : (
          <div>
            <label
              htmlFor="paste-text"
              className="mb-1 block text-xs font-semibold text-ink-soft"
            >
              粘贴通知文本
            </label>
            <textarea
              id="paste-text"
              rows={6}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="粘贴社团通知、活动通告原文…"
              aria-describedby="paste-text-count"
              className={INPUT_CLASS}
            />
            <p
              id="paste-text-count"
              className={cn(
                "mt-1 text-xs",
                pasteText.length > MAX_TEXT_CHARS ? "font-semibold text-warn-fg" : "text-ink-soft",
              )}
            >
              {pasteText.length}/{MAX_TEXT_CHARS} 字符
              {pasteText.length > MAX_TEXT_CHARS && " · 超出限制，请精简后再提交"}
            </p>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <TactileButton
            onClick={submitReal}
            disabled={analyzing || reading || !realReady}
            className="w-full"
          >
            {analyzing ? (
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <Upload aria-hidden="true" className="size-4" />
            )}
            {analyzing ? "正在解析，请稍候…" : "提交真实识别"}
          </TactileButton>
          <p className="text-xs leading-relaxed text-ink-soft">
            点击提交后，将把当前图片或文本发送至已配置的模型服务进行语义解析，本站不持久化保存原件。
          </p>
        </div>
      </div>

      {/* 右栏：核对工作台与读屏控制台 */}
      <div className="flex flex-col gap-6">
        <div className="sticky top-0 z-20 border-b border-line bg-paper/95 py-3 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p
              role="status"
              aria-live="polite"
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                pendingCount > 0
                  ? "border-warn-border bg-warn-bg text-warn-fg"
                  : "border-ok-border bg-ok-bg text-ok-fg",
              )}
            >
              {pendingCount > 0
                ? `${pendingCount} 项待核对`
                : "✓ 已全部核对 · 可生成"}
            </p>
            <TactileButton
              onClick={() => toggleSpeech(readScript())}
              disabled={!loaded || !speechSupported}
              className="px-3 py-1.5 text-xs"
            >
              {speaking ? (
                <Square aria-hidden="true" className="size-3.5" />
              ) : (
                <AudioLines aria-hidden="true" className="size-3.5" />
              )}
              {speaking ? "停止朗读" : "模拟读屏试听"}
            </TactileButton>
          </div>
          {speaking && subtitle && (
            <p aria-live="polite" className="mt-2 text-xs text-cobalt">
              正在朗读：{subtitle}
            </p>
          )}
        </div>

        {analyzing ? (
          <p
            role="status"
            aria-live="polite"
            className="flex items-center justify-center gap-2 rounded-tactile border border-line bg-surface p-8 text-sm text-ink-soft"
          >
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            正在发送至模型服务解析，请稍候…
          </p>
        ) : analyzeError ? (
          <div
            role="alert"
            className="rounded-tactile border border-warn-border bg-warn-bg p-5"
          >
            <p className="flex items-start gap-2 text-sm font-semibold text-warn-fg">
              <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              识别失败：{analyzeError}
            </p>
            <p className="mt-2 text-xs text-warn-fg">
              你的输入已保留，可修改后重新提交，或直接重试同一份输入。
            </p>
            <TactileButton onClick={retryAnalyze} className="mt-3 px-3 py-1.5 text-xs">
              <RotateCcw aria-hidden="true" className="size-3.5" />
              重试一次
            </TactileButton>
          </div>
        ) : !loaded ? (
          <p className="rounded-tactile border border-line bg-surface p-8 text-center text-sm text-ink-soft">
            载入内置样例，或提交真实图片 / 通知文本后，这里会按读屏顺序逐块呈现解析与核对结果。
          </p>
        ) : (
          <>
            <p
              className={cn(
                "inline-flex w-fit items-center rounded-full border px-3 py-1 text-xs font-semibold",
                sampleMode
                  ? "border-warn-border bg-warn-bg text-warn-fg"
                  : "border-cobalt bg-edited-bg text-cobalt",
              )}
            >
              {sampleMode
                ? "内置样例结果 · 固定验收场景"
                : "真实识别结果 · 全部字段需人工核对"}
            </p>

            <CardShell
              kicker="H1 · 活动主标题"
              status={cardStatus.title}
              speaking={readIndex === 0}
              delay={0}
              badgeRef={badgeRefFor("title")}
            >
              {sampleMode ? (
                <h2 className="text-lg font-bold text-ink">{draft.title}</h2>
              ) : (
                <Field id="f-title" label="活动主标题">
                  <input
                    id="f-title"
                    value={draft.title}
                    onChange={(e) => edit("title", e.target.value)}
                    placeholder="按原件核对标题"
                    className={INPUT_CLASS}
                  />
                </Field>
              )}
              {cardMessages("title")}
              {confirmButton("title")}
            </CardShell>

            <CardShell
              kicker="时间 · 活动具体时间"
              status={cardStatus.time}
              speaking={readIndex === 1}
              delay={90}
              badgeRef={badgeRefFor("time")}
            >
              <Field id="f-datetime" label="活动时间">
                <input
                  id="f-datetime"
                  value={draft.datetime}
                  onChange={(e) => edit("datetime", e.target.value)}
                  placeholder={sampleMode ? "2026-11-21 19:00" : "按原件核对时间"}
                  aria-describedby="hint-datetime"
                  className={INPUT_CLASS}
                />
              </Field>
              <p id="hint-datetime" className="mt-1 text-xs text-ink-soft">
                {sampleMode
                  ? "请填写明确日期与时刻，示例：2026-11-21 19:00 或 2026年11月21日 19:00"
                  : "按原件核对；原件时间模糊时可保留原表述或补充确认后的时间，不强制单一格式。"}
              </p>
              {cardMessages("time")}
              {confirmButton("time")}
            </CardShell>

            <CardShell
              kicker="地点 · 活动地点"
              status={cardStatus.location}
              speaking={readIndex === 2}
              delay={180}
              badgeRef={badgeRefFor("location")}
            >
              {sampleMode ? (
                <p className="text-sm text-ink">{draft.location}</p>
              ) : (
                <Field id="f-location" label="活动地点">
                  <input
                    id="f-location"
                    value={draft.location}
                    onChange={(e) => edit("location", e.target.value)}
                    placeholder="按原件核对地点"
                    className={INPUT_CLASS}
                  />
                </Field>
              )}
              {cardMessages("location")}
              {confirmButton("location")}
            </CardShell>

            <CardShell
              kicker="正文 · 核心信息"
              status={cardStatus.points}
              speaking={readIndex === 3}
              delay={270}
              badgeRef={badgeRefFor("points")}
            >
              {sampleMode ? (
                <ul className="list-disc space-y-1 pl-5 text-sm text-ink">
                  {draft.summaryPoints.filter(Boolean).map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              ) : (
                <Field id="f-points" label="正文要点（每行一条）">
                  <textarea
                    id="f-points"
                    rows={4}
                    value={draft.summaryPoints.join("\n")}
                    onChange={(e) => editPoints(e.target.value)}
                    placeholder="每行一条要点，按原件核对"
                    className={INPUT_CLASS}
                  />
                </Field>
              )}
              {cardMessages("points")}
              {confirmButton("points")}
            </CardShell>

            <CardShell
              kicker="视觉与报名入口 · 二维码说明 & 可用报名方式"
              status={cardStatus.action}
              speaking={readIndex === 4}
              delay={360}
              badgeRef={badgeRefFor("action")}
            >
              {sampleMode ? (
                <p className="text-sm text-ink">{draft.visualAlt}</p>
              ) : (
                <div className="grid gap-3">
                  <Field id="f-visual-alt" label="视觉说明（配图 / 二维码）">
                    <input
                      id="f-visual-alt"
                      value={draft.visualAlt}
                      onChange={(e) => edit("visualAlt", e.target.value)}
                      placeholder="客观描述图像内容，不声称读屏能读出二维码"
                      className={INPUT_CLASS}
                    />
                  </Field>
                  <Field id="f-action-guide" label="报名指引文字">
                    <input
                      id="f-action-guide"
                      value={draft.actionGuide}
                      onChange={(e) => edit("actionGuide", e.target.value)}
                      placeholder="如：现场报名 / 扫码报名 / 点击链接报名"
                      className={INPUT_CLASS}
                    />
                  </Field>
                </div>
              )}
              {cardMessages("action")}
              <div className="mt-3 grid gap-3">
                <Field id="f-action-label" label="报名链接名称">
                  <input
                    id="f-action-label"
                    value={draft.actionLabel}
                    onChange={(e) => edit("actionLabel", e.target.value)}
                    placeholder="打开社团招新报名表"
                    className={INPUT_CLASS}
                  />
                </Field>
                <Field id="f-action-url" label="报名链接 URL">
                  <input
                    id="f-action-url"
                    type="url"
                    value={draft.actionUrl}
                    onChange={(e) => edit("actionUrl", e.target.value)}
                    placeholder="https://example.com/join"
                    className={INPUT_CLASS}
                  />
                </Field>
                <Field id="f-contact" label="备用联系方式">
                  <input
                    id="f-contact"
                    value={draft.contactInfo}
                    onChange={(e) => edit("contactInfo", e.target.value)}
                    placeholder="QQ 群 / 电话 / 邮箱"
                    className={INPUT_CLASS}
                  />
                </Field>
              </div>
              {confirmButton("action")}
            </CardShell>

            <div className="flex flex-col gap-3">
              <div id="blocking-issues" role="status" aria-live="polite">
                {issues.length > 0 ? (
                  <ul className="space-y-1 rounded-tactile border border-warn-border bg-warn-bg p-4 text-xs text-warn-fg">
                    {issues.map((issue) => (
                      <li key={issue}>• {issue}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-ok-fg">
                    全部核对完成，可以生成无障碍页面预览。
                  </p>
                )}
              </div>
              <TactileButton
                onClick={() => setPreviewOpen(true)}
                disabled={issues.length > 0}
                aria-describedby="blocking-issues"
                className="w-full"
              >
                生成无障碍页面预览
              </TactileButton>

              {sampleMode ? (
                <p className="text-xs text-ink-soft">
                  内置样例仅供本地预览，不会发布到公开分享库。
                </p>
              ) : published ? (
                <div className="rounded-tactile border border-ok-border bg-ok-bg p-4">
                  <p className="text-sm font-semibold text-ok-fg">
                    已发布 · 经人工核对的公开分享页
                  </p>
                  <a
                    href={published.shareUrl}
                    className="mt-2 inline-flex items-center gap-1 break-all font-mono text-sm text-cobalt underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt"
                  >
                    {published.shareUrl}
                    <ExternalLink aria-hidden="true" className="size-3.5 shrink-0" />
                  </a>
                  <div className="mt-3">
                    <TactileButton onClick={copyLink} className="px-3 py-1.5 text-xs">
                      {copied ? (
                        <Check aria-hidden="true" className="size-3.5" />
                      ) : (
                        <Copy aria-hidden="true" className="size-3.5" />
                      )}
                      {copied ? "已复制" : "复制链接"}
                    </TactileButton>
                  </div>
                  <p className="mt-2 text-xs text-ink-soft">
                    任何持有该链接的人无需登录即可查看（不含原图与原文）。
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <TactileButton
                    onClick={() => setConsentOpen(true)}
                    disabled={issues.length > 0 || publishing}
                    className="w-full"
                  >
                    <Link2 aria-hidden="true" className="size-4" />
                    发布公开分享页
                  </TactileButton>
                  {consentOpen && (
                    <div
                      role="group"
                      aria-labelledby="publish-consent-title"
                      className="rounded-tactile border border-warn-border bg-warn-bg p-4"
                    >
                      <p id="publish-consent-title" className="text-sm font-semibold text-warn-fg">
                        发布前请确认
                      </p>
                      <p className="mt-2 text-xs leading-relaxed text-warn-fg">
                        发布后，任何持有该链接的人无需登录即可查看这份经您核对的无障碍通知（不含原图与原文）。
                      </p>
                      {publishError && (
                        <p role="alert" className="mt-2 text-xs font-semibold text-warn-fg">
                          发布失败：{publishError}
                        </p>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <TactileButton
                          onClick={confirmPublish}
                          disabled={publishing}
                          className="px-3 py-1.5 text-xs"
                        >
                          {publishing ? (
                            <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />
                          ) : null}
                          {publishing ? "正在发布…" : "确认发布"}
                        </TactileButton>
                        <TactileButton
                          onClick={() => {
                            setConsentOpen(false);
                            setPublishError(null);
                          }}
                          className="border-b-line bg-surface px-3 py-1.5 text-xs text-ink-soft shadow-none"
                        >
                          取消
                        </TactileButton>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <dialog
        ref={dialogRef}
        aria-labelledby="preview-title"
        onClose={() => setPreviewOpen(false)}
        className="w-[min(720px,92vw)] rounded-tactile border border-line bg-surface p-0 backdrop:bg-ink/40"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-4">
          <p id="preview-title" className="text-sm font-bold text-ink">
            无障碍分享页预览
          </p>
          <div className="flex items-center gap-2">
            <TactileButton
              aria-pressed={largeText}
              onClick={() => setLargeText((v) => !v)}
              className={cn("px-3 py-1 text-xs", !largeText && "border-b-line bg-surface text-ink-soft shadow-none")}
            >
              大字号
            </TactileButton>
            <TactileButton
              aria-pressed={highContrast}
              onClick={() => setHighContrast((v) => !v)}
              className={cn("px-3 py-1 text-xs", !highContrast && "border-b-line bg-surface text-ink-soft shadow-none")}
            >
              黑底黄字高反差
            </TactileButton>
            <TactileButton
              onClick={() => dialogRef.current?.close()}
              className="border-b-line bg-surface px-3 py-1 text-xs text-ink-soft shadow-none"
            >
              关闭
            </TactileButton>
          </div>
        </div>

        <article
          aria-label="无障碍通知正文"
          className={cn(
            "max-h-[70vh] overflow-y-auto px-6 py-6",
            highContrast ? "bg-lights-off text-amber" : "bg-surface text-ink",
            largeText ? "text-lg" : "text-sm",
          )}
        >
          <h1 className={cn("font-bold", largeText ? "text-3xl" : "text-2xl")}>
            {draft.title}
          </h1>
          <h2 className={cn("mt-5 font-semibold", largeText ? "text-xl" : "text-base")}>
            时间
          </h2>
          <p className="mt-1">{draft.datetime}</p>
          <h2 className={cn("mt-5 font-semibold", largeText ? "text-xl" : "text-base")}>
            地点
          </h2>
          <p className="mt-1">{draft.location}</p>
          <h2 className={cn("mt-5 font-semibold", largeText ? "text-xl" : "text-base")}>
            核心信息
          </h2>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {draft.summaryPoints.filter(Boolean).map((point, index) => (
              <li key={`${index}-${point}`}>{point}</li>
            ))}
          </ul>
          <h2 className={cn("mt-5 font-semibold", largeText ? "text-xl" : "text-base")}>
            视觉与报名
          </h2>
          <p className="mt-1">{draft.visualAlt}</p>
          <p className="mt-1">{draft.actionGuide}</p>
          {draft.actionUrl.trim() && (
            <p className="mt-3">
              <a
                href={draft.actionUrl}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  "font-semibold underline focus-visible:outline-2 focus-visible:outline-offset-2",
                  highContrast
                    ? "text-amber focus-visible:outline-amber"
                    : "text-cobalt focus-visible:outline-cobalt",
                )}
              >
                {draft.actionLabel || "打开报名链接"}
              </a>
            </p>
          )}
          {draft.contactInfo.trim() && (
            <p className="mt-2">备用联系方式：{draft.contactInfo}</p>
          )}
        </article>
      </dialog>
    </div>
  );
}