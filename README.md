# 🍎 Munch — Family Food Journal

A voice-powered food journal for kids and families. Kids tap a button, speak what they ate, and Munch (powered by Claude AI) asks a few quick follow-up questions and saves everything automatically.

## Features

- 🎙️ **Voice-first** — tap the big button and talk
- 🤖 **AI conversation** — Claude asks the right questions naturally
- 📱 **Works on iPhone & Android** — any browser, no app download
- 📊 **Admin dashboard** — view all entries, filter by person, export to CSV
- 💾 **SQLite storage** — simple, reliable, no external database needed

---

## Quick Start (Local)

### 1. Get a Claude API key

Go to [console.anthropic.com](https://console.anthropic.com), sign up, and create an API key.

### 2. Install dependencies

```bash
# Install server deps
npm install

# Install client deps
cd client && npm install && cd ..
```

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY
```

### 4. Run in development

```bash
npm run dev
```

This starts:
- Server on `http://localhost:3001`
- React app on `http://localhost:5173`

Open `http://localhost:5173` on any device on your WiFi network using your computer's local IP address (e.g., `http://192.168.1.x:5173`).

---

## Deploy to Railway (Cloud)

Railway gives you a free cloud deployment so the app works anywhere, not just at home.

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
# Create a repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/food-journal.git
git push -u origin main
```

### 2. Deploy on Railway

1. Go to [railway.app](https://railway.app) and sign in with GitHub
2. Click **New Project → Deploy from GitHub repo**
3. Select your `food-journal` repo
4. Railway will detect it's a Node.js app automatically

### 3. Add environment variables

In Railway dashboard → your service → **Variables** tab:

```
ANTHROPIC_API_KEY = your_api_key_here
NODE_ENV = production
```

### 4. Add persistent storage for the database

In Railway dashboard:
1. Click **+ New** → **Volume**
2. Mount it at `/data`
3. Add this environment variable: `DATABASE_PATH = /data/food-journal.db`

### 5. Your app is live!

Railway gives you a URL like `https://food-journal-production.up.railway.app`.

Bookmark it on your kids' devices and add to the home screen:
- **iPhone**: Open in Safari → Share → "Add to Home Screen"
- **Android**: Open in Chrome → Menu → "Add to Home Screen"

---

## Using the App

### Kids' view (main page `/`)

1. Tap the big purple circle
2. Speak what you ate — e.g. *"I had a grilled cheese sandwich"*
3. Munch will ask follow-up questions (meal type, time)
4. When done: *"That's all"* or *"Goodbye"*

### Admin view (`/admin`)

- See all entries grouped by date
- Filter by person
- Click **⬇️ CSV** to download a spreadsheet for analysis

### Analyzing the data

When someone isn't feeling well, open the CSV in Excel or Numbers and look for patterns:
- Filter by the person's name
- Look at what they ate 12–48 hours before they felt unwell
- Repeated foods that precede symptoms are worth noting

---

## Project Structure

```
food-journal/
├── src/
│   ├── server.ts       # Express API server
│   ├── claude.ts       # Claude AI conversation logic
│   └── database.ts     # SQLite storage
├── client/
│   ├── src/
│   │   ├── App.tsx     # Voice journal UI
│   │   ├── Admin.tsx   # Entries dashboard
│   │   ├── api.ts      # API client
│   │   └── main.tsx    # Router
│   └── vite.config.ts
├── .env.example
└── package.json
```

---

## Tips

- **Multiple kids**: Each child says their name to Munch at the start — entries are saved per person
- **Text mode**: Tap "⌨️ Type instead" if voice isn't working or for quiet situations
- **Export regularly**: Download the CSV periodically and save it somewhere safe
- **Add to home screen**: Makes it feel like a real app on the kids' devices

---

## Troubleshooting

**Voice not working on iPhone?**
- Use Safari (not Chrome) on iOS
- When prompted, allow microphone access
- Make sure the page is served over HTTPS (Railway handles this automatically)

**Voice not working on Android?**
- Use Chrome
- Check that microphone permissions are granted in Chrome settings

**Entries not saving after deploy?**
- Make sure you added the Railway volume and set `DATABASE_PATH=/data/food-journal.db`
- Without a volume, data resets on every deploy
