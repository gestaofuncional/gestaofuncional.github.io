# sistema-gestao
Sistema de gestão com autenticação e controle de acesso.

## Preparo de assinatura digital

Falta abonada e justificativa aceitam o PDF gerado no portal ou um PDF selecionado. O preparo automático, quando habilitado, usa o PDF do bucket privado e roda na Edge Function `preparar-assinatura` com a sessão do funcionário. O link individual é registrado pela RPC existente, que aciona as notificações e deixa o link disponível em Aprovação de documentos. A assinatura continua sendo feita no serviço da Prefeitura, pela pessoa responsável.

A função vem desativada. A ativação usa `ASSINADOR_DIGITAL_HABILITADO=true` na Edge Function. Se o portal estiver em outro domínio, configure `ASSINADOR_DIGITAL_ORIGEM_PORTAL` com sua origem HTTPS. Antes de ativar em produção, confirme com a Prefeitura a autorização de uso automatizado do formulário e valide o fluxo em ambiente de teste com PDFs fictícios. A Prefeitura não fornece uma API para esta integração. O formulário público pode mudar sem aviso.

O endereço de compartilhamento permite acesso ao PDF a quem tiver o link. O funcionário deve selecionar o preparo automático apenas para documentos autorizados para esse tipo de compartilhamento. A opção manual e o envio exclusivo ao portal continuam disponíveis. Segundo as orientações da Prefeitura, arquivos sem assinatura expiram após 15 dias.

Testes da função com serviços simulados, usando Node.js 24:

```sh
node --test tests/preparar-assinatura.test.mjs
```
