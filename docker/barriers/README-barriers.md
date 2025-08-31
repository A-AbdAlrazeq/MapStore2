# Barriers stack (PostGIS + GeoServer)

This folder helps you run a local DB + GeoServer and publish the `security:barriers` layer with icons and WFS-T editing.

## Prerequisites
- Docker Desktop (Windows)
- Two PNG icons you want to use for categories:
  - fixed.png (حاجز ثابت)
  - mobile.png (حاجز متحرك)

Place them in `docker/barriers/icons/` (create the folder).

## Start services
```bash
# From MapStore2/docker/
docker compose -f compose-barriers.yml up -d
```
- PostGIS: localhost:5432 (db/user/pass = mapstore/mapstore/mapstore)
- GeoServer: http://localhost:8080/geoserver (admin/geoserver)

On first PostGIS start, `db/security_barriers.sql` is executed automatically to create the schema and seed two rows.

## Initialize GeoServer (publish layer, style, WFS-T)
Run the script after GeoServer is up:
```powershell
# From MapStore2/docker/barriers/
./init-geoserver.ps1
```
This will:
- Create workspace `security`
- Create datastore pointing to the PostGIS container
- Publish feature type `barriers`
- Upload icons (if present in `icons/`) and SLD style, set it as default
- Enable WFS-T globally

## Add to MapStore
- Catalog service `Local GeoServer WMS` is already in `web/client/configs/localConfig.json`.
- In MapStore, open Catalog → add `security:barriers`.
- Use Identify and the Editing tool to add/edit points via WFS-T.

## Notes
- If you rebuild from scratch, remove the `pgdata` and `gsdata` Docker volumes to reinitialize.
- Adjust credentials/ports in `compose-barriers.yml` if needed.
