# GameRoll

Rolls which ARC Raiders map to play next, with an optional squad challenge.

Plain static site (`index.html`, `styles.css`, `app.js`) served by nginx. No build step — open `index.html` locally to try it.

Maps and challenges live at the top of `app.js`.

## Deploy

Pushing to `main` builds the image, pushes it to `registry.k8s.sindrema.com/images/gameroll`, and bumps the tag in
`SindreMA/sindre-k8s` → `manifests/fun-stuff/gameroll-deployment.yaml`. Flux rolls it out to https://gameroll.sindrema.com.

Needs repo secrets `HARBOR_USERNAME`, `HARBOR_PASSWORD`, `GH_PAT`.
