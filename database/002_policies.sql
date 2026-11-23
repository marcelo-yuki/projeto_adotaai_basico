-- Políticas iniciais. Colaboradores precisam ser provisionados por fluxo confiável.
alter table public.perfis enable row level security;
alter table public.questionarios enable row level security;
alter table public.animais enable row level security;
alter table public.colaboradores_animais enable row level security;
alter table public.animais_curtidos enable row level security;
alter table public.interesses enable row level security;
alter table public.mensagens enable row level security;
create policy "perfil proprio leitura" on public.perfis for select to authenticated using (id=auth.uid());
create policy "perfil proprio cadastro" on public.perfis for insert to authenticated with check (id=auth.uid() and tipo='adotante');
create policy "perfil proprio edicao" on public.perfis for update to authenticated using (id=auth.uid()) with check (id=auth.uid() and tipo='adotante');
create policy "questionario proprio leitura" on public.questionarios for select to authenticated using (adotante_id=auth.uid());
create policy "questionario proprio cadastro" on public.questionarios for insert to authenticated with check (adotante_id=auth.uid());
create policy "questionario proprio edicao" on public.questionarios for update to authenticated using (adotante_id=auth.uid()) with check (adotante_id=auth.uid());
create policy "animais disponiveis leitura" on public.animais for select to authenticated using (status='disponivel' or exists (select 1 from public.colaboradores_animais ca where ca.animal_id=animais.id and ca.colaborador_id=auth.uid()));
create policy "vinculos proprios leitura" on public.colaboradores_animais for select to authenticated using (colaborador_id=auth.uid());
create policy "curtidas proprias leitura" on public.animais_curtidos for select to authenticated using (adotante_id=auth.uid());
create policy "curtidas proprias cadastro" on public.animais_curtidos for insert to authenticated with check (adotante_id=auth.uid());
create policy "curtidas proprias exclusao" on public.animais_curtidos for delete to authenticated using (adotante_id=auth.uid());
create policy "interesses participantes leitura" on public.interesses for select to authenticated using (adotante_id=auth.uid() or exists(select 1 from public.colaboradores_animais ca where ca.animal_id=interesses.animal_id and ca.colaborador_id=auth.uid()));
create policy "interesses adotante cadastro" on public.interesses for insert to authenticated with check (adotante_id=auth.uid());
create policy "mensagens participantes leitura" on public.mensagens for select to authenticated using (exists(select 1 from public.interesses i where i.id=mensagens.interesse_id and (i.adotante_id=auth.uid() or exists(select 1 from public.colaboradores_animais ca where ca.animal_id=i.animal_id and ca.colaborador_id=auth.uid()))));
create policy "mensagens participantes cadastro" on public.mensagens for insert to authenticated with check (remetente_id=auth.uid() and exists(select 1 from public.interesses i where i.id=mensagens.interesse_id and (i.adotante_id=auth.uid() or exists(select 1 from public.colaboradores_animais ca where ca.animal_id=i.animal_id and ca.colaborador_id=auth.uid()))));
-- Escrita de animais e atribuição de colaboradores requerem políticas específicas ou RPCs seguras.
