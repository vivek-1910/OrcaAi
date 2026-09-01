"use client";

import { useState } from "react";
import { Anchor, ArrowLeft, ArrowRight, ArrowUpRight, Check, Clock3, Droplets, Fish, LifeBuoy, LocateFixed, Sailboat, Ship, Waves } from "lucide-react";
import OrcaSelect from "@/components/orca-select";
import {
  type Experience,
  type FisherContext,
  type TripTiming,
} from "@/lib/fisher-context";

type FisherOnboardingProps = {
  initialContext: FisherContext;
  onBack: () => void;
  onComplete: (context: FisherContext) => void;
};

const languageOptions = ["English", "Hindi", "Kannada", "Tamil", "Malayalam", "Telugu", "Bengali", "Marathi", "Gujarati", "Odia", "Punjabi"];
const experienceOptions = [
  { value: "new", label: "New to fishing" },
  { value: "learning", label: "Learning" },
  { value: "regular", label: "Regular fisher" },
  { value: "expert", label: "Experienced skipper" },
];
const totalSteps = 4;
const stepTitles = ["Your water", "Your location", "Your setup", "Your brief"];

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

function hasLocation(context: FisherContext): boolean {
  return context.location.source !== "unset"
    && context.location.label.trim().length > 0
    && context.location.label !== "Add a harbour or waterbody";
}

export default function FisherOnboarding({ initialContext, onBack, onComplete }: FisherOnboardingProps) {
  const [draft, setDraft] = useState<FisherContext>(initialContext);
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [error, setError] = useState("");
  const [locationStatus, setLocationStatus] = useState("");

  const update = (patch: Partial<FisherContext>) => setDraft((current) => ({ ...current, ...patch }));
  const updateVessel = (patch: Partial<FisherContext["vessel"]>) => setDraft((current) => ({ ...current, vessel: { ...current.vessel, ...patch } }));

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocationStatus("Location is unavailable here. Enter a harbour or waterbody instead.");
      return;
    }
    setLocationStatus("Finding your current location…");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setDraft((current) => ({
          ...current,
          location: {
            source: "permission",
            label: "Current fishing location",
            latitude: coords.latitude,
            longitude: coords.longitude,
          },
        }));
        setLocationStatus("Location ready. Orca can now tailor the brief to this spot.");
        setError("");
      },
      () => setLocationStatus("Location was not shared. Add a harbour or waterbody manually."),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  };

  const goNext = () => {
    if (step === 2 && !hasLocation(draft)) {
      setError("Add a harbour, waterbody, or share your current location to continue.");
      return;
    }
    setError("");
    if (step === totalSteps) {
      onComplete(draft);
      return;
    }
    setDirection("forward");
    setStep((current) => current + 1);
  };

  const goBack = () => {
    setError("");
    if (step === 1) {
      onBack();
      return;
    }
    setDirection("back");
    setStep((current) => current - 1);
  };

  const stepContentClass = `onboarding-step-content ${direction === "forward" ? "step-forward" : "step-back"}`;

  return (
    <main className="onboarding-page">
      <div className="onboarding-shell">
        <header className="onboarding-toolbar">
          {step === 1 ? (
            <button type="button" className="onboarding-brand-home" onClick={onBack} aria-label="Back to Orca.ai launch page">
              <span className="launch-brand-mark"><Fish size={20} strokeWidth={1.8} /></span>
              <span className="onboarding-brand-name">orca<span>.ai</span></span>
            </button>
          ) : (
            <button type="button" className="onboarding-nav-button" onClick={goBack}><ArrowLeft size={16} strokeWidth={2} /><span>Back</span></button>
          )}

          <div className="onboarding-progress-pill" aria-label={`Step ${step} of ${totalSteps}`}>
            <span className="onboarding-progress-title">{stepTitles[step - 1]}</span>
            <div className="onboarding-progress-track">{Array.from({ length: totalSteps }, (_, index) => <span key={index} className={index + 1 <= step ? "is-active" : ""} />)}</div>
            <span className="onboarding-progress-count">0{step} / 0{totalSteps}</span>
          </div>

          <button type="button" className="onboarding-nav-button onboarding-next-button" onClick={goNext}><span>{step === totalSteps ? "Enter desk" : "Next"}</span><ArrowRight size={16} strokeWidth={2} /></button>
        </header>

        <section className="onboarding-center-card" aria-labelledby="onboarding-title">
          <div className={`onboarding-card-heading ${direction === "forward" ? "step-forward" : "step-back"}`} key={step}>
            <span className="onboarding-card-kicker">{stepTitles[step - 1]}</span>
            {step === 1 && <h1 id="onboarding-title">Where do you fish?</h1>}
            {step === 2 && <h1 id="onboarding-title">Where should Orca look?</h1>}
            {step === 3 && <h1 id="onboarding-title">Tell us about your setup.</h1>}
            {step === 4 && <h1 id="onboarding-title">How should Orca brief you?</h1>}
            {step === 1 && <p>Choose the water you know best. Orca will keep your brief focused on fishing.</p>}
            {step === 2 && <p>Point Orca to the harbour, lake or waterbody where you plan to fish.</p>}
            {step === 3 && <p>Your vessel and experience help Orca keep the brief practical and conservative.</p>}
            {step === 4 && <p>Choose your language and the window you want to assess.</p>}
          </div>

          <div className={stepContentClass}>
            {step === 1 && (
              <div className="choice-grid water-choice-grid" role="group" aria-label="Fishing water type">
                <button type="button" className={`choice-card ${draft.waterMode === "marine" ? "is-selected" : ""}`} onClick={() => update({ waterMode: "marine" })} aria-pressed={draft.waterMode === "marine"}><span className="choice-symbol"><Waves size={34} strokeWidth={1.7} /></span><strong>Marine</strong><small>Coast, sea or offshore</small><span className="choice-check"><Check size={12} strokeWidth={2.5} /></span></button>
                <button type="button" className={`choice-card ${draft.waterMode === "inland" ? "is-selected" : ""}`} onClick={() => update({ waterMode: "inland" })} aria-pressed={draft.waterMode === "inland"}><span className="choice-symbol"><Droplets size={34} strokeWidth={1.7} /></span><strong>Inland</strong><small>River, lake or reservoir</small><span className="choice-check"><Check size={12} strokeWidth={2.5} /></span></button>
              </div>
            )}

            {step === 2 && (
              <div className="onboarding-location-step">
                <button type="button" className={`location-hero-button ${draft.location.source === "permission" ? "is-selected" : ""}`} onClick={requestLocation}><span className="location-hero-icon"><LocateFixed size={20} strokeWidth={1.9} /></span><span><strong>{draft.location.source === "permission" ? "Current location selected" : "Use my current location"}</strong><small>{draft.location.source === "permission" ? "Ready for this fishing brief" : "For the most accurate local brief"}</small></span><span className="location-hero-arrow"><ArrowUpRight size={18} strokeWidth={2} /></span></button>
                <div className="or-divider"><span>or enter it manually</span></div>
                <label className="onboarding-field"><span className="input-label">Harbour or waterbody</span><input className="field onboarding-field-input" aria-label="Harbour or waterbody" value={draft.location.label === "Add a harbour or waterbody" ? "" : draft.location.label} onChange={(event) => update({ location: { source: "manual", label: event.target.value } })} placeholder={draft.waterMode === "marine" ? "e.g. Mangaluru harbour" : "e.g. Kabini reservoir"} /></label>
                <p className="onboarding-location-status" aria-live="polite">{locationStatus || (hasLocation(draft) ? `Using ${draft.location.label}.` : "We need a location to check live conditions.")}</p>
                {error && <p className="onboarding-error" role="alert">{error}</p>}
              </div>
            )}

            {step === 3 && (
              <div className="onboarding-setup-step">
                <div className="onboarding-field"><span className="input-label">How do you fish?</span><div className="choice-grid setup-choice-grid">
                  {(["Small boat", "Shore / bank", "Kayak", "Commercial vessel"] as const).map((type) => <button type="button" className={`setup-choice ${draft.vessel.type === type ? "is-selected" : ""}`} key={type} onClick={() => updateVessel({ type })} aria-pressed={draft.vessel.type === type}><span>{type === "Shore / bank" ? <LifeBuoy size={19} strokeWidth={1.8} /> : type === "Kayak" ? <Sailboat size={19} strokeWidth={1.8} /> : type === "Commercial vessel" ? <Anchor size={19} strokeWidth={1.8} /> : <Ship size={19} strokeWidth={1.8} />}</span>{type}</button>)}
                </div></div>
                <div className="onboarding-form-row"><label className="onboarding-field"><span className="input-label">Experience</span><OrcaSelect ariaLabel="Experience" value={draft.experience} options={experienceOptions} onValueChange={(value) => update({ experience: value as Experience })} /></label><label className="onboarding-field"><span className="input-label">Boat length (ft)</span><input className="field" inputMode="decimal" value={draft.vessel.lengthFeet} onChange={(event) => updateVessel({ lengthFeet: event.target.value })} placeholder="Optional" /></label></div>
                <div className="onboarding-form-row"><label className="onboarding-field"><span className="input-label">Boat name</span><input className="field" value={draft.vessel.name} onChange={(event) => updateVessel({ name: event.target.value })} placeholder="Optional" /></label><label className="onboarding-field"><span className="input-label">Typical distance (km)</span><input className="field" inputMode="decimal" value={draft.distanceKm ?? ""} onChange={(event) => update({ distanceKm: event.target.value ? Number(event.target.value) : undefined })} placeholder="Optional" /></label></div>
              </div>
            )}

            {step === 4 && (
              <div className="onboarding-brief-step">
                <label className="onboarding-field"><span className="input-label">Preferred language</span><OrcaSelect ariaLabel="Preferred language" value={draft.language} options={languageOptions.map((language) => ({ value: language, label: language }))} onValueChange={(value) => update({ language: value })} /></label>
                <div className="onboarding-field"><span className="input-label">Usual trip timing</span><div className="timing-grid">{([ ["early-morning", "Early morning", "Before the first light"], ["day", "Day trip", "Out with the sun"], ["evening", "Evening", "Late water, long shadows"], ["overnight", "Overnight", "For the longer run"] ] as Array<[TripTiming, string, string]>).map(([value, title, detail]) => <button type="button" key={value} className={`timing-choice ${draft.tripTiming === value ? "is-selected" : ""}`} onClick={() => update({ tripTiming: value })} aria-pressed={draft.tripTiming === value}><Clock3 size={16} strokeWidth={1.8} aria-hidden="true" /><strong>{title}</strong><small>{detail}</small></button>)}</div></div>
                <div className="onboarding-form-row"><label className="onboarding-field"><span className="input-label">Planned departure</span><input className="field" type="datetime-local" value={localDateTimeValue(draft.departureAt)} onChange={(event) => update({ departureAt: isoDateTimeValue(event.target.value) })} /></label><label className="onboarding-field"><span className="input-label">Expected return</span><input className="field" type="datetime-local" value={localDateTimeValue(draft.returnAt)} onChange={(event) => update({ returnAt: isoDateTimeValue(event.target.value) })} /></label></div>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
