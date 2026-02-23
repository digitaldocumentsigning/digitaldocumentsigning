import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendViaProvider } from "../_shared/email-sender.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { to, documentName, link } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await supabase.auth.getUser(token);

    let senderEmail = "noreply@example.com";
    let apiKey = "";
    let provider = "sendgrid";

    if (user) {
      const { data: settings } = await supabase
        .from("settings")
        .select("sender_email, email_api_key, email_provider")
        .eq("user_id", user.id)
        .limit(1)
        .single();
      if (settings?.sender_email) senderEmail = settings.sender_email;
      if (settings?.email_api_key) apiKey = settings.email_api_key;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((settings as any)?.email_provider) provider = (settings as any).email_provider;
    }

    if (!apiKey) throw new Error("Email API key not configured in settings");

    const html = `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>שלום,</h2>
        <p>נשלח אליך מסמך לחתימה: <strong>${documentName}</strong></p>
        <p>אנא לחץ על הכפתור למטה כדי לצפות ולחתום על המסמך:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${link}" style="background-color: #2563eb; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: bold;">
            צפייה וחתימה על המסמך
          </a>
        </div>
        <p style="color: #666; font-size: 13px;">אם הכפתור לא עובד, העתק את הקישור הבא לדפדפן:<br/>${link}</p>
      </div>
    `;

    await sendViaProvider({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      provider: provider as any,
      apiKey,
      senderEmail,
      to,
      subject: `מסמך לחתימה: ${documentName}`,
      html,
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
