import { montarLayout } from "./layout.js";
import { supabase } from "./supabase.js";
import { confirmar, sucesso, erro } from "./alertas.js";
export {supabase,confirmar,sucesso,erro,montarLayout};
export const $=id=>document.getElementById(id);
export const hoje=()=>new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
export const fmt=d=>d?d.slice(0,10).split("-").reverse().join("/"):"—";
export const el=(tag,classe,txt)=>{const n=document.createElement(tag);if(classe)n.className=classe;if(txt!==undefined)n.textContent=txt;return n;};
export const botao=(txt,fn,classe="sg-btn sg-btn-secondary")=>{const b=el("button",classe,txt);b.type="button";b.onclick=fn;return b;};
export const estado={pendente:"Pendente",em_analise:"Em análise",aprovado:"Aprovado",recusado:"Recusado",programado:"Programado",em_andamento:"Em andamento",concluido:"Concluído pelo período",cancelado:"Cancelado"};
export const tiposAgenda={evento:"Evento",reuniao:"Reunião",prazo:"Prazo",feriado:"Feriado",ponto_facultativo:"Ponto facultativo",calendario:"Dia sem expediente"};
export const tiposAfast={licenca:"Licença",atestado:"Atestado",afastamento:"Afastamento",outro:"Outro"};
export const estadoAfast=r=>r.cancelado?"cancelado":r.inicio>hoje()?"programado":r.fim&&r.fim<hoje()?"concluido":"em_andamento";
export const etiqueta=(status,rotulo=estado[status]||status)=>el("span","mg-tag mg-"+status,rotulo);
export const termo=s=>s.trim().replace(/[%,().*\\"]/g," ").trim().slice(0,100);
export function registro(titulo,sub,status=null){const card=el("article","mg-record"),top=el("div","mg-record-top"),info=el("div");info.append(el("h3","",titulo),el("p","mg-muted",sub));top.append(info);if(status)top.append(status);card.append(top);return card;}
export function avisoLista(raiz,txt){raiz.replaceChildren(el("p","mg-muted",txt));}
export async function iniciar(titulo,pagina,admin,fn){try{const p=await montarLayout({titulo,pagina,somenteAdmin:admin});if(p)await fn(p);}catch(e){const c=$("carregando");if(c){c.hidden=false;c.textContent="Não foi possível carregar o módulo: "+e.message;}await erro(e.message||"Falha ao carregar o módulo.");}}
export async function baixarPDF(r,b){if(b.disabled)return;b.disabled=true;try{const {data,error}=await supabase.storage.from("documentos-solicitacoes").download(r.arquivo);if(error||!data)throw Error(error?.message||"PDF indisponível.");const url=URL.createObjectURL(new Blob([data],{type:"application/pdf"}));const a=el("a");a.href=url;a.download=r.tipo+"_"+r.data_referencia+".pdf";document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}catch(e){await erro(e.message);}finally{b.disabled=false;}}
