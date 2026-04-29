import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { lat, lng } = await req.json();
    const latitude = Number(lat);
    const longitude = Number(lng);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return json({ error: "invalid_coordinates" }, 400);
    }

    const reverseUrl =
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}&zoom=18&addressdetails=1`;

    const response = await fetch(reverseUrl, {
      headers: {
        "user-agent": "sophon-driver-reverse-geocode/1.0",
      },
    });

    if (!response.ok) {
      return json({ error: `reverse_geocode_failed_${response.status}` }, 502);
    }

    const payload = await response.json();
    const address = payload?.address || {};
    const district =
      address.city_district ||
      address.suburb ||
      address.town ||
      address.city ||
      address.county ||
      "";
    const province = address.state || address.province || "";

    return json({
      district,
      province,
      displayName: payload?.display_name || "",
      address,
    });
  } catch (error) {
    return json({ error: String(error?.message || error || "reverse_geocode_failed") }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
