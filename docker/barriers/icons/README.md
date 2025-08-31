# Icons for Barriers style

Place your two PNG icons here before running the GeoServer init script:

- fixed.png  (icon for حاجز ثابت)
- mobile.png (icon for حاجز متحرك)

The Docker Compose mounts this folder into GeoServer data directory under `styles/` so the SLD can reference them by filename.
