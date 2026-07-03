/**
 * URL parameter parsing for the Visual Merchandiser.
 *   ?store=<id|N>   deterministic boutique selection / seed
 *   ?hud=1          boot with the debug HUD open (tooling)
 *   ?nogate=1       skip the browser gate (escape hatch)
 *   ?lat=<deg>      daylight-portal latitude preset (31.2 Shanghai default)
 */

export interface VMParams {
  store: string | null;
  hud: boolean;
  nogate: boolean;
  latitude: number;
}

export function parseParams(search: string = window.location.search): VMParams {
  const q = new URLSearchParams(search);
  const lat = parseFloat(q.get("lat") ?? "");
  return {
    store: q.get("store"),
    hud: q.get("hud") === "1",
    nogate: q.get("nogate") === "1",
    latitude: Number.isFinite(lat) ? lat : 31.2,
  };
}
