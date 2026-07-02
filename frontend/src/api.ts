import type { ResumeDocument, ResumeSummary } from "./types";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  if (!response.ok) {
    let message = `请求失败（${response.status}）`;
    try {
      const body = (await response.json()) as { detail?: string };
      if (body.detail) message = body.detail;
    } catch {
      // 保留通用错误信息。
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}

export const api = {
  list: () => request<ResumeSummary[]>("/api/resumes"),
  get: (id: string) => request<ResumeDocument>(`/api/resumes/${id}`),
  import: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<ResumeDocument>("/api/import", { method: "POST", body: form });
  },
  save: (document: ResumeDocument) =>
    request<ResumeDocument>(`/api/resumes/${document.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(document),
    }),
  rename: (id: string, title: string) =>
    request<ResumeDocument>(`/api/resumes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    }),
  remove: async (id: string) => {
    const response = await fetch(`/api/resumes/${id}`, { method: "DELETE" });
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
  duplicate: (id: string, title?: string) =>
    request<ResumeDocument>(`/api/resumes/${id}/duplicate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title || null }),
    }),
  photo: (id: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<ResumeDocument>(`/api/resumes/${id}/photo`, {
      method: "POST",
      body: form,
    });
  },
};
