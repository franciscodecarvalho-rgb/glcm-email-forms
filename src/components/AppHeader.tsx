import { Scale, LogOut, FileText, LayoutDashboard } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

export function AppHeader() {
  const { user, signOut } = useAuth();
  const nav = useNavigate();
  return (
    <header className="border-b bg-card">
      <div className="container flex h-16 items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Scale className="h-5 w-5" />
          </span>
          <span>Sistema Jurídico</span>
        </Link>
        <nav className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/"><LayoutDashboard className="mr-2 h-4 w-4" />Casos</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/templates"><FileText className="mr-2 h-4 w-4" />Templates</Link>
          </Button>
          <span className="hidden text-sm text-muted-foreground md:inline">{user?.email}</span>
          <Button variant="outline" size="sm" onClick={async () => { await signOut(); nav("/login"); }}>
            <LogOut className="mr-2 h-4 w-4" />Sair
          </Button>
        </nav>
      </div>
    </header>
  );
}
