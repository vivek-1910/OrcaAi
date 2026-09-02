"use client";

import {
  BookOpenText,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CloudSun,
  Compass,
  FileCheck2,
  Fish,
  Globe2,
  LoaderCircle,
  MapPin,
  Search,
  ShieldCheck,
  Siren,
  Sparkles,
  Waves,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type ActivityPart = {
  type?: unknown;
  toolName?: unknown;
  state?: unknown;
  input?: unknown;
  output?: unknown;
  errorText?: unknown;
};

type ActivityTimelineProps = {
  parts?: unknown[];
  isWorking?: boolean;
  elapsedMs?: number;
  error?: unknown;
  placeholder?: boolean;
};

type ActivityStep = {
  id: string;
  title: string;
  detail?: string;
  state: "running" | "complete" | "failed" | "pending";
  Icon: LucideIcon;
};

const TOOL_LABELS: Record<string, string> = {
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

const TOOL_ICONS: Record<string, LucideIcon> = {
  discover_skills: Compass,
  activate_skill: Sparkles,
  assess_fishing_conditions: ShieldCheck,
  get_imd_conditions: CloudSun,
  get_ndma_alerts: Siren,
  get_open_meteo_weather: CloudSun,
  get_open_meteo_marine: Waves,
  get_incois_marine_data: Waves,
  get_fishing_restrictions_api: FileCheck2,
  search_trusted_fishing_sources: Search,
  extract_trusted_source: BookOpenText,
  get_nasa_climate_context: Globe2,
};

function recordValue(value: unknown, key: string): unknown {
  return value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;
}

function toolNameFor(part: ActivityPart): string {
  const type = String(part.type ?? "");
  return type === "dynamic-tool"
    ? String(part.toolName ?? "agent tool")
    : type.replace(/^tool-/, "");
}

function titleFor(name: string): string {
  return TOOL_LABELS[name] ?? name.replace(/[-_.]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function iconFor(name: string): LucideIcon {
  if (TOOL_ICONS[name]) return TOOL_ICONS[name];
  if (name.includes("search")) return Search;
  if (name.includes("marine") || name.includes("wave")) return Waves;
  if (name.includes("weather") || name.includes("wind")) return CloudSun;
  if (name.includes("alert") || name.includes("warning")) return Siren;
  if (name.includes("restriction") || name.includes("regulation")) return FileCheck2;
  if (name.includes("location") || name.includes("resolve")) return MapPin;
  if (name.includes("skill")) return Sparkles;
  return Fish;
}

function shorten(value: string, length = 76): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > length ? `${normalized.slice(0, length - 1).trimEnd()}…` : normalized;
}

function inputDetail(input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const record = input as Record<string, unknown>;
  const candidate = [
    record.skillId,
    record.skill_id,
    record.query,
    record.location,
    record.harbour,
    record.waterbody,
    record.waterMode,
  ].find((value) => typeof value === "string" && value.trim());
  return candidate ? shorten(String(candidate)) : undefined;
}

function outputDetail(output: unknown): string | undefined {
  if (!output || typeof output !== "object") return undefined;
  const record = output as Record<string, unknown>;
  if (typeof record.decision === "string") return `Decision: ${record.decision.replace(/_/g, " ")}`;
  if (typeof record.skillId === "string") return `Skill: ${record.skillId.replace(/-/g, " ")}`;
  if (typeof record.sourceCount === "number") return `${record.sourceCount} source${record.sourceCount === 1 ? "" : "s"} found`;
  return undefined;
}

function detailFor(part: ActivityPart): string | undefined {
  return part.state === "output-available" ? outputDetail(part.output) : inputDetail(part.input);
}

function stepState(part: ActivityPart, index: number, parts: ActivityPart[], isWorking: boolean): ActivityStep["state"] {
  const state = String(part.state ?? "");
  if (state === "output-error" || state === "output-denied") return "failed";
  if (state === "output-available") return "complete";
  if (state === "input-available" || state === "input-streaming") return isWorking ? "running" : "complete";
  if (isWorking && index === parts.length - 1) return "running";
  return "pending";
}

function formatElapsed(elapsedMs = 0, running = false): string {
  const totalSeconds = Math.max(0, Math.floor((Number(elapsedMs) || 0) / 1000));
  if (totalSeconds < 1) return running ? "0s" : "<1s";
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds ? `${minutes}m ${String(seconds).padStart(2, "0")}s` : `${minutes}m`;
}

function stepLabel(state: ActivityStep["state"]): string {
  if (state === "running") return "Working";
  if (state === "failed") return "Couldn’t complete";
  if (state === "pending") return "Queued";
  return "Done";
}

function asActivityParts(parts: unknown[]): ActivityPart[] {
  return parts.flatMap((part) => {
    if (!part || typeof part !== "object") return [];
    const type = String(recordValue(part, "type") ?? "");
    return type === "dynamic-tool" || type.startsWith("tool-") ? [part as ActivityPart] : [];
  });
}

export default function AgentActivityTimeline({
  parts = [],
  isWorking = false,
  elapsedMs = 0,
  error,
  placeholder = false,
}: ActivityTimelineProps) {
  const activityParts = useMemo(() => asActivityParts(parts), [parts]);
  const steps = useMemo<ActivityStep[]>(
    () => activityParts.map((part, index) => {
      const name = toolNameFor(part);
      return {
        id: `${name}-${index}`,
        title: titleFor(name),
        detail: detailFor(part),
        state: stepState(part, index, activityParts, isWorking),
        Icon: iconFor(name),
      };
    }),
    [activityParts, isWorking],
  );
  const hasActivity = placeholder || steps.length > 0 || Boolean(error);
  const [manualOpen, setManualOpen] = useState(false);

  if (!hasActivity) return null;

  const failed = Boolean(error) || steps.some((step) => step.state === "failed");
  const open = isWorking || manualOpen;
  const title = failed
    ? "Orca stopped"
    : isWorking
      ? "Orca is checking the water"
      : `Worked for ${formatElapsed(elapsedMs)}`;

  return (
    <section className={`agent-activity${isWorking ? " is-working" : ""}${failed ? " has-failed" : ""}`} aria-label="Agent activity">
      <button
        className="agent-activity-summary"
        type="button"
        aria-expanded={open}
        onClick={() => setManualOpen((current) => !current)}
      >
        <span className="agent-activity-summary-icon" aria-hidden="true">
          {failed ? <Siren size={17} strokeWidth={1.9} /> : isWorking ? <LoaderCircle className="agent-activity-spin" size={18} strokeWidth={1.9} /> : <CheckCircle2 size={18} strokeWidth={1.9} />}
        </span>
        <span className="agent-activity-summary-title">{title}</span>
        <span className="agent-activity-summary-chevron" aria-hidden="true">{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
      </button>

      {open && (
        <div className="agent-activity-steps">
          {steps.map((step, index) => {
            const StepIcon = step.Icon;
            return (
              <div className={`agent-activity-step is-${step.state}`} key={step.id}>
                <div className="agent-activity-step-rail" aria-hidden="true">
                  <span className="agent-activity-step-icon">
                    {step.state === "running" ? <LoaderCircle className="agent-activity-spin" size={15} strokeWidth={2} /> : step.state === "complete" ? <Check size={14} strokeWidth={2.4} /> : <StepIcon size={15} strokeWidth={1.9} />}
                  </span>
                  {index < steps.length - 1 && <span className="agent-activity-step-connector" />}
                </div>
                <div className="agent-activity-step-copy">
                  <div className="agent-activity-step-heading">
                    <span className="agent-activity-step-title">{step.title}</span>
                    <span className="agent-activity-step-state">{stepLabel(step.state)}</span>
                  </div>
                  {step.detail && <span className="agent-activity-step-detail">{step.detail}</span>}
                </div>
              </div>
            );
          })}

          {placeholder && steps.length === 0 && (
            <div className="agent-activity-preparing">
              <span className="agent-activity-preparing-icon" aria-hidden="true"><Fish size={15} strokeWidth={1.8} /></span>
              <span>Preparing the first fishing check…</span>
            </div>
          )}

          {failed && <p className="agent-activity-error">This fishing check could not be completed.</p>}

          {!isWorking && !failed && steps.length > 0 && (
            <div className="agent-activity-done"><CheckCircle2 size={15} strokeWidth={1.9} /><span>Done · Worked for {formatElapsed(elapsedMs)}</span></div>
          )}
        </div>
      )}
    </section>
  );
}
