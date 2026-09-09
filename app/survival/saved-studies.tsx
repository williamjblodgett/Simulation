"use client";

import { useState } from "react";
import { exportRunArchive, loadSavedRuns, type SurvivalCheckpoint } from "./survival-persistence";
import styles from "./survival-experience.module.css";

export function SavedStudies({ activeId }: { activeId: string }) {
  const [studies, setStudies] = useState<SurvivalCheckpoint[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  async function load() {
    setBusy(true);
    try { setStudies((await loadSavedRuns()).filter(s => s.runInstanceId !== activeId)); setOpen(true); }
    catch { setNotice("Saved studies could not be read. Existing records have not been changed."); }
    finally { setBusy(false); }
  }
  async function download(study: SurvivalCheckpoint) {
    setBusy(true);
    try {
      const contents = await exportRunArchive(study);
      const url = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
      const link = document.createElement("a"); link.href = url; link.download = `simulation-${study.runInstanceId}.json`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("Evidence export prepared. This does not resume or change the archived study.");
    } catch { setNotice("The export could not be read. Please retry."); }
    finally { setBusy(false); }
  }
  return <section className={styles.savedStudies}>
    <h2>Previous studies</h2><p>Device-local checkpoints and retained evidence. Opening this list does not resume a study.</p>
    <button type="button" disabled={busy} onClick={() => void load()}>{busy ? "Reading…" : open ? "Refresh saved studies" : "Browse saved studies"}</button>
    {open ? studies.length ? <ul>{studies.map(study => <li key={study.runInstanceId}><div><strong>{study.world.seedLabel}</strong><span>Policy {study.world.policyVersion ?? 1} · Day {study.world.day} · {study.world.agents.filter(a => a.alive).length} survivors</span><small>{new Date(study.savedAt).toLocaleString()} · {study.world.eventWindow.totalEvents - study.missingBefore} retained events</small></div><button type="button" disabled={busy} onClick={() => void download(study)}>Export record</button></li>)}</ul> : <p>No previous studies on this device yet.</p> : null}
    {notice ? <p role="status">{notice}</p> : null}
  </section>;
}
