grant delete on table public.solicitacoes_documentos to authenticated;

create policy documentos_remocao_superadmin
    on public.solicitacoes_documentos
    for delete
    to authenticated
    using (
        (select public.acesso_autorizado())
        and exists (
            select 1
            from public.perfis as perfil
            where perfil.id = (select auth.uid())
              and perfil.ativo
              and perfil.perfil = 'superadmin'
        )
    );
