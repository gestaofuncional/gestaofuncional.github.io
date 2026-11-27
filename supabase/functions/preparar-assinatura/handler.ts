const ASSINADOR = "https://assinadordigitalexterno.praiagrande.sp.gov.br";
const BUCKET = "documentos-solicitacoes";
const LIMITE_PDF = 10 * 1024 * 1024;
const CAMINHO_PDF = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}\/[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}\.pdf$/;
const CAMINHO_PREPARO = /^\/assinar\/[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;

type Configuracao = {
    habilitado: boolean;
    origemPortal: string;
    supabaseUrl: string;
    supabaseAnonKey: string;
    buscar?: typeof fetch;
};

async function lerPdf(resposta: Response): Promise<Blob | null> {
    if (
        !resposta.body ||
        Number(resposta.headers.get("content-length")) > LIMITE_PDF
    ) return null;

    const leitor = resposta.body.getReader();
    const partes: Uint8Array<ArrayBuffer>[] = [];
    let tamanho = 0;
    try {
        while (true) {
            const { done, value } = await leitor.read();
            if (done) break;
            tamanho += value.byteLength;
            if (tamanho > LIMITE_PDF) {
                await leitor.cancel();
                return null;
            }
            partes.push(new Uint8Array(value));
        }
    } finally {
        leitor.releaseLock();
    }

    const pdf = new Blob(partes, { type: "application/pdf" });
    const inicio = await pdf.slice(0, 1024).text();
    return inicio.includes("%PDF-") ? pdf : null;
}

export function criarHandler(config: Configuracao) {
    const buscar = config.buscar ?? fetch;
    const habilitado = Boolean(config.habilitado && config.supabaseUrl && config.supabaseAnonKey);
    const cors = {
        "Access-Control-Allow-Origin": config.origemPortal,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
        "Cache-Control": "no-store",
        "Vary": "Origin",
    };

    function json(status: number, dados: object) {
        return Response.json(dados, { status, headers: cors });
    }

    return async (pedido: Request): Promise<Response> => {
        if (pedido.headers.get("origin") !== config.origemPortal) {
            return new Response(null, { status: 403 });
        }
        if (pedido.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
        if (pedido.method === "GET") return json(200, { habilitado });
        if (pedido.method !== "POST") return json(405, { erro: "Método indisponível." });
        if (!habilitado) return json(503, { erro: "Preparo automático indisponível." });

        const authorization = pedido.headers.get("authorization");
        if (!authorization?.startsWith("Bearer ")) return json(401, { erro: "Sessão inválida." });

        const entrada = await pedido.json().catch(() => null);
        const arquivo = entrada?.arquivo;
        if (entrada?.compartilhamentoAutorizado !== true || typeof arquivo !== "string" || !CAMINHO_PDF.test(arquivo)) {
            return json(400, { erro: "Dados de preparação inválidos." });
        }

        try {
            const headers = { authorization, apikey: config.supabaseAnonKey };
            const sessao = await buscar(config.supabaseUrl + "/auth/v1/user", {
                headers,
                redirect: "error",
                signal: AbortSignal.timeout(5000),
            });
            if (!sessao.ok) return json(401, { erro: "Sessão inválida." });
            const usuario = await sessao.json();
            if (usuario?.id !== arquivo.split("/")[0]) {
                return json(403, { erro: "O PDF não pertence à sessão." });
            }

            // A política do bucket também exige uma sessão validada e só permite ler arquivos autorizados.
            const armazenamento = await buscar(
                config.supabaseUrl + "/storage/v1/object/authenticated/" + BUCKET + "/" + arquivo,
                { headers, redirect: "error", signal: AbortSignal.timeout(10000) },
            );
            if (!armazenamento.ok) return json(404, { erro: "PDF indisponível." });

            const pdf = await lerPdf(armazenamento);
            if (!pdf) return json(422, { erro: "Selecione um PDF válido de até 10 MB." });

            const dados = new FormData();
            dados.append("files", pdf, "solicitacao.pdf");
            const resposta = await buscar(ASSINADOR + "/upload", {
                method: "POST",
                headers: { Accept: "application/json" },
                body: dados,
                redirect: "error",
                signal: AbortSignal.timeout(20000),
            });
            if (!resposta.ok) return json(502, { erro: "O Assinador Digital não confirmou o preparo." });

            const retorno = await resposta.json();
            if (typeof retorno?.url !== "string") throw new Error();
            const destino = new URL(retorno.url, ASSINADOR);
            if (
                destino.origin !== ASSINADOR || destino.username || destino.password ||
                destino.search || destino.hash || !CAMINHO_PREPARO.test(destino.pathname)
            ) throw new Error();

            const pagina = await buscar(destino.href, {
                headers: { Accept: "text/html" },
                redirect: "error",
                signal: AbortSignal.timeout(10000),
            });
            if (!pagina.ok) throw new Error();

            // O botão Compartilhar usa o código verificador do PDF na página de preparo.
            const html = await pagina.text();
            const campo = html.match(/<input\b[^>]*\sid\s*=\s*["']CodigoVerificador["'][^>]*>/i)?.[0];
            const codigo = campo?.match(/\svalue\s*=\s*["']([a-zA-Z0-9]{20,128})["']/i)?.[1];
            if (!codigo) throw new Error();
            return json(200, { link: ASSINADOR + "/assinar/" + codigo + "?cv=true" });
        } catch {
            return json(502, { erro: "Não foi possível confirmar o preparo no Assinador Digital." });
        }
    };
}
