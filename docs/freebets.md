# Processador de PlayerIds

Ferramenta para processar CSVs de apostas e gerar a lista de PlayerIds aptos ao pagamento de freebet.

## Como usar (interface web)

Abra `index.html` no navegador (dois cliques) ou acesse o site publicado no Vercel.

1. Arraste o CSV ou clique para escolher.
2. Digite o valor mínimo apostado (ex.: 30).
3. Clique em **Processar** para ver as estatísticas.
4. Clique em **Baixar planilha .csv** para gerar o arquivo final.

Tudo roda localmente no navegador — **nenhum dado é enviado para a internet**.

> `processador.html` é a mesma ferramenta com o histórico de "eventos já pagos" salvo na nuvem.

## Regras aplicadas

1. Exclui apostas de cashout / anuladas:
   - `settlement_type = alternar_cashout`
   - `alternar_cashout = true`
   - `resultado` contendo **ANULADO**, **CASHOUT** ou **VOID** (ex.: `ANULADO (void cashout)`)
2. **Soma tudo o que cada jogador apostou** e mantém quem alcançou o valor mínimo no total.
   Um jogador com uma aposta de 20 e outra de 10 soma 30 e entra na lista.
3. Transforma o id do jogador em `esportivabetbr_<id>`.
4. Cada jogador aparece uma única vez na saída.
5. Gera CSV com coluna `PlayerId` (preenchida) e `Amount` (vazia).

Colunas como `pago` e `freebet` são ignoradas.

### Estatísticas mostradas

| Indicador | O que é |
| --- | --- |
| Linhas no CSV | total de apostas lidas |
| Removidas (cashout) | apostas de cashout / anuladas |
| Jogadores únicos | jogadores distintos com pelo menos uma aposta válida |
| Jogadores repetidos | quantos deles aparecem em mais de uma aposta |
| Abaixo do mínimo | jogadores cuja soma não alcançou o valor mínimo |
| PlayerIds finais | jogadores que entram na planilha de pagamento |

## Alternativa por linha de comando

```bash
python processar_csv.py "caminho/arquivo.csv" 30
```

O CSV de saída é gerado na mesma pasta, com sufixo `_PROCESSADO`.

## Formatos de CSV aceitos

O separador (`,`, `;` ou TAB) e o BOM do Excel são detectados automaticamente, e os
nomes das colunas são reconhecidos em qualquer uma das variações abaixo:

| Informação | Nomes aceitos no cabeçalho |
| --- | --- |
| ID do jogador (obrigatório) | `user_id`, `jogador`, `player_id`, `playerid`, `id_jogador`, `customer_id` |
| Valor apostado (obrigatório) | `valor_apostado`, `stake`, `valor`, `valor_aposta`, `amount` |
| Cashout / anulada (opcional) | `settlement_type`, `alternar_cashout`, `resultado`, `status`, `resultado_aposta` |

Assim funcionam tanto o relatório antigo:

```
user_id,utm_source,transaction_id,ext_ticket_id,odd,valor_apostado,data_hora_aposta,settlement_type,alternar_win,alternar_cashout,alternar_loss_signal,valor_resultado
```

quanto o relatório de bilhetes de boost (separado por `;`):

```
share_code;jogador;bilhete;ticket_altenar;criado_em;stake;odd_total;resultado;pago;lucro_jogador;freebet;campanha
```

Valores monetários aceitam vírgula ou ponto decimal e prefixo `R$` (`50`, `27,94`, `R$ 1.234,56`).
