"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/src/components/I18nProvider";
import type { SlackMessage } from "@/src/lib/slack";

interface SlackMessagesClientProps {
  initialMessages: SlackMessage[];
  initialUserNames?: Record<string, string>;
  channelId: string;
  channels: Array<{ id: string; name: string }>;
  refreshIntervalMs?: number;
  channelCount: number;
}

const AUTO_REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

interface UserCache {
  [userId: string]: string;
}

function formatReactionEmoji(name: string): string {
  // Convert Slack emoji names to Unicode or keep as-is
  const emojiMap: Record<string, string> = {
    "+1": "👍",
    "-1": "👎",
    "heart": "❤️",
    "laugh": "😂",
    "confused": "😕",
    "eyes": "👀",
    "rocket": "🚀",
    "white_check_mark": "✅",
    "x": "❌",
  };
  return emojiMap[name] || `:${name}:`;
}

function MessageItem({
  message,
  userNames,
  onThreadClick,
  showAvatar = true,
}: {
  message: SlackMessage;
  userNames: UserCache;
  onThreadClick: (threadTs: string) => void;
  showAvatar?: boolean;
}) {
  const { t, formatDate } = useI18n();
  const isThreadReply = !!message.threadTs && message.ts !== message.threadTs;
  const userId = message.user || "unknown";
  const userName = userNames[userId] || (userId === "unknown" ? t("slack.unknown") : userId);
  const isBot = !!message.botId;
  const initial = userName.charAt(0).toUpperCase();

  // Format time like Slack: "11:51 AM"
  const formatTime = (ts: string) => {
    return formatDate(new Date(parseFloat(ts) * 1000));
  };

  // Check if this is a system message subtype
  const subtype = message.subtype || "";
  const isSystemSubtype = ["channel_join", "channel_leave", "pinned_item", "file_comment"].includes(subtype);

  // Also check if the text content indicates a system message
  const text = message.text || "";
  const isJoinLeaveText = text.includes("joined the channel") || text.includes("left the channel") || text.includes("joined");

  // Show as system message if it's a system subtype OR if it's a join/leave notification
  const isSystemMessage = isSystemSubtype || (isBot && isJoinLeaveText && !message.attachments?.length);

  // Format system message text
  const getSystemMessageText = () => {
    if (text.includes("joined") || subtype === "channel_join") {
      return t("slack.joinedChannel", { user: userName });
    }
    if (text.includes("left") || subtype === "channel_leave") {
      return t("slack.leftChannel", { user: userName });
    }
    if (subtype === "pinned_item") {
      return t("slack.pinnedMessage", { user: userName });
    }
    return text;
  };

  // Show system messages in centered format
  if (isSystemMessage && text) {
    return (
      <div className="system-message-row">
        <span className="system-text">{getSystemMessageText()}</span>
        <span className="system-time">{formatTime(message.ts)}</span>
      </div>
    );
  }

  return (
    <article className={`slack-message ${isThreadReply ? "thread-reply" : ""}`}>
      {showAvatar ? (
        <div className="message-layout">
          <div className="avatar">
            {isBot ? <span className="bot-badge">🤖</span> : initial}
          </div>
          <div className="message-content">
            <div className="message-header">
              <span className="message-author">
                {userName}
                {isBot && <span className="bot-label">{t("slack.bot")}</span>}
              </span>
              <span className="message-time">{formatTime(message.ts)}</span>
            </div>
            <div className="message-body">
              <span className="message-text">{message.text}</span>
            </div>
            {message.attachments && message.attachments.length > 0 && (
              <div className="message-attachments">
                {message.attachments.map((att, idx) => (
                  <div key={idx} className="attachment-card">
                    {att.title && (
                      <a href={att.title_link || "#"} target="_blank" rel="noopener noreferrer" className="attachment-title">
                        📎 {att.title}
                      </a>
                    )}
                    {att.text && <p className="attachment-text">{att.text}</p>}
                  </div>
                ))}
              </div>
            )}
            {message.reactions && message.reactions.length > 0 && (
              <div className="message-reactions">
                {message.reactions.map((reaction, idx) => {
                  const count = reaction.count;
                  const personLabel = count === 1 ? t("slack.person") : t("slack.people");
                  return (
                    <span key={idx} className="reaction" title={`${reaction.users?.length || count} ${personLabel}`}>
                      {formatReactionEmoji(reaction.name)} {count}
                    </span>
                  );
                })}
              </div>
            )}
            {message.replyCount && message.replyCount > 0 && (
              <button
                className="thread-info"
                onClick={() => onThreadClick(message.ts)}
              >
                💬 {message.replyCount} {message.replyCount === 1 ? t("slack.reply") : t("slack.replies")}
                {message.replyUsers && message.replyUsers.length > 0 &&
                  ` · ${message.replyUsers.slice(0, 2).map(u => userNames[u] || u).join(", ")}`
                }
              </button>
            )}
          </div>
        </div>
      ) : (
        // Compact view for thread replies
        <div className="compact-message">
          <span className="compact-time">{formatTime(message.ts)}</span>
          <div className="message-body"><span className="message-text">{message.text}</span></div>
          {message.reactions && message.reactions.length > 0 && (
            <div className="message-reactions compact-reactions">
              {message.reactions.map((reaction, idx) => (
                <span key={idx} className="reaction">{formatReactionEmoji(reaction.name)} {reaction.count}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

export function SlackMessagesClient({ 
  initialMessages, 
  initialUserNames = {},
  channelId: initialChannelId,
  channels,
  refreshIntervalMs = 30000,
  channelCount
}: SlackMessagesClientProps) {
  const { t } = useI18n();
  const [messages, setMessages] = useState<SlackMessage[]>(initialMessages);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userNames, setUserNames] = useState<UserCache>(initialUserNames);
  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<SlackMessage[]>([]);
  const [isLoadingThread, setIsLoadingThread] = useState(false);
  const [isAutoRefreshEnabled, setIsAutoRefreshEnabled] = useState(true);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date(0));
  const [nextRefreshIn, setNextRefreshIn] = useState<number>(AUTO_REFRESH_INTERVAL_MS / 1000);
  const [isClient, setIsClient] = useState(false);
  const [currentChannelId, setCurrentChannelId] = useState(initialChannelId);
  const [isLoadingChannel, setIsLoadingChannel] = useState(false);
  const [keywordFilter, setKeywordFilter] = useState("");
  const [mutedChannels, setMutedChannels] = useState<Set<string>>(new Set());
  const autoRefreshRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  // Get current channel name
  const currentChannel = channels.find(c => c.id === currentChannelId);

  // Set client-side state after hydration
  useEffect(() => {
    setLastUpdated(new Date());
    setIsClient(true);
    try {
      const raw = window.localStorage.getItem("nrcc.slack.mutedChannels.v1");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setMutedChannels(new Set(parsed.filter((v): v is string => typeof v === "string")));
        }
      }
    } catch {
      // Ignore storage errors.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        "nrcc.slack.mutedChannels.v1",
        JSON.stringify(Array.from(mutedChannels)),
      );
    } catch {
      // Ignore storage errors.
    }
  }, [mutedChannels]);

  const toggleMute = (channelId: string) => {
    setMutedChannels((prev) => {
      const next = new Set(prev);
      if (next.has(channelId)) next.delete(channelId);
      else next.add(channelId);
      return next;
    });
  };

  const isCurrentMuted = mutedChannels.has(currentChannelId);

  // Build user cache from messages
  const buildUserCache = useCallback((msgs: SlackMessage[]) => {
    const userIds = new Set<string>();
    msgs.forEach(msg => {
      if (msg.user) userIds.add(msg.user);
      if (msg.replyUsers) {
        msg.replyUsers.forEach(u => userIds.add(u));
      }
    });

    const newCache: UserCache = {};
    userIds.forEach(id => {
      if (!userNames[id]) {
        // For now, we'll use a placeholder that will be resolved on refresh
        newCache[id] = id;
      }
    });

    if (Object.keys(newCache).length > 0) {
      setUserNames(prev => ({ ...prev, ...newCache }));
    }
  }, [userNames]);

  // Initial build of user cache
  if (Object.keys(userNames).length === 0 && messages.length > 0) {
    buildUserCache(messages);
  }

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setError(null);

    try {
      const response = await fetch(`/api/slack/messages?channelId=${encodeURIComponent(currentChannelId)}`);

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Failed to fetch messages (${response.status})`);
      }

      const data = await response.json();
      setMessages(data.messages || []);
      setLastUpdated(new Date());
      setNextRefreshIn(refreshIntervalMs / 1000);

      // Update user names if provided
      if (data.users) {
        setUserNames(prev => ({ ...prev, ...data.users }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh messages");
    } finally {
      setIsRefreshing(false);
    }
  }, [currentChannelId, refreshIntervalMs]);

  const handleChannelChange = useCallback(async (newChannelId: string) => {
    if (newChannelId === currentChannelId) return;
    
    setIsLoadingChannel(true);
    setError(null);
    setCurrentChannelId(newChannelId);
    
    try {
      const response = await fetch(`/api/slack/messages?channelId=${encodeURIComponent(newChannelId)}`);
      
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Failed to fetch messages (${response.status})`);
      }
      
      const data = await response.json();
      setMessages(data.messages || []);
      setLastUpdated(new Date());
      setNextRefreshIn(refreshIntervalMs / 1000);
      setActiveThread(null);
      setThreadMessages([]);
      
      // Update user names if provided
      if (data.users) {
        setUserNames(prev => ({ ...prev, ...data.users }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch messages");
    } finally {
      setIsLoadingChannel(false);
    }
  }, [currentChannelId, refreshIntervalMs]);

  const handleTestNotification = useCallback(async () => {
    setIsSendingTest(true);
    setTestResult(null);

    try {
      const response = await fetch("/api/slack/test", { method: "POST" });
      const data = await response.json();

      if (response.ok && data.success) {
        setTestResult({ success: true, message: t("slack.testSuccess") });
      } else {
        setTestResult({ success: false, message: data.error || t("slack.testFailed") });
      }
    } catch {
      setTestResult({ success: false, message: t("slack.testNetworkError") });
    } finally {
      setIsSendingTest(false);
      // Clear result after 5 seconds
      setTimeout(() => setTestResult(null), 5000);
    }
  }, [t]);

  // Auto-refresh setup. Skip entirely when the channel is muted so we
  // do not hammer Slack for a feed the user explicitly turned off.
  useEffect(() => {
    if (isAutoRefreshEnabled && refreshIntervalMs > 0 && !mutedChannels.has(currentChannelId)) {
      // Countdown timer
      countdownRef.current = setInterval(() => {
        setNextRefreshIn(prev => Math.max(0, prev - 1));
      }, 1000);

      // Auto-refresh timer
      autoRefreshRef.current = setInterval(() => {
        handleRefresh();
      }, refreshIntervalMs);

      return () => {
        if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
        if (countdownRef.current) clearInterval(countdownRef.current);
      };
    }
  }, [isAutoRefreshEnabled, refreshIntervalMs, handleRefresh, mutedChannels, currentChannelId]);

  const handleThreadClick = useCallback(async (threadTs: string) => {
    if (activeThread === threadTs) {
      setActiveThread(null);
      setThreadMessages([]);
      return;
    }

    setActiveThread(threadTs);
    setIsLoadingThread(true);

    try {
      const response = await fetch(
        `/api/slack/thread?channelId=${encodeURIComponent(currentChannelId)}&threadTs=${encodeURIComponent(threadTs)}`
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Failed to fetch thread (${response.status})`);
      }

      const data = await response.json();
      setThreadMessages(data.messages || []);

      // Update user names if provided
      if (data.users) {
        setUserNames(prev => ({ ...prev, ...data.users }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load thread");
      setActiveThread(null);
    } finally {
      setIsLoadingThread(false);
    }
  }, [currentChannelId, activeThread]);

  // Separate thread parent messages from regular messages, then apply the
  // keyword filter across text + cached display name.
  const keywordQ = keywordFilter.trim().toLowerCase();
  const mainMessages = messages
    .filter(m => !m.threadTs || m.threadTs === m.ts)
    .filter((m) => {
      if (!keywordQ) return true;
      const author = (m.user ? userNames[m.user] ?? m.user : "").toLowerCase();
      return m.text.toLowerCase().includes(keywordQ) || author.includes(keywordQ);
    });
  const mainMessagesByDate = mainMessages.reduce((acc, msg) => {
    const date = new Date(parseFloat(msg.ts) * 1000).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(msg);
    return acc;
  }, {} as Record<string, SlackMessage[]>);

  return (
    <>
      {/* Header with refresh controls */}
      <header className="card hero">
        <div className="hero-top">
          <div>
            <p className="kicker">Slack</p>
            <h1>Slack Messages</h1>
            <p className="muted">
              {channelCount > 0 
                ? `${channelCount} channel${channelCount !== 1 ? "s" : ""} monitored` 
                : "Configuration Required"}
            </p>
          </div>
          <div className="hero-actions">
            <button
              className={`refresh-button ${isRefreshing ? "loading" : ""}`}
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              {isRefreshing ? t("slack.refreshing") : t("slack.refresh")}
            </button>
            
            <button
              type="button"
              className={`auto-refresh-toggle ${isAutoRefreshEnabled ? "active" : ""}`}
              onClick={() => setIsAutoRefreshEnabled(!isAutoRefreshEnabled)}
              title={isAutoRefreshEnabled ? t("slack.autoRefreshTitleOn") : t("slack.autoRefreshTitleOff")}
            >
              <span className="toggle-indicator" />
              {isAutoRefreshEnabled ? t("slack.autoRefreshOn") : t("slack.autoRefreshOff")}
            </button>

            {isAutoRefreshEnabled && (
              <span className="refresh-timer" title={`Last: ${isClient ? lastUpdated.toLocaleTimeString() : '--'}`}>
                ↻ {nextRefreshIn}s
              </span>
            )}

            <button
              className="secondary-button"
              onClick={handleTestNotification}
              disabled={isSendingTest}
            >
              {isSendingTest ? t("slack.sending") : t("slack.testNotification")}
            </button>

            {testResult && (
              <span className={`test-result ${testResult.success ? "success" : "error"}`}>
                {testResult.message}
              </span>
            )}


          </div>
        </div>
      </header>

      <style jsx>{`
        .slack-actions {
          display: flex;
          gap: 0.75rem;
          align-items: center;
          margin-bottom: 1rem;
          flex-wrap: wrap;
        }

        .auto-refresh-toggle {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.45rem 0.85rem;
          border: 1px solid var(--border, #e0e0e0);
          border-radius: 6px;
          background: transparent;
          color: var(--text, #222);
          font-size: 0.8rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .auto-refresh-toggle:hover {
          background: rgba(102, 126, 234, 0.1);
        }

        .auto-refresh-toggle.active {
          background: #f0f9ff;
          border-color: #0d6efd;
          color: #0d6efd;
        }

        .toggle-indicator {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--border, #e0e0e0);
        }

        .auto-refresh-toggle.active .toggle-indicator {
          background: #0d6efd;
          box-shadow: 0 0 6px #0d6efd;
        }

        .refresh-timer {
          font-size: 0.75rem;
          color: var(--muted, #888);
          font-family: monospace;
          min-width: 45px;
        }

        .secondary-button {
          padding: 0.45rem 0.85rem;
          border: 1px solid var(--border, #e0e0e0);
          border-radius: 6px;
          background: transparent;
          color: var(--text, #222);
          cursor: pointer;
          font-size: 0.8rem;
          transition: all 0.15s;
        }

        .secondary-button:hover:not(:disabled) {
          background: #f5f5f5;
        }

        .secondary-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .test-result {
          font-size: 0.75rem;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
        }

        .test-result.success {
          background: #d1fae5;
          color: #065f46;
        }

        .test-result.error {
          background: #fee2e2;
          color: #991b1b;
        }

        .refresh-button {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.45rem 1rem;
          border: 1px solid var(--accent, #e63946);
          border-radius: 6px;
          background: transparent;
          color: var(--accent, #e63946);
          cursor: pointer;
          font-size: 0.85rem;
          font-weight: 500;
          transition: all 0.15s ease;
        }

        .refresh-button:hover:not(:disabled) {
          background: var(--accent, #e63946);
          color: white;
        }

        .refresh-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .refresh-button.loading {
          background: var(--accent, #e63946);
          color: white;
        }

        .refresh-button.loading svg {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .slack-message-list {
          display: flex;
          flex-direction: column;
          gap: 0;
        }

        .date-separator {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin: 1.5rem 0 1rem;
          padding: 0.5rem 0;
        }

        .date-separator::before,
        .date-separator::after {
          content: "";
          flex: 1;
          height: 1px;
          background: var(--border-color, #e5e7eb);
        }

        .date-separator span {
          font-size: 0.75rem;
          font-weight: 500;
          color: var(--text-muted, #6b7280);
          background: var(--bg-secondary, #f3f4f6);
          padding: 0.25rem 0.75rem;
          border-radius: 1rem;
        }

        .slack-message {
          padding: 0.125rem 0;
          border-radius: 0.375rem;
          transition: background 0.1s;
        }

        .slack-message:hover {
          background: var(--bg-hover, rgba(0,0,0,0.02));
        }

        .slack-message.thread-reply {
          margin-left: 3.5rem;
        }

        .message-layout {
          display: flex;
          gap: 1rem;
          padding: 0.25rem 0;
        }

        .avatar {
          width: 2.5rem;
          min-width: 2.5rem;
          height: 2.25rem;
          border-radius: 0.375rem;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          font-size: 0.875rem;
        }

        .avatar .bot-badge {
          font-size: 1rem;
        }

        .message-content {
          flex: 1;
          min-width: 0;
        }

        .message-header {
          display: flex;
          align-items: baseline;
          gap: 0.5rem;
          margin-bottom: 0.125rem;
        }

        .message-header > * {
          flex-shrink: 0;
        }

        .message-header .message-content-text {
          flex-shrink: 0;
        }

        .message-author {
          font-weight: 700;
          font-size: 0.9375rem;
          color: var(--text-primary, #111827);
          margin-right: 0.25rem;
        }

        .bot-label {
          font-size: 0.6875rem;
          font-weight: 500;
          background: var(--bg-secondary, #e5e7eb);
          color: var(--text-muted, #6b7280);
          padding: 0.0625rem 0.375rem;
          border-radius: 0.25rem;
          margin-left: 0.25rem;
        }

        .message-time {
          font-size: 0.75rem;
          color: var(--text-muted, #6b7280);
          margin-left: 0.5rem;
        }

        .message-body {
          margin: 0;
        }

        .message-text {
          font-size: 0.9375rem;
          line-height: 1.5;
          color: var(--text-primary, #111827);
          white-space: pre-wrap;
          word-break: break-word;
        }

        .system-message-row {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          padding: 0.5rem 0;
          color: var(--text-muted, #6b7280);
        }

        .system-text {
          font-size: 0.8125rem;
          font-style: italic;
        }

        .system-time {
          font-size: 0.6875rem;
          color: var(--text-muted, #9ca3af);
        }

        .compact-message {
          display: flex;
          align-items: baseline;
          gap: 0.75rem;
          padding: 0.125rem 0;
          margin-left: 3.5rem;
        }

        .compact-time {
          font-size: 0.6875rem;
          color: var(--text-muted, #9ca3af);
          min-width: 3rem;
        }

        .compact-reactions {
          margin-left: 0;
        }

        .compact-message .message-body {
          flex: 1;
        }

        .message-attachments {
          margin-top: 0.5rem;
        }

        .attachment-card {
          background: var(--bg-secondary, #f3f4f6);
          border-radius: 0.5rem;
          padding: 0.5rem 0.75rem;
          margin-top: 0.25rem;
        }

        .attachment-title {
          font-weight: 500;
          font-size: 0.875rem;
          color: var(--color-primary, #2563eb);
          text-decoration: none;
          display: block;
        }

        .attachment-title:hover {
          text-decoration: underline;
        }

        .attachment-text {
          margin: 0.25rem 0 0;
          font-size: 0.8125rem;
          color: var(--text-secondary, #4b5563);
        }

        .message-reactions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.375rem;
          margin-top: 0.375rem;
        }

        .reaction {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.125rem 0.5rem;
          background: var(--bg-secondary, #f3f4f6);
          border: 1px solid var(--border-color, #e5e7eb);
          border-radius: 1rem;
          font-size: 0.75rem;
          font-weight: 500;
          cursor: default;
          transition: background 0.1s;
        }

        .reaction:hover {
          background: var(--bg-hover, #e5e7eb);
        }

        .thread-info {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          margin-top: 0.375rem;
          padding: 0.125rem 0.5rem;
          background: transparent;
          border: none;
          border-radius: 0.25rem;
          font-size: 0.75rem;
          font-weight: 500;
          color: var(--color-primary, #2563eb);
          cursor: pointer;
          transition: background 0.1s;
        }

        .thread-info:hover {
          background: var(--bg-secondary, #f3f4f6);
        }

        .thread-messages {
          margin-left: 3.5rem;
          margin-top: 0.25rem;
          padding-left: 0.75rem;
          border-left: 2px solid var(--border-color, #e5e7eb);
        }

        .loading-indicator {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 2rem;
          color: var(--text-muted, #6b7280);
        }

        .error-message {
          padding: 1rem;
          background: var(--error-bg, #fef2f2);
          border: 1px solid var(--error-border, #fecaca);
          border-radius: 0.5rem;
          color: var(--error-text, #dc2626);
          font-size: 0.875rem;
        }

        .empty-state {
          text-align: center;
          padding: 3rem 1rem;
          color: var(--text-muted, #6b7280);
        }

        .empty-state p {
          margin: 0;
        }

        .auto-refresh-toggle {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 0.75rem;
          background: transparent;
          border: 1px solid var(--border-color, #e5e7eb);
          border-radius: 0.375rem;
          font-size: 0.75rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .auto-refresh-toggle:hover {
          background: var(--bg-secondary, #f3f4f6);
        }

        .auto-refresh-toggle.active {
          background: var(--color-primary, #2563eb);
          color: white;
          border-color: var(--color-primary, #2563eb);
        }

        .toggle-indicator {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--text-muted, #6b7280);
        }

        .auto-refresh-toggle.active .toggle-indicator {
          background: #4ade80;
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        .test-button {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 0.75rem;
          background: transparent;
          border: 1px solid var(--border-color, #e5e7eb);
          border-radius: 0.375rem;
          font-size: 0.75rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .test-button:hover:not(:disabled) {
          background: var(--bg-secondary, #f3f4f6);
        }

        .test-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .test-result {
          padding: 0.5rem 0.75rem;
          border-radius: 0.375rem;
          font-size: 0.75rem;
          font-weight: 500;
        }

        .test-result.success {
          background: #dcfce7;
          color: #166534;
        }

        .test-result.error {
          background: #fef2f2;
          color: #991b1b;
        }

        .refresh-info {
          display: flex;
          flex-direction: column;
          gap: 0.125rem;
          font-size: 0.6875rem;
          color: var(--text-muted, #9ca3af);
          margin-left: auto;
        }

        .countdown {
          font-variant-numeric: tabular-nums;
        }

        .channel-selector {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-right: auto;
        }

        .channel-selector label {
          font-size: 0.75rem;
          color: var(--text-muted, #6b7280);
          font-weight: 500;
        }

        .channel-select {
          padding: 0.375rem 2rem 0.375rem 0.75rem;
          border: 1px solid var(--border-color, #e5e7eb);
          border-radius: 0.375rem;
          background: white;
          font-size: 0.875rem;
          font-weight: 500;
          color: var(--text-primary, #111827);
          cursor: pointer;
          appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b7280' d='M3 4.5L6 7.5L9 4.5'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 0.5rem center;
          min-width: 120px;
        }

        .channel-select:hover {
          border-color: var(--color-primary, #2563eb);
        }

        .channel-select:focus {
          outline: none;
          border-color: var(--color-primary, #2563eb);
          box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.2);
        }

        .channel-select:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .slack-mute-btn {
          background: transparent;
          border: 1px solid var(--border-color, #e5e7eb);
          border-radius: 999px;
          padding: 0.25rem 0.65rem;
          font-size: 0.75rem;
          cursor: pointer;
          color: var(--text-primary, #111827);
        }

        .slack-mute-btn[aria-pressed="true"] {
          background: var(--warn-soft, #fef3c7);
          border-color: var(--warn, #d97706);
          color: var(--warn-strong, #b45309);
        }

        .slack-search {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
        }

        .slack-keyword-input {
          padding: 0.3rem 0.55rem;
          border: 1px solid var(--border-color, #e5e7eb);
          border-radius: 0.375rem;
          font-size: 0.85rem;
          min-width: 200px;
        }

        .slack-clear-search {
          background: transparent;
          border: 0;
          color: var(--text-muted, #6b7280);
          cursor: pointer;
          font-size: 0.85rem;
          line-height: 1;
        }

        .slack-muted-banner {
          background: var(--warn-soft, #fef3c7);
          border: 1px solid var(--warn, #d97706);
          color: var(--warn-strong, #b45309);
          padding: 0.5rem 0.75rem;
          border-radius: 0.375rem;
          font-size: 0.85rem;
          margin: 0.5rem 0;
        }

        .slack-filter-summary {
          margin: 0.25rem 0 0.5rem;
          font-size: 0.78rem;
        }
      `}</style>

      <section className="card">
        <div className="slack-actions">
          <div className="channel-selector">
            <label htmlFor="channel-select">Channel:</label>
            <select
              id="channel-select"
              className="channel-select"
              value={currentChannelId}
              onChange={(e) => handleChannelChange(e.target.value)}
              disabled={isLoadingChannel}
            >
              {channels.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  {mutedChannels.has(channel.id) ? "🔕 " : ""}#{channel.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="slack-mute-btn"
              onClick={() => toggleMute(currentChannelId)}
              aria-pressed={isCurrentMuted}
              title={isCurrentMuted ? "Unmute this channel" : "Mute this channel"}
            >
              {isCurrentMuted ? "🔕 Unmute" : "🔔 Mute"}
            </button>
          </div>

          <div className="slack-search">
            <label htmlFor="slack-keyword" className="muted">Search:</label>
            <input
              id="slack-keyword"
              type="text"
              value={keywordFilter}
              onChange={(e) => setKeywordFilter(e.target.value)}
              placeholder="text or user…"
              className="slack-keyword-input"
            />
            {keywordFilter && (
              <button
                type="button"
                className="slack-clear-search"
                onClick={() => setKeywordFilter("")}
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          <div className="refresh-info">
            <span suppressHydrationWarning>
              {isClient ? `Last: ${lastUpdated.toLocaleTimeString("en-US", { hour12: false })}` : "Last: --:--:--"}
            </span>
          </div>
        </div>

        {error && (
          <div className="error-message">{error}</div>
        )}

        {isLoadingThread && (
          <div className="loading-indicator" role="status" aria-busy="true" aria-live="polite">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" strokeDasharray="50" strokeDashoffset="25">
                <animateTransform attributeName="transform" type="rotate" from="0 10 10" to="360 10 10" dur="1s" repeatCount="indefinite"/>
              </circle>
            </svg>
            {t("slack.loadingThread")}
          </div>
        )}

        {isCurrentMuted && (
          <div className="slack-muted-banner" role="status">
            🔕 This channel is muted. Messages still render but auto-refresh stays paused.{" "}
            <button type="button" className="link-button" onClick={() => toggleMute(currentChannelId)}>
              Unmute
            </button>
          </div>
        )}

        {keywordFilter && (
          <p className="muted slack-filter-summary">
            Showing {mainMessages.length} matches for &quot;{keywordFilter}&quot;.
          </p>
        )}

        {mainMessages.length === 0 ? (
          <div className="empty-state">
            <p>{t("slack.noMessages", { channel: currentChannel?.name || t("slack.unknown") })}</p>
          </div>
        ) : (
          <div className="slack-message-list">
            {Object.entries(mainMessagesByDate).map(([date, msgs]) => (
              <div key={date}>
                <div className="date-separator">
                  <span>{date}</span>
                </div>
                {msgs.map((message) => (
                  <div key={message.ts}>
                    <MessageItem
                      message={message}
                      userNames={userNames}
                      onThreadClick={handleThreadClick}
                      showAvatar={true}
                    />
                    {activeThread === message.ts && threadMessages.length > 0 && (
                      <div className="thread-messages">
                        {threadMessages
                          .filter(m => m.ts !== message.ts)
                          .map((reply) => (
                            <MessageItem
                              key={reply.ts}
                              message={reply}
                              userNames={userNames}
                              onThreadClick={handleThreadClick}
                              showAvatar={false}
                            />
                          ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
