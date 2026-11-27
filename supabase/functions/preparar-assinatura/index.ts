import { criarHandler } from "./handler.ts";

Deno.serve(criarHandler({
    habilitado: Deno.env.get("ASSINADOR_DIGITAL_HABILITADO") === "true",
    origemPortal: Deno.env.get("ASSINADOR_DIGITAL_ORIGEM_PORTAL") ?? "https://gestaofuncional.github.io",
    supabaseUrl: Deno.env.get("SUPABASE_URL") ?? "",
    supabaseAnonKey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
}));
