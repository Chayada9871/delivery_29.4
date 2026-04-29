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
    const { url } = await req.json();
    const shortUrl = String(url || "").trim();

    if (!shortUrl) {
      return json({ error: "missing_url" }, 400);
    }

    const response = await fetch(shortUrl, {
      method: "GET",
      redirect: "follow",
      headers: {
        "user-agent": "sophon-driver-expand-link/1.0",
      },
    });

    const finalUrl = response.url || shortUrl;
    const coordinates = extractCoordinates(finalUrl);

    return json({
      shortUrl,
      finalUrl,
      coordinates,
    });
  } catch (error) {
    return json({ error: String(error?.message || error || "expand_failed") }, 500);
  }
});

function extractCoordinates(value: string) {
  const source = `${value} ${safeDecode(value)}`;
  const patterns = [
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /[?&]ll=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /destination=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /query=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match) {
      return {
        lat: Number(match[1]),
        lng: Number(match[2]),
      };
    }
  }

  return null;
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
