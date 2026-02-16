import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_ANON_KEY")!
);

serve(async (req) => {
  const { name, email, business_name, problem } = await req.json();

  if (!name || !email || !business_name || !problem) {
    return new Response("Missing required fields", { status: 400 });
  }

  const { error } = await supabase.from("teaser_insights").insert([
    {
      name,
      email,
      business_name,
      problem,
      status: "demo",
      experience_type: "teaser",
    },
  ]);

  if (error) {
    return new Response("Failed to insert into teaser_insights", { status: 500 });
  }

  // In real setup, this is where .cjs would trigger and return URL
  const dummyAudioUrl = `https://example.com/audio/fake-insight.mp3`;

  return new Response(JSON.stringify({ audio_url: dummyAudioUrl }), {
    headers: { "Content-Type": "application/json" },
  });
});
