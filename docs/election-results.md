# Apuração Eleitoral 2026

A central pública fica em `/apuracao`; a configuração fica em `/admin/apuracao` e é restrita ao perfil administrador principal.

## Fonte e armazenamento

- A coleta usa exclusivamente arquivos do domínio oficial `resultados.tse.jus.br`.
- Arquivos JWS compactos são verificados com a chave pública Ed25519 do TSE antes de qualquer resultado ser salvo.
- Fotos dos candidatos a presidente, governador e senador são carregadas do diretório oficial `ft` do TSE (`<ciclo>/<eleição>/fotos/<uf>/<sqcand>.jpeg`). Se o TSE ainda não publicou uma foto, o cartão exibe as iniciais.
- Configuração, estado do coletor, trava e snapshots são persistidos na tabela existente `pz_news_settings` do Supabase. Não é necessário criar tabela ou usar armazenamento local.
- O navegador consulta as APIs do RBN; não faz chamadas diretas ao TSE.
- A aplicação identifica resultados antigos ou sem verificação recente como desatualizados. Não estima nem substitui resultados oficiais.

## Configuração de produção

Configure as variáveis no projeto Vercel para os ambientes que devem executar a coleta:

| Variável | Obrigatória | Uso |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` ou `SUPABASE_URL` | Sim | Projeto Supabase que contém `pz_news_settings`. |
| `SUPABASE_SERVICE_ROLE_KEY` | Sim, somente no servidor | Leitura e gravação das configurações e resultados pelo backend. Nunca use o prefixo `NEXT_PUBLIC_`. |
| `CRON_SECRET` | Sim | Protege `/api/cron/election`; configure um segredo aleatório e mantenha o mesmo valor nos ambientes Vercel do cron. |
| `ELECTION_POLL_INTERVAL` | Não | Intervalo mínimo entre coletas, em segundos; limitado pelo código a 60–3600 segundos. |
| `ELECTION_DATA_STALE_AFTER_SECONDS` | Não | Idade máxima aceita para classificar um snapshot como recente; limitado a 60–3600 segundos. |
| `TSE_RESULTS_BASE_URL` | Não | Deve permanecer `https://resultados.tse.jus.br`; outros hosts são rejeitados. |
| `TSE_RESULTS_PUBLIC_JWK` | Não | Substitui a chave oficial embutida em caso de rotação. Deve ser uma chave pública Ed25519 EdDSA obtida de fonte oficial verificada. |

O agendamento está declarado em `vercel.json`. A plataforma e o plano Vercel precisam aceitar a frequência configurada. Se a plataforma não aceitar um cron por minuto, ajuste o cron para uma frequência permitida; o coletor também respeita o intervalo mínimo configurado.

## Operação

1. Acesse **Administração → Apuração Eleitoral** com o perfil administrador principal.
2. Habilite a apuração, a página pública e as atualizações automáticas conforme necessário; escolha cargos, estados, turno e apresentação.
3. Salve. As preferências são armazenadas no Supabase existente.
4. O cron chama `/api/cron/election` com `Authorization: Bearer <CRON_SECRET>`. Uma chamada sem segredo válido é rejeitada.
5. A central consulta `/api/election/settings` e `/api/election/results`, com filtros e paginação. Ela atualiza a apresentação periodicamente, mas só exibe como recente um arquivo oficial cuja data e verificação atendam ao limite de atualidade.

Os resultados eleitorais futuros podem não existir nos arquivos do TSE antes do início da totalização. Nesse caso, a central informa que ainda não recebeu resultados validados. Um build bem-sucedido, por si só, não significa que a configuração de produção, o Supabase, o cron ou a publicação oficial do TSE já foram validados.

## Verificação local

```powershell
npm exec tsc -- --noEmit
npm run lint -- app/admin/apuracao/page.tsx app/apuracao/page.tsx app/components/ElectionResults.tsx app/components/Header.tsx app/lib/elections
node --experimental-strip-types --test app/lib/elections/types.test.mjs
npm run build
```

Para verificar operacionalmente, confirme no ambiente Vercel que as variáveis necessárias estão definidas sem imprimir seus valores; confira os logs do cron e a última verificação na tela administrativa. A ativação depende da disponibilidade real de dados assinados do TSE.
