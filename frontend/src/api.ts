import type { ResumeDocument, ResumeSummary } from "./types";

export type RevisionedResumeDocument = ResumeDocument & { revision: number };

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function responseError(response: Response, fallback = "请求失败") {
  let message = `${fallback}（${response.status}）`;
  try {
    const body = (await response.json()) as { detail?: string };
    if (body.detail) message = body.detail;
  } catch {
    // 保留通用错误信息。
  }
  return new ApiError(message, response.status);
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw await responseError(response);
  }
  return (await response.json()) as T;
}

export const api = {
  list: () => request<ResumeSummary[]>("/api/resumes"),
  get: (id: string) => request<RevisionedResumeDocument>(`/api/resumes/${id}`),
  import: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<RevisionedResumeDocument>("/api/import", { method: "POST", body: form });
  },
  save: (document: RevisionedResumeDocument) =>
    request<RevisionedResumeDocument>(`/api/resumes/${document.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(document),
    }),
  rename: (id: string, title: string, revision: number) =>
    request<RevisionedResumeDocument>(`/api/resumes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, revision }),
    }),
  remove: async (id: string, revision: number) => {
    const response = await fetch(`/api/resumes/${id}?revision=${revision}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      let message = `删除失败（${response.status}）`;
      try {
        const body = (await response.json()) as { detail?: string };
        if (body.detail) message = body.detail;
      } catch {
        // 保留通用错误信息。
      }
      throw new Error(message);
    }
  },
  trash: () => request<ResumeSummary[]>("/api/trash"),
  restoreResume: (id: string, revision: number) =>
    request<RevisionedResumeDocument>(`/api/resumes/${id}/restore?revision=${revision}`, {
      method: "POST",
    }),
  purge: async (id: string, revision: number) => {
    const response = await fetch(`/api/resumes/${id}/purge?revision=${revision}`, {
      method: "DELETE",
    });
    if (!response.ok) throw await responseError(response, "永久删除失败");
  },
  duplicate: (id: string, title?: string) =>
    request<ResumeDocument>(`/api/resumes/${id}/duplicate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title || null }),
    }),
  photo: (id: string, file: File, revision: number) => {
    const form = new FormData();
    form.append("file", file);
    form.append("revision", String(revision));
    return request<RevisionedResumeDocument>(`/api/resumes/${id}/photo`, {
      method: "POST",
      body: form,
    });
  },
  exportPdf: async (id: string) => {
    const response = await fetch(`/api/resumes/${id}/export/pdf`, { method: "POST" });
    if (!response.ok) throw await responseError(response, "PDF 导出失败");
    return response.blob();
  },
  backup: async () => {
    const response = await fetch("/api/backup", { method: "POST" });
    if (!response.ok) throw await responseError(response, "备份失败");
    const disposition = response.headers.get("Content-Disposition") ?? "";
    const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
    const plainName = disposition.match(/filename="?([^";]+)"?/i)?.[1];
    return {
      blob: await response.blob(),
      filename: encoded ? decodeURIComponent(encoded) : plainName || "web-resume-backup.zip",
    };
  },
  restoreBackup: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<{
      status: string;
      safety_backup: string;
      restored_files: number;
      quarantined_files: number;
    }>("/api/restore", {
      method: "POST",
      body: form,
    });
  },
};
