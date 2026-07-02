import type { ReactNode } from "react";
import type { ResumeDocument, RichTextSpan } from "../types";

function RichText({ spans }: { spans: RichTextSpan[] }) {
  return spans.map((span, index) => {
    let content: ReactNode = span.text;
    if (span.bold) content = <strong>{content}</strong>;
    if (span.italic) content = <em>{content}</em>;
    return <span key={`${index}-${span.text}`}>{content}</span>;
  });
}

export function ResumePreview({ document }: { document: ResumeDocument }) {
  const { profile } = document;
  return (
    <article className="resume-content" aria-label={`${document.title} 预览`}>
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
                  <div className="resume-item-title">
                    <RichText spans={item.title} />
                  </div>
                  {item.date && <div className="resume-item-date">{item.date}</div>}
                </div>
              )}
              {item.subtitle.length > 0 && (
                <div className="resume-item-subtitle">
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
