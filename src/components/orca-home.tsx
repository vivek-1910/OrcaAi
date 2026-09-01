"use client";

import { useEffect, useMemo, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { Fish, LocateFixed, UserRound, Waves } from "lucide-react";
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
import FisherProfile from "@/components/fisher-profile";
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
  "Give me a fishing brief for my next trip",
  "What are the current conditions near my water?",
  "Tell me if I should go fishing today",
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
  const [hydrated, setHydrated] = useState(false);
  const [locationStatus, setLocationStatus] = useState("");

  useEffect(() => {
    const loadProfile = window.setTimeout(() => {
      const stored = window.localStorage.getItem(FISHER_PROFILE_STORAGE_KEY);
      if (stored) {
        try {
          setContext(mergeFisherContext(JSON.parse(stored)));
        } catch {
          setLocationStatus("The saved profile could not be read; starting fresh.");
        }
      }
      setHydrated(true);
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

  const updateContext = (next: FisherContext) => {
    setContext(next);
    if (hydrated) window.localStorage.setItem(FISHER_PROFILE_STORAGE_KEY, JSON.stringify(next));
  };

  const saveProfile = () => {
    window.localStorage.setItem(FISHER_PROFILE_STORAGE_KEY, JSON.stringify(context));
  };

  const locate = () => {
    if (!navigator.geolocation) {
      setLocationStatus("Location is unavailable here. Enter a harbour or waterbody instead.");
      return;
    }
    setLocationStatus("Requesting your location…");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        updateContext({ ...context, location: { source: "permission", label: "Current fishing location", latitude: coords.latitude, longitude: coords.longitude } });
        setLocationStatus("Using your current location. It is sent only when you ask Orca for a brief.");
      },
      () => setLocationStatus("Location was not shared. Add a harbour or waterbody manually."),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  };

  const ask = (text: string) => {
    if (status === "ready" && text.trim()) sendMessage({ text: text.trim() });
  };

  const completeOnboarding = (next: FisherContext) => {
    setContext(next);
    window.localStorage.setItem(FISHER_PROFILE_STORAGE_KEY, JSON.stringify(next));
    setScreen("chat");
  };

  if (screen === "launch") return <OrcaLaunch onNext={() => setScreen("onboarding")} />;
  if (screen === "onboarding") return <FisherOnboarding initialContext={context} onBack={() => setScreen("launch")} onComplete={completeOnboarding} />;

  return (
    <main className="orca-shell">
      <div className="orca-frame">
        <header className="topbar">
          <a className="brand" href="#top" aria-label="Orca.ai home"><span className="brand-mark"><Fish size={21} strokeWidth={1.8} /></span><span><span className="brand-name">orca<span className="brand-name-dot">.ai</span></span><span className="brand-kicker">field intelligence for fishers</span></span></a>
          <span className="topbar-note"><span className="status-dot" /> Your water. Your call.</span>
        </header>

        <section className="hero" id="top">
          <div><span className="eyebrow">Before you cast</span><h1>Know the water.<br /><span>Choose the moment.</span></h1><p className="hero-copy">Orca combines your fishing context with live tools and trusted evidence to create one clear brief for the water ahead.</p></div>
          <div className="hero-note"><span className="section-label">Built for the bank and the bow</span><p>Marine or inland. Shore or vessel. Ask naturally and Orca activates the right fishing workflow for your location.</p></div>
        </section>

        <div className="workspace">
          <section className="card chat-card" aria-labelledby="chat-title">
            <div className="chat-header"><div className="chat-title"><span className="agent-avatar" aria-hidden="true"><Fish size={20} strokeWidth={1.8} /></span><div><h2 id="chat-title">Orca fishing desk</h2><p>Ask for conditions, a brief, or a straight go / wait call.</p></div></div><span className={`status-pill ${isWorking ? "is-working" : ""}`}><span className="status-dot" />{isWorking ? "Working" : "Ready"}</span></div>
            <div className="chat-body">
              <FishingDecisionCard decision={decision} />
              {messages.length === 0 ? (
                <div className="empty-chat"><span className="empty-chat-mark" aria-hidden="true"><Waves size={26} strokeWidth={1.7} /></span><h3>What are you seeing on the water?</h3><p>Tell Orca where and when you fish. The agent will activate relevant tools, show evidence and return a conservative fishing decision.</p><div className="prompt-grid">{starterPrompts.map((prompt) => <button type="button" className="prompt-button" key={prompt} onClick={() => ask(prompt)} disabled={isWorking}>{prompt}</button>)}</div></div>
              ) : (
                <Conversation className="message-list" aria-label="Orca fishing conversation"><ConversationContent className="message-content">{messages.map((message) => <MessageView key={message.id} message={message} language={context.language} />)}</ConversationContent><ConversationScrollButton /></Conversation>
              )}
              {error && <p className="location-status" role="alert">The fishing desk could not connect: {error.message}. Check that the Fastify server is running on port 3001.</p>}
              <form className="chat-form" onSubmit={(event) => { event.preventDefault(); const input = event.currentTarget.elements.namedItem("message"); if (!(input instanceof HTMLTextAreaElement)) return; const value = input.value; if (!isWorking) { ask(value); input.value = ""; } }}>
                <textarea className="chat-input" name="message" aria-label="Message Orca" placeholder="Ask about your next fishing window…" rows={1} disabled={isWorking} />
                <VoiceControl apiUrl={API_URL} language={context.language} disabled={isWorking} onTranscript={ask} />
                {isWorking ? <button type="button" className="stop-button" onClick={() => stop()}>Stop</button> : <button type="submit" className="send-button" disabled={status !== "ready"}>Send brief</button>}
              </form>
            </div>
          </section>

          <aside className="sidebar">
            <FisherProfile context={context} onChange={updateContext} onLocate={locate} locationStatus={locationStatus} onSave={saveProfile} />
            <section className="card side-card" aria-labelledby="controls-title"><span className="eyebrow">Field controls</span><h2 id="controls-title">Ready for the water</h2><p className="side-card-intro">Set the context once. Every question can then use the right location, water type and vessel details.</p><button type="button" className="control-button" onClick={locate}><span className="control-icon"><LocateFixed size={18} strokeWidth={1.9} /></span><strong>Location</strong><span>{context.location.source === "permission" ? "Current location set" : "Permission or manual"}</span></button><p className="control-note">Orca checks each brief against the profile you set above.</p></section>
          </aside>
        </div>

      </div>
    </main>
  );
}
