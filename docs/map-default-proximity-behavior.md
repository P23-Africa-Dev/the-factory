# Map Default Proximity Behavior

## Summary

Map initialization no longer uses hardcoded Lagos/Ikeja coordinates.

Default map behavior now follows this priority order:

1. Active tracked agent data (live task route/position)
2. Privacy-safe regional proximity from browser geolocation
3. Country-level fallback based on locale/timezone
4. Global fallback when country cannot be inferred

## Applied Surfaces

- Dashboard map widget (`MapView` in compact mode)
- Full management map page (`MapView`)
- Full agent map page (`AgentMapView`)
- Agent task tracking map initializer (`TrackingMap` fallback path)
- Route history map fallback path

## Privacy Model

- Browser geolocation is only used to infer nearby regional context.
- Exact user coordinates are never used directly for default centering.
- A deterministic obfuscation step is applied to geolocation before centering.
- Default proximity zoom is regional, not street-level.

## Fallback Model

- If geolocation is denied/unavailable/times out, maps render a country-level viewport.
- Country is inferred from browser locale and timezone.
- No fallback path points to Lagos/Ikeja/Allen Avenue.
