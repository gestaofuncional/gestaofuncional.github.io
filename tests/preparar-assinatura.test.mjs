import assert from "node:assert/strict";
import test from "node:test";
import { criarHandler } from "../supabase/functions/preparar-assinatura/handler.ts";

const origem = "https://portal.example";
const supabase = "https://supabase.example";
const assinador = "https://assinadordigitalexterno.praiagrande.sp.gov.br";
const rota = "/assinar/dadde209-0054-4d84-8be0-a3702a93081b";
const codigo = "X".repeat(32);
const pdf = "%PDF-1.4\n%%EOF";

function pedido({
    token = "Bearer ficticio",
    autorizado = "true",
    site = origem,
    tipo = "application/pdf",
    corpo = pdf,
    tamanho,
} = {}) {
    const headers = {
        origin: site,
        authorization: token,
        "content-type": tipo,
        "x-compartilhamento-autorizado": autorizado,
    };
    if (tamanho) headers["content-length"] = tamanho;
    return new Request("https://edge.example", { method: "POST", headers, body: corpo });
}

function preparar({
    habilitado = true,
    sessaoValida = true,
    retorno = rota,
    assinadorStatus = 200,
    paginaStatus = 200,
    html = '<input id="CodigoVerificador" type="hidden" value="' + codigo + '" />',
} = {}) {
    const chamadas = [];
    const handler = criarHandler({
        habilitado,
        origemPortal: origem,
        supabaseUrl: supabase,
        supabaseApiKey: "chave-publicavel-ficticia",
        buscar: async (url, opcoes) => {
            chamadas.push({ url, opcoes });
            if (url === supabase + "/rest/v1/rpc/acesso_autorizado") return Response.json(sessaoValida);
            if (url === assinador + rota) return new Response(html, { status: paginaStatus });
            assert.equal(url, assinador + "/upload");
            return Response.json({ url: retorno }, { status: assinadorStatus });
        },
    });
    return { handler, chamadas };
}

test("envia um único PDF sem credenciais e retorna o link individual", async () => {
    const { handler, chamadas } = preparar();
    const resposta = await handler(pedido());
    assert.equal(resposta.status, 200);
    assert.deepEqual(await resposta.json(), { preparado: true, link: assinador + "/assinar/" + codigo + "?cv=true" });
    assert.equal(resposta.headers.get("cache-control"), "no-store");
    assert.equal(chamadas.length, 3);
    assert.equal(chamadas[0].opcoes.method, "POST");
    assert.equal(chamadas[0].opcoes.headers.authorization, "Bearer ficticio");

    const upload = chamadas[1].opcoes;
    assert.equal(upload.method, "POST");
    assert.deepEqual(upload.headers, { Accept: "application/json" });
    assert.equal(upload.redirect, "error");
    assert.equal(upload.body.getAll("files").length, 1);
    const arquivo = upload.body.get("files");
    assert.equal(arquivo.type, "application/pdf");
    assert.equal(arquivo.name, "solicitacao.pdf");
    assert.equal(await arquivo.text(), pdf);

    const pagina = chamadas[2];
    assert.equal(pagina.url, assinador + rota);
    assert.deepEqual(pagina.opcoes.headers, { Accept: "text/html" });
    assert.equal(pagina.opcoes.redirect, "error");
});

test("aceita o preflight do portal para o envio do PDF", async () => {
    const { handler, chamadas } = preparar();
    const resposta = await handler(new Request("https://edge.example", { method: "OPTIONS", headers: { origin: origem } }));
    assert.equal(resposta.status, 204);
    assert.equal(resposta.headers.get("access-control-allow-origin"), origem);
    assert.match(resposta.headers.get("access-control-allow-headers"), /x-compartilhamento-autorizado/);
    assert.equal(chamadas.length, 0);
});

for (const [nome, configuracao, entrada, status, total] of [
    ["preparo desligado", { habilitado: false }, {}, 503, 0],
    ["origem desconhecida", {}, { site: "https://outro.example" }, 403, 0],
    ["sem autorização para compartilhar", {}, { autorizado: "" }, 400, 0],
    ["sem token", {}, { token: "" }, 401, 0],
    ["sessão inválida", { sessaoValida: false }, {}, 403, 1],
    ["tipo de conteúdo incorreto", {}, { tipo: "text/plain" }, 415, 0],
    ["conteúdo que não é PDF", {}, { corpo: "arquivo de texto" }, 422, 1],
    ["PDF com tamanho declarado superior ao limite", {}, { tamanho: String(10 * 1024 * 1024 + 1) }, 413, 0],
    ["PDF sem tamanho declarado que excede o limite", {}, { corpo: "%PDF-" + "x".repeat(10 * 1024 * 1024) }, 422, 1],
    ["Assinador indisponível", { assinadorStatus: 503 }, {}, 502, 2],
    ["link de domínio externo", { retorno: "https://outro.example" + rota }, {}, 502, 2],
    ["link com credenciais embutidas", { retorno: assinador.replace("https://", "https://teste@") + rota }, {}, 502, 2],
    ["página de preparo indisponível", { paginaStatus: 503 }, {}, 502, 3],
    ["página sem código de compartilhamento", { html: "<input value='teste' />" }, {}, 502, 3],
]) {
    test(nome, async () => {
        const { handler, chamadas } = preparar(configuracao);
        assert.equal((await handler(pedido(entrada))).status, status);
        assert.equal(chamadas.length, total);
    });
}
