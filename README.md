# sistema-gestao
Sistema de gestão com autenticação e controle de acesso.

## Preparo de assinatura digital

O botão **Enviar para análise**, disponível após gerar uma falta abonada ou uma justificativa, envia o PDF à Edge Function `preparar-assinatura`. A função usa a sessão validada do funcionário e confirma o preparo no Assinador Digital da Prefeitura. O portal guarda o PDF no bucket privado e registra a solicitação com o link de compartilhamento. Os administradores podem abrir o link em **Aprovação de documentos**.

A função usa o formulário público do Assinador. O portal pede confirmação de que o PDF pode ser compartilhado com quem tiver o link. A variável `ASSINADOR_DIGITAL_HABILITADO=false` desabilita o envio, e `ASSINADOR_DIGITAL_ORIGEM_PORTAL` permite configurar outra origem HTTPS.

Para testar a função com serviços simulados, use Node.js 24 e execute `node --test tests/preparar-assinatura.test.mjs`.
