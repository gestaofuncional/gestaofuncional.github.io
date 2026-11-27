// Integração semiautomática: o upload e a assinatura acontecem no site oficial.
export const ASSINADOR="https://assinadordigitalexterno.praiagrande.sp.gov.br/";
export function linkAssinaturaValido(valor){
    const s=String(valor||"").trim();
    return s.length<=250&&/^https:\/\/assinadordigitalexterno\.praiagrande\.sp\.gov\.br\/assinar\/[A-Za-z0-9]{20,128}(?:\?cv=true)?$/.test(s);
}
export function abrirAssinador(){
    window.open(ASSINADOR,"_blank","noopener,noreferrer");
}
export function botaoCopiarLink(url, aoFalhar) {
    if (!linkAssinaturaValido(url)) return null;
    const link = url.trim();
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "sg-btn sg-btn-secondary";
    botao.textContent = "Copiar link";
    botao.onclick = async () => {
        try {
            await navigator.clipboard.writeText(link);
            botao.textContent = "Link copiado";
            setTimeout(() => { botao.textContent = "Copiar link"; }, 2000);
        } catch {
            await aoFalhar();
        }
    };
    return botao;
}

export function acoesAssinatura(url){
    const copiar = botaoCopiarLink(url, () => window.prompt("Copie o link de assinatura. Compartilhe somente com pessoas autorizadas.", url));
    if (!copiar) return [];
    const a=document.createElement("a");a.href=url;a.target="_blank";a.rel="noopener noreferrer";a.referrerPolicy="no-referrer";a.className="sg-btn sg-btn-secondary";a.textContent="Abrir link de assinatura";
    return [a,copiar];
}
