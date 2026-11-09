import { Fragment, type ReactNode } from "react";

/** Render bold (**text**) segments. */
function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(<Fragment key={k++}>{text.slice(last, m.index)}</Fragment>);
    out.push(<strong key={k++}>{m[1]}</strong>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(<Fragment key={k++}>{text.slice(last)}</Fragment>);
  return out.length ? out : [text];
}

function isBullet(line: string) {
  return /^[-*]\s+/.test(line);
}

/**
 * Lightweight, safe formatting for assistant replies (bold, bullet lists, paragraphs).
 * Avoids a markdown dependency while fixing common LLM formatting like **headings** and `- item`.
 */
export function AssistantText({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    if (isBullet(line)) {
      const items: string[] = [];
      while (i < lines.length && isBullet(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ""));
        i++;
      }
      blocks.push(
        <ul key={key++} className="my-1.5 list-disc space-y-1 pl-5">
          {items.map((item, j) => (
            <li key={j}>{renderInline(item)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !isBullet(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(
      <p key={key++} className="my-1.5 first:mt-0 last:mb-0">
        {para.map((pl, j) => (
          <Fragment key={j}>
            {j > 0 && <br />}
            {renderInline(pl)}
          </Fragment>
        ))}
      </p>,
    );
  }

  return <div className="break-words">{blocks}</div>;
}
