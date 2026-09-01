"use client";

import { useState } from "react";
import { LocateFixed, Waves, Droplets } from "lucide-react";
import OrcaSelect from "@/components/orca-select";
import {
  getFisherContextSummary,
  type Experience,
  type FisherContext,
  type TripTiming,
  type WaterMode,
} from "@/lib/fisher-context";

type FisherProfileProps = {
  context: FisherContext;
  onChange: (next: FisherContext) => void;
  onLocate: () => void;
  locationStatus: string;
  onSave: () => void;
};

const languageOptions = ["English", "Hindi", "Kannada", "Tamil", "Malayalam", "Telugu", "Bengali", "Marathi", "Gujarati", "Odia", "Punjabi"];
const experienceOptions = [{ value: "new", label: "New to fishing" }, { value: "learning", label: "Learning" }, { value: "regular", label: "Regular fisher" }, { value: "expert", label: "Experienced skipper" }];
const fishingModeOptions = ["Small boat", "Kayak", "Shore / bank", "Charter boat", "Commercial vessel"].map((type) => ({ value: type, label: type }));
const timingOptions = [{ value: "early-morning", label: "Early morning" }, { value: "day", label: "Day trip" }, { value: "evening", label: "Evening" }, { value: "overnight", label: "Overnight" }];

function localDateTimeValue(value: string | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function isoDateTimeValue(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export default function FisherProfile({ context, onChange, onLocate, locationStatus, onSave }: FisherProfileProps) {
  const [editing, setEditing] = useState(true);
  const [saved, setSaved] = useState(false);

  const update = (patch: Partial<FisherContext>) => onChange({ ...context, ...patch });
  const save = () => {
    onSave();
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2400);
  };

  return (
    <section className="card side-card" aria-labelledby="profile-title">
      <span className="eyebrow">Your fishing profile</span>
      <h2 id="profile-title">Your fishing profile</h2>
      <p className="side-card-intro">Set these once so every brief fits your water, vessel and timing.</p>

      <div className="profile-summary">
        <div><strong>{context.waterMode === "marine" ? "Marine" : "Inland"} fisher</strong><span>{getFisherContextSummary(context)}</span></div>
        <button type="button" className="text-button" onClick={() => setEditing((value) => !value)} aria-expanded={editing}>{editing ? "Hide" : "Edit"}</button>
      </div>

      {editing && (
        <div className="profile-form">
          <div className="form-group"><span className="input-label">Water</span><div className="control-grid" role="group" aria-label="Fishing water type">
            {(["marine", "inland"] as WaterMode[]).map((mode) => <button key={mode} type="button" className={`control-button ${context.waterMode === mode ? "is-active" : ""}`} onClick={() => update({ waterMode: mode })} aria-pressed={context.waterMode === mode}><span className="control-icon">{mode === "marine" ? <Waves size={18} strokeWidth={1.9} /> : <Droplets size={18} strokeWidth={1.9} />}</span><strong>{mode === "marine" ? "Marine" : "Inland"}</strong><span>{mode === "marine" ? "Coast, sea, offshore" : "River, lake, reservoir"}</span></button>)}
          </div></div>

          <div className="form-group"><span className="input-label">Where are you fishing?</span><div className="location-actions"><button type="button" className="secondary-button" onClick={onLocate}><LocateFixed size={15} strokeWidth={1.9} /> Use current location</button><input className="location-input" aria-label="Harbour or waterbody" value={context.location.source === "manual" ? context.location.label : ""} onChange={(event) => update({ location: { source: "manual", label: event.target.value } })} placeholder="Harbour or waterbody" /></div><p className="location-status" aria-live="polite">{locationStatus || context.location.label}</p></div>

          <div className="form-row"><label className="form-group"><span className="input-label">Language</span><OrcaSelect ariaLabel="Language" value={context.language} options={languageOptions.map((language) => ({ value: language, label: language }))} onValueChange={(value) => update({ language: value })} /></label><label className="form-group"><span className="input-label">Experience</span><OrcaSelect ariaLabel="Experience" value={context.experience} options={experienceOptions} onValueChange={(value) => update({ experience: value as Experience })} /></label></div>

          <div className="form-row"><label className="form-group"><span className="input-label">Fishing mode</span><OrcaSelect ariaLabel="Fishing mode" value={context.vessel.type} options={fishingModeOptions} onValueChange={(value) => update({ vessel: { ...context.vessel, type: value } })} /></label><label className="form-group"><span className="input-label">Boat name</span><input className="field" value={context.vessel.name} onChange={(event) => update({ vessel: { ...context.vessel, name: event.target.value } })} placeholder="Optional" /></label></div>

          <div className="form-row"><label className="form-group"><span className="input-label">Length (ft)</span><input className="field" inputMode="decimal" value={context.vessel.lengthFeet} onChange={(event) => update({ vessel: { ...context.vessel, lengthFeet: event.target.value } })} placeholder="Optional" /></label><label className="form-group"><span className="input-label">Distance (km)</span><input className="field" inputMode="decimal" value={context.distanceKm ?? ""} onChange={(event) => update({ distanceKm: event.target.value ? Number(event.target.value) : undefined })} placeholder="Optional" /></label></div>

          <div className="form-row"><label className="form-group"><span className="input-label">Planned departure</span><input className="field" type="datetime-local" value={localDateTimeValue(context.departureAt)} onChange={(event) => update({ departureAt: isoDateTimeValue(event.target.value) })} /></label><label className="form-group"><span className="input-label">Expected return</span><input className="field" type="datetime-local" value={localDateTimeValue(context.returnAt)} onChange={(event) => update({ returnAt: isoDateTimeValue(event.target.value) })} /></label></div>

          <label className="form-group"><span className="input-label">Usual trip timing</span><OrcaSelect ariaLabel="Usual trip timing" value={context.tripTiming} options={timingOptions} onValueChange={(value) => update({ tripTiming: value as TripTiming })} /></label>

          <button type="button" className="primary-button profile-submit" onClick={save}>Save profile</button>
          <p className="save-status" aria-live="polite">{saved ? "Profile saved." : ""}</p>
        </div>
      )}
    </section>
  );
}
