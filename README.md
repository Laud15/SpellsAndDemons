# Spells & Demons

A multiplayer, turn-based PvE web game. Players team up in a lobby and fight
waves of enemies together; between waves they pick up new spell scrolls and
level up their stats. Built as a PWA so it can be installed.

## Tech stack

- **Frontend:** SvelteKit 5 (runes) + Vite
- **PWA:** vite-plugin-pwa (`injectManifest`), custom service worker, web-push notifications
- **Backend:** Firebase — Authentication, Firestore, Cloud Functions (region `europe-west1`)

All game-state mutations go through Cloud Functions (the client never writes to
the `games` collection directly); Firestore Security Rules enforce this.

## Prerequisites

- Node.js 18+ and npm
- A Firebase project on the **Blaze** plan (Cloud Functions require it)
- Firebase CLI: `npm install -g firebase-tools`

## Setup

```bash
# 1. clone
git clone <REPO_URL>
cd Spells_and_Demons

# 2. install dependencies (root app + cloud functions)
npm install
cd functions && npm install && cd ..

# 3. log in to Firebase and select your project
firebase login
firebase use <YOUR_PROJECT_ID>
```

Then add your Firebase web config in `src/lib/firebase/clientSDK.ts`
(the `firebaseConfig` object, copied from the Firebase console).

> **Note — seed data:** the game reads its content from the Firestore
> collections `scrolls`, `statuses`, and `enemies`. These must be populated in
> Firestore for the game to work. Enable **Email/Password** authentication in
> the Firebase console as well.

## Run locally

```bash
# standard dev server (fast, hot reload) — best for working on the UI
npm run dev
```

The service worker / offline behaviour is **not** faithfully reproduced by the
dev server. To test the PWA as it behaves in production, build and run the
adapter output:

```bash
npm run build
node build/index.js     # serves on http://localhost:3000
```

## Deploy backend

After changing Cloud Functions or Security Rules:

```bash
firebase deploy --only functions
firebase deploy --only firestore:rules
```

## Project structure

```
.
├── src/
│   ├── routes/
│   │   ├── (public)/                 # pages reachable when logged out
│   │   │   ├── login/
│   │   │   ├── register/
│   │   │   └── forgot-password/
│   │   └── (protected)/              # pages behind auth guard
│   │       ├── home/                 # dashboard: create lobby, invites, friends
│   │       ├── lobby/[lobbyId]/      # lobby room
│   │       ├── game/[gameId]/        # main game screen (battlefield + HUD)
│   │       └── ranking/              # global leaderboard
│   │
│   ├── lib/
│   │   ├── firebase/                 # client-side Firebase wrappers
│   │   │   ├── clientSDK.ts          # Firebase init + config
│   │   │   ├── auth.ts               # register / login / logout / reset
│   │   │   ├── lobby.ts              # create / join / leave / invite / start
│   │   │   ├── social.ts             # friend search & requests
│   │   │   ├── game.ts               # game subscription + action calls
│   │   │   └── notification.ts       # web-push subscribe / unsubscribe
│   │   ├── stores/                   # Svelte 5 rune-based stores
│   │   │   ├── auth.svelte.ts
│   │   │   ├── lobby.svelte.ts
│   │   │   └── game.svelte.ts
│   │   ├── components/
│   │   │   ├── game/sprite.svelte    # sprite-sheet animation component
│   │   │   └── social/FriendSystem.svelte
│   │   ├── styles/                   # CSS (global.css holds shared tokens)
│   │   └── types/index.ts            # shared TypeScript types
│   │
│   ├── sw.ts                         # service worker (precache + offline fallback + push)
│   └── app.html
│
├── functions/                        # Firebase Cloud Functions (TypeScript)
│   └── src/
│       ├── game/                     # one function per game action
│       │   ├── startGame.ts
│       │   ├── performAction.ts      # player action + enemy turns
│       │   ├── chooseDrop.ts
│       │   ├── skipDrop.ts
│       │   └── levelUp.ts
│       ├── engine/                   # pure game logic
│       │   ├── combat.ts
│       │   ├── enemies.ts
│       │   └── drops.ts
│       └── types/
│
├── static/                           # served as-is
│   ├── offline.html                  # PWA offline fallback page
│   ├── sprites/                      # character / enemy sprite sheets (PNG)
│   ├── icons/                        # PWA icons
│   └── bg.png
│
├── firestore.rules                   # Firestore Security Rules
├── vite.config.ts                    # Vite + VitePWA config
└── package.json
```

### Firestore collections

| Collection | Purpose |
|------------|---------|
| `users` | profile, score, friends, presence status |
| `usernames` | username → uid reservation (uniqueness) |
| `friendRequests` | pending / accepted friend requests |
| `lobbies` | pre-game rooms |
| `games` | active game state (written only by Cloud Functions) |
| `scrolls`, `statuses`, `enemies` | static game content (seed data) |