import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Send, Eraser, Type, PenTool, CheckCircle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const SignDocument = () => {
  const { uniqueId } = useParams<{ uniqueId: string }>();
  const [document, setDocument] = useState<{ id: string; name: string; file_path: string; user_id: string | null } | null>(null);
  const [fileUrl, setFileUrl] = useState("");
  const [clientName, setClientName] = useState("");
  const [signatureMode, setSignatureMode] = useState<"draw" | "type">("draw");
  const [typedSignature, setTypedSignature] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [multiSendMode, setMultiSendMode] = useState<"single" | "multiple">("multiple");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);

  useEffect(() => {
    fetchDocument();
  }, [uniqueId]);

  const fetchDocument = async () => {
    const { data, error } = await supabase
      .from("documents")
      .select("*")
      .eq("unique_id", uniqueId)
      .single();
    if (error || !data) {
      setNotFound(true);
      return;
    }
    setDocument(data);
    const { data: urlData } = supabase.storage.from("documents").getPublicUrl(data.file_path);
    setFileUrl(urlData.publicUrl);

    // Fetch multiSendMode from settings if user_id available
    if (data.user_id) {
      const { data: settingsData } = await supabase
        .from("settings")
        .select("receiver_email")
        .eq("user_id", data.user_id)
        .limit(1)
        .single();
      if (settingsData?.receiver_email) {
        try {
          const parsed = JSON.parse(settingsData.receiver_email);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && parsed.multiSendMode) {
            setMultiSendMode(parsed.multiSendMode);
          }
        } catch { /* fallback to default */ }
      }
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1a1a2e";
    ctx.lineWidth = 2.5;

    const getPos = (e: MouseEvent | TouchEvent) => {
      const r = canvas.getBoundingClientRect();
      if ("touches" in e) {
        return { x: e.touches[0].clientX - r.left, y: e.touches[0].clientY - r.top };
      }
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const start = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      isDrawingRef.current = true;
      const pos = getPos(e);
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
    };

    const draw = (e: MouseEvent | TouchEvent) => {
      if (!isDrawingRef.current) return;
      e.preventDefault();
      const pos = getPos(e);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    };

    const stop = () => { isDrawingRef.current = false; };

    canvas.addEventListener("mousedown", start);
    canvas.addEventListener("mousemove", draw);
    canvas.addEventListener("mouseup", stop);
    canvas.addEventListener("mouseleave", stop);
    canvas.addEventListener("touchstart", start, { passive: false });
    canvas.addEventListener("touchmove", draw, { passive: false });
    canvas.addEventListener("touchend", stop);

    return () => {
      canvas.removeEventListener("mousedown", start);
      canvas.removeEventListener("mousemove", draw);
      canvas.removeEventListener("mouseup", stop);
      canvas.removeEventListener("mouseleave", stop);
      canvas.removeEventListener("touchstart", start);
      canvas.removeEventListener("touchmove", draw);
      canvas.removeEventListener("touchend", stop);
    };
  }, [document, signatureMode]);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const getSignatureData = (): string | null => {
    if (signatureMode === "type") {
      if (!typedSignature) return null;
      // Render typed signature as image to avoid Hebrew encoding issues in pdf-lib
      const offscreen = window.document.createElement("canvas");
      offscreen.width = 600;
      offscreen.height = 160;
      const offCtx = offscreen.getContext("2d");
      if (!offCtx) return null;
      offCtx.fillStyle = "white";
      offCtx.fillRect(0, 0, 600, 160);
      offCtx.font = "italic 48px 'Segoe Script', 'Dancing Script', cursive, serif";
      offCtx.fillStyle = "#1a1a2e";
      offCtx.textAlign = "center";
      offCtx.textBaseline = "middle";
      offCtx.fillText(typedSignature, 300, 80);
      return offscreen.toDataURL("image/png");
    }
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const hasContent = pixels.some((_, i) => i % 4 === 3 && pixels[i] > 0);
    if (!hasContent) return null;
    return canvas.toDataURL("image/png");
  };

  const handleSubmit = async () => {
    if (!clientName.trim()) {
      toast({ title: "נא להזין את שמך", variant: "destructive" });
      return;
    }
    const sig = getSignatureData();
    if (!sig) {
      toast({ title: "נא לחתום לפני השליחה", variant: "destructive" });
      return;
    }

    setSending(true);
    try {
      const { error } = await supabase.functions.invoke("process-signature", {
        body: {
          documentId: document!.id,
          clientName,
          signatureData: sig,
          signatureMode,
          multiSendMode,
        },
      });
      if (error) throw error;
      setSent(true);
      toast({ title: "המסמך החתום נשלח בהצלחה!" });
    } catch {
      toast({ title: "שגיאה בשליחת המסמך", variant: "destructive" });
    }
    setSending(false);
  };

  if (notFound) {
    return (
      <div dir="rtl" className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-2">מסמך לא נמצא</h1>
          <p className="text-muted-foreground">הקישור אינו תקין או שהמסמך הוסר.</p>
        </div>
      </div>
    );
  }

  if (sent) {
    return (
      <div dir="rtl" className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="p-8 text-center">
            <CheckCircle className="h-16 w-16 text-accent mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-foreground mb-2">תודה רבה!</h1>
            <p className="text-muted-foreground">המסמך החתום נשלח בהצלחה.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!document) {
    return (
      <div dir="rtl" className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">טוען מסמך...</p>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <header className="border-b bg-card shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-xl font-bold text-foreground text-center">{document.name}</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-3xl space-y-6">
        {/* PDF Viewer */}
        <Card>
          <CardContent className="p-0">
            <iframe
              src={`${fileUrl}#toolbar=0`}
              className="w-full h-[60vh] md:h-[70vh] rounded-lg"
              title="תצוגת מסמך"
            />
          </CardContent>
        </Card>

        {/* Signature Section */}
        <Card>
          <CardContent className="p-6 space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">שם מלא</label>
              <Input
                placeholder="הזן את שמך המלא"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-3 block">חתימה</label>
              <Tabs value={signatureMode} onValueChange={(v) => setSignatureMode(v as "draw" | "type")}>
                <TabsList className="w-full">
                  <TabsTrigger value="draw" className="flex-1 gap-2">
                    <PenTool className="h-4 w-4" />
                    ציור חתימה
                  </TabsTrigger>
                  <TabsTrigger value="type" className="flex-1 gap-2">
                    <Type className="h-4 w-4" />
                    הקלדת שם
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="draw" className="mt-3" forceMount style={{ display: signatureMode === "draw" ? "block" : "none" }}>
                  <div className="relative border-2 border-dashed border-border rounded-lg bg-card">
                    <canvas
                      ref={canvasRef}
                      className="w-full h-40 cursor-crosshair touch-none"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute top-2 left-2 gap-1 text-xs"
                      onClick={clearCanvas}
                    >
                      <Eraser className="h-3.5 w-3.5" />
                      נקה
                    </Button>
                  </div>
                </TabsContent>
                <TabsContent value="type" className="mt-3">
                  <Input
                    placeholder="הקלד את שמך כחתימה"
                    value={typedSignature}
                    onChange={(e) => setTypedSignature(e.target.value)}
                    className="signature-font text-2xl h-16 text-center"
                  />
                  {typedSignature && (
                    <div className="mt-3 p-4 border rounded-lg bg-card text-center">
                      <p className="text-xs text-muted-foreground mb-1">תצוגה מקדימה:</p>
                      <p className="signature-font text-3xl">{typedSignature}</p>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>

            <Button
              onClick={handleSubmit}
              disabled={sending}
              className="w-full gap-2 h-12 text-base"
              size="lg"
            >
              <Send className="h-5 w-5" />
              {sending ? "שולח..." : "שלח מסמך חתום"}
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default SignDocument;
