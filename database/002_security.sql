-- Executar APÓS 001_schema.sql. Não exponha service_role no navegador.
create or replace function public.eh_colaborador(uid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.perfis where id=uid and tipo='colaborador');
$$;
create or replace function public.gerencia_animal(uid uuid, aid bigint)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.colaboradores_animais where colaborador_id=uid and animal_id=aid);
$$;
create or replace function public.participa_interesse(uid uuid, iid bigint)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.interesses i where i.id=iid and
 (i.adotante_id=uid or public.gerencia_animal(uid,i.animal_id)));
$$;
revoke all on function public.eh_colaborador(uuid) from public;
revoke all on function public.gerencia_animal(uuid,bigint) from public;
revoke all on function public.participa_interesse(uuid,bigint) from public;
grant execute on function public.eh_colaborador(uuid) to authenticated;
grant execute on function public.gerencia_animal(uuid,bigint) to authenticated;
grant execute on function public.participa_interesse(uuid,bigint) to authenticated;

-- Criação automática de perfil (tipo sempre adotante; não confia em metadados de papel).
create or replace function public.novo_usuario()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.perfis(id,email,telefone,tipo)
 values(new.id,coalesce(new.email,''),coalesce(new.raw_user_meta_data->>'telefone',''),'adotante');
 return new;
end; $$;
create trigger trg_novo_usuario after insert on auth.users
for each row execute function public.novo_usuario();

-- Ao criar animal, vincula automaticamente o colaborador responsável.
create or replace function public.vincular_criador()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.colaboradores_animais(colaborador_id,animal_id)
 values(new.criado_por,new.id);
 return new;
end; $$;
create trigger trg_vincular_criador after insert on public.animais
for each row when (new.criado_por is not null) execute function public.vincular_criador();

alter table public.perfis enable row level security;
alter table public.questionarios enable row level security;
alter table public.animais enable row level security;
alter table public.colaboradores_animais enable row level security;
alter table public.animais_curtidos enable row level security;
alter table public.interesses enable row level security;
alter table public.mensagens enable row level security;

create policy perfil_ler on public.perfis for select to authenticated
 using(id=(select auth.uid()) or exists(select 1 from public.interesses i where i.adotante_id=perfis.id and public.gerencia_animal((select auth.uid()),i.animal_id)));
-- Não permitir atualização direta de tipo, e-mail ou telefone por clientes.
-- Telefone será alterado pelo fluxo de auth metadata + rotina confiável futura.
create policy questionario_ler on public.questionarios for select to authenticated using(adotante_id=(select auth.uid()));
create policy questionario_inserir on public.questionarios for insert to authenticated with check(adotante_id=(select auth.uid()) and not public.eh_colaborador((select auth.uid())));
create policy questionario_atualizar on public.questionarios for update to authenticated using(adotante_id=(select auth.uid())) with check(adotante_id=(select auth.uid()));

create policy animais_ler on public.animais for select to authenticated
 using(status='disponivel' or public.gerencia_animal((select auth.uid()),id));
create policy animais_inserir on public.animais for insert to authenticated
 with check(public.eh_colaborador((select auth.uid())) and criado_por=(select auth.uid()));
create policy animais_atualizar on public.animais for update to authenticated
 using(public.gerencia_animal((select auth.uid()),id))
 with check(public.gerencia_animal((select auth.uid()),id));
create policy animais_excluir on public.animais for delete to authenticated
 using(public.gerencia_animal((select auth.uid()),id));
create policy vinculos_ler on public.colaboradores_animais for select to authenticated
 using(colaborador_id=(select auth.uid()));
-- Inclusão de colaboradores adicionais apenas por administrador no SQL Editor / backend privilegiado.

create policy curtidas_ler on public.animais_curtidos for select to authenticated using(adotante_id=(select auth.uid()));
create policy curtidas_inserir on public.animais_curtidos for insert to authenticated
 with check(adotante_id=(select auth.uid()) and not public.eh_colaborador((select auth.uid())));
create policy curtidas_excluir on public.animais_curtidos for delete to authenticated using(adotante_id=(select auth.uid()));

create policy interesses_ler on public.interesses for select to authenticated
 using(adotante_id=(select auth.uid()) or public.gerencia_animal((select auth.uid()),animal_id));
create policy interesses_inserir on public.interesses for insert to authenticated
 with check(adotante_id=(select auth.uid()) and status='pendente' and not public.eh_colaborador((select auth.uid())));
create policy interesses_atualizar on public.interesses for update to authenticated
 using(public.gerencia_animal((select auth.uid()),animal_id))
 with check(public.gerencia_animal((select auth.uid()),animal_id));
create policy interesses_excluir on public.interesses for delete to authenticated
 using(adotante_id=(select auth.uid()) or public.gerencia_animal((select auth.uid()),animal_id));

create policy mensagens_ler on public.mensagens for select to authenticated
 using(public.participa_interesse((select auth.uid()),interesse_id));
create policy mensagens_inserir on public.mensagens for insert to authenticated
 with check(remetente_id=(select auth.uid()) and public.participa_interesse((select auth.uid()),interesse_id));

-- Protege campos imutáveis em atualizações de animais e interesses (além do RLS).
create or replace function public.bloquear_mudanca_dono()
returns trigger language plpgsql set search_path = '' as $$
begin
 if new.criado_por is distinct from old.criado_por then
  raise exception 'Criador do animal não pode ser alterado';
 end if;
 return new;
end; $$;
create trigger trg_bloquear_dono before update on public.animais
for each row execute function public.bloquear_mudanca_dono();
create or replace function public.bloquear_mudanca_interesse()
returns trigger language plpgsql set search_path = '' as $$
begin
 if new.adotante_id is distinct from old.adotante_id or new.animal_id is distinct from old.animal_id then
  raise exception 'Participantes do interesse não podem ser alterados';
 end if;
 return new;
end; $$;
create trigger trg_bloquear_interesse before update on public.interesses
for each row execute function public.bloquear_mudanca_interesse();
