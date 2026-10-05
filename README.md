# Opto Rank

Browser extension that lets anyone rate episodes and movies on [opto.sic.pt](https://opto.sic.pt), keep a shared count of "Momentos o7", and see everyone's results. No login.

Built for *Casados à Primeira Vista*, works on every series and movie on Opto.

![Season ranking](docs/season-ranking.png)

| 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|
| Intancável | Meh | Tancável | Vê-se bem | Cinema |

## How to use it

### Rate an episode

Open any series. Every episode card gets the average rating, a 1–5 picker and the shared **Momentos o7** box. Click a number to vote (click another to change it). Type a number in Momentos o7 and press Enter to save it for everyone.

![Rating an episode from its card](docs/rate-episode.gif)

![Episode cards](docs/episode-cards.png)

### Season ranking

Above the episode list:

- **Average per episode:** a bar chart for the selected season. Hover a bar for the details, click it to open the episode.
- **Cinemas:** the 3 best-rated episodes.
- **Fillers:** the 3 worst-rated episodes.

### At the end of an episode

In the last 2 minutes of an episode or movie, a box asks for your rating and Momentos o7. It also works in fullscreen. If you already voted, your rating is pre-selected. Click outside it, press Esc or ✕ to close it.

![End-of-episode prompt](docs/end-of-episode.gif)

### Movies

Movie pages get the average and the rating strip under the action buttons.

![Movie page](docs/movie.jpg)

## Rules

- **One vote per install per episode.** There is no login: each install gets a random anonymous ID. Voting again changes your vote.
- **Momentos o7 is one shared number (0–99) per episode.** Anyone can change it and the last edit wins. Clear the box to remove it. Every change is logged in the `momentEdits` table (install, old → new value), so vandalism can be reverted.
- **Rate limits per install:** 30 votes per minute, 300 per hour, and 30 Momentos o7 changes per hour.
- **Unreleased episodes can't be rated.** The first vote on an episode is checked against Opto's API: the episode must exist and already be released.

## How it works

```
extension/        Chrome MV3, plain JS, no build step
  content.js      reads Opto's public API (/api/v1/content/item/...) to map cards → episode IDs, injects the UI
  content.css     styles, matched to Opto's dark UI
  background.js   creates the anonymous per-install deviceId, calls Convex over HTTP
  config.js       Convex deployment URL
convex/           backend (Convex)
  schema.ts       contents (averages + shared Momentos o7 per episode) · votes (one per deviceId+episode) · momentEdits (change log)
  ratings.ts      vote (action) · getStats (query)
docs/             README images
```

The average is updated in the same transaction as the vote, so reads never scan the votes table.

## Local development

Requires Node ≥ 18.

```sh
npm install
CONVEX_AGENT_MODE=anonymous npx convex dev   # local backend at http://127.0.0.1:3210, no account needed
```

Then in Chrome go to `chrome://extensions` → enable **Developer mode** → **Load unpacked** → choose the `extension/` folder, and open any series on Opto.

After changing the extension, press reload on its card in `chrome://extensions` **and refresh the Opto tab**. Until the tab is refreshed, the old script can't reach the extension and votes fail with "A extensão foi atualizada".

## Sharing with testers

1. **Deploy the backend:** `npx convex login`, then `npx convex deploy`. Copy the production URL (`https://<name>.convex.cloud`).
2. **Point the extension at it:** put that URL in `extension/config.js` and remove `http://127.0.0.1:3210/*` from `host_permissions` in `extension/manifest.json`.
3. **Send it:**
   - **Quickest (friends):** zip the `extension/` folder. Testers unzip it, then in `chrome://extensions` turn on Developer mode → **Load unpacked**. No auto-updates: send a new zip for each change.
   - **Proper:** publish it **Unlisted** on the [Chrome Web Store](https://chrome.google.com/webstore/devconsole). Only people with the link can install it, and it updates automatically. You need a $5 one-time developer account, icons (16/48/128 px), at least one 1280×800 screenshot, and a short privacy policy (the extension stores an anonymous random ID and your votes, nothing else). Review usually takes a few days.
