"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Fish, Settings2 } from "lucide-react";
import FisherProfile from "@/components/fisher-profile";
import { locationErrorMessage, requestBrowserLocation } from "@/lib/browser-location";
import {
  DEFAULT_FISHER_CONTEXT,
  FISHER_PROFILE_STORAGE_KEY,
  mergeFisherContext,
  type FisherContext,
} from "@/lib/fisher-context";

export default function FisherSettings() {
  const [context, setContext] = useState<FisherContext>(DEFAULT_FISHER_CONTEXT);
  const [hydrated, setHydrated] = useState(false);
  const [locationStatus, setLocationStatus] = useState("");
  const [isLocating, setIsLocating] = useState(false);

  useEffect(() => {
    const loadProfile = window.setTimeout(() => {
      const stored = window.localStorage.getItem(FISHER_PROFILE_STORAGE_KEY);
      if (stored) {
        try {
          setContext(mergeFisherContext(JSON.parse(stored)));
        } catch {
          setLocationStatus("Your saved profile could not be read.");
        }
      }
      setHydrated(true);
    }, 0);

    return () => window.clearTimeout(loadProfile);
  }, []);

  const updateContext = (next: FisherContext) => {
    setContext(next);
    if (hydrated) window.localStorage.setItem(FISHER_PROFILE_STORAGE_KEY, JSON.stringify(next));
  };

  const saveProfile = () => {
    window.localStorage.setItem(FISHER_PROFILE_STORAGE_KEY, JSON.stringify(context));
  };

  const locate = () => {
    if (isLocating) return;
    setIsLocating(true);
    setLocationStatus("Requesting your location…");
    void requestBrowserLocation().then(
      ({ latitude, longitude }) => {
        updateContext({ ...context, location: { source: "permission", label: "Current fishing location", latitude, longitude } });
        setIsLocating(false);
        setLocationStatus("Current location ready.");
      },
      (locationError) => {
        setIsLocating(false);
        setLocationStatus(locationErrorMessage(locationError));
      },
    );
  };

  return (
    <main className="settings-page">
      <div className="settings-board">
        <header className="settings-toolbar">
          <Link className="settings-back-link" href="/?screen=chat"><ArrowLeft size={16} strokeWidth={2} /><span>Fishing desk</span></Link>
          <Link className="settings-brand" href="/" aria-label="Orca.ai home"><span className="settings-brand-mark"><Fish size={20} strokeWidth={1.8} /></span><span>orca<span>.ai</span></span></Link>
          <span className="settings-title"><Settings2 size={15} strokeWidth={1.9} /> Settings</span>
        </header>

        <section className="settings-intro" aria-labelledby="settings-page-title">
          <span className="settings-kicker">Personalise your brief</span>
          <h1 id="settings-page-title">Your fishing profile.</h1>
          <p>Keep your water, vessel and timing ready so Orca can give you a more useful answer.</p>
        </section>

        <section className="settings-card" aria-label="Fishing profile settings">
          <FisherProfile context={context} onChange={updateContext} onLocate={locate} locationStatus={locationStatus} onSave={saveProfile} isLocating={isLocating} />
        </section>
      </div>
    </main>
  );
}
