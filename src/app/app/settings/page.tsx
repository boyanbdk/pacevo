"use client";

import { Activity, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { UserSettings } from "@/domain/workout-schema";
import { getSettings, saveSettings } from "@/lib/storage";

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const [settings, setSettings] = useState<UserSettings>(getSettings());
  const [saved, setSaved] = useState(false);
  const stravaStatus = searchParams.get("strava");

  useEffect(() => {
    setSettings(getSettings());
  }, []);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    saveSettings(settings);
    setSaved(true);
  }

  function connectStrava() {
    window.location.href = "/api/integrations/strava/connect";
  }

  return (
    <>
      <div className="page-header">
        <div className="page-title">
          <h1>Settings</h1>
          <p>Defaults stay editable on every Pacevo workout.</p>
        </div>
      </div>
      <form className="panel stack" onSubmit={submit}>
        <div className="grid-3">
          <div className="field">
            <label>Default easy/warm-up pace</label>
            <input className="input" value={settings.defaultEasyPace} onChange={(event) => setSettings({ ...settings, defaultEasyPace: event.target.value })} />
            <span className="field-hint">Shown as your setting, not an auto-generated plan target.</span>
          </div>
          <div className="field">
            <label>Default recovery pace</label>
            <input className="input" value={settings.defaultCooldownPace} onChange={(event) => setSettings({ ...settings, defaultCooldownPace: event.target.value })} />
            <span className="field-hint">Used when you choose to show easy and recovery targets.</span>
          </div>
          <div className="field">
            <label>Default walking speed</label>
            <input className="input" type="number" step="0.1" value={settings.defaultRestWalkSpeed} onChange={(event) => setSettings({ ...settings, defaultRestWalkSpeed: Number(event.target.value) })} />
          </div>
        </div>
        <div className="grid-2">
          <div className="field">
            <label>Preferred output</label>
            <select className="select" value={settings.preferredOutputMode} onChange={(event) => setSettings({ ...settings, preferredOutputMode: event.target.value as UserSettings["preferredOutputMode"] })}>
              <option value="treadmill-time">Treadmill time-based</option>
              <option value="treadmill-distance">Treadmill distance-based</option>
              <option value="general">General running plan</option>
            </select>
          </div>
          <div className="field">
            <label>Preferred display</label>
            <select className="select" value={settings.preferredDisplayStyle} onChange={(event) => setSettings({ ...settings, preferredDisplayStyle: event.target.value as UserSettings["preferredDisplayStyle"] })}>
              <option value="table">Table</option>
              <option value="steps">Step list</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label>Intensity display mode</label>
          <select className="select" value={settings.intensityMode} onChange={(event) => setSettings({ ...settings, intensityMode: event.target.value as UserSettings["intensityMode"] })}>
            <option value="pace">Pace — show target pace per km</option>
            <option value="rpe">RPE — show perceived effort (1–10)</option>
            <option value="hr">Heart rate — show HR zone targets</option>
          </select>
          <span className="field-hint" style={{ marginTop: 4, display: "block" }}>
            Training plans respect this setting. Easy and recovery runs use heart rate or RPE unless you opt into pace targets below.
          </span>
        </div>
        <label className="check-row">
          <input
            type="checkbox"
            checked={settings.showEasyRunPaceTargets}
            onChange={(event) => setSettings({ ...settings, showEasyRunPaceTargets: event.target.checked })}
          />
          <span>Show easy and recovery pace targets</span>
        </label>
        <button className="button primary" type="submit">
          <Save size={17} />
          Save settings
        </button>
        {saved && <span className="tag">Saved</span>}
      </form>
      <section className="panel stack">
        <div className="section-heading">
          <div>
            <h2>Connected apps</h2>
            <p>Use Strava to pull completed runs into server-side storage for automatic matching.</p>
          </div>
        </div>
        <div className="action-row">
          <button className="button secondary" type="button" onClick={connectStrava}>
            <Activity size={17} />
            Connect Strava
          </button>
          {stravaStatus === "connected" && <span className="tag active-tag">Strava connected</span>}
          {stravaStatus === "denied" && <span className="tag warn">Strava connection denied</span>}
        </div>
      </section>
    </>
  );
}
