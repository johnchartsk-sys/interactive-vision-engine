export const PLACES: Record<string, { lon: number; lat: number; height: number; pitch: number }> = {
  windhoek: { lon: 17.0658, lat: -22.5609, height: 9000, pitch: -50 },
  airport: { lon: 17.4709, lat: -22.4799, height: 6000, pitch: -50 },
  okahandja: { lon: 16.9167, lat: -21.9833, height: 8000, pitch: -50 },
  "walvis bay": { lon: 14.5053, lat: -22.9576, height: 9000, pitch: -50 },
  swakopmund: { lon: 14.5266, lat: -22.6784, height: 9000, pitch: -50 },
  luderitz: { lon: 15.1594, lat: -26.6481, height: 9000, pitch: -50 },
  namibia: { lon: 17.5, lat: -22.0, height: 2200000, pitch: -90 },
};

export const ACTIONS = ["fly_to", "zoom_in", "zoom_out", "top_down", "show_rail", "hide_rail", "follow_train", "stop_following", "reset_view", "trigger_fault", "clear_fault"] as const;

export const MAP_TOOL = {
  type: "function",
  function: {
    name: "map_command",
    description: "Control the 3D Windhoek digital twin map: fly to a place, zoom, look top-down, show or hide the rail line, follow a simulated train, or reset the view. trigger_fault starts a SIMULATED axle bearing overheat (hot box) fault on a simulated train, and clear_fault clears it. Always tell the user a triggered fault is a simulation and not a real event.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: [...ACTIONS] },
        place: { type: "string", description: "For fly_to. Known: windhoek, airport, okahandja, walvis bay, swakopmund, luderitz, namibia. Any other place name is looked up by geocoder. For trigger_fault and clear_fault you may set place to 'all' for every train." },
        train: { type: "number", description: "For follow_train, trigger_fault and clear_fault: 1, 2 or 3." },
      },
      required: ["action"],
    },
  },
};

export function toMapMedia(args: Record<string, unknown>) {
  const action = String(args["action"] ?? "");
  if (!(ACTIONS as readonly string[]).includes(action)) return null;
  const place = String(args["place"] ?? "").trim().slice(0, 80);
  if (action === "fly_to" && !place) return null;
  const train = Math.min(3, Math.max(1, Math.round(Number(args["train"] ?? 1)) || 1));
  const wantsTrain = action === "follow_train" || action === "trigger_fault" || action === "clear_fault";
  const detail = wantsTrain ? (place.toLowerCase() === "all" ? "all" : String(train)) : place;
  return { type: "map" as const, action, ...(detail ? { place: detail } : {}) };
}