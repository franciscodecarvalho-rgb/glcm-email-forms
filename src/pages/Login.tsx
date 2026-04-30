import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Scale } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";

const schema = z.object({
  email: z.string().trim().email("Email inválido").max(255),
  password: z.string().min(6, "Mínimo 6 caracteres").max(72),
});

export default function Login() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (user) nav("/", { replace: true }); }, [user, nav]);

  const handle = async (mode: "login" | "signup") => {
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }
    setLoading(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Login realizado");
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/` },
        });
        if (error) throw error;
        toast.success("Conta criada. Você já pode entrar.");
      }
    } catch (e: any) {
      toast.error(e.message ?? "Falha na autenticação");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Scale className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Sistema Jurídico</h1>
            <p className="text-sm text-muted-foreground">Acesse o painel de casos</p>
          </div>
        </div>
        <Tabs defaultValue="login">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login">Entrar</TabsTrigger>
            <TabsTrigger value="signup">Criar conta</TabsTrigger>
          </TabsList>
          {(["login", "signup"] as const).map((mode) => (
            <TabsContent key={mode} value={mode} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor={`${mode}-email`}>Email</Label>
                <Input id={`${mode}-email`} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${mode}-pwd`}>Senha</Label>
                <Input id={`${mode}-pwd`} type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <Button className="w-full" disabled={loading} onClick={() => handle(mode)}>
                {loading ? "Aguarde…" : mode === "login" ? "Entrar" : "Criar conta"}
              </Button>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}
