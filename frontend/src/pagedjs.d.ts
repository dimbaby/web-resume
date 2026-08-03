declare module "pagedjs" {
  export type PagedStylesheet = string | Record<string, string>;

  export class Previewer {
    preview(
      content: string | HTMLElement,
      stylesheets?: PagedStylesheet[],
      renderTo?: HTMLElement,
    ): Promise<{ total: number }>;
  }
}
