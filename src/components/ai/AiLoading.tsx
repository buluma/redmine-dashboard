"use client";

interface AiLoadingProps {
  message?: string;
  size?: "sm" | "md" | "lg";
}

export function AiLoading({ message = "Loading...", size = "md" }: AiLoadingProps) {
  const sizeStyles = {
    sm: "w-4 h-4 border-2",
    md: "w-6 h-6 border-2",
    lg: "w-8 h-8 border-3",
  };

  return (
    <div className="flex items-center gap-3 py-2">
      <div
        className={`${sizeStyles[size]} border-blue-500 border-t-transparent rounded-full animate-spin`}
      />
      <span className="text-sm text-gray-500 dark:text-gray-400">{message}</span>
    </div>
  );
}

export function AiSkeleton({ lines = 3 }: { lines?: number }) {
  const widths = [92, 86, 79, 95, 83];
  return (
    <div className="space-y-2 py-2">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"
          style={{
            width: `${widths[i % widths.length]}%`,
          }}
        />
      ))}
    </div>
  );
}
