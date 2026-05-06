"use client";

type Props = {
  rows?: number;
  columns?: number;
};

export function SkeletonTable({ rows = 8, columns = 6 }: Props) {
  const widths = ["skel-w-sm", "skel-w-lg", "skel-w-md", "skel-w-sm", "skel-w-md", "skel-w-sm"];
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <tr key={i} className="skeleton-row">
          {Array.from({ length: columns }, (_, j) => (
            <td key={j}>
              <span className={`skel ${widths[j % widths.length]}`} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function SkeletonMetricCards({ count = 6 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <article key={i} className="card metric-card">
          <span className="skel skel-w-md" style={{ marginBottom: "0.5rem" }} />
          <span className="skel skel-w-sm skel-h-lg" style={{ marginBottom: "0.4rem" }} />
          <span className="skel skel-w-lg" />
        </article>
      ))}
    </>
  );
}
