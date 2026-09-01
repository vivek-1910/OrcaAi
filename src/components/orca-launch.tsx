"use client";

import Image from "next/image";
import { ArrowRight, ArrowUpRight, Fish } from "lucide-react";

type OrcaLaunchProps = {
  onNext: () => void;
};

export default function OrcaLaunch({ onNext }: OrcaLaunchProps) {
  return (
    <main className="launch-page">
      <div className="launch-board">
        <header className="launch-board-nav">
          <a className="launch-brand" href="#top" aria-label="Orca.ai home">
            <span className="launch-brand-mark"><Fish size={24} strokeWidth={1.8} /></span>
            <span>
              <span className="launch-brand-name">orca<span>.ai</span></span>
              <span className="launch-brand-kicker">fishing intelligence</span>
            </span>
          </a>
          <button type="button" className="launch-top-cta" onClick={onNext}>
            <span>Get started</span>
            <ArrowUpRight size={17} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </header>

        <section className="launch-hero" id="top">
          <div className="launch-hero-copy">
            <h1><span>READ THE</span><em>WATER</em><span>LIKE A LOCAL</span></h1>
            <div className="launch-copy-bottom">
              <p>Make a clearer call before you leave shore. Orca.ai brings your water, your vessel and the conditions ahead into one simple brief.</p>
              <button type="button" className="launch-primary" onClick={onNext}>
                <span>Start my setup</span>
                <ArrowRight size={18} strokeWidth={2.2} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="launch-art-panel" aria-label="A fisher and an orca moving through calm water">
            <Image className="launch-hero-image" src="/images/orca-launch-hero-transparent.png" alt="A fisher and an orca moving through calm blue water" fill priority sizes="(max-width: 900px) 100vw, 57vw" />
          </div>
        </section>
      </div>
    </main>
  );
}
