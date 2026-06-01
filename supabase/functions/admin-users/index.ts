// Edge function: admin-users
// Operations: list | create | update_password | delete | set_role
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Missing token" }, 401);

    // Validate caller
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Verify admin role
    const { data: isAdmin } = await admin.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    if (!isAdmin) return json({ error: "Forbidden: admin only" }, 403);

    const { action, payload } = await req.json();

    switch (action) {
      case "list": {
        const { data, error } = await admin.auth.admin.listUsers({ perPage: 200 });
        if (error) throw error;
        const { data: roles } = await admin.from("user_roles").select("user_id, role");
        const roleMap = new Map<string, string[]>();
        roles?.forEach((r: any) => {
          const arr = roleMap.get(r.user_id) ?? [];
          arr.push(r.role);
          roleMap.set(r.user_id, arr);
        });
        const users = data.users.map((u) => ({
          id: u.id,
          email: u.email,
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at,
          roles: roleMap.get(u.id) ?? [],
        }));
        return json({ users });
      }

      case "create": {
        const { email, password, role } = payload ?? {};
        if (!email || !password) return json({ error: "email e password obrigatórios" }, 400);
        const { data, error } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });
        if (error) throw error;
        const newRole = role === "admin" ? "admin" : "user";
        await admin.from("user_roles").insert({ user_id: data.user.id, role: newRole });
        return json({ user: { id: data.user.id, email: data.user.email } });
      }

      case "update_password": {
        const { user_id, password } = payload ?? {};
        if (!user_id || !password) return json({ error: "user_id e password obrigatórios" }, 400);
        const { error } = await admin.auth.admin.updateUserById(user_id, { password });
        if (error) throw error;
        return json({ ok: true });
      }

      case "delete": {
        const { user_id } = payload ?? {};
        if (!user_id) return json({ error: "user_id obrigatório" }, 400);
        if (user_id === userData.user.id) return json({ error: "Você não pode se remover" }, 400);
        const { error } = await admin.auth.admin.deleteUser(user_id);
        if (error) throw error;
        return json({ ok: true });
      }

      case "set_role": {
        const { user_id, role } = payload ?? {};
        if (!user_id || !role) return json({ error: "user_id e role obrigatórios" }, 400);
        if (!["admin", "user"].includes(role)) return json({ error: "role inválido" }, 400);
        await admin.from("user_roles").delete().eq("user_id", user_id);
        await admin.from("user_roles").insert({ user_id, role });
        return json({ ok: true });
      }

      default:
        return json({ error: "Ação desconhecida" }, 400);
    }
  } catch (e) {
    console.error("admin-users error", e);
    return json({ error: (e as Error).message }, 500);
  }
});
