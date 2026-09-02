"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { useChat } from "@ai-sdk/react";
import Link from "next/link";
import { ArrowUp, Fish, Settings2, Square, UserRound } from "lucide-react";
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
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
  type ToolPart,
} from "@/components/ai-elements/tool";
import FisherOnboarding from "@/components/fisher-onboarding";
import OrcaLaunch from "@/components/orca-launch";
import {
  DEFAULT_DECISION,
  FishingDecisionCard,
  type FishingDecision,
  type FishingDecisionState,
} from "@/components/fishing-decision";
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

type HomeScreen = "launch" | "onboarding" | "chat";

const starterPrompts = [
  "Can I go fishing today?",
  "Check the sea near my harbour",
  "Find my best fishing window",
  "What should I prepare before leaving?",
];

const toolNames: Record<string, string> = {
  discover_skills: "Choosing the right fishing skill",
  activate_skill: "Activating a fishing workflow",
  assess_fishing_conditions: "Assessing fishing conditions",
  get_imd_conditions: "Checking official IMD conditions",
  get_ndma_alerts: "Checking official disaster alerts",
  get_open_meteo_weather: "Checking local weather and wind",
  get_open_meteo_marine: "Checking waves and swell",
  get_incois_marine_data: "Checking INCOIS marine data",
  get_fishing_restrictions_api: "Checking fishing restrictions",
  search_trusted_fishing_sources: "Searching trusted fishing sources",
  extract_trusted_source: "Reading trusted evidence",
  get_nasa_climate_context: "Checking climate context",
};

function recordValue(value: unknown, key: string): unknown {
  return value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;
}

function normalizeDecision(value: unknown): FishingDecision | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const raw = String(item.state ?? item.decision ?? item.status ?? "").toLowerCase();
  const map: Record<string, FishingDecisionState> = {
    go: "go",
    green: "go",
    safe: "go",
    caution: "caution",
    yellow: "caution",
    wait: "wait",
    unknown: "wait",
    hold: "wait",
    no_go: "avoid",
    "no-go": "avoid",
    avoid: "avoid",
    red: "avoid",
  };
  const state = map[raw];
  if (!state) return null;

  return {
    state,
    title: String(item.title ?? item.headline ?? (state === "go" ? "Conditions support a trip" : state === "caution" ? "Go with a cautious plan" : state === "avoid" ? "Do not launch yet" : "Wait for a verified window")),
    detail: String(item.detail ?? item.reason ?? item.summary ?? "The agent updated this decision from the latest available evidence."),
    updated: item.updated ? String(item.updated) : item.generatedAt ? String(item.generatedAt) : "Updated by agent",
  };
}

function decisionFromMessages(messages: UIMessage[]): FishingDecision {
  for (const message of [...messages].reverse()) {
    for (const part of [...message.parts].reverse()) {
      const direct = normalizeDecision(recordValue(part, "data")) ?? normalizeDecision(recordValue(part, "output"));
      if (direct) return direct;
    }
  }
  return DEFAULT_DECISION;
}

function toolName(part: unknown): string {
  const type = String(recordValue(part, "type") ?? "");
  const name = type === "dynamic-tool" ? String(recordValue(part, "toolName") ?? "agent tool") : type.replace(/^tool-/, "");
  return toolNames[name] ?? name.replace(/[-_]/g, " ");
}

function ToolActivity({ part }: { part: unknown }) {
  const toolPart = part as ToolPart;
  const name = toolName(part);
  return (
    <Tool className="tool-card" defaultOpen={toolPart.state === "output-error"}>
      <ToolHeader type="dynamic-tool" toolName={name} state={toolPart.state} title={name} />
      <ToolContent>
        {toolPart.input !== undefined && <ToolInput input={toolPart.input} />}
        {(toolPart.output !== undefined || toolPart.errorText) && <ToolOutput output={toolPart.output} errorText={toolPart.errorText} />}
      </ToolContent>
    </Tool>
  );
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

function MessageView({ message, language }: { message: UIMessage; language: string }) {
  const isUser = message.role === "user";
  const text = messageText(message);
  const parts = message.parts as unknown[];
  const tools = parts.filter((part) => {
    const type = String(recordValue(part, "type") ?? "");
    return type === "dynamic-tool" || type.startsWith("tool-");
  });

  return (
    <article className={`message ${isUser ? "user" : "assistant"}`}>
      <span className="message-avatar" aria-hidden="true">{isUser ? <UserRound size={14} strokeWidth={2} /> : <Fish size={16} strokeWidth={1.8} />}</span>
      <div className="message-bubble">
        {text && <MarkdownContent text={text} />}
        {!isUser && tools.map((part, index) => <ToolActivity key={`${message.id}-tool-${index}`} part={part} />)}
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

  useEffect(() => {
    const loadProfile = window.setTimeout(() => {
      const stored = window.localStorage.getItem(FISHER_PROFILE_STORAGE_KEY);
      if (stored) {
        try {
          setContext(mergeFisherContext(JSON.parse(stored)));
        } catch {
          // Keep the safe defaults when an old or invalid profile is present.
        }
      }
      if (new URLSearchParams(window.location.search).get("screen") === "chat") setScreen("chat");
    }, 0);

    return () => window.clearTimeout(loadProfile);
  }, []);

  const transport = useMemo(
    () => new DefaultChatTransport<UIMessage>({ api: API_URL, body: { fisherContext: context } }),
    [context],
  );
  const { messages, sendMessage, status, error, stop } = useChat<UIMessage>({ transport, throttle: 50 });
  const decision = useMemo(() => decisionFromMessages(messages), [messages]);
  const isWorking = status === "submitted" || status === "streaming";

  const ask = (text: string): boolean => {
    if (status !== "ready" || !text.trim()) return false;
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

  const completeOnboarding = (next: FisherContext) => {
    setContext(next);
    window.localStorage.setItem(FISHER_PROFILE_STORAGE_KEY, JSON.stringify(next));
    setScreen("chat");
  };

  if (screen === "launch") return <OrcaLaunch onNext={() => setScreen("onboarding")} />;
  if (screen === "onboarding") return <FisherOnboarding initialContext={context} onBack={() => setScreen("launch")} onComplete={completeOnboarding} />;

  return (
    <main className="chat-page">
      <div className="chat-board">
        <header className="chat-board-nav">
          <Link className="chat-brand" href="#top" aria-label="Orca.ai home">
            <span className="chat-brand-mark"><Fish size={22} strokeWidth={1.8} /></span>
            <strong>orca<span>.ai</span></strong>
          </Link>
          <Link className="chat-settings-link" href="/settings" aria-label="Open settings"><Settings2 size={16} strokeWidth={1.9} /><span>Settings</span></Link>
        </header>

        <section className="chat-interface" id="top" aria-label="Orca.ai fishing chat">
          <div className="chat-body">
            {messages.length > 0 && <FishingDecisionCard decision={decision} />}
            {messages.length === 0 ? (
              <div className="empty-chat"><div className="empty-chat-visual" aria-hidden="true"><Image src="/images/orca-launch-hero-transparent.png" alt="" fill sizes="220px" /></div><h3>What are you seeing on the water?</h3><p>Ask Orca about your next fishing window. Start with a suggestion or write your own question.</p><div className="prompt-grid">{starterPrompts.map((prompt) => <button type="button" className="prompt-button" key={prompt} onClick={() => ask(prompt)} disabled={isWorking}>{prompt}</button>)}</div></div>
            ) : (
              <Conversation className="message-list" aria-label="Orca fishing conversation"><ConversationContent className="message-content">{messages.map((message) => <MessageView key={message.id} message={message} language={context.language} />)}</ConversationContent><ConversationScrollButton /></Conversation>
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
    </main>
  );
}
