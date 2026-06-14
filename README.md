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

## 1. Clone & install

```bash
git clone <REPO_URL>
cd Spells_and_Demons

# install dependencies (root app + cloud functions)
npm install
cd functions && npm install && cd ..

# log in to Firebase and select your project
firebase login
firebase use <YOUR_PROJECT_ID>
```

## 2. Firebase project setup

In the Firebase console for your own project:

- **Authentication** -> enable the **Email/Password** sign-in method.
- **Firestore** -> create a database (production mode is fine, the rules are in
  this repo).
- Copy your **web app config** into `src/lib/firebase/clientSDK.ts`
  (the `firebaseConfig` object).

## 3. Credentials (NOT in the repo)

These files contain private keys and are **git-ignored**, so you must create
your own copies. They are tied to *your* Firebase project.

**a) Service account key** — used only by the seed script (Admin SDK).
Firebase console -> Project settings -> Service accounts -> *Generate new
private key*. Save the downloaded file as:

```
functions/src/seed/serviceAccountKey.json
```

**b) Functions environment** — create `functions/.env.local` for running the
functions locally:

```
VAPID_PUBLIC_KEY="..."
VAPID_PRIVATE_KEY="..."
BACKEND_EMAIL="your-contact@email.com"
```

Generate the VAPID key pair with:

```bash
npx web-push generate-vapid-keys
```

`BACKEND_EMAIL` is any contact email (required by the Web Push protocol).
The **public** VAPID key is also used by the client to subscribe to push
notifications.

## 4. Seed the game content

The game reads its static content (spells, statuses, enemies) from Firestore.
Populate the `scrolls`, `statuses`, and `enemies` collections by running the
seed script once (needs the service account key from step 3a):

```bash
cd functions
npx ts-node --project tsconfig.json src/seed/seedData.ts
cd ..
```

## 5. Run locally

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

## 6. Deploy

```bash
# Cloud Functions read VAPID keys from Firebase Secret Manager (not .env.local),
# so set them once before the first deploy:
firebase functions:secrets:set VAPID_PUBLIC_KEY
firebase functions:secrets:set VAPID_PRIVATE_KEY
firebase functions:secrets:set BACKEND_EMAIL

# deploy functions and security rules
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
│       ├── lobby/
│       │   └── sendLobbyInviteNotification.ts
│       ├── notifications/
│       │   └── sendPushNotifications.ts
│       ├── seed/                     # needs serviceAccountKey.json (git-ignored)
│       │   └── seedData.ts           # uploads scrolls / statuses / enemies
│       ├── social/
│       │   ├── acceptFriendRequest.ts
│       │   └── sendFriendRequestNotification.ts
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
| `usernames` | username -> uid reservation (uniqueness) |
| `friendRequests` | pending / accepted friend requests |
| `lobbies` | pre-game rooms |
| `games` | active game state (written only by Cloud Functions) |
| `scrolls`, `statuses`, `enemies` | static game content (seed data) |