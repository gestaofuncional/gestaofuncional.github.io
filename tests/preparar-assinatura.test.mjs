import assert from "node:assert/strict";
import test from "node:test";
import { criarHandler } from "../supabase/functions/preparar-assinatura/handler.ts";

const origem = "https://portal.example";
const supabase = "https://supabase.example";
const assinador = "https://assinadordigitalexterno.praiagrande.sp.gov.br";
const usuario = "e51ec9b2-9a79-4a04-a3e5-fab77f626377";
const caminho = usuario + "/be291b79-e719-4f22-bf1f-9170e3b98dbd.pdf";
const rota = "/assinar/dadde209-0054-4d84-8be0-a3702a93081b";
const codigo = "X".repeat(32);

function pedido({ arquivo = caminho, token = "Bearer ficticio", autorizado = true, site = origem } = {}) {
    return new Request("https://edge.example", {
        method: "POST",
        headers: { origin: site, authorization: token },
        body: JSON.stringify({ arquivo, compartilhamentoAutorizado: autorizado }),
    });
}

function preparar({
    habilitado = true,
    id = usuario,
    sessaoValida = true,
    storageStatus = 200,
    pdf = "%PDF-1.4\n%%EOF",
    retorno = rota,
    assinadorStatus = 200,
    paginaStatus = 200,
    html = `<input id="CodigoVerificador" name="CodigoVerificador" type="hidden" value="${codigo}" />`,
} = {}) {
    const chamadas = [];
    const handler = criarHandler({
        habilitado,
        origemPortal: origem,
        supabaseUrl: supabase,
        supabaseAnonKey: "chave-publicavel-ficticia",
        buscar: async (url, opcoes) => {
            chamadas.push({ url, opcoes });
            if (url === supabase + "/auth/v1/user") {
                return Response.json({ id }, { status: sessaoValida ? 200 : 401 });
            }
            if (url === supabase + "/storage/v1/object/authenticated/documentos-solicitacoes/" + caminho) {
                return new Response(pdf, { status: storageStatus });
            }
            if (url === assinador + rota) {
                return new Response(html, { status: paginaStatus });
            }
            assert.equal(url, assinador + "/upload");
            return Response.json({ url: retorno }, { status: assinadorStatus });
        },
    });
    return { handler, chamadas };
}

test("retorna o link individual e envia somente um PDF, sem credenciais ao Assinador", async () => {
    const { handler, chamadas } = preparar();
    const resposta = await handler(pedido());
    assert.equal(resposta.status, 200);
    assert.deepEqual(await resposta.json(), { link: assinador + "/assinar/" + codigo + "?cv=true" });
    assert.equal(resposta.headers.get("cache-control"), "no-store");
    assert.equal(chamadas.length, 4);
    assert.equal(chamadas[1].opcoes.headers.authorization, "Bearer ficticio");
    const pagina = chamadas.at(-1);
    assert.equal(pagina.url, assinador + rota);
    assert.deepEqual(pagina.opcoes.headers, { Accept: "text/html" });
    assert.equal(pagina.opcoes.redirect, "error");
    const upload = chamadas[2].opcoes;
    assert.equal(upload.method, "POST");
    assert.deepEqual(upload.headers, { Accept: "application/json" });
    assert.equal(upload.redirect, "error");
    assert.equal(upload.body.getAll("files").length, 1);
    const pdf = upload.body.get("files");
    assert.equal(pdf.type, "application/pdf");
    assert.equal(pdf.name, "solicitacao.pdf");
    assert.equal(await pdf.text(), "%PDF-1.4\n%%EOF");
});

test("mantém o preparo desativado até a configuração explícita", async () => {
    const { handler, chamadas } = preparar({ habilitado: false });
    const disponibilidade = await handler(new Request("https://edge.example", { headers: { origin: origem } }));
    assert.deepEqual(await disponibilidade.json(), { habilitado: false });
    assert.equal((await handler(pedido())).status, 503);
    assert.equal(chamadas.length, 0);
});

test("aceita o preflight do portal configurado", async () => {
    const { handler, chamadas } = preparar();
    const resposta = await handler(new Request("https://edge.example", { method: "OPTIONS", headers: { origin: origem } }));
    assert.equal(resposta.status, 204);
    assert.equal(resposta.headers.get("access-control-allow-origin"), origem);
    assert.equal(chamadas.length, 0);
});

for (const [nome, opcoes, entrada, status, total] of [
    ["origem desconhecida", {}, { site: "https://outro.example" }, 403, 0],
    ["pedido sem autorização de compartilhamento", {}, { autorizado: false }, 400, 0],
    ["caminho inválido", {}, { arquivo: "../teste.pdf" }, 400, 0],
    ["pedido sem token", {}, { token: "" }, 401, 0],
    ["sessão inválida", { sessaoValida: false }, {}, 401, 1],
    ["PDF de outro funcionário", { id: "outro-id" }, {}, 403, 1],
    ["PDF indisponível pelas políticas do bucket", { storageStatus: 403 }, {}, 404, 2],
    ["conteúdo que não é PDF", { pdf: "arquivo de texto" }, {}, 422, 2],
    ["PDF maior que 10 MB", { pdf: "%PDF-" + "x".repeat(10 * 1024 * 1024) }, {}, 422, 2],
    ["Assinador indisponível", { assinadorStatus: 503 }, {}, 502, 3],
    ["link de domínio externo", { retorno: "https://outro.example" + rota }, {}, 502, 3],
    ["link com credenciais embutidas", { retorno: assinador.replace("https://", "https://teste@") + rota }, {}, 502, 3],
    ["retorno coletivo", { retorno: "/lote/" + "X".repeat(32) }, {}, 502, 3],
    ["página de preparo indisponível", { paginaStatus: 503 }, {}, 502, 4],
    ["página sem código de compartilhamento", { html: '<input name="CodigoVerificador" value="teste" />' }, {}, 502, 4],
]) {
    test(nome, async () => {
        const { handler, chamadas } = preparar(opcoes);
        assert.equal((await handler(pedido(entrada))).status, status);
        assert.equal(chamadas.length, total);
    });
}
