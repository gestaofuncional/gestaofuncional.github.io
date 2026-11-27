import { linkAssinaturaValido, acoesAssinatura } from "./assinatura-digital.js";
import { supabase } from "./supabase.js";
import { confirmar, sucesso, erro, Alerta } from "./alertas.js";

const BUCKET="documentos-solicitacoes";
const ATUALIZAR_DOCUMENTOS="sg-documentos-atualizar";
const ABONADA_JA_ENVIADA="Já existe um documento enviado para esta abonada.";
const TIPOS={abonada:"Falta abonada",justificativa:"Justificativa"};
const ESTADOS={pendente:"Pendente",em_analise:"Em análise",aprovado:"Aprovado",recusado:"Recusado"};
const $=id=>document.getElementById(id);
const el=(tag,classe,texto)=>{const n=document.createElement(tag);if(classe)n.className=classe;if(texto!==undefined)n.textContent=texto;return n;};
const fmt=d=>d?d.split("-").reverse().join("/"):"—";
const fmtHora=d=>new Date(d).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"});
const btn=(texto,acao,classe="sg-btn sg-btn-secondary")=>{const b=el("button",classe,texto);b.type="button";b.onclick=acao;return b;};

async function baixar(r,b){
    if(b.disabled)return;b.disabled=true;
    try{
        const {data,error}=await supabase.storage.from(BUCKET).download(r.arquivo);
        if(error||!data)throw Error(error?.message||"PDF indisponível.");
        const url=URL.createObjectURL(new Blob([data],{type:"application/pdf"}));
        const a=el("a");a.href=url;a.download=(r.tipo==="abonada"?"Falta_Abonada":"Justificativa")+"_"+r.data_referencia+".pdf";document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
    }catch(e){await erro(e.message);}finally{b.disabled=false;}
}

function painelLinkAssinatura(url) {
    const [abrir, copiar] = acoesAssinatura(url);
    if (!abrir) return null;

    abrir.className = "doc-compartilhamento-endereco";
    abrir.setAttribute("aria-label", "Abrir link de assinatura");
    abrir.textContent = url.trim();

    const painel = el("div", "doc-compartilhamento");
    const linha = el("div", "doc-compartilhamento-linha");
    linha.append(abrir, copiar);
    painel.append(el("p", "doc-compartilhamento-titulo", "Link de assinatura"), linha);
    return painel;
}

function listaDocumentos({raiz,status,anterior,proxima,carregarConsulta,admin=false}){
    let pagina=0,versao=0,ocupado=false;const tamanho=30;
    async function carregar(reset=false){
        if(reset)pagina=0;
        const v=++versao;status.textContent="Carregando...";anterior.disabled=true;proxima.disabled=true;
        try{
            let q=supabase.from("solicitacoes_documentos").select("id,usuario_id,tipo,rf,nome,secretaria,data_referencia,arquivo,assinatura_link,status,motivo_decisao,criado_em,atualizado_em",{count:"exact"});
            q=carregarConsulta(q);
            const {data,error,count}=await q.order("criado_em",{ascending:false}).order("id",{ascending:false}).range(pagina*tamanho,(pagina+1)*tamanho-1);
            if(v!==versao)return;
            if(error)throw error;
            if(!data.length&&pagina>0){pagina--;return carregar();}
            raiz.replaceChildren();status.textContent=count?count+" solicitação(ões)":"Nenhuma solicitação encontrada.";
            anterior.disabled=pagina===0;proxima.disabled=(pagina+1)*tamanho>=(count||0);
            for(const r of data){
                const card=el("article","doc-solicitacao"), topo=el("div","doc-topo"), info=el("div");
                info.append(el("strong","",TIPOS[r.tipo]+" • "+fmt(r.data_referencia)));
                if(admin)info.append(el("p","doc-muted",r.nome+" • RF "+r.rf+(r.secretaria?" • "+r.secretaria:"")));
                info.append(el("p","doc-muted","Enviado em "+fmtHora(r.criado_em)));
                const etiqueta=el("span","doc-status doc-"+r.status,ESTADOS[r.status]||r.status);topo.append(info,etiqueta);card.append(topo);
                if(r.motivo_decisao)card.append(el("p","doc-motivo","Motivo: "+r.motivo_decisao));
                const aguardandoDecisao = ["pendente", "em_analise"].includes(r.status);
                const acoes = el("div", "doc-acoes");
                const baixarBtn = btn("Baixar PDF", () => baixar(r, baixarBtn));
                acoes.append(baixarBtn);
                if (admin) {
                    const assinatura = painelLinkAssinatura(r.assinatura_link);
                    if (assinatura) card.append(assinatura);
                } else {
                    acoes.append(...acoesAssinatura(r.assinatura_link));
                    if (aguardandoDecisao) {
                        const rotulo = r.assinatura_link ? "Alterar link de assinatura" : "Adicionar link de assinatura";
                        acoes.append(btn(rotulo, () => vincular(r)));
                    }
                }
                if(admin&&aguardandoDecisao){
                    for(const [estado,label] of [["em_analise","Analisar"],["aprovado","Aprovar"],["recusado","Recusar"]]){
                        if(estado===r.status)continue;
                        const b=btn(label,()=>decidir(r,estado,b),estado==="aprovado"?"sg-btn sg-btn-success":estado==="recusado"?"sg-btn sg-btn-danger":"sg-btn sg-btn-secondary");
                        acoes.append(b);
                    }
                }
                card.append(acoes);raiz.append(card);
            }
        }catch(e){if(v===versao){raiz.replaceChildren();status.textContent="Não foi possível consultar: "+e.message;}}
    }
    async function vincular(r){
        if(admin||ocupado)return;ocupado=true;
        try{
            const resp=await Alerta.fire({titleText:"Link de assinatura",input:"url",inputValue:r.assinatura_link||"",inputAttributes:{maxlength:"250"},showCancelButton:true,confirmButtonText:"Salvar link",cancelButtonText:"Cancelar",inputValidator:v=>linkAssinaturaValido(v)?undefined:"Cole o link individual de compartilhamento do assinador oficial."});
            if(!resp.isConfirmed)return;
            const {error}=await supabase.rpc("vincular_assinatura_documento",{p_id:r.id,p_link:resp.value.trim(),p_revisao:r.atualizado_em});
            if(error)throw error;await sucesso("Link vinculado à solicitação.");await carregar();
        }catch(e){await erro(e.message);}finally{ocupado=false;}
    }
    async function decidir(r,estado,b){
        if(!admin||ocupado)return;ocupado=true;b.disabled=true;
        try{
            let motivo=null;
            if(estado==="recusado"){
                const resp=await Alerta.fire({titleText:"Motivo da recusa",input:"textarea",inputAttributes:{maxlength:"500"},showCancelButton:true,confirmButtonText:"Recusar",cancelButtonText:"Cancelar",inputValidator:v=>!v?.trim()?"Informe o motivo.":undefined});
                if(!resp.isConfirmed)return;motivo=resp.value.trim();
            }else if(!await confirmar(estado==="aprovado"?"Aprovar documento?":"Iniciar análise?",TIPOS[r.tipo]+" — "+r.nome+" — "+fmt(r.data_referencia)))return;
            const {error}=await supabase.rpc("decidir_documento_solicitacao",{p_id:r.id,p_status:estado,p_motivo:motivo,p_revisao:r.atualizado_em});
            if(error)throw error;
            await sucesso("Situação atualizada. O funcionário receberá uma notificação.");await carregar();
        }catch(e){await erro(e.message);}finally{ocupado=false;b.disabled=false;}
    }
    anterior.onclick=()=>{pagina=Math.max(0,pagina-1);carregar();};proxima.onclick=()=>{pagina++;carregar();};
    return carregar;
}

export async function enviarDocumentoParaAnalise(pdf, envio) {
    const { data: { user }, error: erroSessao } = await supabase.auth.getUser();
    if (erroSessao || !user || user.id !== envio.usuarioId) {
        throw new Error("Sessão inválida. Entre novamente e gere o PDF.");
    }

    if (!envio.link) {
        if (envio.tipo === "abonada") {
            const { data: existente, error } = await supabase.from("solicitacoes_documentos")
                .select("id").eq("usuario_id", user.id).eq("tipo", envio.tipo)
                .eq("data_referencia", envio.data).neq("status", "recusado").limit(1).maybeSingle();
            if (error) throw new Error("Não foi possível verificar os documentos enviados para esta abonada.");
            if (existente) throw new Error(ABONADA_JA_ENVIADA);
        }

        const { data, error } = await supabase.functions.invoke("preparar-assinatura", {
            body: pdf,
            headers: {
                "Content-Type": "application/pdf",
                "X-Compartilhamento-Autorizado": "true",
            },
        });
        if (error || data?.preparado !== true || !linkAssinaturaValido(data.link)) {
            throw new Error("Não foi possível confirmar o link do PDF no Assinador Digital.");
        }
        envio.link = data.link.trim();
    }

    envio.arquivo ??= user.id + "/" + crypto.randomUUID() + ".pdf";
    const arquivos = supabase.storage.from(BUCKET);
    if (!envio.armazenado) {
        const { error } = await arquivos.upload(envio.arquivo, pdf, { contentType: "application/pdf", upsert: false });
        if (error) {
            // O envio anterior pode ter gravado este arquivo mesmo sem devolver uma resposta.
            const { data: objeto } = await arquivos.info(envio.arquivo);
            if (objeto?.size !== pdf.size || objeto.contentType !== "application/pdf") {
                throw new Error("O PDF foi preparado. Tente novamente para salvar o arquivo no portal.");
            }
        }
        envio.armazenado = true;
    }

    const { error } = await supabase.rpc("enviar_documento_com_assinatura", {
        p_tipo: envio.tipo,
        p_data: envio.data,
        p_arquivo: envio.arquivo,
        p_link: envio.link,
    });
    if (error?.code === "P0001" && error.message === ABONADA_JA_ENVIADA) {
        const { error: erroLimpeza } = await arquivos.remove([envio.arquivo]);
        if (!erroLimpeza) envio.armazenado = false;
        throw new Error(ABONADA_JA_ENVIADA);
    }
    if (error) throw new Error("O PDF foi preparado. Tente novamente para concluir o envio para análise.");

    window.dispatchEvent(new Event(ATUALIZAR_DOCUMENTOS));
}

export async function iniciarMeusDocumentos(tipo,usuarioId){
    const atualizar=listaDocumentos({
        raiz:$("docLista"),status:$("docStatus"),anterior:$("docAnterior"),proxima:$("docProxima"),
        carregarConsulta:q=>q.eq("usuario_id",usuarioId).eq("tipo",tipo),
    });
    $("docAtualizar").onclick=()=>atualizar(true);
    window.addEventListener(ATUALIZAR_DOCUMENTOS,()=>atualizar(true));
    $("docHistorico").hidden=false;
    await atualizar();
}
export async function iniciarAdministracaoDocumentos(){
    const atualizar=listaDocumentos({raiz:$("docLista"),status:$("docStatus"),anterior:$("docAnterior"),proxima:$("docProxima"),admin:true,carregarConsulta:q=>{
        const tipo=$("docTipo").value,status=$("docFiltro").value;
        if(tipo)q=q.eq("tipo",tipo);
        if(status==="pendentes")q=q.in("status",["pendente","em_analise"]);else if(status)q=q.eq("status",status);
        const busca=$("docBusca").value.trim().replace(/[%,().*]/g," ");
        if(busca)q=q.or("rf.ilike.%"+busca+"%,nome.ilike.%"+busca+"%");
        return q;
    }});
    $("docAtualizar").onclick=()=>atualizar(true);$("docTipo").onchange=()=>atualizar(true);$("docFiltro").onchange=()=>atualizar(true);
    let timer;$("docBusca").oninput=()=>{clearTimeout(timer);timer=setTimeout(()=>atualizar(true),300);};
    await atualizar();
}
