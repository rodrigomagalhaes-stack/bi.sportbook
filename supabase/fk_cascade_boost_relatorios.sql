-- Faz com que, ao excluir uma Welcome Boost, os relatórios salvos
-- vinculados a ela (boost_relatorios) sejam removidos automaticamente,
-- evitando erro de chave estrangeira ao excluir o card.

alter table boost_relatorios
  drop constraint if exists boost_relatorios_boost_id_fkey;

alter table boost_relatorios
  add constraint boost_relatorios_boost_id_fkey
  foreign key (boost_id) references welcome_boosts(id) on delete cascade;
