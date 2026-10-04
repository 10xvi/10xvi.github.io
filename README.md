# 10X Vital Intelligence

Website of 10X Vital Intelligence, an initiative for a new paradigm in vitality and medicine. Served with GitHub Pages at https://10x.vi/ (also https://10xvi.github.io/).

| Path | Page |
| --- | --- |
| `/` | Home. Shows the "Guest Area" password screen first. |
| `/blank/` | The Wix "test" page: the POD.AGI interactive interface plus the site footer. |

The password screen is cosmetic. Everything on the home page is in this public repo, so anyone can read it without the password. Only a SHA-256 hash of the password is stored in `index.html`.

No build step: plain HTML. Tailwind, Lucide and Three.js load from CDNs. The POD.AGI page reads its sensor and actuator data from the published Google Sheet referenced in `blank/pod.html`.

The Wix Madefor fonts in `assets/fonts/` are licensed under the SIL Open Font License (`assets/fonts/OFL.txt`).
