"use client";

import { useMemo, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";

import { useI18n } from "@/src/components/I18nProvider";
import { attachmentUrl, filenamesMatch } from "@/src/lib/issue-utils";
import { normalizeRedmineText, splitRedmineCollapseSegments } from "@/src/lib/redmine-text-format";
import type { Attachment } from "@/src/types/dashboard";

type MarkdownBlockProps = {
  content: string;
  attachments?: Attachment[];
  issueId?: number;
  onImageClick?: (src: string, alt: string) => void;
};

export function MarkdownBlock({
  content,
  attachments = [],
  issueId,
  onImageClick,
}: MarkdownBlockProps) {
  const segments = useMemo(() => splitRedmineCollapseSegments(content), [content]);
  const { t } = useI18n();

  function textFromNode(node: ReactNode): string {
    if (typeof node === "string" || typeof node === "number") {
      return String(node);
    }
    if (!node || typeof node !== "object") {
      return "";
    }
    if (Array.isArray(node)) {
      return node.map((part) => textFromNode(part)).join("");
    }
    const props = (node as { props?: { children?: ReactNode } }).props;
    return textFromNode(props?.children ?? "");
  }

  function createCodePre(disableCollapse: boolean) {
    return function CodePre(props: { children?: ReactNode }) {
      if (disableCollapse) {
        return <pre>{props.children}</pre>;
      }
      const raw = textFromNode(props.children ?? "");
      const lines = raw.split("\n").filter((line) => line.trim().length > 0).length;
      const shouldCollapse = lines >= 10 || raw.trim().length >= 80;
      if (!shouldCollapse) {
        return <pre>{props.children}</pre>;
      }
      return (
        <details className="md-collapsible-code">
          <summary>{t("issues.showCode", { count: lines })}</summary>
          <pre>{props.children}</pre>
        </details>
      );
    };
  }

  function MarkdownImage({ src, alt }: { src?: string | Blob; alt?: string }) {
    if (!src || typeof src === "object") return null;
    const srcText = src.toString();
    const attachmentMarker = "/api/issues/_ATTACHMENT_/";
    const filename = srcText.includes(attachmentMarker)
      ? decodeURIComponent(srcText.slice(srcText.indexOf(attachmentMarker) + attachmentMarker.length))
      : srcText.split("/").pop() ?? alt ?? "image";

    if (srcText.includes(attachmentMarker)) {
      const attachment = attachments.find((item) => filenamesMatch(item.filename, filename));
      if (!attachment || !issueId) return <span className="muted">[Image: {filename}]</span>;
      const url = attachmentUrl(issueId, attachment.redmineAttachmentId);
      return (
        <span className="markdown-image-frame">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="attachment-preview-image clickable"
            src={url}
            alt={alt ?? filename}
            loading="lazy"
            onClick={() => onImageClick?.(url, alt ?? filename)}
          />
        </span>
      );
    }

    return (
      <span className="markdown-image-frame">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="attachment-preview-image clickable"
          src={srcText}
          alt={alt ?? filename}
          loading="lazy"
          onClick={() => onImageClick?.(srcText, alt ?? filename)}
        />
      </span>
    );
  }

  function renderMarkdown(markdown: string, key: string, options?: { disableCodeCollapse?: boolean }) {
    const normalized = normalizeRedmineText(markdown);
    if (!normalized.trim()) return null;
    const CodePre = createCodePre(options?.disableCodeCollapse ?? false);
    return (
      <ReactMarkdown
        key={key}
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { ignoreMissing: true }]]}
        components={{
          pre: CodePre,
          img: MarkdownImage,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {normalized}
      </ReactMarkdown>
    );
  }

  return (
    <div className="markdown">
      {segments.map((segment, index) => {
        if (segment.type === "markdown") {
          return renderMarkdown(segment.content, `md-${index}`);
        }
        return (
          <details key={`collapse-${index}`} className="redmine-collapse">
            <summary>{segment.title}</summary>
            {renderMarkdown(segment.content, `collapse-body-${index}`, { disableCodeCollapse: true })}
          </details>
        );
      })}
    </div>
  );
}
