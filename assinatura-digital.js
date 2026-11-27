// Integração semiautomática: o upload e a assinatura acontecem no site oficial.
export const ASSINADOR="https://assinadordigitalexterno.praiagrande.sp.gov.br/";
export function linkAssinaturaValido(valor){
    const s=String(valor||"").trim();
    return s.length<=250&&/^https:\/\/assinadordigitalexterno\.praiagrande\.sp\.gov\.br\/assinar\/[A-Za-z0-9]{20,128}(?:\?cv=true)?$/.test(s);
}
export function abrirAssinador(){
    window.open(ASSINADOR,"_blank","noopener,noreferrer");
}
export function acoesAssinatura(url){
    if(!linkAssinaturaValido(url))return [];
    const a=document.createElement("a");a.href=url;a.target="_blank";a.rel="noopener noreferrer";a.referrerPolicy="no-referrer";a.className="sg-btn sg-btn-secondary";a.textContent="Abrir link de assinatura";
    const b=document.createElement("button");b.type="button";b.className="sg-btn sg-btn-secondary";b.textContent="Copiar link";
    b.onclick=async()=>{try{await navigator.clipboard.writeText(url);b.textContent="Link copiado";setTimeout(()=>{b.textContent="Copiar link";},2000);}catch{window.prompt("Copie o link de assinatura. Compartilhe somente com pessoas autorizadas.",url);}};
    return [a,b];
}
