import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";
import { decode as decodeBase64 } from "https://deno.land/std@0.208.0/encoding/base64.ts";
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
    const { documentId, clientName, signatureData, multiSendMode } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: doc, error: docError } = await supabase
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .single();
    if (docError || !doc) throw new Error("Document not found");

    const sigPositionRaw = doc.signature_position || "bottom";
    const datePositionRaw = doc.date_position || "bottom";

    const { data: settings } = await supabase
      .from("settings")
      .select("*")
      .eq("user_id", doc.user_id)
      .limit(1)
      .single();

    const senderEmail = settings?.sender_email || "noreply@example.com";

    // Parse receiver emails (may be JSON array or plain string)
    let receiverEntries: Array<{ email: string; enabled: boolean }> = [];
    let resolvedMultiSendMode = multiSendMode || "multiple";
    try {
      const parsed = JSON.parse(settings?.receiver_email || "");
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && parsed.entries) {
        receiverEntries = parsed.entries;
        if (!multiSendMode) resolvedMultiSendMode = parsed.multiSendMode || "multiple";
      } else if (Array.isArray(parsed)) {
        receiverEntries = parsed;
      } else {
        receiverEntries = [{ email: settings?.receiver_email || "", enabled: true }];
      }
    } catch {
      receiverEntries = settings?.receiver_email ? [{ email: settings.receiver_email, enabled: true }] : [];
    }

    const activeReceivers = receiverEntries.filter((r) => r.enabled && r.email.trim());
    if (!activeReceivers.length) throw new Error("Receiver email not configured");

    const apiKey = settings?.email_api_key;
    if (!apiKey) throw new Error("Email API key not configured in settings");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const provider = ((settings as any)?.email_provider as string) || "sendgrid";

    // Get PDF file
    const { data: fileData, error: fileError } = await supabase.storage
      .from("documents")
      .download(doc.file_path);
    if (fileError || !fileData) throw new Error("Failed to download document");

    const pdfBytes = new Uint8Array(await fileData.arrayBuffer());
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const now = new Date();
    const dateStr = `${now.getDate().toString().padStart(2, "0")}/${(now.getMonth() + 1).toString().padStart(2, "0")}/${now.getFullYear()}`;

    // Parse signature position
    let sigPage, sigX, sigY;
    try {
      const pos = JSON.parse(sigPositionRaw);
      const pageIndex = Math.min(pos.page || 0, pages.length - 1);
      sigPage = pages[pageIndex];
      const { width: pw, height: ph } = sigPage.getSize();
      sigX = pw * pos.xRatio;
      sigY = ph * (1 - pos.yRatio);
    } catch {
      sigPage = pages[pages.length - 1];
      sigX = 40;
      sigY = 75;
    }

    // Parse date position
    let datePage, dateX, dateY;
    try {
      const pos = JSON.parse(datePositionRaw);
      const pageIndex = Math.min(pos.page || 0, pages.length - 1);
      datePage = pages[pageIndex];
      const { width: pw, height: ph } = datePage.getSize();
      dateX = pw * pos.xRatio;
      dateY = ph * (1 - pos.yRatio);
    } catch {
      datePage = pages[pages.length - 1];
      dateX = 40;
      dateY = 40;
    }

    if (signatureData.startsWith("data:image")) {
      const base64Data = signatureData.split(",")[1];
      const sigBytes = decodeBase64(base64Data);
      const sigImage = await pdfDoc.embedPng(sigBytes);
      const sigDims = sigImage.scale(0.5);
      const maxWidth = 200;
      const maxHeight = 70;
      const scale = Math.min(maxWidth / sigDims.width, maxHeight / sigDims.height, 1);
      sigPage.drawImage(sigImage, {
        x: sigX - (sigDims.width * scale) / 2,
        y: sigY - (sigDims.height * scale) / 2,
        width: sigDims.width * scale,
        height: sigDims.height * scale,
      });
    }

    datePage.drawText(dateStr, {
      x: dateX - 30,
      y: dateY - 5,
      size: 11,
      font,
      color: rgb(0.15, 0.15, 0.15),
    });

    const signedPdfBytes = await pdfDoc.save();
    const signedPdfBase64 = btoa(
      new Uint8Array(signedPdfBytes).reduce((data, byte) => data + String.fromCharCode(byte), "")
    );

    const html = `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>מסמך חתום התקבל</h2>
        <p><strong>שם המסמך:</strong> ${doc.name}</p>
        <p><strong>שם הלקוח:</strong> ${clientName}</p>
        <p><strong>תאריך חתימה:</strong> ${dateStr}</p>
        <hr style="margin: 20px 0;" />
        <p style="color: #666; font-size: 13px;">המסמך החתום מצורף למייל זה. החתימה מוטבעת ישירות על גבי המסמך.</p>
      </div>
    `;

    const subject = `Signed document: ${doc.name} - ${clientName}`;
    const commonParams = {
      provider: provider as any,
      apiKey,
      senderEmail,
      subject,
      html,
      attachmentBase64: signedPdfBase64,
      attachmentFilename: `${doc.name}_signed_${clientName}.pdf`,
    };

    if (resolvedMultiSendMode === "single" && activeReceivers.length > 1) {
      // Send to first, CC the rest
      const primaryTo = activeReceivers[0].email;
      const ccList = activeReceivers.slice(1).map((r) => r.email);
      await sendViaProvider({ ...commonParams, to: primaryTo, cc: ccList });
    } else {
      // Send individual emails to each active receiver
      for (const receiver of activeReceivers) {
        await sendViaProvider({ ...commonParams, to: receiver.email });
      }
    }

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
