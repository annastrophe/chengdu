# Chengdu Ledger

A shared expense + booking tracker for the Chengdu trip (8–15 April 2027, SIN → CTU), built for two couples — Andik & Mirta and Aljufrey & Siti — to log flights, hotels, activities, transport and food, split costs (evenly or by custom amount), track who's paid whom, and see a live SGD⇄CNY converter. Same design and features as the original version, now packaged as a plain static website you host yourself, with [Supabase](https://supabase.com) as the shared database so everyone's entries sync in real time.

## 1. Create a free Supabase project

1. Go to [supabase.com](https://supabase.com) and sign up (free tier is plenty for this).
2. Click **New project**. Pick any name/region, set a database password (you won't need it day-to-day — just don't lose it), and wait ~2 minutes for it to spin up.

## 2. Create the tables

1. In your new project, open **SQL Editor** (left sidebar) → **New query**.
2. Open `supabase-schema.sql` from this folder, copy its entire contents, paste into the editor, and click **Run**.
3. This creates three tables (`trip_meta`, `entries`, `settlements`), sets up Row Level Security policies so the app can read/write them, turns on realtime sync, and seeds the trip's starting details.
4. If the last two lines (`alter publication supabase_realtime add table ...`) error out, that's just because your project already had those tables registered a different way — instead go to **Database → Replication** in the sidebar and toggle on `trip_meta`, `entries` and `settlements` there.

## 3. Connect the site to your project

1. In Supabase, open **Settings → API**.
2. Copy the **Project URL** and the **anon / public** key (not the `service_role` key — never use that one client-side).
3. Open `config.js` in this folder and paste them in:

   ```js
   window.SUPABASE_CONFIG = {
     url: 'https://your-project-ref.supabase.co',
     anonKey: 'eyJ...'
   };
   ```

That's the only file you need to edit.

## 4. Try it locally (optional)

Open `index.html` directly in a browser, or serve the folder with any static server, e.g.:

```
npx serve .
```

You should see the ledger load with the seeded trip details. Log a test entry, then open the page in a second tab — it should appear there too within a second or so.

## 5. Deploy to GitHub Pages

1. Create a new GitHub repository and push everything in this folder to it (`index.html`, `style.css`, `app.js`, `config.js` — with your real Supabase values already filled in, `supabase-schema.sql`, this `README.md`).
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to "Deploy from a branch," pick your default branch (e.g. `main`) and the `/ (root)` folder, then **Save**.
4. GitHub gives you a URL like `https://yourusername.github.io/your-repo-name/` within a minute or two. That's your shareable link.

Send that link to Andik & Mirta and Aljufrey & Siti — anyone who opens it can log entries, and everyone sees the same live ledger.

## How sharing works (read this)

There's no login. Whoever has the site's URL can view and edit everything — that's controlled by the Supabase `anon` key embedded in `config.js`, which is meant to be public-ish by design (security comes from the Row Level Security policies, not from hiding the key). This is the same trust model as a shared spreadsheet: fine for a link you send directly to your tripmates, but don't post the URL somewhere public. If you ever want real per-person accounts and access control, Supabase Auth (magic-link email sign-in) is the natural next step — ask if you want help wiring that up.

## Customizing

- **Couples / categories**: edit the `COUPLES` and `CATEGORIES` arrays near the top of `app.js`.
- **Trip name, dates, route, exchange rate**: editable from the app itself via the gear icon, or change the seed values in `supabase-schema.sql` before first running it.
- **Design**: all styling lives in `style.css`; fonts are loaded from Google Fonts in `index.html`.

## Files in this folder

| File | Purpose |
|---|---|
| `index.html` | Page structure |
| `style.css` | All styling |
| `app.js` | App logic + Supabase data layer |
| `config.js` | **Edit this** — your Supabase URL + anon key |
| `supabase-schema.sql` | Run once in Supabase's SQL Editor to set up tables |
| `README.md` | This file |
