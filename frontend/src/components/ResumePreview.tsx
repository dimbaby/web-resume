import type { ReactNode } from "react";
import type { ResumeDocument, RichTextSpan, TextStyle } from "../types";

function RichText({ spans }: { spans: RichTextSpan[] }) {
  return spans.map((span, index) => {
    let content: ReactNode = span.text;
    if (span.bold) content = <strong>{content}</strong>;
    if (span.italic) content = <em>{content}</em>;
    return (
      <span className="rich-text-span" key={`${index}-${span.text}`}>
        {content}
      </span>
    );
  });
}

function styleClass(style?: TextStyle, fallback?: TextStyle) {
  const resolved = style ?? fallback ?? { bold: false, italic: false };
  return [
    resolved.bold ? "resume-text-bold" : "",
    resolved.italic ? "resume-text-italic" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function ResumePreview({ document }: { document: ResumeDocument }) {
  const { profile } = document;
  const appearance = document.appearance ?? {
    template: "reference",
    bullet_style: "triangle",
  };
  return (
    <article
      className={`resume-content resume-template-${appearance.template} resume-bullet-${appearance.bullet_style}`}
      aria-label={`${document.title} 预览`}
    >
      <header className={`resume-header${profile.photo_url ? " has-photo" : ""}`}>
        <h1 className="resume-name">{profile.name || "姓名"}</h1>
        <div className="resume-contact">
          {profile.email && <span>邮箱：{profile.email}</span>}
          {profile.phone && <span>电话：{profile.phone}</span>}
        </div>
        {profile.photo_url && (
          <div className="resume-photo-frame">
            <img src={profile.photo_url} alt="证件照" />
          </div>
        )}
      </header>

      {document.sections.map((section) => (
        <section
          className={`resume-section resume-section-${section.kind}`}
          key={section.id}
        >
          <h2 className="resume-section-title">{section.title}</h2>
          {section.items.map((item) => (
            <div className="resume-item" key={item.id}>
              {(item.title.length > 0 || item.date) && (
                <div className="resume-item-header">
                  <div
                    className={`resume-item-title ${styleClass(item.title_style, {
                      bold: true,
                      italic: false,
                    })}`}
                  >
                    <RichText spans={item.title} />
                  </div>
                  {item.date && <div className="resume-item-date">{item.date}</div>}
                </div>
              )}
              {item.subtitle.length > 0 && (
                <div
                  className={`resume-item-subtitle ${styleClass(item.subtitle_style, {
                    bold: false,
                    italic: true,
                  })}`}
                >
                  <RichText spans={item.subtitle} />
                </div>
              )}
              {item.bullets.length > 0 && (
                <ul className="resume-bullets">
                  {item.bullets.map((bullet) => (
                    <li className="resume-bullet" key={bullet.id}>
                      <span>
                        <RichText spans={bullet.content} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </section>
      ))}
    </article>
  );
}
