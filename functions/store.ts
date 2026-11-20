// 公开无障碍页面的持久化契约与真实适配器。
// 生产路径只走 Qoder Sites 注入的数据库 SDK；绝不使用内存 Map 兜底。
// 本地联调由 dev/local-store.mjs 注入文件适配器，自检由测试 Mock 注入——均不在生产代码路径。

export interface PageContent {
  title: string;
  datetime: string;
  location: string;
  summaryPoints: string[];
  visualAlt: string;
  actionGuide: string;
  actionLabel: string;
  actionUrl: string;
  contactInfo: string;
}

export interface PageRow {
  id: string;
  content: PageContent;
  sourceType: "image" | "text";
  warningsResolvedCount: number;
  publishedAt: string;
  confirmedAt: string;
}

export interface PageStore {
  /** 短 ID 冲突时返回 inserted:false（不抛错），由调用方换新 ID 重试。 */
  insert(row: PageRow): Promise<{ inserted: boolean }>;
  get(id: string): Promise<PageRow | null>;
}

interface QueryResult {
  data: Record<string, unknown>[] | null;
  error: { code?: string } | null;
}

interface DbClient {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: unknown): { limit(n: number): Promise<QueryResult> };
    };
    insertIfAbsent(
      row: Record<string, unknown>,
      options: { onConflict: string },
    ): { select(columns: string): Promise<QueryResult> };
  };
}

function fail(error: { code?: string } | null): void {
  if (error) {
    const err = new Error(error.code ?? "database_error") as Error & { code?: string };
    err.code = error.code ?? "database_error";
    throw err;
  }
}

/** 真实适配器：基于平台注入的数据库 SDK（_qoder/backend.mjs 的 createDatabaseClient）。 */
export function createSdkStore(db: DbClient): PageStore {
  return {
    async insert(row) {
      const result = await db
        .from("pages")
        .insertIfAbsent(
          {
            id: row.id,
            content: row.content,
            source_type: row.sourceType,
            warnings_resolved_count: row.warningsResolvedCount,
            published_at: row.publishedAt,
            confirmed_at: row.confirmedAt,
          },
          { onConflict: "id" },
        )
        .select("id");
      fail(result.error);
      return { inserted: (result.data?.length ?? 0) > 0 };
    },
    async get(id) {
      const result = await db
        .from("pages")
        .select("id,content,source_type,warnings_resolved_count,published_at,confirmed_at")
        .eq("id", id)
        .limit(1);
      fail(result.error);
      const r = result.data?.[0];
      if (!r) return null;
      return {
        id: r.id as string,
        content: r.content as PageContent,
        sourceType: r.source_type as "image" | "text",
        warningsResolvedCount: r.warnings_resolved_count as number,
        publishedAt: r.published_at as string,
        confirmedAt: r.confirmed_at as string,
      };
    },
  };
}