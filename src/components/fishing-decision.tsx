export type FishingDecisionState = "go" | "caution" | "wait" | "avoid";
export type FishingDecision = { state: FishingDecisionState; title: string; detail: string; updated?: string };
export const DEFAULT_DECISION: FishingDecision = { state: "wait", title: "Awaiting your water brief", detail: "Share a location and ask Orca about the next trip. The agent will combine conditions, evidence, and your experience before giving a call.", updated: "No live brief yet" };
const states: FishingDecisionState[] = ["go", "caution", "wait", "avoid"];

export function FishingDecisionCard({ decision }: { decision: FishingDecision }) {
  return <section className="decision-card" aria-labelledby="decision-title"><div className="decision-topline"><span className="section-label">Fishing decision</span><span className="mini-label">{decision.updated ?? "Live from agent"}</span></div><div className="decision-title-row"><div><h3 id="decision-title">{decision.title}</h3><p>{decision.detail}</p></div><span className={`decision-badge ${decision.state}`}>{decision.state.toUpperCase()}</span></div><div className="decision-rail" aria-label={`Current fishing decision: ${decision.state}`}>{states.map((state) => <span key={state} className={`${state} ${state === decision.state ? "active" : ""}`} />)}</div></section>;
}
