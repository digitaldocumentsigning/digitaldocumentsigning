import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { Upload, FileText, Copy, ExternalLink, Trash2, Send, MessageCircle, Mail, Settings, Plus, LogOut } from "lucide-react";
import SignaturePositionPicker, { type SignaturePosition } from "@/components/SignaturePositionPicker";
import { Link } from "react-router-dom";
import type { User } from "@supabase/supabase-js";

type Document = {
  id: string;
  name: string;
  file_path: string;
  unique_id: string;
  created_at: string;
};

const Index = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [clientEmail, setClientEmail] = useState("");
  const [newDocName, setNewDocName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [signaturePosition, setSignaturePosition] = useState<SignaturePosition | null>(null);
  const [datePosition, setDatePosition] = useState<SignaturePosition | null>(null);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const baseUrl = window.location.origin;

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        navigate("/auth");
      } else {
        setUser(session.user);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/auth");
      } else {
        setUser(session.user);
        fetchDocuments();
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const fetchDocuments = async () => {
    const { data, error } = await supabase.from("documents").select("*").order("created_at", { ascending: false });
    if (error) {
      toast({ title: "שגיאה בטעינת מסמכים", variant: "destructive" });
    } else {
      setDocuments(data || []);
    }
    setLoading(false);
  };

  const handleUpload = async () => {
    if (!selectedFile || !newDocName || !user) return;
    setUploading(true);
    const safeFileName = `${Date.now()}_${selectedFile.name.replace(/[^\w.-]/g, '_')}`;
    const filePath = safeFileName;
    const { error: uploadError } = await supabase.storage.from("documents").upload(filePath, selectedFile);
    if (uploadError) {
      toast({ title: "שגיאה בהעלאת הקובץ", variant: "destructive" });
      setUploading(false);
      return;
    }
    const positionData = signaturePosition ? JSON.stringify(signaturePosition) : "bottom";
    const dateData = datePosition ? JSON.stringify(datePosition) : "bottom";
    const { error: insertError } = await supabase.from("documents").insert({
      name: newDocName,
      file_path: filePath,
      signature_position: positionData,
      date_position: dateData,
      user_id: user.id,
    });
    if (insertError) {
      toast({ title: "שגיאה בשמירת המסמך", variant: "destructive" });
    } else {
      toast({ title: "המסמך הועלה בהצלחה!" });
      setUploadOpen(false);
      setNewDocName("");
      setSelectedFile(null);
      setSignaturePosition(null);
      setDatePosition(null);
      fetchDocuments();
    }
    setUploading(false);
  };

  const handleDelete = async (doc: Document) => {
    await supabase.storage.from("documents").remove([doc.file_path]);
    const { error } = await supabase.from("documents").delete().eq("id", doc.id);
    if (error) {
      toast({ title: "שגיאה במחיקת המסמך", variant: "destructive" });
    } else {
      toast({ title: "המסמך הוסר בהצלחה" });
      fetchDocuments();
    }
  };

  const copyLink = (uniqueId: string) => {
    const link = `${baseUrl}/sign/${uniqueId}`;
    navigator.clipboard.writeText(link);
    toast({ title: "הקישור הועתק!" });
  };

  const shareWhatsApp = (doc: Document) => {
    const link = `${baseUrl}/sign/${doc.unique_id}`;
    const text = `שלום, אנא חתום על המסמך "${doc.name}" בקישור הבא:\n${link}`;
    const w = window.top || window.parent || window;
    w.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
  };

  const openEmailDialog = (doc: Document) => {
    setSelectedDoc(doc);
    setClientEmail("");
    setEmailOpen(true);
  };

  const sendEmail = async () => {
    if (!selectedDoc || !clientEmail) return;
    const link = `${baseUrl}/sign/${selectedDoc.unique_id}`;
    try {
      const { error } = await supabase.functions.invoke("send-link-email", {
        body: { to: clientEmail, documentName: selectedDoc.name, link },
      });
      if (error) throw error;
      toast({ title: "המייל נשלח בהצלחה!" });
      setEmailOpen(false);
    } catch {
      toast({ title: "שגיאה בשליחת המייל", variant: "destructive" });
    }
  };

  const updateDocName = async (id: string) => {
    if (!editName.trim()) return;
    const { error } = await supabase.from("documents").update({ name: editName }).eq("id", id);
    if (error) {
      toast({ title: "שגיאה בעדכון השם", variant: "destructive" });
    } else {
      setEditingName(null);
      fetchDocuments();
    }
  };

  const openFile = (filePath: string) => {
    const { data } = supabase.storage.from("documents").getPublicUrl(filePath);
    const w = window.top || window.parent || window;
    w.open(data.publicUrl, "_blank");
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  return (
    <div dir="rtl" className="min-h-screen" style={{background: "linear-gradient(135deg, hsl(217 71% 97%) 0%, hsl(220 20% 97%) 40%, hsl(168 50% 96%) 100%)"}}>
      {/* Header */}
      <header className="bg-card/90 backdrop-blur-sm border-b border-border/40 sticky top-0 z-10 shadow-sm">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-primary/20 to-accent/20 p-2.5 rounded-xl shadow-sm">
              <FileText className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-xl font-semibold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">מערכת חתימה דיגיטלית</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => setUploadOpen(true)} size="sm" className="gap-2 rounded-full px-4">
              <Plus className="h-4 w-4" />
              העלאת מסמך
            </Button>
            <Link to="/admin-settings-8f42b1c3">
              <Button variant="outline" size="sm" className="gap-2 rounded-full px-4 text-muted-foreground">
                <Settings className="h-4 w-4" />
                הגדרות
              </Button>
            </Link>
            <Button variant="ghost" size="icon" onClick={handleLogout} title="התנתק" className="text-muted-foreground">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <h2 className="text-lg font-semibold text-foreground/70 mb-6 flex items-center gap-2">
          <span className="w-1 h-5 rounded-full bg-gradient-to-b from-primary to-accent inline-block"></span>
          המסמכים שלי
        </h2>

        {loading ? (
          <div className="text-center py-20 text-muted-foreground">טוען מסמכים...</div>
        ) : documents.length === 0 ? (
          <div className="text-center py-20">
            <div className="bg-gradient-to-br from-primary/10 to-accent/10 w-24 h-24 rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-inner">
              <Upload className="h-10 w-10 text-primary/60" />
            </div>
            <p className="text-lg font-medium text-foreground/70">אין מסמכים עדיין</p>
            <p className="text-sm text-muted-foreground mt-1">העלה מסמך PDF כדי להתחיל</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {documents.map((doc) => (
              <Card key={doc.id} className="hover:shadow-xl transition-all duration-300 border-border/30 rounded-2xl overflow-hidden hover:-translate-y-0.5 bg-card/90 backdrop-blur-sm">
                <div className="h-1 bg-gradient-to-r from-primary/60 to-accent/60" />
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="bg-gradient-to-br from-primary/15 to-accent/15 p-2 rounded-lg shadow-sm">
                        <FileText className="h-6 w-6 text-primary" />
                      </div>
                      {editingName === doc.id ? (
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onBlur={() => updateDocName(doc.id)}
                          onKeyDown={(e) => e.key === "Enter" && updateDocName(doc.id)}
                          className="h-8 text-sm"
                          autoFocus
                        />
                      ) : (
                        <h3
                          className="font-semibold text-foreground cursor-pointer hover:text-primary transition-colors"
                          onClick={() => { setEditingName(doc.id); setEditName(doc.name); }}
                          title="לחץ לעריכת שם"
                        >
                          {doc.name}
                        </h3>
                      )}
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive h-8 w-8"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent dir="rtl">
                        <AlertDialogHeader>
                          <AlertDialogTitle>מחיקת מסמך</AlertDialogTitle>
                          <AlertDialogDescription>
                            האם אתה בטוח שברצונך למחוק את "{doc.name}"? פעולה זו אינה ניתנת לביטול.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>ביטול</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(doc)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            מחק
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>

                  <p className="text-xs text-muted-foreground mb-4 font-mono break-all bg-muted p-2 rounded">
                    {baseUrl}/sign/{doc.unique_id}
                  </p>

                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs"
                      onClick={() => openFile(doc.file_path)}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      פתיחה
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs"
                      onClick={() => copyLink(doc.unique_id)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                      העתקה
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs bg-[hsl(142,70%,45%)] text-white hover:bg-[hsl(142,70%,38%)] border-[hsl(142,70%,40%)]"
                      onClick={() => shareWhatsApp(doc)}
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      וואטסאפ
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs bg-[hsl(4,80%,56%)] text-white hover:bg-[hsl(4,80%,48%)] border-[hsl(4,80%,50%)]"
                      onClick={() => openEmailDialog(doc)}
                    >
                      <Mail className="h-3.5 w-3.5" />
                      מייל
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* Upload Dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent dir="rtl" className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>העלאת מסמך חדש</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">שם המסמך</label>
              <Input
                placeholder="לדוגמה: הסכם שירות"
                value={newDocName}
                onChange={(e) => setNewDocName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">קובץ PDF</label>
              <Input
                type="file"
                accept=".pdf"
                onChange={(e) => {
                  setSelectedFile(e.target.files?.[0] || null);
                  setSignaturePosition(null);
                  setDatePosition(null);
                }}
              />
            </div>
            {selectedFile && (
              <SignaturePositionPicker
                file={selectedFile}
                signaturePosition={signaturePosition}
                datePosition={datePosition}
                onSignaturePositionChange={setSignaturePosition}
                onDatePositionChange={setDatePosition}
              />
            )}
          </div>
          <DialogFooter>
            <Button onClick={handleUpload} disabled={!selectedFile || !newDocName || !signaturePosition || !datePosition || uploading}>
              {uploading ? "מעלה..." : "העלאה"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email Dialog */}
      <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>שליחת קישור במייל</DialogTitle>
          </DialogHeader>
          <div>
            <label className="text-sm font-medium mb-1.5 block">כתובת מייל הלקוח</label>
            <Input
              type="email"
              placeholder="client@example.com"
              value={clientEmail}
              onChange={(e) => setClientEmail(e.target.value)}
              dir="ltr"
            />
          </div>
          <DialogFooter>
            <Button onClick={sendEmail} disabled={!clientEmail}>
              <Send className="h-4 w-4 ml-2" />
              שלח
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Index;
