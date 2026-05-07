import { useState, useRef, useEffect } from "react";
import { chat, openRawKnowledgePdf, submitFeedback } from "../api/client";
import { notifyApiError } from "../lib/notify";
import {
  MessageCircle, X, Send, ThumbsUp, ThumbsDown,
  FileText, ChevronDown, RotateCcw,
} from "lucide-react";
import { InlineSpinner } from "./ui/Skeleton";
import ReactMarkdown from "react-markdown";
import { BRAND } from "../lib/brand";
import StratumMark from "./brand/StratumMark";

const STARTERS = [
  "What are the account opening procedures?",
  "Explain KYC and AML due diligence steps",
  "What is the refund and chargeback process?",
];

/** Detect if viewport is mobile-width (<768px) */
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 768 : false
  );
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return isMobile;
}

export default function Chatbot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState({});
  const [showSources, setShowSources] = useState({});
  const [pdfOpening, setPdfOpening] = useState(null);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [messages, open]);

  // Prevent body scroll on mobile when chat is open
  useEffect(() => {
    if (isMobile && open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isMobile, open]);

  const history = () => messages.map((m) => ({ role: m.role, content: m.content }));

  const send = async (text) => {
    const q = (text || input).trim();
    if (!q || loading) return;
    setInput("");
    const userMsg = { role: "user", content: q, id: Date.now() };
    setMessages((p) => [...p, userMsg]);
    setLoading(true);
    try {
      const res = await chat(q, history());
      setMessages((p) => [
        ...p,
        { role: "assistant", content: res.answer, sources: res.sources || [],
          confidence: res.confidence, query: q, id: Date.now() + 1 },
      ]);
    } catch (err) {
      notifyApiError(err, "The assistant could not complete that request.");
      setMessages((p) => [
        ...p,
        { role: "assistant", content: "Sorry, something went wrong. Please try again.",
          sources: [], id: Date.now() + 1, error: true },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const [feedbackComment, setFeedbackComment] = useState({});

  const sendFeedback = async (msg, rating, comment = "") => {
    setFeedbackSent((p) => ({ ...p, [msg.id]: rating }));
    try {
      await submitFeedback(msg.query || "", msg.content, rating, comment, (msg.sources || []).map((s) => s.doc_id));
      if (comment) {
        setFeedbackComment((p) => ({ ...p, [msg.id]: "sent" }));
      }
    } catch (err) {
      console.error("Feedback failed", err);
    }
  };

  const handleCommentSubmit = (msgId, rating) => {
    const comment = feedbackComment[msgId];
    if (typeof comment === "string" && comment.trim()) {
      sendFeedback(messages.find(m => m.id === msgId), rating, comment);
    }
  };

  const clear = () => { setMessages([]); setFeedbackSent({}); setShowSources({}); };

  // ── Panel style: full-screen on mobile, floating on desktop ────
  const panelStyle = isMobile
    ? undefined // handled entirely by Tailwind classes below
    : { bottom: "4.8rem", right: "1.25rem", width: 368, height: 500 };

  const panelClassName = isMobile
    ? "fixed inset-0 z-50 flex flex-col bg-surface overflow-hidden"
    : "fixed z-40 flex flex-col bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden";

  return (
    <>
      {/* Toggle FAB — hidden on mobile when panel is open */}
      {(!isMobile || !open) && (
        <button
          onClick={() => setOpen(!open)}
          className={`fixed z-40 w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-lg
            ${isMobile ? "bottom-5 right-4" : "bottom-5 right-5"}
            ${open ? "bg-surface border border-border text-foreground" : "bg-primary text-white shadow-primary/30"}`}
          aria-label={open ? "Close assistant" : "Open assistant"}
        >
          {open ? <X size={17} /> : <MessageCircle size={18} />}
        </button>
      )}

      {/* Panel */}
      {open && (
        <div
          className={panelClassName}
          style={panelStyle}
        >
          {/* Header */}
          <div className={`flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0 bg-surface ${isMobile ? "h-14" : ""}`}>
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <StratumMark variant="minimal" size={22} decorative />
              </div>
              <div>
                <p className="text-xs font-semibold leading-tight font-display">{BRAND.assistantName}</p>
                <p className="text-[11px] text-secondary leading-tight">{BRAND.tagline}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button onClick={clear} title="Clear conversation"
                  className="p-1.5 text-secondary hover:text-foreground rounded-lg hover:bg-surface-hover transition-colors">
                  <RotateCcw size={12} />
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                aria-label="Close assistant"
                className="p-1.5 text-secondary hover:text-foreground rounded-lg hover:bg-surface-hover transition-colors"
              >
                <X size={isMobile ? 18 : 14} />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3.5 py-3 space-y-3">
            {messages.length === 0 && (
              <div className="flex flex-col h-full">
                <div className="flex-1 flex flex-col items-center justify-center text-center px-2 pb-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-3 text-primary">
                    <StratumMark variant="minimal" size={28} decorative />
                  </div>
                  <p className="text-sm font-semibold mb-1">Ask a question</p>
                  <p className="text-xs text-secondary leading-relaxed max-w-[220px]">
                    Answers use your indexed docs — verify citations.
                  </p>
                </div>
                {/* Starter chips */}
                <div className="space-y-1.5 pb-1">
                  {STARTERS.map((s) => (
                    <button key={s} onClick={() => send(s)}
                      className="w-full text-left px-3 py-2 rounded-xl border border-border bg-background text-xs text-secondary hover:text-foreground hover:border-primary/30 hover:bg-surface-hover transition-all">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className="max-w-[90%]">
                  <div className={`px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed
                    ${msg.role === "user"
                      ? "bg-primary text-white rounded-br-md"
                      : msg.error
                      ? "bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 rounded-bl-md"
                      : "bg-background border border-border rounded-bl-md"
                    }`}>
                    {msg.role === "user" ? (
                      <p>{msg.content}</p>
                    ) : (
                      <div
                        className={[
                          "max-w-none dark:prose-invert",
                          "prose prose-sm",
                          "prose-headings:font-semibold prose-headings:text-foreground prose-headings:tracking-tight",
                          "prose-h1:text-sm prose-h1:leading-snug prose-h1:mt-0 prose-h1:mb-2",
                          "prose-h2:text-xs prose-h2:leading-snug prose-h2:mt-3 prose-h2:mb-1.5 first:prose-h2:mt-0",
                          "prose-h3:text-xs prose-h3:leading-snug prose-h3:mt-2 prose-h3:mb-1",
                          "prose-p:text-xs prose-p:leading-relaxed prose-p:my-1.5 first:prose-p:mt-0 last:prose-p:mb-0",
                          "prose-strong:font-semibold prose-strong:text-foreground",
                          "prose-ul:text-xs prose-ol:text-xs prose-li:my-0.5",
                          "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
                        ].join(" ")}
                      >
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    )}
                  </div>

                  {msg.role === "assistant" && !msg.error && (
                    <div className="mt-1.5 px-1 space-y-1.5">
                      {msg.sources?.length > 0 && (
                        <>
                          <button
                            onClick={() => setShowSources((p) => ({ ...p, [msg.id]: !p[msg.id] }))}
                            className="flex items-center gap-1.5 text-[11px] text-secondary hover:text-primary transition-colors"
                          >
                            <FileText size={10} />
                            {msg.sources.length} source{msg.sources.length > 1 ? "s" : ""}
                            <ChevronDown size={10} className={`transition-transform ${showSources[msg.id] ? "rotate-180" : ""}`} />
                          </button>
                          {showSources[msg.id] && (
                            <div className="space-y-1">
                              {(() => {
                                const seen = new Set();
                                return msg.sources.filter((s) => {
                                  const label = String(
                                    s.metadata?.source_file || s.metadata?.file_name || s.doc_id || ""
                                  ).trim();
                                  if (!label || seen.has(label)) return false;
                                  seen.add(label);
                                  return true;
                                });
                              })().map((s, i) => {
                                const label = String(
                                  s.metadata?.source_file || s.metadata?.file_name || s.doc_id || ""
                                ).trim();
                                const canPdf =
                                  label.toLowerCase().endsWith(".pdf") && label.length > 0;
                                const openKey = `${msg.id}-${label}`;
                                return (
                                  <div key={`${label}-${i}`} className="rounded-lg border border-border overflow-hidden">
                                    {canPdf ? (
                                      <button
                                        type="button"
                                        disabled={pdfOpening === openKey}
                                        onClick={async () => {
                                          setPdfOpening(openKey);
                                          try {
                                            await openRawKnowledgePdf(label);
                                          } catch (pdfErr) {
                                            notifyApiError(pdfErr, "Could not open PDF.");
                                          } finally {
                                            setPdfOpening(null);
                                          }
                                        }}
                                        className="w-full text-left px-2.5 py-1.5 bg-background hover:bg-primary/5 transition-colors group disabled:opacity-60"
                                      >
                                        <p className="text-[11px] text-foreground truncate group-hover:text-primary group-hover:underline underline-offset-2">
                                          {label}
                                        </p>
                                        <p className="text-[10px] text-secondary/80 mt-0.5">
                                          {pdfOpening === openKey ? "Opening…" : "Open PDF"}
                                        </p>
                                      </button>
                                    ) : (
                                      <div className="px-2.5 py-1.5 bg-background">
                                        <p className="text-[11px] text-secondary truncate">{label}</p>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </>
                      )}

                      {!feedbackSent[msg.id] ? (
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-secondary">Helpful?</span>
                          <button onClick={() => sendFeedback(msg, 1)}
                            className="p-1 rounded-lg hover:bg-green-100 dark:hover:bg-green-950/30 text-secondary hover:text-green-600 transition-colors">
                            <ThumbsUp size={11} />
                          </button>
                          <button onClick={() => sendFeedback(msg, -1)}
                            className="p-1 rounded-lg hover:bg-red-100 dark:hover:bg-red-950/30 text-secondary hover:text-red-500 transition-colors">
                            <ThumbsDown size={11} />
                          </button>
                        </div>
                      ) : feedbackComment[msg.id] !== "sent" ? (
                        <div className="space-y-2 mt-1 py-1">
                          <p className="text-[11px] text-secondary font-medium">
                            {feedbackSent[msg.id] === 1 ? "What did you like?" : "How can we improve?"}
                          </p>
                          <div className="flex gap-1.5">
                            <input
                              type="text"
                              autoFocus
                              placeholder="Optional comment..."
                              value={typeof feedbackComment[msg.id] === "string" ? feedbackComment[msg.id] : ""}
                              onChange={(e) => setFeedbackComment(p => ({ ...p, [msg.id]: e.target.value }))}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleCommentSubmit(msg.id, feedbackSent[msg.id]);
                              }}
                              className="flex-1 px-2.5 py-1 text-[11px] rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary/30"
                            />
                            <button
                              onClick={() => handleCommentSubmit(msg.id, feedbackSent[msg.id])}
                              className="px-2 py-1 bg-primary text-white text-[10px] font-bold rounded-lg hover:bg-primary/90 transition-colors"
                            >
                              Send
                            </button>
                            <button
                              onClick={() => setFeedbackComment(p => ({ ...p, [msg.id]: "sent" }))}
                              className="px-2 py-1 text-secondary text-[10px] font-medium hover:text-foreground transition-colors"
                            >
                              Skip
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-[11px] text-secondary/70">
                          {feedbackSent[msg.id] === 1 ? "Thanks for the thumbs up!" : "Thanks, we'll work to improve."}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="px-3.5 py-2.5 rounded-2xl rounded-bl-md bg-background border border-border flex items-center gap-2.5">
                  <InlineSpinner size={16} className="text-primary" />
                  <span className="text-[11px] text-secondary font-medium">Thinking…</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <form
            onSubmit={(e) => { e.preventDefault(); send(); }}
            className={`p-3 border-t border-border flex-shrink-0 flex gap-2 bg-surface ${isMobile ? "pb-safe" : ""}`}
            style={isMobile ? { paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" } : undefined}
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Ask the knowledge base…"
              disabled={loading}
              className="flex-1 px-3.5 py-2 text-sm rounded-xl border border-border bg-background text-foreground placeholder-secondary focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition-all"
            />
            <button type="submit" disabled={!input.trim() || loading}
              className="p-2.5 rounded-xl bg-primary text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
              {loading ? <InlineSpinner size={15} className="text-white" /> : <Send size={14} />}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
