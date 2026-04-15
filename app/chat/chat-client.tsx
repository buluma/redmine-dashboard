"use client";

import { useState, useRef, useEffect } from "react";

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: Date;
};

export function ChatInterface() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Hello! I'm your AI assistant. I can help you with:\n\n• Searching and analyzing Redmine issues\n• Answering questions about your project logs\n• Finding information in system traces\n• Summarizing error patterns\n\nHow can I help you today?",
      createdAt: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      createdAt: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage].map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!response.ok) throw new Error("Failed to get response");

      const data = await response.json();
      
      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.message?.content || "I couldn't get a response. Please try again.",
        createdAt: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "Sorry, I encountered an error. Please try again.",
        createdAt: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content: "Hello! I'm your AI assistant. I can help you with:\n\n• Searching and analyzing Redmine issues\n• Answering questions about your project logs\n• Finding information in system traces\n• Summarizing error patterns\n\nHow can I help you today?",
        createdAt: new Date(),
      },
    ]);
  };

  return (
    <div className="chat-container">
      <div className="chat-messages">
        {messages.map((msg) => (
          <div key={msg.id} className={`chat-message ${msg.role}`}>
            <div className="message-avatar">
              {msg.role === "user" ? "👤" : msg.role === "assistant" ? "🤖" : "⚙️"}
            </div>
            <div className="message-content">
              <div className="message-header">
                <span className="message-role">
                  {msg.role === "user" ? "You" : msg.role === "assistant" ? "AI" : "System"}
                </span>
                <span className="message-time">
                  {msg.createdAt.toLocaleTimeString()}
                </span>
              </div>
              <div className="message-body">
                {msg.content.split("\n").map((line, i) => (
                  <p key={i}>{line || <br />}</p>
                ))}
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="chat-message assistant">
            <div className="message-avatar">🤖</div>
            <div className="message-content">
              <div className="message-header">
                <span className="message-role">AI</span>
                <span className="message-time">typing...</span>
              </div>
              <div className="message-body loading">
                <span className="typing-indicator">
                  <span></span><span></span><span></span>
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
          placeholder="Type your message..."
          disabled={isLoading}
        />
        <button type="submit" disabled={isLoading || !input.trim()}>
          {isLoading ? "..." : "Send"}
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