"use client";

import { Save } from "lucide-react";
import { useEffect, useState } from "react";
import type { UserSettings } from "@/domain/workout-schema";
import { getSettings, saveSettings } from "@/lib/storage";

export default function SettingsPage() {
  const [settings, setSettings] = useState<UserSettings>(getSettings());
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSettings(getSettings());
  }, []);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    saveSettings(settings);
    setSaved(true);
  }

  return (
    <>
      <div className="page-header">
        <div className="page-title">
          <h1>Settings</h1>
          <p>Defaults stay editable on every workout.</p>
        </div>
      </div>
      <form className="panel stack" onSubmit={submit}>
        <div className="grid-3">
          <div className="field">
            <label>Default easy/warm-up pace</label>
            <input className="input" value={settings.defaultEasyPace} onChange={(event) => setSettings({ ...settings, defaultEasyPace: event.target.value })} />
          </div>
          <div className="field">
            <label>Default cool-down pace</label>
            <input className="input" value={settings.defaultCooldownPace} onChange={(event) => setSettings({ ...settings, defaultCooldownPace: event.target.value })} />
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
        <button className="button primary" type="submit">
          <Save size={17} />
          Save settings
        </button>
        {saved && <span className="tag">Saved</span>}
      </form>
    </>
  );
}
