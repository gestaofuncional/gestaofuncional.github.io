import { criarHandler } from "./handler.ts";

const chavesPublicaveis = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");

Deno.serve(criarHandler({
    habilitado: Deno.env.get("ASSINADOR_DIGITAL_HABILITADO") !== "false",
    origemPortal: Deno.env.get("ASSINADOR_DIGITAL_ORIGEM_PORTAL") ?? "https://gestaofuncional.github.io",
    supabaseUrl: Deno.env.get("SUPABASE_URL") ?? "",
    supabaseApiKey: chavesPublicaveis.default ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "",
}));
