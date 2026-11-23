/**
 * AIChatbot — In-App AI Assistant
 * Rate limited to 10 messages per session. Graceful degradation on LLM failure.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { MessageCircle, X, Send, Loader2, Bot, User, AlertCircle } from "lucide-react";
import { askAssistant, type ChatMessage } from "../lib/aiService";

const MAX_MESSAGES_PER_SESSION = 10;

interface DisplayMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export function AIChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [messageCount, setMessageCount] = useState(0);
  // Only flip to false after a real send failure — never pre-check
  const [llmAvailable, setLlmAvailable] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 100);
  }, [isOpen]);

  // Core send — accepts an explicit text so quick-prompts bypass stale state
  const sendText = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isTyping || messageCount >= MAX_MESSAGES_PER_SESSION) return;

    const userMsg: DisplayMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: trimmed,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);
    setMessageCount((c) => c + 1);

    const history: ChatMessage[] = [
      ...messages.map((m) => ({ role: m.role, content: m.content }) as ChatMessage),
      { role: "user" as const, content: trimmed },
    ];

    const response = await askAssistant(history);

    if (response) {
      setLlmAvailable(true);
      setMessages((prev) => [
        ...prev,
        { id: `assistant-${Date.now()}`, role: "assistant", content: response },
      ]);
    } else {
      // Don't block the whole input — show inline error bubble instead
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-error-${Date.now()}`,
          role: "assistant",
          content: "I'm having trouble connecting right now. Please try again in a moment.",
        },
      ]);
      setLlmAvailable(false);
    }

    setIsTyping(false);
  }, [isTyping, messageCount, messages]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendText(input); }
  };

  const rateLimitReached = messageCount >= MAX_MESSAGES_PER_SESSION;

  return (
    <>
      {/* Floating Trigger */}
      {!isOpen && (
        <button
          id="ai-chatbot-trigger"
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-900/30 flex items-center justify-center hover:scale-105 hover:shadow-xl active:scale-95 transition-all duration-200 group"
          aria-label="Open AI Assistant"
        >
          <MessageCircle className="w-6 h-6 group-hover:scale-110 transition-transform" />
          <span className="absolute top-0 right-0 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-background" />
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div
          className="fixed bottom-6 right-6 z-50 w-[380px] max-w-[calc(100vw-2rem)] h-[520px] max-h-[calc(100vh-6rem)] rounded-2xl overflow-hidden flex flex-col shadow-2xl shadow-black/40 border border-border"
          style={{ background: "var(--card)" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-gradient-to-r from-purple-600/10 to-indigo-600/10 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">AI Assistant</h3>
                <p className="text-[11px] text-muted-foreground">
                  {llmAvailable ? "Ready" : "Connection issue"}
                  {!rateLimitReached && (
                    <span className="ml-1 opacity-60">({MAX_MESSAGES_PER_SESSION - messageCount} left)</span>
                  )}
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Close chat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">
            {messages.length === 0 && (
              <div className="text-center py-8">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500/20 to-indigo-500/20 border border-purple-500/20 flex items-center justify-center mx-auto mb-4">
                  <Bot className="w-7 h-7 text-purple-400" />
                </div>
                <h4 className="text-sm font-semibold text-foreground mb-1.5">Welcome to Zero Food Waste AI</h4>
                <p className="text-xs text-muted-foreground leading-relaxed max-w-[250px] mx-auto">
                  Ask me anything about donating food, claiming deliveries, KYC verification, or how the platform works.
                </p>
                <div className="flex flex-col gap-1.5 mt-5">
                  {["How do I donate food?", "How does KYC work?", "What is the QR code for?"].map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => sendText(prompt)}
                      className="px-3 py-2 text-xs rounded-lg border border-border bg-muted/30 text-muted-foreground hover:text-foreground hover:border-purple-500/30 hover:bg-purple-500/5 transition-colors text-left"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.id} className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "assistant" && (
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500/20 to-indigo-500/20 border border-purple-500/20 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="w-3.5 h-3.5 text-purple-400" />
                  </div>
                )}
                <div className={`max-w-[75%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-md"
                    : "bg-muted text-foreground rounded-bl-md"
                }`}>
                  {msg.content}
                </div>
                {msg.role === "user" && (
                  <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                    <User className="w-3.5 h-3.5 text-primary" />
                  </div>
                )}
              </div>
            ))}

            {isTyping && (
              <div className="flex gap-2.5">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500/20 to-indigo-500/20 border border-purple-500/20 flex items-center justify-center shrink-0">
                  <Bot className="w-3.5 h-3.5 text-purple-400" />
                </div>
                <div className="bg-muted px-4 py-3 rounded-2xl rounded-bl-md flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="px-3 pb-3 pt-2 border-t border-border shrink-0">
            {rateLimitReached ? (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-500">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                Chat limit reached for this session. Refresh to start a new one.
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-muted/40 rounded-xl px-3 py-1 border border-border focus-within:border-purple-500/40 transition-colors">
                <input
                  ref={inputRef}
                  value={input}
                  maxLength={2000}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask me anything..."
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground py-2.5 outline-none"
                  disabled={isTyping}
                />
                <button
                  onClick={() => sendText(input)}
                  disabled={!input.trim() || isTyping}
                  className="p-2 rounded-lg text-muted-foreground hover:text-purple-400 hover:bg-purple-500/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                  aria-label="Send message"
                >
                  {isTyping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
