"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { useChat } from "@ai-sdk/react";
import Link from "next/link";
import { ArrowUp, CircleAlert, CircleCheck, Fish, PanelLeftClose, PanelLeftOpen, Settings2, ShieldCheck, Square, TriangleAlert, UserRound } from "lucide-react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from "@/components/ai-elements/sources";
import FisherOnboarding from "@/components/fisher-onboarding";
import OrcaLaunch from "@/components/orca-launch";
import ChatHistorySidebar, { type ChatHistoryItem } from "@/components/chat-history-sidebar";
import AgentActivityTimeline from "@/components/agent-activity-timeline";
import { MarkdownContent } from "@/components/markdown";
import { SpeakResponseButton, VoiceControl } from "@/components/voice-control";
import {
  DEFAULT_FISHER_CONTEXT,
  FISHER_PROFILE_STORAGE_KEY,
  mergeFisherContext,
  type FisherContext,
} from "@/lib/fisher-context";
import { DefaultChatTransport, type UIMessage } from "ai";

const API_URL = process.env.NEXT_PUBLIC_ORCA_API_URL ?? "http://localhost:3001/v1/chat";
const CHAT_HISTORY_STORAGE_KEY = "orca:chat-history:v1";
const ACTIVE_CHAT_STORAGE_KEY = "orca:active-chat:v1";
const SIDEBAR_COLLAPSED_STORAGE_KEY = "orca:chat-sidebar-collapsed:v1";
const EMPTY_MESSAGES: UIMessage[] = [];
const currentTimeMs = () => Date.now();

type HomeScreen = "launch" | "onboarding" | "chat";

function updateScreenUrl(screen: HomeScreen): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (screen === "launch") url.searchParams.delete("screen");
  else url.searchParams.set("screen", screen);
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

function hasSavedFisherProfile(value: unknown): boolean {
  const saved = mergeFisherContext(value);
  return saved.location.source !== "unset"
    && saved.location.label.trim().length > 0
    && saved.location.label !== "Add a harbour or waterbody";
}

type FishingAssessmentSnapshot = {
  decision: "GO" | "CAUTION" | "NO_GO" | "UNKNOWN";
  title?: string;
  detail?: string;
  locationLabel?: string;
  missingData?: string[];
  blockingReasons?: string[];
  metrics?: {
    maxWindKph?: number | null;
    maxGustKph?: number | null;
    maxWaveHeightM?: number | null;
    maxSwellHeightM?: number | null;
  };
};

const starterPrompts = [
  "Can I go fishing today?",
  "Check the sea near my harbour",
  "Find my best fishing window",
  "What should I prepare before leaving?",
];

function recordValue(value: unknown, key: string): unknown {
  return value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;
}

function collectEvidence(value: unknown, output: Array<{ url: string; title: string }>) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectEvidence(item, output));
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if (typeof record.url === "string" && /^https?:\/\//i.test(record.url)) {
    output.push({ url: record.url, title: String(record.title ?? record.provider ?? "Source") });
  }
  for (const key of ["evidence", "sources"]) collectEvidence(record[key], output);
}

function SourceLinks({ parts, outputs = [] }: { parts: unknown[]; outputs?: unknown[] }) {
  const sources = parts
    .filter((part) => recordValue(part, "type") === "source-url")
    .map((part) => ({
      url: String(recordValue(part, "url") ?? ""),
      title: String(recordValue(part, "title") ?? recordValue(part, "url") ?? "Source"),
    }))
    .filter((source) => /^https?:\/\//i.test(source.url))
    .filter((source, index, values) => values.findIndex((candidate) => candidate.url === source.url) === index);
  outputs.forEach((output) => collectEvidence(output, sources));
  const uniqueSources = sources.filter((source, index, values) => values.findIndex((candidate) => candidate.url === source.url) === index);

  if (!uniqueSources.length) return null;
  return (
    <Sources className="source-links">
      <SourcesTrigger count={uniqueSources.length} />
      <SourcesContent>
        {uniqueSources.map((source) => <Source key={source.url} href={source.url} title={source.title} />)}
      </SourcesContent>
    </Sources>
  );
}

function messageText(message: UIMessage): string {
  return message.parts.filter((part) => part.type === "text").map((part) => part.text).join("\n");
}

function assessmentFromMessage(message: UIMessage): FishingAssessmentSnapshot | null {
  const candidate = recordValue(message.metadata, "fishingAssessment");
  if (!candidate || typeof candidate !== "object") return null;
  const assessment = candidate as Record<string, unknown>;
  const decision = String(assessment.decision ?? "");
  if (!["GO", "CAUTION", "NO_GO", "UNKNOWN"].includes(decision)) return null;
  return {
    decision: decision as FishingAssessmentSnapshot["decision"],
    title: typeof assessment.title === "string" ? assessment.title : undefined,
    detail: typeof assessment.detail === "string" ? assessment.detail : undefined,
    locationLabel: typeof assessment.locationLabel === "string" ? assessment.locationLabel : undefined,
    missingData: Array.isArray(assessment.missingData) ? assessment.missingData.filter((item): item is string => typeof item === "string") : undefined,
    blockingReasons: Array.isArray(assessment.blockingReasons) ? assessment.blockingReasons.filter((item): item is string => typeof item === "string") : undefined,
    metrics: assessment.metrics && typeof assessment.metrics === "object" ? assessment.metrics as FishingAssessmentSnapshot["metrics"] : undefined,
  };
}

function metricLabel(value: number | null | undefined, suffix: string): string | null {
  return typeof value === "number" && Number.isFinite(value) ? `${value}${suffix}` : null;
}

function FishingVerdict({ assessment }: { assessment: FishingAssessmentSnapshot }) {
  const decisionLabel = assessment.decision === "NO_GO" ? "NO-GO" : assessment.decision.replace("_", "-");
  const Icon = assessment.decision === "GO" ? CircleCheck : assessment.decision === "NO_GO" ? CircleAlert : assessment.decision === "CAUTION" ? TriangleAlert : ShieldCheck;
  const metrics = [
    metricLabel(assessment.metrics?.maxWindKph, " km/h wind"),
    metricLabel(assessment.metrics?.maxWaveHeightM, " m waves"),
    metricLabel(assessment.metrics?.maxSwellHeightM, " m swell"),
  ].filter((value): value is string => Boolean(value));
  const caveat = assessment.missingData?.length ? `Missing: ${assessment.missingData.join(", ")}.` : null;

  return (
    <section className={`fishing-verdict is-${assessment.decision.toLowerCase()}`} aria-label={`Authoritative fishing decision: ${decisionLabel}`}>
      <div className="fishing-verdict-topline">
        <span className="fishing-verdict-icon" aria-hidden="true"><Icon size={16} strokeWidth={2} /></span>
        <div className="fishing-verdict-heading"><span>Safety engine · {assessment.locationLabel || "Current fishing location"}</span><strong>{assessment.title || "Fishing readiness result"}</strong></div>
        <b>{decisionLabel}</b>
      </div>
      {assessment.detail && <p>{assessment.detail}</p>}
      {(metrics.length > 0 || caveat) && <div className="fishing-verdict-meta">{metrics.map((metric) => <span key={metric}>{metric}</span>)}{caveat && <span>{caveat}</span>}</div>}
    </section>
  );
}

type StoredChat = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: UIMessage[];
};

function createChatId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return `chat-${crypto.randomUUID()}`;
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function shorten(value: string, length: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > length ? `${normalized.slice(0, length - 1).trimEnd()}…` : normalized;
}

function chatTitle(messages: UIMessage[]): string {
  const firstUserMessage = messages.find((message) => message.role === "user");
  return firstUserMessage ? shorten(messageText(firstUserMessage), 42) || "New fishing brief" : "New fishing brief";
}

function chatPreview(messages: UIMessage[]): string {
  for (const message of [...messages].reverse()) {
    const text = shorten(messageText(message), 58);
    if (text) return text;
  }
  return "";
}

function readStoredChats(): StoredChat[] {
  const raw = window.localStorage.getItem(CHAT_HISTORY_STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.flatMap((value) => {
      if (!value || typeof value !== "object") return [];
      const item = value as Record<string, unknown>;
      if (typeof item.id !== "string" || !Array.isArray(item.messages)) return [];
      const messages = item.messages as UIMessage[];
      const updatedAt = typeof item.updatedAt === "string" ? item.updatedAt : new Date().toISOString();
      return [{
        id: item.id,
        title: typeof item.title === "string" && item.title.trim() ? item.title : chatTitle(messages),
        createdAt: typeof item.createdAt === "string" ? item.createdAt : updatedAt,
        updatedAt,
        messages,
      }];
    }).sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  } catch {
    return [];
  }
}

function historyItem(chat: StoredChat): ChatHistoryItem {
  return {
    id: chat.id,
    title: chat.title,
    preview: chatPreview(chat.messages),
    updatedAt: chat.updatedAt,
    messageCount: chat.messages.length,
  };
}

function MessageView({ message, language, isWorking, elapsedMs }: { message: UIMessage; language: string; isWorking: boolean; elapsedMs: number }) {
  const isUser = message.role === "user";
  const text = messageText(message);
  const parts = message.parts as unknown[];
  const assessment = !isUser ? assessmentFromMessage(message) : null;
  const tools = parts.filter((part) => {
    const type = String(recordValue(part, "type") ?? "");
    return type === "dynamic-tool" || type.startsWith("tool-");
  });
  const toolError = tools
    .map((part) => recordValue(part, "errorText"))
    .find((value): value is string => typeof value === "string" && value.trim().length > 0);

  return (
    <article className={`message ${isUser ? "user" : "assistant"}`}>
      <span className="message-avatar" aria-hidden="true">{isUser ? <UserRound size={14} strokeWidth={2} /> : <Fish size={16} strokeWidth={1.8} />}</span>
      <div className="message-bubble">
        {assessment && <FishingVerdict assessment={assessment} />}
        {!isUser && <AgentActivityTimeline parts={parts} isWorking={isWorking} elapsedMs={elapsedMs} error={toolError} placeholder={isWorking && tools.length === 0} />}
        {text && <MarkdownContent text={text} />}
        {!isUser && <SourceLinks parts={parts} outputs={tools.map((part) => recordValue(part, "output"))} />}
        {!isUser && text && <SpeakResponseButton apiUrl={API_URL} language={language} text={text} />}
      </div>
    </article>
  );
}

export default function OrcaHome() {
  const [context, setContext] = useState<FisherContext>(DEFAULT_FISHER_CONTEXT);
  const [screen, setScreen] = useState<HomeScreen>("launch");
  const [draftMessage, setDraftMessage] = useState("");
  const [isMultiLine, setIsMultiLine] = useState(false);
  const [conversations, setConversations] = useState<StoredChat[]>([]);
  const [activeChatId, setActiveChatId] = useState("new-chat");
  const [historyReady, setHistoryReady] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [requestStartedAt, setRequestStartedAt] = useState<number | null>(null);
  const [requestElapsedMs, setRequestElapsedMs] = useState(0);
  const [existingAssistantIds, setExistingAssistantIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const loadProfile = window.setTimeout(() => {
      const stored = window.localStorage.getItem(FISHER_PROFILE_STORAGE_KEY);
      let savedProfile = false;
      if (stored) {
        try {
          const parsedProfile: unknown = JSON.parse(stored);
          setContext(mergeFisherContext(parsedProfile));
          savedProfile = hasSavedFisherProfile(parsedProfile);
        } catch {
          // Keep the safe defaults when an old or invalid profile is present.
        }
      }
      const storedChats = readStoredChats();
      const savedActiveChatId = window.localStorage.getItem(ACTIVE_CHAT_STORAGE_KEY);
      const nextActiveChatId = savedActiveChatId && storedChats.some((chat) => chat.id === savedActiveChatId)
        ? savedActiveChatId
        : storedChats[0]?.id ?? createChatId();
      setConversations(storedChats);
      setActiveChatId(nextActiveChatId);
      setSidebarCollapsed(window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true");
      setHistoryReady(true);
      const requestedScreen = new URLSearchParams(window.location.search).get("screen");
      const nextScreen: HomeScreen = requestedScreen === "onboarding"
        ? "onboarding"
        : requestedScreen === "chat" || savedProfile
          ? "chat"
          : "launch";
      setScreen(nextScreen);
      if (nextScreen !== "launch") updateScreenUrl(nextScreen);
    }, 0);

    return () => window.clearTimeout(loadProfile);
  }, []);

  const transport = useMemo(
    () => new DefaultChatTransport<UIMessage>({ api: API_URL, body: { fisherContext: context } }),
    [context],
  );

  const saveConversation = useCallback((chatId: string, nextMessages: UIMessage[]) => {
    if (!nextMessages.length) return;

    setConversations((current) => {
      const existing = current.find((conversation) => conversation.id === chatId);
      const now = new Date().toISOString();
      const nextConversation: StoredChat = {
        id: chatId,
        title: existing?.title ?? chatTitle(nextMessages),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        messages: nextMessages,
      };
      return [nextConversation, ...current.filter((conversation) => conversation.id !== chatId)];
    });
  }, []);

  const handleChatFinish = useCallback(({ messages: finishedMessages }: { messages: UIMessage[] }) => {
    saveConversation(activeChatId, finishedMessages);
    if (requestStartedAt) setRequestElapsedMs(Math.max(0, currentTimeMs() - requestStartedAt));
  }, [activeChatId, requestStartedAt, saveConversation]);

  const activeConversation = conversations.find((conversation) => conversation.id === activeChatId);
  const { messages, sendMessage, status, error, stop } = useChat<UIMessage>({
    id: activeChatId,
    messages: activeConversation?.messages ?? EMPTY_MESSAGES,
    transport,
    throttle: 50,
    onFinish: handleChatFinish,
  });
  const isWorking = status === "submitted" || status === "streaming";
  const activeChatTitle = activeConversation?.title ?? "New fishing brief";
  const historyItems = useMemo(() => conversations.map(historyItem), [conversations]);
  const activeAssistantMessageId = isWorking
    ? [...messages].reverse().find((message) => message.role === "assistant" && !existingAssistantIds.has(message.id))?.id
    : undefined;

  useEffect(() => {
    if (!isWorking || !requestStartedAt) return undefined;
    const updateElapsed = () => {
      const elapsed = Math.max(0, Date.now() - requestStartedAt);
      setRequestElapsedMs(elapsed);
    };
    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(timer);
  }, [isWorking, requestStartedAt]);

  useEffect(() => {
    if (!historyReady) return;
    window.localStorage.setItem(CHAT_HISTORY_STORAGE_KEY, JSON.stringify(conversations));
    window.localStorage.setItem(ACTIVE_CHAT_STORAGE_KEY, activeChatId);
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(sidebarCollapsed));
  }, [activeChatId, conversations, historyReady, sidebarCollapsed]);

  const ask = (text: string): boolean => {
    if (status !== "ready" || !text.trim()) return false;
    setExistingAssistantIds(new Set(messages.filter((message) => message.role === "assistant").map((message) => message.id)));
    setRequestStartedAt(currentTimeMs());
    setRequestElapsedMs(0);
    sendMessage({ text: text.trim() });
    return true;
  };

  const submitDraft = () => {
    if (ask(draftMessage)) {
      setDraftMessage("");
      setIsMultiLine(false);
    }
  };

  const handleDraftChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value;
    setDraftMessage(value);
    event.target.style.height = "auto";
    event.target.style.height = `${Math.min(event.target.scrollHeight, 180)}px`;
    setIsMultiLine(value.includes("\n") || value.length > 60);
  };

  const handleDraftKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitDraft();
    }
  };

  const handleNewChat = () => {
    saveConversation(activeChatId, messages);
    stop();
    setRequestStartedAt(null);
    setRequestElapsedMs(0);
    setActiveChatId(createChatId());
    setDraftMessage("");
    setIsMultiLine(false);
  };

  const handleSelectChat = (chatId: string) => {
    if (chatId === activeChatId) return;
    saveConversation(activeChatId, messages);
    stop();
    setRequestStartedAt(null);
    setRequestElapsedMs(0);
    setActiveChatId(chatId);
    setDraftMessage("");
    setIsMultiLine(false);
  };

  const handleDeleteChat = (chatId: string) => {
    const chat = conversations.find((conversation) => conversation.id === chatId);
    if (!chat || !window.confirm(`Delete “${chat.title}”?`)) return;

    const remaining = conversations.filter((conversation) => conversation.id !== chatId);
    setConversations(remaining);
    if (chatId === activeChatId) {
      stop();
      setRequestStartedAt(null);
      setRequestElapsedMs(0);
      setActiveChatId(remaining[0]?.id ?? createChatId());
      setDraftMessage("");
      setIsMultiLine(false);
    }
  };

  const completeOnboarding = (next: FisherContext) => {
    setContext(next);
    window.localStorage.setItem(FISHER_PROFILE_STORAGE_KEY, JSON.stringify(next));
    updateScreenUrl("chat");
    setScreen("chat");
  };

  if (!historyReady) return <main className="app-loading-screen" aria-label="Loading Orca.ai"><span>orca<span>.ai</span></span></main>;
  if (screen === "launch") return <OrcaLaunch onNext={() => { updateScreenUrl("onboarding"); setScreen("onboarding"); }} />;
  if (screen === "onboarding") return <FisherOnboarding initialContext={context} onBack={() => { updateScreenUrl("launch"); setScreen("launch"); }} onComplete={completeOnboarding} />;

  return (
    <main className="chat-page">
      <div className="chat-board">
        <div className={`chat-layout${sidebarCollapsed ? " is-collapsed" : ""}`}>
          <ChatHistorySidebar
            items={historyItems}
            activeChatId={activeChatId}
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed((current) => !current)}
            onNewChat={handleNewChat}
            onSelectChat={handleSelectChat}
            onDeleteChat={handleDeleteChat}
          />
          {!sidebarCollapsed && <button type="button" className="chat-sidebar-backdrop" onClick={() => setSidebarCollapsed(true)} aria-label="Close chat history" />}

          <div className="chat-main-column">
            <header className="chat-board-nav">
              <div className="chat-nav-leading">
                <button type="button" className="chat-sidebar-mobile-toggle" onClick={() => setSidebarCollapsed((current) => !current)} aria-label={sidebarCollapsed ? "Open chat history" : "Close chat history"} aria-expanded={!sidebarCollapsed}>
                  {sidebarCollapsed ? <PanelLeftOpen size={18} strokeWidth={1.8} /> : <PanelLeftClose size={18} strokeWidth={1.8} />}
                </button>
                <Link className="chat-brand" href="#top" aria-label="Orca.ai home">
                  <span className="chat-brand-mark"><Fish size={22} strokeWidth={1.8} /></span>
                  <strong>orca<span>.ai</span></strong>
                </Link>
                <span className="chat-current-title" aria-live="polite">{activeChatTitle}</span>
              </div>
              <Link className="chat-settings-link" href="/settings" aria-label="Open settings"><Settings2 size={16} strokeWidth={1.9} /><span>Settings</span></Link>
            </header>

            <section className="chat-interface" id="top" aria-label="Orca.ai fishing chat">
              <div className="chat-body">
                {messages.length === 0 ? (
                  <div className="empty-chat"><div className="empty-chat-visual" aria-hidden="true"><Image src="/images/orca-launch-hero-transparent.png" alt="" fill sizes="220px" /></div><h3>What are you seeing on the water?</h3><p>Ask Orca about your next fishing window. Start with a suggestion or write your own question.</p><div className="prompt-grid">{starterPrompts.map((prompt) => <button type="button" className="prompt-button" key={prompt} onClick={() => ask(prompt)} disabled={isWorking}>{prompt}</button>)}</div></div>
                ) : (
                  <Conversation className="message-list" aria-label="Orca fishing conversation"><ConversationContent className="message-content">{messages.map((message) => <MessageView key={message.id} message={message} language={context.language} isWorking={message.id === activeAssistantMessageId} elapsedMs={requestElapsedMs} />)}{isWorking && !activeAssistantMessageId && <article className="message assistant activity-placeholder"><div className="message-bubble"><AgentActivityTimeline isWorking elapsedMs={requestElapsedMs} placeholder /></div></article>}</ConversationContent><ConversationScrollButton /></Conversation>
                )}
                {error && <p className="location-status" role="alert">The fishing desk is unavailable right now. Please try again in a moment.</p>}
                <form className="chat-form chat-composer" onSubmit={(event) => { event.preventDefault(); submitDraft(); }}>
                  <div className={`composer-shell${isMultiLine ? " composer-shell--multiline" : ""}`}>
                    <textarea className="chat-input" name="message" aria-label="Message Orca" placeholder="Ask Orca about the water…" rows={1} value={draftMessage} onChange={handleDraftChange} onKeyDown={handleDraftKeyDown} disabled={isWorking} />
                    <div className="composer-right-rail">
                      {isWorking ? <button type="button" className="stop-button" onClick={() => stop()} aria-label="Stop response"><Square size={13} strokeWidth={2.2} /></button> : draftMessage.trim() ? <button type="submit" className="send-button" disabled={status !== "ready"} aria-label="Send message"><span className="send-label">Send brief</span><ArrowUp size={14} strokeWidth={2.4} /></button> : <VoiceControl apiUrl={API_URL} language={context.language} disabled={isWorking} onTranscript={ask} />}
                    </div>
                  </div>
                </form>
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
