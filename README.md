# Opening Coach

A simple app for learning beginner chess openings. At every position you see the candidate moves for the side to move, each with a verdict (Best / Good / Playable / Dubious / Mistake) and a short list of pros and cons. Play a move to see how the position develops and what the next choices are.

**Lessons**

| Start here | Openings for White | Openings for Black |
|---|---|---|
| First Moves (opening principles) | Italian Game, Ruy Lopez, Queen's Gambit, London System | Sicilian, French, Caro-Kann, Stop Early Queen Attacks |

The lessons include classic traps (Fried Liver, Blackburne Shilling, Elephant, Lasker, the Caro-Kann smothered mate and Scholar's Mate), so you learn both how to set them and how to avoid them.

**Modes**

- **Explore**: every option is listed with its pros and cons, and arrows on the board show each one. Tap an option to play it, or move a piece yourself.
- **Practice**: the app plays your opponent and picks from the lesson's replies, sometimes the bad ones, so you get to punish mistakes. You find your own moves, with a score, hints, and "take back & try again".
- If you play a move the lesson doesn't cover, the **coach** comments on it using opening principles. It checks development, the centre, early queen moves, moving a piece twice, pieces left hanging, missed captures, and mate-in-one threats.

Progress is saved on the device. "Next unexplored line" takes you to the branches you haven't seen yet.

## Install on a Pixel 7 (or any Android 8+ phone)

1. Every push builds the app with GitHub Actions (see `.github/workflows/android.yml`) and publishes it as the **`latest-apk`** release.
2. On the phone, open the repository's **Releases** page → *Opening Coach (latest build)* → download **`OpeningCoach.apk`**.
3. Open the downloaded file. If Android asks, allow your browser to *install unknown apps*, then tap **Install**.

If Chrome stays on "Downloading…" forever, it's stuck on its own APK safety check. Download **`OpeningCoach.zip`** instead. Then open **Files → Downloads**, tap the zip, choose **Extract**, and tap `OpeningCoach.apk`. You may need to allow *Files* to install unknown apps.

New builds use the same signing key, so they install over the old version and keep your progress.

The app works fully offline.

## Run in a browser

```sh
npm start            # serves ./web at http://localhost:8000
```

The `web/` folder is a self-contained web app with no dependencies and no build step. If you host it over HTTPS (GitHub Pages, for example), Chrome on Android can also install it to the home screen as a PWA.

## Project layout

```
web/                 the app (HTML/CSS/JS, no dependencies)
  js/chess.js        chess rules: legal moves, SAN, check/mate
  js/coach.js        principle-based comments on any move
  js/lessons.js      the opening trees and all commentary
  js/app.js          UI
android/             minimal WebView wrapper; bundles web/ as assets
test/                engine perft tests + a validator that replays every lesson line
```

### Adding or editing lessons

Lessons in `web/js/lessons.js` are trees. `P(description, ...moves)` is a position, and `M(san, tag, note, pros, cons, nextPosition)` is a candidate move. Run `npm test` afterwards: it replays every line and fails if a move is illegal or not written in standard notation (e.g. a missing `+`).

## Credits

Piece images: "cburnett" set by Colin M.L. Burnett, licensed CC BY-SA 3.0 (via lichess.org).
