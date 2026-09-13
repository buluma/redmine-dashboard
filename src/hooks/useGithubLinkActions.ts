"use client";

import { useState } from "react";

import type { GithubLinkCreatePayload } from "@/src/components/issue-detail/GithubLinksSection";

export interface UseGithubLinkActionsResult {
  busy: boolean;
  submitGithubLink: (payload: GithubLinkCreatePayload) => Promise<boolean>;
  deleteGithubLink: (linkId: string) => Promise<void>;
}

interface Options {
  issueId: string;
  onChanged: () => Promise<void>;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
  t: (key: string, variables?: Record<string, string | number> | string) => string;
}

export function useGithubLinkActions({ issueId, onChanged, onSuccess, onError, t }: Options): UseGithubLinkActionsResult {
  const [busy, setBusy] = useState(false);

  async function submitGithubLink(payload: GithubLinkCreatePayload): Promise<boolean> {
    setBusy(true);
    try {
      const res = await fetch(`/api/issues/${issueId}/github-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Unable to link GitHub reference");
      }
      await onChanged();
      onSuccess(t("issues.messages.githubLinked"));
      return true;
    } catch (e) {
      onError(e instanceof Error ? e.message : "Unable to link GitHub reference");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function deleteGithubLink(linkId: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/issues/${issueId}/github-links/${linkId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Unable to remove GitHub link");
      }
      await onChanged();
      onSuccess(t("issues.messages.githubRemoved"));
    } catch (e) {
      onError(e instanceof Error ? e.message : "Unable to remove GitHub link");
    } finally {
      setBusy(false);
    }
  }

  return { busy, submitGithubLink, deleteGithubLink };
}
