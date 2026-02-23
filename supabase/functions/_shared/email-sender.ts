// Shared email sending logic for all edge functions

export type EmailProvider =
  | "sendgrid"
  | "resend"
  | "mailgun"
  | "brevo"
  | "gmail"
  | "gmail-api-oauth2"
  | "gmail-api-service";

export interface SendEmailParams {
  provider: EmailProvider;
  apiKey: string; // for multi-field providers, this is a JSON string
  senderEmail: string;
  to: string;
  cc?: string[]; // optional CC recipients
  subject: string;
  html: string;
  attachmentBase64?: string;
  attachmentFilename?: string;
}

// Get Gmail OAuth2 access token using refresh token
async function getOAuth2AccessToken(clientId: string, clientSecret: string, refreshToken: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`OAuth2 token error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.access_token;
}

// Get Service Account access token via JWT
async function getServiceAccountAccessToken(serviceAccountJson: string): Promise<{ token: string; email: string }> {
  const sa = JSON.parse(serviceAccountJson);
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: sa.client_email,
    sub: sa.client_email,
    scope: "https://www.googleapis.com/auth/gmail.send",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  // Build JWT manually (RS256)
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" })).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const body = btoa(JSON.stringify(payload)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const signingInput = `${header}.${body}`;

  // Import private key
  const pemKey = sa.private_key.replace(/\\n/g, "\n");
  const keyData = pemKey
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const keyBytes = Uint8Array.from(atob(keyData), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyBytes,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sigBytes = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );
  const sig = btoa(String.fromCharCode(...new Uint8Array(sigBytes))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const jwt = `${signingInput}.${sig}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  if (!tokenRes.ok) throw new Error(`Service Account token error: ${tokenRes.status} ${await tokenRes.text()}`);
  const data = await tokenRes.json();
  return { token: data.access_token, email: sa.client_email };
}

// Build and send email via Gmail API (used by both OAuth2 and Service Account)
async function sendViaGmailApi(
  accessToken: string,
  senderEmail: string,
  to: string,
  subject: string,
  html: string,
  attachmentBase64?: string,
  attachmentFilename?: string,
  cc?: string[]
): Promise<void> {
  const boundary = "boundary_" + Math.random().toString(36).slice(2);
  const ccLine = cc && cc.length > 0 ? `Cc: ${cc.join(", ")}\r\n` : "";
  let rawEmail: string;

  if (attachmentBase64 && attachmentFilename) {
    rawEmail = [
      `From: ${senderEmail}`,
      `To: ${to}`,
      ...(cc && cc.length > 0 ? [`Cc: ${cc.join(", ")}`] : []),
      `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      btoa(unescape(encodeURIComponent(html))),
      "",
      `--${boundary}`,
      `Content-Type: application/pdf; name="${attachmentFilename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${attachmentFilename}"`,
      "",
      attachmentBase64,
      "",
      `--${boundary}--`,
    ].join("\r\n");
  } else {
    rawEmail = [
      `From: ${senderEmail}`,
      `To: ${to}`,
      ...(cc && cc.length > 0 ? [`Cc: ${cc.join(", ")}`] : []),
      `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,
      "MIME-Version: 1.0",
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      btoa(unescape(encodeURIComponent(html))),
    ].join("\r\n");
  }
  // suppress unused variable warning
  void ccLine;

  const encodedEmail = btoa(rawEmail).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: encodedEmail }),
  });
  if (!res.ok) throw new Error(`Gmail API error: ${res.status} ${await res.text()}`);
}

export async function sendViaProvider(params: SendEmailParams): Promise<void> {
  const { provider, apiKey, senderEmail, to, cc, subject, html, attachmentBase64, attachmentFilename } = params;

  if (provider === "sendgrid") {
    const personalization: Record<string, unknown> = { to: [{ email: to }] };
    if (cc && cc.length > 0) personalization.cc = cc.map((e) => ({ email: e }));
    const body: Record<string, unknown> = {
      personalizations: [personalization],
      from: { email: senderEmail, name: "מערכת חתימה דיגיטלית" },
      subject,
      content: [{ type: "text/html", value: html }],
    };
    if (attachmentBase64 && attachmentFilename) {
      body.attachments = [{ content: attachmentBase64, filename: attachmentFilename, type: "application/pdf", disposition: "attachment" }];
    }
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`SendGrid error: ${res.status} ${await res.text()}`);

  } else if (provider === "resend") {
    const body: Record<string, unknown> = { from: senderEmail, to, subject, html };
    if (cc && cc.length > 0) body.cc = cc;
    if (attachmentBase64 && attachmentFilename) {
      body.attachments = [{ filename: attachmentFilename, content: attachmentBase64 }];
    }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Resend error: ${res.status} ${await res.text()}`);

  } else if (provider === "mailgun") {
    const domain = senderEmail.split("@")[1];
    const form = new FormData();
    form.append("from", senderEmail);
    form.append("to", to);
    if (cc && cc.length > 0) form.append("cc", cc.join(","));
    form.append("subject", subject);
    form.append("html", html);
    if (attachmentBase64 && attachmentFilename) {
      const pdfBytes = Uint8Array.from(atob(attachmentBase64), (c) => c.charCodeAt(0));
      form.append("attachment", new Blob([pdfBytes], { type: "application/pdf" }), attachmentFilename);
    }
    const credentials = btoa(`api:${apiKey}`);
    const res = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
      method: "POST",
      headers: { Authorization: `Basic ${credentials}` },
      body: form,
    });
    if (!res.ok) throw new Error(`Mailgun error: ${res.status} ${await res.text()}`);

  } else if (provider === "brevo") {
    const body: Record<string, unknown> = {
      sender: { email: senderEmail, name: "מערכת חתימה דיגיטלית" },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    };
    if (cc && cc.length > 0) body.cc = cc.map((e) => ({ email: e }));
    if (attachmentBase64 && attachmentFilename) {
      body.attachment = [{ content: attachmentBase64, name: attachmentFilename }];
    }
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Brevo error: ${res.status} ${await res.text()}`);

  } else if (provider === "gmail") {
    const { SMTPClient } = await import("https://deno.land/x/denomailer@1.0.0/mod.ts");
    const client = new SMTPClient({
      connection: {
        hostname: "smtp.gmail.com",
        port: 587,
        tls: false,
        auth: { username: senderEmail, password: apiKey },
      },
    });
    const mailOptions: Record<string, unknown> = { from: senderEmail, to, subject, content: "auto", html };
    if (cc && cc.length > 0) mailOptions.cc = cc.join(",");
    if (attachmentBase64 && attachmentFilename) {
      mailOptions.attachments = [{ filename: attachmentFilename, content: attachmentBase64, encoding: "base64", mimeType: "application/pdf" }];
    }
    await client.send(mailOptions);
    await client.close();

  } else if (provider === "gmail-api-oauth2") {
    const { clientId, clientSecret, refreshToken } = JSON.parse(apiKey);
    const accessToken = await getOAuth2AccessToken(clientId, clientSecret, refreshToken);
    await sendViaGmailApi(accessToken, senderEmail, to, subject, html, attachmentBase64, attachmentFilename, cc);

  } else if (provider === "gmail-api-service") {
    const { serviceAccountJson, delegatedEmail } = JSON.parse(apiKey);
    const saWithDelegation = serviceAccountJson;
    // For domain-wide delegation we set sub = delegatedEmail in the JWT
    const sa = JSON.parse(saWithDelegation);
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: sa.client_email,
      sub: delegatedEmail || sa.client_email,
      scope: "https://www.googleapis.com/auth/gmail.send",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    };
    const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" })).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    const body = btoa(JSON.stringify(payload)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    const signingInput = `${header}.${body}`;
    const pemKey = sa.private_key.replace(/\\n/g, "\n");
    const keyData = pemKey.replace(/-----BEGIN PRIVATE KEY-----/, "").replace(/-----END PRIVATE KEY-----/, "").replace(/\s/g, "");
    const keyBytes = Uint8Array.from(atob(keyData), (c) => c.charCodeAt(0));
    const cryptoKey = await crypto.subtle.importKey("pkcs8", keyBytes, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
    const sigBytes = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(signingInput));
    const sig = btoa(String.fromCharCode(...new Uint8Array(sigBytes))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    const jwt = `${signingInput}.${sig}`;
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
    });
    if (!tokenRes.ok) throw new Error(`Service Account token error: ${tokenRes.status} ${await tokenRes.text()}`);
    const tokenData = await tokenRes.json();
    const sendAs = delegatedEmail || sa.client_email;
    await sendViaGmailApi(tokenData.access_token, sendAs, to, subject, html, attachmentBase64, attachmentFilename, cc);

  } else {
    throw new Error(`Unknown email provider: ${provider}`);
  }
}
