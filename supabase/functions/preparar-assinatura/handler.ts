const ASSINADOR = "https://assinadordigitalexterno.praiagrande.sp.gov.br";
const LIMITE_PDF = 10 * 1024 * 1024;
const CAMINHO_PREPARO = /^\/assinar\/[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;

type Configuracao = {
    habilitado: boolean;
    origemPortal: string;
    supabaseUrl: string;
    supabaseApiKey: string;
    buscar?: typeof fetch;
};

async function lerPdf(corpo: ReadableStream<Uint8Array> | null): Promise<Blob | null> {
    if (!corpo) return null;
    const leitor = corpo.getReader();
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
    const habilitado = Boolean(config.habilitado && config.supabaseUrl && config.supabaseApiKey);
    const cors = {
        "Access-Control-Allow-Origin": config.origemPortal,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-compartilhamento-autorizado",
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
        if (pedido.method !== "POST") return json(405, { erro: "Método indisponível." });
        if (!habilitado) return json(503, { erro: "Preparo automático indisponível." });

        const authorization = pedido.headers.get("authorization");
        if (!authorization?.startsWith("Bearer ")) return json(401, { erro: "Sessão inválida." });

        if (pedido.headers.get("x-compartilhamento-autorizado") !== "true") {
            return json(400, { erro: "Confirme a autorização para compartilhar o PDF." });
        }
        if (pedido.headers.get("content-type") !== "application/pdf") {
            return json(415, { erro: "Envie um PDF." });
        }
        if (Number(pedido.headers.get("content-length")) > LIMITE_PDF) {
            return json(413, { erro: "O PDF deve ter até 10 MB." });
        }

        try {
            const sessao = await buscar(config.supabaseUrl + "/rest/v1/rpc/acesso_autorizado", {
                method: "POST",
                headers: { authorization, apikey: config.supabaseApiKey, "Content-Type": "application/json" },
                body: "{}",
                redirect: "error",
                signal: AbortSignal.timeout(5000),
            });
            if (!sessao.ok || await sessao.json() !== true) {
                return json(403, { erro: "Sessão inválida. Entre novamente." });
            }

            const pdf = await lerPdf(pedido.body);
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
            const link = ASSINADOR + "/assinar/" + codigo + "?cv=true";
            return json(200, { preparado: true, link });
        } catch {
            return json(502, { erro: "Não foi possível confirmar o preparo no Assinador Digital." });
        }
    };
}
