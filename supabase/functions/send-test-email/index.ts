// 📁 supabase/functions/send-test-email/index.ts

// deno-lint-ignore-file no-explicit-any no-unused-vars
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// @ts-ignore - URL imports are valid in Deno
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendViaProvider } from "../_shared/email-sender.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// @ts-ignore - Deno is globally available in edge runtime
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // @ts-ignore - Deno is globally available in edge runtime
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    // @ts-ignore - Deno is globally available in edge runtime
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { provider, apiKey: rawApiKey, senderEmail, receiverEmail } = await req.json();

    if (!provider || !rawApiKey || !senderEmail || !receiverEmail) {
      throw new Error("חסרים פרמטרים: provider, apiKey, senderEmail, receiverEmail");
    }

    // Resolve saved API key if placeholder is passed
    let apiKey = rawApiKey;
    if (rawApiKey === "__use_saved__") {
      const authHeader = req.headers.get("authorization") || "";
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      if (!user) throw new Error("לא מחובר - לא ניתן לאחזר משמע API שמור");
      const { data: settings } = await supabase
        .from("settings")
        .select("email_api_key")
        .eq("user_id", user.id)
        .limit(1)
        .single();
      if (!settings?.email_api_key) throw new Error("לא נמצא משמע API שמור - יש להגדיר");
      apiKey = settings.email_api_key;
    }

    const html = `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">✓ מייל בדיקה – הצליח!</h2>
        <p>זהו מייל בדיקה שנשלח ממערכת החתימה הדיגיטלית.</p>
        <p>ההגדרות שלך עובדות כמו שצריך עם שירות <strong>${provider}</strong>.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
        <p style="color:#888;font-size:12px;">מייל זה נשלח בעת בדיקת ההגדרות של המערכת.</p>
      </div>
    `;

    await sendViaProvider({
      provider: provider as any,
      apiKey,
      senderEmail,
      to: receiverEmail,
      subject: "מייל בדיקה – מערכת חתימה דיגיטלית",
      html,
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Test email error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});