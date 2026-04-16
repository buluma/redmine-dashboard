'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useI18n } from '@/src/components/I18nProvider';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PendingToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  summary: string;
};

type ExecutedTool = {
  name: string;
  success: boolean;
  error?: string | null;
};

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: Date;
  /** Pending tool calls awaiting user confirmation. */
  pendingToolCalls?: PendingToolCall[];
  /** Conversation context carried from the chat API for the execute-tools call. */
  conversationContext?: Array<{ role: string; content: string }>;
  /** Tools that were executed (shown as badges). */
  executedTools?: ExecutedTool[];
  /** Whether this message's tool calls have been resolved (confirmed or rejected). */
  toolsResolved?: boolean;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOOL_ICON_MAP: Record<string, string> = {
  update_status: '🔄',
  log_time: '⏱️',
  add_comment: '💬',
  close_issue: '✅',
  update_issue: '📝',
  get_issue: '🔍',
  search_issues: '🔎',
  list_statuses: '📋',
  list_activities: '📋',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChatInterface() {
  const { t } = useI18n();

  const welcomeContent = useMemo(() => {
    return (
      `${t("chat.welcomeTitle")}\n\n` +
      `• ${t("chat.welcomeItem1")}\n` +
      `• ${t("chat.welcomeItem2")}\n` +
      `• ${t("chat.welcomeItem3")}\n` +
      `• ${t("chat.welcomeItem4")}\n\n` +
      `${t("chat.welcomeActionsTitle")}\n` +
      `• ${t("chat.welcomeAction1")}\n` +
      `• ${t("chat.welcomeAction2")}\n` +
      `• ${t("chat.welcomeAction3")}\n` +
      `• ${t("chat.welcomeAction4")}\n\n` +
      `${t("chat.welcomeFooter")}`
    );
  }, [t]);

  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // Initialize welcome message once
  useEffect(() => {
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content: welcomeContent,
        createdAt: new Date(),
      },
    ]);
  }, [welcomeContent]);

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(scrollToBottom, [messages, scrollToBottom]);

  // -----------------------------------------------------------------------
  // Send a message
  // -----------------------------------------------------------------------
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      createdAt: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage].map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!response.ok) throw new Error('Failed to get response');

      const data = await response.json();

      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content:
          data.message?.content || t("chat.errorResponse"),
        createdAt: new Date(),
        pendingToolCalls: data.pendingToolCalls ?? undefined,
        conversationContext: data.conversationContext ?? undefined,
        executedTools: data.executedTools ?? undefined,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: t("chat.errorGeneral"),
        createdAt: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // -----------------------------------------------------------------------
  // Confirm tool calls
  // -----------------------------------------------------------------------
  const handleConfirmTools = async (messageId: string) => {
    const msg = messages.find((m) => m.id === messageId);
    if (!msg?.pendingToolCalls || !msg.conversationContext) return;

    setIsLoading(true);

    // Mark as resolved
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, toolsResolved: true } : m,
      ),
    );

    try {
      const response = await fetch('/api/chat/execute-tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toolCalls: msg.pendingToolCalls,
          conversationContext: msg.conversationContext,
        }),
      });

      if (!response.ok) throw new Error('Failed to execute tools');

      const data = await response.json();

      const resultMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.message?.content || t("chat.actionsCompleted"),
        createdAt: new Date(),
        executedTools: data.executedTools ?? undefined,
      };

      setMessages((prev) => [...prev, resultMessage]);
    } catch (error) {
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: t("chat.errorExecuting"),
        createdAt: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // -----------------------------------------------------------------------
  // Reject tool calls
  // -----------------------------------------------------------------------
  const handleRejectTools = (messageId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, toolsResolved: true } : m,
      ),
    );

    const cancelMessage: ChatMessage = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: t("chat.actionsCancelled"),
      createdAt: new Date(),
    };
    setMessages((prev) => [...prev, cancelMessage]);
  };

  // -----------------------------------------------------------------------
  // Clear chat
  // -----------------------------------------------------------------------
  const clearChat = () => {
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content: welcomeContent,
        createdAt: new Date(),
      },
    ]);
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <div className="chat-container">
      <div className="chat-messages">
        {messages.map((msg) => (
          <div key={msg.id} className={`chat-message ${msg.role}`}>
            <div className="message-avatar">
              {msg.role === 'user'
                ? '👤'
                : msg.role === 'assistant'
                  ? '🤖'
                  : '⚙️'}
            </div>
            <div className="message-content">
              <div className="message-header">
                <span className="message-role">
                  {msg.role === 'user'
                    ? t("chat.roleYou")
                    : msg.role === 'assistant'
                      ? t("chat.roleAi")
                      : t("chat.roleSystem")}
                </span>
                <span className="message-time">
                  {mounted ? msg.createdAt.toLocaleTimeString() : ''}
                </span>
              </div>
              <div className="message-body">
                {msg.content.split('\n').map((line, i) => (
                  <p key={i}>{line || <br />}</p>
                ))}
              </div>

              {/* Executed tools badges */}
              {msg.executedTools && msg.executedTools.length > 0 && (
                <div className="tool-badges">
                  {msg.executedTools.map((t, i) => (
                    <span
                      key={i}
                      className={`tool-badge ${t.success ? 'success' : 'error'}`}
                    >
                      {TOOL_ICON_MAP[t.name] ?? '🔧'}{' '}
                      {t.name.replace(/_/g, ' ')}
                      {t.success ? ' ✓' : ' ✗'}
                    </span>
                  ))}
                </div>
              )}

              {/* Pending tool calls — confirmation card */}
              {msg.pendingToolCalls &&
                msg.pendingToolCalls.length > 0 &&
                !msg.toolsResolved && (
                  <div className="tool-confirmation-card">
                    <div className="tool-card-header">
                      <span className="tool-card-icon">🛠️</span>
                      <span className="tool-card-title">
                        {t("chat.proposedActions")}
                      </span>
                    </div>
                    <div className="tool-card-list">
                      {msg.pendingToolCalls.map((tc) => (
                        <div key={tc.id} className="tool-card-item">
                          <span className="tool-item-icon">
                            {TOOL_ICON_MAP[tc.name] ?? '🔧'}
                          </span>
                          <span className="tool-item-summary">
                            {tc.summary}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="tool-card-actions">
                      <button
                        className="tool-btn confirm"
                        onClick={() => handleConfirmTools(msg.id)}
                        disabled={isLoading}
                      >
                        ✅ {t("chat.confirm")}
                      </button>
                      <button
                        className="tool-btn reject"
                        onClick={() => handleRejectTools(msg.id)}
                        disabled={isLoading}
                      >
                        ❌ {t("chat.reject")}
                      </button>
                    </div>
                  </div>
                )}

              {/* Resolved tool calls (greyed out) */}
              {msg.pendingToolCalls &&
                msg.pendingToolCalls.length > 0 &&
                msg.toolsResolved && (
                  <div className="tool-confirmation-card resolved">
                    <div className="tool-card-header">
                      <span className="tool-card-icon">🛠️</span>
                      <span className="tool-card-title">
                        {t("chat.actionsProcessed")}
                      </span>
                    </div>
                    <div className="tool-card-list">
                      {msg.pendingToolCalls.map((tc) => (
                        <div key={tc.id} className="tool-card-item">
                          <span className="tool-item-icon">
                            {TOOL_ICON_MAP[tc.name] ?? '🔧'}
                          </span>
                          <span className="tool-item-summary">
                            {tc.summary}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="chat-message assistant">
            <div className="message-avatar">🤖</div>
            <div className="message-content">
              <div className="message-header">
                <span className="message-role">{t("chat.roleAi")}</span>
                <span className="message-time">{t("chat.typing")}</span>
              </div>
              <div className="message-body loading">
                <span className="typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form className="chat-input" onSubmit={handleSubmit}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t("chat.placeholder")}
          disabled={isLoading}
        />
        <button type="submit" disabled={isLoading || !input.trim()}>
          {isLoading ? '...' : t("chat.send")}
        </button>
      </form>

      <style>{`
        .chat-container {
          display: flex;
          flex-direction: column;
          height: calc(100vh - 180px);
          min-height: 400px;
        }

        .chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 1rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .chat-message {
          display: flex;
          gap: 0.75rem;
          max-width: 85%;
        }

        .chat-message.user {
          align-self: flex-end;
          flex-direction: row-reverse;
        }

        .chat-message.assistant {
          align-self: flex-start;
        }

        .message-avatar {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.25rem;
          flex-shrink: 0;
        }

        .chat-message.user .message-avatar {
          background: var(--accent);
        }

        .chat-message.assistant .message-avatar {
          background: var(--surface-3);
        }

        .message-content {
          background: var(--surface-1);
          border-radius: 12px;
          padding: 0.75rem 1rem;
          border: 1px solid var(--border);
        }

        .chat-message.user .message-content {
          background: var(--accent-light);
          border-color: var(--accent);
        }

        .message-header {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          margin-bottom: 0.5rem;
          font-size: 0.75rem;
        }

        .message-role {
          font-weight: 600;
          color: var(--accent);
        }

        .message-time {
          color: var(--text-soft);
        }

        .message-body {
          line-height: 1.5;
        }

        .message-body p {
          margin: 0;
        }

        .message-body.loading {
          padding: 0.5rem 0;
        }

        .typing-indicator {
          display: flex;
          gap: 4px;
        }

        .typing-indicator span {
          width: 8px;
          height: 8px;
          background: var(--text-soft);
          border-radius: 50%;
          animation: bounce 1.4s infinite ease-in-out;
        }

        .typing-indicator span:nth-child(1) { animation-delay: 0s; }
        .typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
        .typing-indicator span:nth-child(3) { animation-delay: 0.4s; }

        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-6px); }
        }

        /* ---- Tool badges ---- */
        .tool-badges {
          display: flex;
          flex-wrap: wrap;
          gap: 0.375rem;
          margin-top: 0.625rem;
          padding-top: 0.5rem;
          border-top: 1px solid var(--border);
        }

        .tool-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.2rem 0.5rem;
          border-radius: 999px;
          font-size: 0.7rem;
          font-weight: 600;
          text-transform: capitalize;
        }

        .tool-badge.success {
          background: rgba(34, 197, 94, 0.15);
          color: #16a34a;
          border: 1px solid rgba(34, 197, 94, 0.3);
        }

        .tool-badge.error {
          background: rgba(239, 68, 68, 0.15);
          color: #dc2626;
          border: 1px solid rgba(239, 68, 68, 0.3);
        }

        /* ---- Tool confirmation card ---- */
        .tool-confirmation-card {
          margin-top: 0.75rem;
          background: var(--surface-2, #f8f9fb);
          border: 1px solid var(--accent, #6366f1);
          border-radius: 10px;
          padding: 0.75rem;
          animation: slideIn 0.25s ease-out;
        }

        .tool-confirmation-card.resolved {
          opacity: 0.55;
          border-color: var(--border);
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .tool-card-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.5rem;
          font-weight: 700;
          font-size: 0.8rem;
          color: var(--accent);
        }

        .tool-card-icon {
          font-size: 1rem;
        }

        .tool-card-list {
          display: flex;
          flex-direction: column;
          gap: 0.375rem;
        }

        .tool-card-item {
          display: flex;
          align-items: flex-start;
          gap: 0.5rem;
          padding: 0.375rem 0.5rem;
          background: var(--surface-1, #fff);
          border-radius: 6px;
          font-size: 0.8rem;
          line-height: 1.4;
          border: 1px solid var(--border);
        }

        .tool-item-icon {
          flex-shrink: 0;
          font-size: 0.9rem;
        }

        .tool-item-summary {
          color: var(--text);
        }

        .tool-card-actions {
          display: flex;
          gap: 0.5rem;
          margin-top: 0.625rem;
        }

        .tool-btn {
          flex: 1;
          padding: 0.5rem 0.75rem;
          border: none;
          border-radius: 6px;
          font-weight: 600;
          font-size: 0.8rem;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .tool-btn.confirm {
          background: rgba(34, 197, 94, 0.15);
          color: #16a34a;
          border: 1px solid rgba(34, 197, 94, 0.35);
        }

        .tool-btn.confirm:hover:not(:disabled) {
          background: rgba(34, 197, 94, 0.25);
        }

        .tool-btn.reject {
          background: rgba(239, 68, 68, 0.1);
          color: #dc2626;
          border: 1px solid rgba(239, 68, 68, 0.25);
        }

        .tool-btn.reject:hover:not(:disabled) {
          background: rgba(239, 68, 68, 0.2);
        }

        .tool-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        /* ---- Chat input ---- */
        .chat-input {
          display: flex;
          gap: 0.5rem;
          padding: 1rem;
          border-top: 1px solid var(--border);
          background: var(--surface-1);
        }

        .chat-input input {
          flex: 1;
          padding: 0.75rem 1rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          font-size: 1rem;
          background: var(--bg);
        }

        .chat-input input:focus {
          outline: none;
          border-color: var(--accent);
        }

        .chat-input button {
          padding: 0.75rem 1.5rem;
          background: var(--accent);
          color: white;
          border: none;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s;
        }

        .chat-input button:hover:not(:disabled) {
          background: var(--accent-strong);
        }

        .chat-input button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        @media (max-width: 768px) {
          .chat-message {
            max-width: 95%;
          }
        }
      `}</style>
    </div>
  );
}