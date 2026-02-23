import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { ArrowRight, Save, Mail, KeyRound, CheckCircle2, Send, HelpCircle, ExternalLink, Plus, Trash2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Link } from "react-router-dom";
import type { User } from "@supabase/supabase-js";

interface ReceiverEntry {
  email: string;
  enabled: boolean;
}

type MultiSendMode = "single" | "multiple";

type EmailProvider = "sendgrid" | "resend" | "mailgun" | "brevo" | "gmail" | "gmail-api-oauth2" | "gmail-api-service";

type ProviderField = { key: string; label: string; placeholder: string; type?: string };

interface ProviderConfig {
  value: EmailProvider;
  label: string;
  placeholder: string;
  hint: string;
  fields?: ProviderField[]; // multi-field providers
}

const PROVIDERS: ProviderConfig[] = [
  {
    value: "sendgrid",
    label: "SendGrid",
    placeholder: "SG.xxxxxxxxxxxxxxxxxxxxxxxxxx",
    hint: "ניתן להפיק מ־app.sendgrid.com → Settings → API Keys",
  },
  {
    value: "resend",
    label: "Resend",
    placeholder: "re_xxxxxxxxxxxxxxxxxxxxxxxx",
    hint: "ניתן להפיק מ־resend.com → API Keys",
  },
  {
    value: "mailgun",
    label: "Mailgun",
    placeholder: "key-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    hint: "ניתן להפיק מ־app.mailgun.com → API Security — שים לב: הדומיין ייקבע לפי כתובת המייל השולח",
  },
  {
    value: "brevo",
    label: "Brevo (Sendinblue)",
    placeholder: "xkeysib-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    hint: "ניתן להפיק מ־app.brevo.com → SMTP & API → API Keys",
  },
  {
    value: "gmail",
    label: "Gmail (סיסמת אפליקציה)",
    placeholder: "xxxx xxxx xxxx xxxx",
    hint: "הפק מ־myaccount.google.com → אבטחה → אימות דו-שלבי → סיסמאות אפליקציה (App Passwords). כתובת המייל השולח חייבת להיות כתובת ה-Gmail שלך.",
  },
  {
    value: "gmail-api-oauth2",
    label: "Gmail API — OAuth2 (Gmail אישי)",
    placeholder: "",
    hint: "ב-Google Cloud Console: צור OAuth2 credentials → הוצא Refresh Token דרך OAuth Playground (oauth2.googleapis.com). מתאים לחשבון Gmail אישי.",
    fields: [
      { key: "clientId", label: "Client ID", placeholder: "xxxxxxx.apps.googleusercontent.com" },
      { key: "clientSecret", label: "Client Secret", placeholder: "GOCSPX-xxxxxxxxxxxxxxxxxxxx" },
      { key: "refreshToken", label: "Refresh Token", placeholder: "1//0exxxxxxxxxxxxxxxxxxxxxxxxxx", type: "password" },
    ],
  },
  {
    value: "gmail-api-service",
    label: "Gmail API — Service Account (Google Workspace)",
    placeholder: "",
    hint: "ב-Google Cloud Console: צור Service Account → הפעל Domain-Wide Delegation → הורד JSON Key → הדבק כאן. מתאים לארגונים עם Google Workspace.",
    fields: [
      { key: "serviceAccountJson", label: "Service Account JSON Key", placeholder: '{"type":"service_account","project_id":"...",...}', type: "textarea" },
      { key: "delegatedEmail", label: "כתובת Gmail לשליחה מטעמה (Delegated)", placeholder: "sender@yourdomain.com" },
    ],
  },
];

interface GuideStep {
  title: string;
  description: string;
  link?: { label: string; url: string };
}
interface ProviderGuide {
  title: string;
  intro: string;
  steps: GuideStep[];
  notes?: string[];
}

const PROVIDER_GUIDES: Record<EmailProvider, ProviderGuide> = {
  sendgrid: {
    title: "הגדרת SendGrid",
    intro: "SendGrid הוא שירות מייל ענן מוביל. נדרשים כ-3 דקות להגדרה.",
    steps: [
      { title: "צור חשבון", description: "הירשם בחינם ב-SendGrid (עד 100 מיילים ביום בחינם).", link: { label: "SendGrid — הרשמה", url: "https://signup.sendgrid.com/" } },
      { title: "אמת את הדומיין", description: "עבור ל-Settings → Sender Authentication → Authenticate Your Domain והגדר רשומות DNS בדומיין שלך. חלופה פשוטה: Single Sender Verification לאימות כתובת בלבד." },
      { title: "צור API Key", description: "Settings → API Keys → Create API Key. בחר 'Restricted Access' ואפשר הרשאת 'Mail Send'.", link: { label: "SendGrid API Keys", url: "https://app.sendgrid.com/settings/api_keys" } },
      { title: "הזן את המפתח כאן", description: "העתק את המפתח (מתחיל ב-SG.) והדבק בשדה המפתח בהגדרות." },
    ],
    notes: ["⚠️ בחשבון חינמי, מיילים עלולים להגיע לספאם ללא אימות דומיין.", "✅ SendGrid מספק לוג מפורט בדשבורד שלהם לניפוי שגיאות."],
  },
  resend: {
    title: "הגדרת Resend",
    intro: "Resend הוא שירות מייל מודרני עם API נוח. חינמי עד 3,000 מיילים בחודש.",
    steps: [
      { title: "צור חשבון", description: "הירשם ב-Resend.", link: { label: "Resend — הרשמה", url: "https://resend.com/signup" } },
      { title: "הוסף ואמת דומיין", description: "עבור ל-Domains → Add Domain. הוסף את רשומות ה-DNS המבוקשות בספק הדומיין שלך.", link: { label: "Resend Domains", url: "https://resend.com/domains" } },
      { title: "צור API Key", description: "עבור ל-API Keys → Create API Key. בחר הרשאת 'Sending access'.", link: { label: "Resend API Keys", url: "https://resend.com/api-keys" } },
      { title: "הזן את המפתח כאן", description: "העתק את המפתח (מתחיל ב-re_) והדבק בשדה המפתח בהגדרות." },
    ],
    notes: ["✅ ממשק ה-API של Resend ידידותי במיוחד.", "💡 ניתן לשלוח ממייל @resend.dev בחינם לבדיקות ללא אימות דומיין."],
  },
  mailgun: {
    title: "הגדרת Mailgun",
    intro: "Mailgun הוא שירות מייל לפיתוח ועסקים. חינמי עד 5,000 מיילים בחודש (3 חודשים ראשונים).",
    steps: [
      { title: "צור חשבון", description: "הירשם ב-Mailgun.", link: { label: "Mailgun — הרשמה", url: "https://signup.mailgun.com/" } },
      { title: "הוסף דומיין", description: "עבור ל-Sending → Domains → Add New Domain. הוסף את הדומיין שלך ובצע אימות DNS.", link: { label: "Mailgun Domains", url: "https://app.mailgun.com/mg/sending/domains" } },
      { title: "הפק מפתח API", description: "עבור ל-Settings → API Keys. העתק את ה-Private API Key.", link: { label: "Mailgun API Keys", url: "https://app.mailgun.com/settings/api_security" } },
      { title: "הגדר כתובת שולח", description: "כתובת המייל השולח חייבת להיות מהדומיין שהוגדר ב-Mailgun (למשל: noreply@yourdomain.com)." },
      { title: "הזן את המפתח כאן", description: "הדבק את ה-Private API Key בשדה המפתח בהגדרות." },
    ],
    notes: ["⚠️ הדומיין נקבע אוטומטית לפי כתובת המייל השולח שהזנת.", "⚠️ בחשבון Sandbox (בדיקה), ניתן לשלוח רק לכתובות שאומתו ידנית."],
  },
  brevo: {
    title: "הגדרת Brevo (לשעבר Sendinblue)",
    intro: "Brevo הוא שירות מייל שיווקי ועסקי. חינמי עד 300 מיילים ביום.",
    steps: [
      { title: "צור חשבון", description: "הירשם ב-Brevo.", link: { label: "Brevo — הרשמה", url: "https://app.brevo.com/account/register" } },
      { title: "אמת את הדומיין / השולח", description: "עבור ל-Senders & IPs → Domains → Authenticate a domain, או הוסף ואמת כתובת שולח בודדת.", link: { label: "Brevo Senders", url: "https://app.brevo.com/senders" } },
      { title: "צור API Key", description: "עבור ל-SMTP & API → API Keys → Generate a new API key.", link: { label: "Brevo API Keys", url: "https://app.brevo.com/settings/keys/api" } },
      { title: "הזן את המפתח כאן", description: "העתק את ה-API Key (מתחיל ב-xkeysib-) והדבק בשדה המפתח בהגדרות." },
    ],
    notes: ["✅ Brevo חינמי לנפחים נמוכים ואינו דורש כרטיס אשראי.", "💡 ניתן גם להשתמש בפרטי SMTP של Brevo (שרת smtp-relay.brevo.com) ישירות."],
  },
  gmail: {
    title: "הגדרת Gmail — סיסמת אפליקציה",
    intro: "שלח מיילים ישירות מחשבון Gmail אישי שלך באמצעות סיסמת אפליקציה. מתאים לשימוש אישי.",
    steps: [
      { title: "הפעל אימות דו-שלבי", description: "סיסמת אפליקציה מחייבת אימות דו-שלבי פעיל בחשבון Google שלך.", link: { label: "הגדרות אבטחה Google", url: "https://myaccount.google.com/security" } },
      { title: "צור סיסמת אפליקציה", description: "עבור ל-myaccount.google.com → אבטחה → אימות דו-שלבי (גלול למטה) → סיסמאות אפליקציה. בחר 'Mail' ו-'Windows Computer' (או כל מכשיר). לחץ Generate.", link: { label: "סיסמאות אפליקציה Google", url: "https://myaccount.google.com/apppasswords" } },
      { title: "שמור את הסיסמה", description: "Google תציג סיסמה של 16 תווים (4 קבוצות של 4). שמור אותה — היא לא תוצג שוב." },
      { title: "הגדר כתובת שולח", description: "כתובת המייל השולח חייבת להיות כתובת ה-Gmail שלך (yourname@gmail.com)." },
      { title: "הזן את הסיסמה כאן", description: "הדבק את סיסמת האפליקציה (16 תווים, עם או בלי רווחים) בשדה המפתח בהגדרות." },
    ],
    notes: ["⚠️ Gmail מגביל שליחה ל-500 מיילים ביום בחשבון אישי.", "⚠️ Google עשויה לחסום שליחה אם מזוהה שימוש חריג.", "✅ מתאים לשימוש אישי קטן — לנפחים גדולים יש להשתמש ב-Gmail API."],
  },
  "gmail-api-oauth2": {
    title: "הגדרת Gmail API — OAuth2 (Gmail אישי)",
    intro: "שלח מיילים דרך Gmail API הרשמי עם OAuth2. אמין יותר מסיסמת אפליקציה, מתאים לחשבון Gmail אישי.",
    steps: [
      { title: "צור פרויקט ב-Google Cloud", description: "פתח את Google Cloud Console וצור פרויקט חדש (או בחר קיים).", link: { label: "Google Cloud Console", url: "https://console.cloud.google.com/projectcreate" } },
      { title: "הפעל Gmail API", description: "ב-APIs & Services → Library, חפש 'Gmail API' ולחץ Enable.", link: { label: "Gmail API Library", url: "https://console.cloud.google.com/apis/library/gmail.googleapis.com" } },
      { title: "הגדר OAuth Consent Screen", description: "ב-APIs & Services → OAuth consent screen. בחר 'External'. מלא שם אפליקציה ואימייל. הוסף scope: gmail.send. הוסף את האימייל שלך ב-Test Users." },
      { title: "צור OAuth2 Credentials", description: "ב-APIs & Services → Credentials → Create Credentials → OAuth Client ID. בחר 'Web application'. הוסף Redirect URI: https://developers.google.com/oauthplayground", link: { label: "Google Credentials", url: "https://console.cloud.google.com/apis/credentials" } },
      { title: "קבל Refresh Token", description: "עבור ל-OAuth 2.0 Playground → לחץ על גלגל השיניים → סמן 'Use your own OAuth credentials' → הזן Client ID ו-Client Secret. בחר scope: https://mail.google.com/ → Authorize → Exchange code for tokens. שמור את ה-Refresh Token.", link: { label: "OAuth 2.0 Playground", url: "https://developers.google.com/oauthplayground" } },
      { title: "הזן את הפרטים כאן", description: "הזן Client ID, Client Secret ו-Refresh Token בשדות המתאימים בהגדרות." },
    ],
    notes: ["✅ Gmail API מאפשר עד 1 מיליארד בקשות ביום.", "⚠️ Refresh Token עלול לפוג אם האפליקציה לא בשימוש למשך תקופה. אם זה קורה, חזור על שלב 5.", "💡 ניתן לפשט את שלב 5 באמצעות Google OAuth Playground."],
  },
  "gmail-api-service": {
    title: "הגדרת Gmail API — Service Account (Google Workspace)",
    intro: "שלח מיילים מחשבון ארגוני Google Workspace דרך Service Account. מתאים לארגונים בלבד.",
    steps: [
      { title: "צור פרויקט ב-Google Cloud", description: "פתח Google Cloud Console וצור פרויקט חדש.", link: { label: "Google Cloud Console", url: "https://console.cloud.google.com/projectcreate" } },
      { title: "הפעל Gmail API", description: "ב-APIs & Services → Library, חפש 'Gmail API' ולחץ Enable.", link: { label: "Gmail API Library", url: "https://console.cloud.google.com/apis/library/gmail.googleapis.com" } },
      { title: "צור Service Account", description: "ב-IAM & Admin → Service Accounts → Create Service Account. תן שם ולחץ Done.", link: { label: "Service Accounts", url: "https://console.cloud.google.com/iam-admin/serviceaccounts" } },
      { title: "הורד JSON Key", description: "לחץ על ה-Service Account שיצרת → Keys → Add Key → Create new key → JSON. הקובץ יורד אוטומטית." },
      { title: "הפעל Domain-Wide Delegation", description: "בדף ה-Service Account → Show Advanced Settings → סמן 'Enable Google Workspace Domain-wide Delegation' → שמור. העתק את Client ID." },
      { title: "אשר Delegation ב-Google Workspace Admin", description: "ב-Google Workspace Admin Console: Security → API Controls → Domain-wide Delegation → Add new. הזן את ה-Client ID של ה-Service Account. ב-OAuth Scopes הוסף: https://www.googleapis.com/auth/gmail.send", link: { label: "Google Workspace Admin", url: "https://admin.google.com/ac/owl/domainwidedelegation" } },
      { title: "הזן את הפרטים כאן", description: "הדבק את תוכן ה-JSON Key בשדה המתאים. הזן את כתובת ה-Gmail הארגונית שממנה תשלח." },
    ],
    notes: ["⚠️ שיטה זו מחייבת Google Workspace (לא Gmail חינמי).", "⚠️ נדרשות הרשאות ניהול ב-Google Workspace Admin Console.", "✅ Service Account לא פג תוקף ומתאים לסביבות Production."],
  },
};

const isMultiField = (provider: EmailProvider) =>
  provider === "gmail-api-oauth2" || provider === "gmail-api-service";

const AdminSettings = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [senderEmail, setSenderEmail] = useState("");
  const [receivers, setReceivers] = useState<ReceiverEntry[]>([{ email: "", enabled: true }]);
  const [multiSendMode, setMultiSendMode] = useState<MultiSendMode>("multiple");
  const [emailProvider, setEmailProvider] = useState<EmailProvider>("sendgrid");
  const [saving, setSaving] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);

  // API key dialog state
  const [apiKeyDialogOpen, setApiKeyDialogOpen] = useState(false);
  // Single-field providers: string. Multi-field providers: Record<string,string>
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [multiFieldInputs, setMultiFieldInputs] = useState<Record<string, string>>({});
  const [hasApiKey, setHasApiKey] = useState(false);
  const [pendingSenderEmail, setPendingSenderEmail] = useState("");

  // Guide dialog state
  const [guideOpen, setGuideOpen] = useState(false);

  // Track original sender email to detect changes
  const originalSenderEmail = useRef("");

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) navigate("/auth");
      else setUser(session.user);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) navigate("/auth");
      else {
        setUser(session.user);
        fetchSettings(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const fetchSettings = async (userId: string) => {
    const { data } = await supabase.from("settings").select("*").eq("user_id", userId).limit(1).single();
    if (data) {
      setSenderEmail(data.sender_email);
      // Parse receiver_email: may be new JSON object, old array, or plain string
      try {
        const parsed = JSON.parse(data.receiver_email);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && parsed.entries) {
          // New format: { entries: [...], multiSendMode: "..." }
          setReceivers(parsed.entries);
          if (parsed.multiSendMode) setMultiSendMode(parsed.multiSendMode);
        } else if (Array.isArray(parsed)) {
          // Legacy array format
          setReceivers(parsed);
        } else {
          setReceivers([{ email: data.receiver_email, enabled: true }]);
        }
      } catch {
        setReceivers(data.receiver_email ? [{ email: data.receiver_email, enabled: true }] : [{ email: "", enabled: true }]);
      }
      originalSenderEmail.current = data.sender_email;
      setHasApiKey(!!data.email_api_key);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const provider = (data as any).email_provider as EmailProvider;
      if (provider) setEmailProvider(provider);
    }
  };

  const handleSenderEmailBlur = () => {
    if (senderEmail && senderEmail !== originalSenderEmail.current) {
      setPendingSenderEmail(senderEmail);
      setApiKeyInput("");
      setMultiFieldInputs({});
      setApiKeyDialogOpen(true);
    }
  };

  // Build the stored api key value from current inputs
  const buildApiKeyValue = (): string => {
    if (isMultiField(emailProvider)) {
      return JSON.stringify(multiFieldInputs);
    }
    return apiKeyInput;
  };

  const isDialogValid = (): boolean => {
    const cp = PROVIDERS.find((p) => p.value === emailProvider);
    if (!cp) return false;
    if (cp.fields) {
      return cp.fields.every((f) => (multiFieldInputs[f.key] || "").trim() !== "");
    }
    return apiKeyInput.trim() !== "";
  };

  const saveApiKeyAndEmail = async () => {
    if (!isDialogValid()) {
      toast({ title: "יש למלא את כל השדות", variant: "destructive" });
      return;
    }
    setApiKeyDialogOpen(false);
    originalSenderEmail.current = pendingSenderEmail;
    setHasApiKey(true);
    toast({ title: "פרטי ה-API נשמרו בהצלחה" });
  };

  const cancelApiKeyDialog = () => {
    setSenderEmail(originalSenderEmail.current);
    setApiKeyDialogOpen(false);
    setApiKeyInput("");
    setMultiFieldInputs({});
  };

  const sendTestEmail = async () => {
    if (!hasApiKey && !isDialogValid()) {
      toast({ title: "יש להגדיר פרטי API תחילה", variant: "destructive" });
      return;
    }
    const firstReceiver = receivers.find((r) => r.enabled && r.email.trim());
    if (!firstReceiver) {
      toast({ title: "יש להזין לפחות כתובת מייל מקבל אחת מסומנת", variant: "destructive" });
      return;
    }
    setSendingTest(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const currentApiKey = isMultiField(emailProvider)
        ? (Object.keys(multiFieldInputs).length > 0 ? JSON.stringify(multiFieldInputs) : "__use_saved__")
        : (apiKeyInput || "__use_saved__");
      const res = await fetch(
        `https://rwmxscvqnrovtwzttkoq.supabase.co/functions/v1/send-test-email`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token ?? ""}`,
          },
          body: JSON.stringify({
            provider: emailProvider,
            apiKey: currentApiKey,
            senderEmail,
            receiverEmail: firstReceiver.email,
          }),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "שגיאה לא ידועה");
      toast({ title: "מייל הבדיקה נשלח בהצלחה! ✅", description: `נשלח אל ${firstReceiver.email}` });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "שליחת מייל הבדיקה נכשלה", description: msg, variant: "destructive" });
    } finally {
      setSendingTest(false);
    }
  };

  const saveSettings = async () => {
    if (!user) return;

    const builtKey = buildApiKeyValue();
    if (senderEmail !== originalSenderEmail.current && !builtKey) {
      setPendingSenderEmail(senderEmail);
      setApiKeyDialogOpen(true);
      return;
    }

    setSaving(true);
    const { data: existing } = await supabase.from("settings").select("id").eq("user_id", user.id).limit(1).single();

    // Serialize receivers + multiSendMode as JSON
    const activeCount = receivers.filter((r) => r.enabled && r.email.trim()).length;
    const receiverPayload = { entries: receivers, multiSendMode: activeCount > 1 ? multiSendMode : "multiple" };
    const receiverEmailJson = JSON.stringify(receiverPayload);

    const updateData: Record<string, string> = {
      sender_email: senderEmail,
      receiver_email: receiverEmailJson,
      email_provider: emailProvider,
    };
    if (builtKey) {
      updateData.email_api_key = builtKey;
    }

    if (existing) {
      const { error } = await supabase.from("settings").update(updateData).eq("id", existing.id);
      if (error) {
        toast({ title: "שגיאה בשמירת ההגדרות", variant: "destructive" });
      } else {
        originalSenderEmail.current = senderEmail;
        setApiKeyInput("");
        setMultiFieldInputs({});
        toast({ title: "ההגדרות נשמרו בהצלחה!" });
      }
    } else {
      const { error } = await supabase.from("settings").insert({
        sender_email: senderEmail,
        receiver_email: receiverEmailJson,
        email_provider: emailProvider,
        user_id: user.id,
        ...(builtKey ? { email_api_key: builtKey } : {}),
      });
      if (error) {
        toast({ title: "שגיאה בשמירת ההגדרות", variant: "destructive" });
      } else {
        originalSenderEmail.current = senderEmail;
        setApiKeyInput("");
        setMultiFieldInputs({});
        toast({ title: "ההגדרות נשמרו בהצלחה!" });
      }
    }
    setSaving(false);
  };

  const currentProvider = PROVIDERS.find((p) => p.value === emailProvider) ?? PROVIDERS[0];

  const senderPlaceholder =
    emailProvider === "gmail" || emailProvider === "gmail-api-oauth2"
      ? "yourname@gmail.com"
      : emailProvider === "gmail-api-service"
      ? "sender@yourdomain.com"
      : "noreply@yourdomain.com";

  const senderHint =
    emailProvider === "gmail"
      ? "חייבת להיות כתובת Gmail שלך ממנה הפקת את סיסמת האפליקציה"
      : emailProvider === "gmail-api-oauth2"
      ? "חייבת להיות כתובת Gmail שהורשתה ב-OAuth2 Credentials"
      : emailProvider === "gmail-api-service"
      ? "כתובת ה-Gmail שה-Service Account מורשה לשלוח מטעמה (Delegated)"
      : "הכתובת שממנה יישלחו המיילים — שינוי הכתובת ידרוש הזנת פרטי API מחדש";

  const credentialLabel =
    emailProvider === "gmail"
      ? "סיסמת אפליקציה (App Password)"
      : emailProvider === "gmail-api-oauth2"
      ? "פרטי Gmail API OAuth2"
      : emailProvider === "gmail-api-service"
      ? "Service Account JSON Key"
      : "מפתח API לשירות המייל";

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <header className="border-b bg-card shadow-sm">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Link to="/">
            <Button variant="ghost" size="icon">
              <ArrowRight className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold text-foreground">הגדרות מערכת</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              הגדרות שליחת מיילים
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Provider selector */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium">ספק שליחת מיילים</label>
                <button
                  type="button"
                  onClick={() => setGuideOpen(true)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors group"
                  title="מדריך הגדרה לספק הנבחר"
                >
                  <HelpCircle className="h-4 w-4 group-hover:text-primary" />
                  <span>מדריך הגדרה</span>
                </button>
              </div>
              <Select value={emailProvider} onValueChange={(v) => { setEmailProvider(v as EmailProvider); setMultiFieldInputs({}); setApiKeyInput(""); }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">
                כתובת מייל שולח (From)
              </label>
              <Input
                type="email"
                placeholder={senderPlaceholder}
                value={senderEmail}
                onChange={(e) => setSenderEmail(e.target.value)}
                onBlur={handleSenderEmailBlur}
                dir="ltr"
              />
              <p className="text-xs text-muted-foreground mt-1">{senderHint}</p>
            </div>

            {/* Credentials status */}
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border border-border">
              <KeyRound className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium">{credentialLabel}</p>
                {hasApiKey ? (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                    מוגדר — ישתנה אוטומטית בשינוי כתובת השולח
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    טרם הוגדר — שנה את כתובת השולח כדי להגדיר
                  </p>
                )}
              </div>
            </div>

            {/* Receiver Emails */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">כתובות מייל מקבל (To)</label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => setReceivers((prev) => [...prev, { email: "", enabled: true }])}
                >
                  <Plus className="h-3.5 w-3.5" />
                  הוסף כתובת
                </Button>
              </div>

              <div className="space-y-2">
                {receivers.map((r, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Checkbox
                      id={`recv-${idx}`}
                      checked={r.enabled}
                      onCheckedChange={(checked) =>
                        setReceivers((prev) =>
                          prev.map((x, i) => (i === idx ? { ...x, enabled: !!checked } : x))
                        )
                      }
                    />
                    <Input
                      type="email"
                      placeholder="you@yourdomain.com"
                      value={r.email}
                      onChange={(e) =>
                        setReceivers((prev) =>
                          prev.map((x, i) => (i === idx ? { ...x, email: e.target.value } : x))
                        )
                      }
                      dir="ltr"
                      className={!r.enabled ? "opacity-50" : ""}
                    />
                    {receivers.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => setReceivers((prev) => prev.filter((_, i) => i !== idx))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              {receivers.filter((r) => r.enabled && r.email.trim()).length > 1 && (
                <div className="mt-3 p-3 rounded-lg border border-border bg-muted/40 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">אופן שליחה למספר כתובות:</p>
                  <div className="flex gap-3">
                    <label className="flex items-center gap-2 cursor-pointer text-sm">
                      <input
                        type="radio"
                        name="multiSendMode"
                        value="single"
                        checked={multiSendMode === "single"}
                        onChange={() => setMultiSendMode("single")}
                        className="accent-primary"
                      />
                      מייל אחד (הראשון — לשאר כעותק CC)
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-sm">
                      <input
                        type="radio"
                        name="multiSendMode"
                        value="multiple"
                        checked={multiSendMode === "multiple"}
                        onChange={() => setMultiSendMode("multiple")}
                        className="accent-primary"
                      />
                      מיילים נפרדים לכל כתובת
                    </label>
                  </div>
                </div>
              )}

              <p className="text-xs text-muted-foreground mt-2">
                לכתובות אלו יישלחו המסמכים החתומים. בטל סימון כדי להשמיט כתובת ספציפית מבלי למחוק אותה.
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={sendTestEmail}
                disabled={sendingTest || saving || !senderEmail || !receivers.some((r) => r.enabled && r.email.trim())}
                className="flex-1 gap-2"
              >
                <Send className="h-4 w-4" />
                {sendingTest ? "שולח בדיקה..." : "שלח מייל בדיקה"}
              </Button>
              <Button onClick={saveSettings} disabled={saving} className="flex-1 gap-2">
                <Save className="h-4 w-4" />
                {saving ? "שומר..." : "שמירת הגדרות"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Credentials Dialog */}
      <Dialog open={apiKeyDialogOpen} onOpenChange={(open) => { if (!open) cancelApiKeyDialog(); }}>
        <DialogContent dir="rtl" className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              {emailProvider === "gmail" ? "הזנת סיסמת אפליקציה" : "הזנת פרטי API"}
            </DialogTitle>
            <DialogDescription>
              שינית את כתובת השולח ל-<span dir="ltr" className="font-mono text-foreground">{pendingSenderEmail}</span>.
              {" "}יש להזין את פרטי ה-{currentProvider.label} לשליחה מכתובת זו.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            {currentProvider.fields ? (
              // Multi-field providers (Gmail API)
              currentProvider.fields.map((field) => (
                <div key={field.key}>
                  <label className="text-xs font-medium mb-1 block text-muted-foreground">{field.label}</label>
                  {field.type === "textarea" ? (
                    <Textarea
                      placeholder={field.placeholder}
                      value={multiFieldInputs[field.key] || ""}
                      onChange={(e) => setMultiFieldInputs((prev) => ({ ...prev, [field.key]: e.target.value }))}
                      dir="ltr"
                      rows={5}
                      className="text-xs font-mono resize-none"
                    />
                  ) : (
                    <Input
                      type={field.type === "password" ? "password" : "text"}
                      placeholder={field.placeholder}
                      value={multiFieldInputs[field.key] || ""}
                      onChange={(e) => setMultiFieldInputs((prev) => ({ ...prev, [field.key]: e.target.value }))}
                      dir="ltr"
                      className="text-sm font-mono"
                    />
                  )}
                </div>
              ))
            ) : (
              // Single-field providers
              <Input
                type="password"
                placeholder={currentProvider.placeholder}
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                dir="ltr"
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") saveApiKeyAndEmail(); }}
              />
            )}

            <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2 border border-border leading-relaxed">
              💡 {currentProvider.hint}
            </p>
            <p className="text-xs text-muted-foreground">
              הפרטים נשמרים בצורה מאובטחת ולא יוצגו שוב לאחר שמירה.
            </p>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={cancelApiKeyDialog}>ביטול</Button>
            <Button onClick={saveApiKeyAndEmail} disabled={!isDialogValid()}>אישור</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Provider Guide Dialog */}
      <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
        <DialogContent dir="rtl" className="max-w-lg p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
            <DialogTitle className="flex items-center gap-2 text-base">
              <HelpCircle className="h-5 w-5 text-primary shrink-0" />
              {PROVIDER_GUIDES[emailProvider].title}
            </DialogTitle>
            <DialogDescription className="text-sm mt-1">
              {PROVIDER_GUIDES[emailProvider].intro}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[65vh]">
            <div className="px-6 py-4 space-y-4">
              {/* Steps */}
              <ol className="space-y-4">
                {PROVIDER_GUIDES[emailProvider].steps.map((step, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center mt-0.5">
                      {i + 1}
                    </span>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-semibold text-foreground">{step.title}</p>
                      <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
                      {step.link && (
                        <a
                          href={step.link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-0.5"
                        >
                          <ExternalLink className="h-3 w-3" />
                          {step.link.label}
                        </a>
                      )}
                    </div>
                  </li>
                ))}
              </ol>

              {/* Notes */}
              {PROVIDER_GUIDES[emailProvider].notes && (
                <div className="bg-muted/50 border border-border rounded-lg p-3 space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">הערות חשובות</p>
                  {PROVIDER_GUIDES[emailProvider].notes!.map((note, i) => (
                    <p key={i} className="text-xs text-muted-foreground leading-relaxed">{note}</p>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="px-6 py-4 border-t border-border flex justify-between items-center gap-2">
            <p className="text-xs text-muted-foreground">המדריך מתעדכן לפי הספק הנבחר</p>
            <Button size="sm" onClick={() => setGuideOpen(false)}>הבנתי, סגור</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminSettings;
