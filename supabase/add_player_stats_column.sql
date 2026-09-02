-- Stake e GGR por jogador (apenas apostas válidas), salvos junto com cada relatório.
-- Formato: { "<player_id>": [stake, ggr], ... }
-- Com essa coluna preenchida, a tela "Ids Repetidos" mostra valores EXATOS por faixa de
-- repetição em vez de estimativas por média. Relatórios antigos (sem a coluna) continuam
-- funcionando com estimativa.
-- Rodar no SQL Editor do Supabase.
alter table boost_relatorios add column if not exists player_stats jsonb;
