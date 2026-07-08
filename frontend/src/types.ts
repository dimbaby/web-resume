export type RichTextSpan = {
  text: string;
  bold?: boolean;
  italic?: boolean;
};

export type TextStyle = {
  bold: boolean;
  italic: boolean;
};

export type ResumeBullet = {
  id: string;
  content: RichTextSpan[];
};

export type ResumeItem = {
  id: string;
  title: RichTextSpan[];
  subtitle: RichTextSpan[];
  title_style: TextStyle;
  subtitle_style: TextStyle;
  date: string;
  bullets: ResumeBullet[];
};

export type SectionKind =
  | "education"
  | "project"
  | "experience"
  | "skills"
  | "awards"
  | "campus"
  | "custom"
  | "unresolved";

export type ResumeSection = {
  id: string;
  kind: SectionKind;
  title: string;
  items: ResumeItem[];
};

export type ResumeProfile = {
  name: string;
  email: string;
  phone: string;
  photo_url: string;
};

export type TemplateStyle = "reference" | "ats" | "modern" | "compact" | "elegant";
export type BulletStyle = "triangle" | "dot" | "dash" | "square" | "none";

export type ResumeAppearance = {
  template: TemplateStyle;
  bullet_style: BulletStyle;
};

export type ResumeDocument = {
  id: string;
  title: string;
  profile: ResumeProfile;
  appearance: ResumeAppearance;
  sections: ResumeSection[];
  warnings: string[];
  source: { filename: string; format: "md" | "docx" | "manual" };
  created_at: string;
  updated_at: string;
};

export type ResumeSummary = {
  id: string;
  title: string;
  source_filename: string;
  section_count: number;
  created_at: string;
  updated_at: string;
};
