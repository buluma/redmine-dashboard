"use client";

import { useCallback, useState } from "react";
import type { SlackMessage } from "@/src/lib/slack";

interface SlackMessagesClientProps {
  initialMessages: SlackMessage[];
  channelId: string;
  channelName: string;
}

interface UserCache {
  [userId: string]: string;
}

function formatTimestamp(ts: string): string {
  const date = new Date(parseFloat(ts) * 1000);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
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
  channelId,
  onThreadClick 
}: { 
  message: SlackMessage;
  userNames: UserCache;
  channelId: string;
  onThreadClick: (threadTs: string) => void;
}) {
  const isThreadReply = !!message.threadTs && message.threadTs !== message.ts;
  const userName = message.user ? (userNames[message.user] || message.user) : "Unknown";
  const isBot = !!message.botId;

  return (
    <article className={`slack-message ${isThreadReply ? "thread-reply" : ""}`}>
      <div className="message-header">
        <span className="message-author">
          {isBot ? "🤖 Bot" : userName}
        </span>
        <span className="message-time">{formatTimestamp(message.ts)}</span>
      </div>
      
      <div className="message-body">
        {message.subtype === "channel_join" && (
          <p className="system-message">joined the channel</p>
        )}
        {message.subtype === "channel_leave" && (
          <p className="system-message">left the channel</p>
        )}
        {message.subtype === "pinned_item" && (
          <p className="system-message">pinned an item</p>
        )}
        {message.subtype === "file_comment" && (
          <p className="system-message">commented on a file</p>
        )}
        {(message.subtype === undefined || !["channel_join", "channel_leave", "pinned_item", "file_comment"].includes(message.subtype)) && (
          <p className="message-text">{message.text}</p>
        )}
      </div>

      {message.attachments && message.attachments.length > 0 && (
        <div className="message-attachments">
          {message.attachments.map((att, idx) => (
            <div key={idx} className="attachment">
              {att.title && (
                <a href={att.title_link || "#"} target="_blank" rel="noopener noreferrer" className="attachment-title">
                  {att.title}
                </a>
              )}
              {att.text && <p className="attachment-text">{att.text}</p>}
            </div>
          ))}
        </div>
      )}

      {message.reactions && message.reactions.length > 0 && (
        <div className="message-reactions">
          {message.reactions.map((reaction, idx) => (
            <span key={idx} className="reaction" title={`${reaction.count} ${reaction.count === 1 ? "person" : "people"}`}>
              {formatReactionEmoji(reaction.name)} {reaction.count}
            </span>
          ))}
        </div>
      )}

      {message.replyCount && message.replyCount > 0 && (
        <button 
          className="thread-info"
          onClick={() => onThreadClick(message.ts)}
        >
          💬 {message.replyCount} {message.replyCount === 1 ? "reply" : "replies"}
          {message.replyUsers && message.replyUsers.length > 0 && 
            ` · Last reply from ${message.replyUsers.slice(0, 2).map(u => userNames[u] || u).join(", ")}`
          }
        </button>
      )}
    </article>
  );
}

export function SlackMessagesClient({ 
  initialMessages, 
  channelId,
  channelName 
}: SlackMessagesClientProps) {
  const [messages, setMessages] = useState<SlackMessage[]>(initialMessages);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userNames, setUserNames] = useState<UserCache>({});
  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<SlackMessage[]>([]);
  const [isLoadingThread, setIsLoadingThread] = useState(false);

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
      const response = await fetch(`/api/slack/messages?channelId=${encodeURIComponent(channelId)}`);
      
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Failed to fetch messages (${response.status})`);
      }

      const data = await response.json();
      setMessages(data.messages || []);
      
      // Update user names if provided
      if (data.users) {
        setUserNames(prev => ({ ...prev, ...data.users }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh messages");
    } finally {
      setIsRefreshing(false);
    }
  }, [channelId]);

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
        `/api/slack/thread?channelId=${encodeURIComponent(channelId)}&threadTs=${encodeURIComponent(threadTs)}`
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
  }, [channelId, activeThread]);

  // Group messages by date
  const messagesByDate = messages.reduce((acc, msg) => {
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

  // Separate thread parent messages from regular messages
  const mainMessages = messages.filter(m => !m.threadTs || m.threadTs === m.ts);
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
      <style jsx>{`
        .slack-actions {
          display: flex;
          gap: 0.75rem;
          align-items: center;
          margin-bottom: 1rem;
        }

        .refresh-button {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 1rem;
          background: var(--color-primary, #2563eb);
          color: white;
          border: none;
          border-radius: 0.375rem;
          font-size: 0.875rem;
          font-weight: 500;
          cursor: pointer;
          transition: opacity 0.2s;
        }

        .refresh-button:hover {
          opacity: 0.9;
        }

        .refresh-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
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
          gap: 0.5rem;
        }

        .date-separator {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin: 1.5rem 0 1rem;
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
          font-weight: 600;
          color: var(--text-muted, #6b7280);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .slack-message {
          padding: 0.75rem;
          background: var(--card-bg, white);
          border-radius: 0.5rem;
          border: 1px solid var(--border-color, #e5e7eb);
        }

        .slack-message.thread-reply {
          margin-left: 2rem;
          border-left: 2px solid var(--color-primary, #2563eb);
        }

        .message-header {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 0.25rem;
        }

        .message-author {
          font-weight: 600;
          font-size: 0.875rem;
          color: var(--text-primary, #111827);
        }

        .message-time {
          font-size: 0.75rem;
          color: var(--text-muted, #6b7280);
        }

        .message-body {
          margin-left: 0;
        }

        .message-text {
          margin: 0;
          font-size: 0.9375rem;
          line-height: 1.5;
          color: var(--text-primary, #111827);
          white-space: pre-wrap;
          word-break: break-word;
        }

        .system-message {
          margin: 0;
          font-size: 0.875rem;
          font-style: italic;
          color: var(--text-muted, #6b7280);
        }

        .message-attachments {
          margin-top: 0.5rem;
          padding-left: 0.5rem;
          border-left: 2px solid var(--border-color, #e5e7eb);
        }

        .attachment {
          margin-bottom: 0.5rem;
        }

        .attachment-title {
          font-weight: 500;
          color: var(--color-primary, #2563eb);
          text-decoration: none;
        }

        .attachment-title:hover {
          text-decoration: underline;
        }

        .attachment-text {
          margin: 0.25rem 0 0;
          font-size: 0.875rem;
          color: var(--text-secondary, #4b5563);
        }

        .message-reactions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          margin-top: 0.5rem;
        }

        .reaction {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.125rem 0.5rem;
          background: var(--bg-secondary, #f3f4f6);
          border-radius: 9999px;
          font-size: 0.75rem;
          font-weight: 500;
          cursor: default;
        }

        .thread-info {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          margin-top: 0.5rem;
          padding: 0.25rem 0.5rem;
          background: transparent;
          border: none;
          border-radius: 0.25rem;
          font-size: 0.75rem;
          color: var(--color-primary, #2563eb);
          cursor: pointer;
          transition: background 0.2s;
        }

        .thread-info:hover {
          background: var(--bg-secondary, #f3f4f6);
        }

        .thread-messages {
          margin-left: 2rem;
          margin-top: 0.5rem;
          padding-left: 0.75rem;
          border-left: 2px solid var(--color-primary, #2563eb);
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
      `}</style>

      <section className="card">
        <div className="slack-actions">
          <button 
            className={`refresh-button ${isRefreshing ? "loading" : ""}`}
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M2 8C2 4.68629 4.68629 2 8 2C10.2208 2 12.1599 3.20608 13.1973 5M14 8C14 11.3137 11.3137 14 8 14C5.77915 14 3.84008 12.7939 2.80273 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <path d="M13 2V6H9M3 14V10H7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </button>
          <span style={{ fontSize: "0.875rem", color: "var(--text-muted, #6b7280)" }}>
            Last updated: {new Date().toLocaleTimeString()}
          </span>
        </div>

        {error && (
          <div className="error-message">{error}</div>
        )}

        {isLoadingThread && (
          <div className="loading-indicator">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" strokeDasharray="50" strokeDashoffset="25">
                <animateTransform attributeName="transform" type="rotate" from="0 10 10" to="360 10 10" dur="1s" repeatCount="indefinite"/>
              </circle>
            </svg>
            Loading thread...
          </div>
        )}

        {mainMessages.length === 0 ? (
          <div className="empty-state">
            <p>No messages found in #{channelName}</p>
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
                      channelId={channelId}
                      onThreadClick={handleThreadClick}
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
                              channelId={channelId}
                              onThreadClick={handleThreadClick}
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
