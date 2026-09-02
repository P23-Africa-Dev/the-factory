<?php

return [
    // Fallback provider if no admin override exists in platform_settings.
    'default_provider' => env('MAP_PROVIDER_DEFAULT', 'mapbox'),

    // Whether Google Places business pins are displayed on the map by default.
    // Overridden globally via the `map.poi_display` platform setting, and
    // per-organization via companies.map_poi_display_enabled. Defaults ON so
    // existing behavior is preserved until a super admin turns it off.
    'poi_display_enabled' => env('MAPS_POI_DISPLAY_ENABLED', true),
];
