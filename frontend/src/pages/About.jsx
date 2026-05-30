import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useReference } from "../context/Reference";
import { useApi, apiSend } from "../lib/api";
import { getToken } from "../lib/session";
import WhatsAppButton from "../components/WhatsAppButton";
import KidGoMark from "../components/KidGoMark";

// WhatsApp contact QR — scanning it in the WhatsApp app adds the bot (PRD §4.1, §8).
const BOT_QR_URL =
  import.meta.env.VITE_BOT_QR_URL || "https://wa.me/qr/FVDNWYDE2CR2N1";

export default function About() {
  const { groups, spots } = useReference();

  // When opened from a manage link, the stored token logs the parent in — show
  // their (editable) profile instead of the generic intro.
  const loggedIn = !!getToken();
  const { data: fetchedMe } = useApi(loggedIn ? "/api/me" : null);
  const [me, setMe] = useState(null);
  useEffect(() => setMe(fetchedMe), [fetchedMe]);

  return (
    <div className="px-4 py-6 sm:px-6 md:py-10">
      {me && (
        <section className="mx-auto mb-6 max-w-2xl md:mb-10">
          <ProfileCard me={me} groups={groups} onSaved={setMe} />
        </section>
      )}

      <section className="mx-auto max-w-2xl rounded-2xl bg-gradient-to-b from-brand-100 to-white p-6 text-center shadow-sm ring-1 ring-slate-100 dark:from-slate-800 dark:to-slate-800 dark:ring-slate-700 md:p-8">
        <KidGoMark className="mx-auto h-20 w-20 drop-shadow-sm md:h-24 md:w-24" />
        <h1 className="mt-3 text-2xl font-extrabold tracking-tight md:text-3xl">
          <span className="text-slate-800 dark:text-slate-100">Kid</span>
          <span className="text-brand-600 dark:text-brand-400">Go</span>
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 md:text-base">
          Help parents find playmates and activities for same-age kids in
          Maastricht.
        </p>
        <div className="mx-auto mt-5 max-w-xs">
          <WhatsAppButton
            label="Add the bot on WhatsApp"
            message="Hi KidGo! I'd like to join."
          />
        </div>
        {/* Scan in the WhatsApp app to add the bot as a contact (PRD §4.1, §8). */}
        <a
          href={BOT_QR_URL}
          target="_blank"
          rel="noreferrer"
          className="mx-auto mt-4 block w-fit rounded-xl border-2 border-brand-200 bg-white p-3 dark:border-slate-600"
        >
          <QRCodeSVG
            value={BOT_QR_URL}
            size={128}
            level="M"
            className="h-32 w-32"
          />
        </a>
        <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
          Scan to talk
        </p>
      </section>

      <section className="mt-6 md:mt-10">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          How it works
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            {
              icon: "✍️",
              title: "Post in one sentence",
              body: "“Saturday 2pm, sandbox at Stadspark” — no forms.",
            },
            {
              icon: "⚡",
              title: "Smart match",
              body: "We find families nearby, at a similar time, in the same stage.",
            },
            {
              icon: "🔒",
              title: "Safe by default",
              body: "Contact details are shared only when both sides want to.",
            },
          ].map((s) => (
            <div
              key={s.title}
              className="flex gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100 dark:bg-slate-800 dark:ring-slate-700 sm:flex-col"
            >
              <span className="text-2xl">{s.icon}</span>
              <div>
                <p className="font-bold text-slate-800 dark:text-slate-100">
                  {s.title}
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {s.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 md:mt-10">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Developmental stages
        </h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <div
              key={g.id}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 ring-1 ${g.color}`}
            >
              <span className="text-xl">{g.emoji}</span>
              <span className="font-bold">{g.name}</span>
              <span className="ml-auto text-sm opacity-70">{g.range}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 md:mt-10">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Popular spots
        </h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {spots.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-100 dark:bg-slate-800 dark:ring-slate-700"
            >
              <div>
                <p className="font-semibold text-slate-800 dark:text-slate-100">
                  {s.name}
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  {s.type}
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-700 dark:text-slate-300">
                📍 {s.area}
              </span>
            </div>
          ))}
        </div>
      </section>

      <p className="mt-8 text-center text-xs text-slate-400 dark:text-slate-500 md:mt-12">
        English · Maastricht 🇳🇱
      </p>
    </div>
  );
}

/** Logged-in profile: view + inline edit (nickname, city, stages). */
function ProfileCard({ me, groups, onSaved }) {
  const [editing, setEditing] = useState(false);
  const stages = (me.interests || [])
    .map((id) => groups.find((g) => g.id === id))
    .filter(Boolean);

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100 dark:bg-slate-800 dark:ring-slate-700">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-brand-100 text-lg font-bold text-brand-700 dark:bg-brand-500/20 dark:text-brand-200">
            {me.nickname[0]}
          </span>
          <div>
            <p className="text-lg font-extrabold text-slate-900 dark:text-slate-100">{me.nickname}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">📍 {me.city}</p>
          </div>
        </div>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="rounded-full bg-slate-100 px-3.5 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
          >
            ✏️ Edit
          </button>
        )}
      </div>

      {!editing && (
        <div className="mt-4">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Following stages
          </p>
          <div className="flex flex-wrap gap-1.5">
            {stages.length ? (
              stages.map((g) => (
                <span key={g.id} className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${g.color}`}>
                  {g.emoji} {g.name}
                </span>
              ))
            ) : (
              <span className="text-sm text-slate-400 dark:text-slate-500">No stages set yet.</span>
            )}
          </div>
        </div>
      )}

      {editing && (
        <ProfileForm
          me={me}
          groups={groups}
          onDone={(updated) => {
            if (updated) onSaved(updated);
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}

function ProfileForm({ me, groups, onDone }) {
  const [nickname, setNickname] = useState(me.nickname);
  const [city, setCity] = useState(me.city);
  const [interests, setInterests] = useState(me.interests || []);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const toggle = (id) =>
    setInterests((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]));

  async function save() {
    if (!nickname.trim()) {
      setErr("Name can't be empty.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const updated = await apiSend("PATCH", "/api/me", {
        body: { nickname: nickname.trim(), city: city.trim(), interests },
      });
      onDone(updated);
    } catch (e) {
      setErr(e.message);
      setSaving(false);
    }
  }

  const input =
    "w-full rounded-xl bg-white px-3 py-2.5 text-sm text-slate-800 outline-none ring-1 ring-slate-200 focus:ring-brand-400 dark:bg-slate-900 dark:text-slate-100 dark:ring-slate-600";

  return (
    <div className="mt-4 space-y-3">
      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Name</span>
        <input className={input} value={nickname} onChange={(e) => setNickname(e.target.value)} />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">City</span>
        <input className={input} value={city} onChange={(e) => setCity(e.target.value)} />
      </label>

      <div>
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Stages (tap to toggle — you'll get matches for each)
        </span>
        <div className="flex flex-wrap gap-1.5">
          {groups.map((g) => {
            const on = interests.includes(g.id);
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => toggle(g.id)}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold ring-1 transition ${
                  on
                    ? "bg-brand-500 text-white ring-brand-500"
                    : "bg-white text-slate-600 ring-slate-200 hover:ring-brand-300 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-600"
                }`}
              >
                {g.emoji} {g.name}
              </button>
            );
          })}
        </div>
      </div>

      {err && <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">{err}</p>}

      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-full bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        <button
          onClick={() => onDone(null)}
          disabled={saving}
          className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-600 dark:hover:bg-slate-700"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
