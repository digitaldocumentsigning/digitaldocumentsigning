import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const AuthCallback = () => {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        console.log("🔵 Processing OAuth callback...");
        
        // ✅ Supabase automatically parses the OAuth hash from URL
        // Give it enough time to process and store in localStorage
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Now check if session was successfully stored
        const { data: { session }, error } = await supabase.auth.getSession();
        
        console.log("Session check:", { session: !!session, error });
        
        if (error) {
          console.error("Auth error:", error);
          setError(error.message || String(error));
          setTimeout(() => navigate("/auth"), 2000);
          return;
        }
        
        if (session) {
          // ✅ Session exists, navigate to home
          console.log("✅ User logged in successfully:", session.user.email);
          navigate("/", { replace: true });
        } else {
          // ❌ No session, go back to login
          console.log("❌ No session found");
          navigate("/auth", { replace: true });
        }
      } catch (e) {
        console.error("Callback error:", e);
        setError(e instanceof Error ? e.message : String(e));
        setTimeout(() => navigate("/auth"), 2000);
      }
    })();
  }, [navigate]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="p-6 bg-red-50 rounded-lg border border-red-200">
          <h2 className="text-red-800 font-bold mb-2">שגיאה בהתחברות</h2>
          <p className="text-red-700 text-sm mb-4">{error}</p>
          <p className="text-red-600 text-xs">מעביר חזרה להתחברות...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin mb-4">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
        </div>
        <p className="text-foreground font-medium">אנא המתן...</p>
        <p className="text-xs text-muted-foreground mt-1">מאמת את ההתחברות שלך</p>
      </div>
    </div>
  );
};

export default AuthCallback;