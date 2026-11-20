/** 「读屏友好页面生成器」四阶段数据契约：读取 → 存疑 → 确认 → 发布。 */

export type SourceType = "image" | "text";

/** 可被发布者核对与修正的内容字段，也是 VerificationWarning.field 的取值范围。 */
export interface AccessibleContentFields {
  title: string;
  datetime: string;
  location: string;
  summaryPoints: string[];
  /** 配图 / 二维码的视觉说明，供读屏替代图像本身。 */
  visualAlt: string;
  /** 报名方式的文字说明。 */
  actionGuide: string;
  /** 明确的链接名称，如「打开AI创造社招新报名表」。 */
  actionLabel: string;
  /** 可点击的报名链接。 */
  actionUrl: string;
  /** 备用联系方式。 */
  contactInfo: string;
}

export type ContentField = keyof AccessibleContentFields;

/** 工作台里可编辑的字段（列表类字段不在单行输入中编辑）。 */
export type EditableField = Exclude<ContentField, "summaryPoints">;

/** 阶段一：模型读到了什么。未经人工核对，不得直接发布。 */
export interface RawExtractedResult extends AccessibleContentFields {
  sourceType: SourceType;
  /** 模型自评置信度，0–1；仅用于排序核对优先级，不作为事实依据。 */
  rawConfidence: number;
}

export type WarningSeverity = "missing" | "ambiguous" | "unverified_qr";

export type WarningStatus = "pending" | "edited" | "confirmed";

/** 阶段二：哪些内容有疑问。message 面向发布者，不是面向最终读者。 */
export interface VerificationWarning {
  id: string;
  field: ContentField;
  /** 中文显示名，用于进度胶囊与阻断提示。 */
  fieldLabel: string;
  severity: WarningSeverity;
  /** 是否阻断发布。 */
  blocking: boolean;
  message: string;
  status: WarningStatus;
}

/** 阶段三：用户确认了什么。字段值已是修正后的结果。 */
export interface ConfirmedPageContent extends AccessibleContentFields {
  sourceType: SourceType;
  warningsResolvedCount: number;
  /** ISO 8601 时间戳。 */
  confirmedAt: string;
}

/** 供读屏与语音试听按数组顺序朗读的扁平语义块。 */
export type ReadOrderSection =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "image-alt"; text: string }
  | { kind: "action"; text: string };

/** 阶段四：最终发布了什么。 */
export interface PublishedAccessiblePage {
  /** 6 位短码，同时作为分享路径末段。 */
  id: string;
  /** 形如 `/p/${id}`。 */
  shareUrl: string;
  content: ConfirmedPageContent;
  /** ISO 8601 时间戳。 */
  publishedAt: string;
  readOrderSections: ReadOrderSection[];
}

/** 发布闸门：返回具体未完成提示；为空才允许进入最终发布预览。 */
export function getBlockingIssues(
  warnings: VerificationWarning[],
  content: AccessibleContentFields,
  options: { requireActionContact?: boolean } = {},
): string[] {
  const issues: string[] = [];
  for (const warning of warnings) {
    if (warning.blocking && warning.status !== "confirmed") {
      issues.push(`${warning.fieldLabel}：${warning.message}`);
    }
  }
  // 「必须有链接或联系方式」仅约束内置样例；真实通知可能只有现场报名等文字指引。
  if (
    options.requireActionContact !== false &&
    !content.actionUrl.trim() &&
    !content.contactInfo.trim()
  ) {
    issues.push("报名方式：请补充带明确名称的报名链接或备用联系方式");
  }
  return issues;
}