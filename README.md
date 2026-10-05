# 10X Vital Intelligence

Website of 10X Vital Intelligence, an initiative for a new paradigm in vitality and medicine. Served with GitHub Pages at https://10x.vi/ (also https://10xvi.github.io/).

| Path | Page |
| --- | --- |
| `/` | Home. Shows the "Guest Area" password screen first. |
| `/blank/` | The Wix "test" page: the POD.AGI interactive interface plus the site footer. |

The password screen is cosmetic. Everything on the home page is in this public repo, so anyone can read it without the password. Only a SHA-256 hash of the password is stored in `index.html`.

No build step: plain HTML, CSS and JavaScript.

- `index.html`: the page content and the password screen.
- `assets/css/site.css`, `assets/js/site.js`: the shared light design system (layout, type, colors, navigation, scroll reveal). Icons are Lucide icons inlined as SVG in `index.html`, so no icon script is loaded.
- `assets/widgets/`: one CSS and JS file per interactive figure (hero field, goal figures, coordination, loop, world model and safety, conversation and path). Each script finds its mount by `data-widget` and waits for the page to be unlocked before animating.
- Fonts: Space Grotesk, Inter and JetBrains Mono from Google Fonts; the password screen uses the self-hosted Wix Madefor fonts.

The POD.AGI page (`/blank/`) still loads Tailwind and Lucide from CDNs and reads its sensor and actuator data from the published Google Sheet referenced in `blank/pod.html`.

The Wix Madefor fonts in `assets/fonts/` are licensed under the SIL Open Font License (`assets/fonts/OFL.txt`).
