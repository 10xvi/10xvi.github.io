# 10X Vital Intelligence

Static copy of [10x.vi](https://www.10x.vi/), served with GitHub Pages at https://10xvi.github.io/.

| Path | Page |
| --- | --- |
| `/` | Home. Shows the "Guest Area" password screen first, like the Wix site. |
| `/blank/` | The Wix "test" page: the POD.AGI interactive interface plus the site footer. |

The password screen is cosmetic. Everything on the home page is in this public repo, so anyone can read it without the password. Only a SHA-256 hash of the password is stored in `index.html`.

No build step: plain HTML. Tailwind, Lucide and Three.js load from CDNs, the same way the original embeds do. The POD.AGI page reads its sensor and actuator data from the published Google Sheet referenced in `blank/pod.html`.

The Wix Madefor fonts in `assets/fonts/` are licensed under the SIL Open Font License (`assets/fonts/OFL.txt`).
