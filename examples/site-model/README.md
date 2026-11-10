# Example site model

Synthetic test data for the **Site model** tab. It is not a real site. Regenerate it with:

```bash
node tools/make-example-site.js
```

A 3 km S-curved embankment in GDA2020 MGA zone 56, elevations in metres AHD.

| File | Add it as | Contents |
|---|---|---|
| `ground_model_volumes.obj` | Ground model volumes | Closed output volumes, one object each: Alluvium - Soft clay (thickest under a creek at chainage 1700 m, pinching out at one end), Alluvium - Sand lens (inside the clay near chainage 1350 m), Stiff silty clay, Dense sand, Bedrock |
| `existing_ground.obj` | Existing ground surface | Topography |
| `emb_general_fill.dxf` | Embankment surface | Top of general fill (the road design surface), 3DFACE entities |
| `emb_working_platform.dxf` | Embankment surface | Top of a 0.5 m working platform, polyface mesh |
| `groundwater.dxf` | Groundwater surface | 0.4–2 m below ground |
| `alignment.geojson` | GIS layer, then *Use line* under sections | Embankment centreline |
| `pcs_zones.geojson` | GIS layer, then PCS requirement zones | Road pavement 100 mm, bridge approach 50 mm (`pcs_mm` attribute) |
| `treatment_zones.geojson` | GIS layer, then ground treatment zones | Two zones to set treatment for |

## Trying it

1. Select **Load example** so the soil units and fill materials exist. The volume and surface names match them, so the units fill in by themselves.
2. On **Calculations**, switch the plan to **Map** and add the three GeoJSON files as GIS layers.
3. On **Site model**, add the volumes, the existing ground, both embankment surfaces and the groundwater surface (choose *Surface* under Groundwater first).
4. Set a grid spacing, then select **Sample and calculate**.
5. Add the PCS and treatment zones from their GIS layers, set a treatment for each zone, and choose the centreline for the sections.
