# O dia de trabalho

Como corre um dia de trabalho com o agente, num projeto que tem rastreador. Agentes escrevem a maior
parte do código; as decisões ficam com o desenvolvedor, e o que o agente descobre no caminho precisa
voltar para ele em vez de ficar em commits e documentos. Quatro cerimônias são esse caminho de volta.

Elas vêm no plugin `agent-container` da imagem, que o wrapper do `claude` carrega, então todo projeto
as tem sem instalar nada. O que vale em todo turno também está nas [Regras](RULES.md), em *O dia de
trabalho*; isto é o resto, lido quando é o assunto.

Caminhos fora desta pasta são escritos como código, não como links, pelo motivo dado nas
[Regras](RULES.md).

## O dia

| Cerimônia | Skill | Quando | O que deixa |
|---|---|---|---|
| Daily | `agent-container:daily` | início do dia | as tasks acordadas do dia, cada uma com seu critério de pronto, reivindicadas em nome do desenvolvedor |
| Review | `agent-container:review` | fim do dia, primeiro | cada task aceita nas palavras do próprio desenvolvedor, ou reaberta com o que falta |
| Retro | `agent-container:retro` | fim do dia, segundo | a entrada do dia no diário |
| Refinement | `agent-container:refine` | fim do dia, por último | as próximas stories e tasks, propostas e acordadas |

**As cerimônias são o calendário da cadeia, não um atalho em volta dela.** Todo elo da cadeia do
[Workflow](WORKFLOW.md) continua acordado antes de ser escrito. O refinement é onde stories e tasks
são propostas e acordadas, e a daily só pega o que foi acordado. Um item que chega cru numa daily
volta para o refinement em vez de ser construído naquele dia.

Cada cerimônia roda `needs-tracker` primeiro e para, numa linha dizendo como ligar o rastreador, num
projeto cujo manifest não diz `"beads": true`.

## A daily

A daily lê o rastreador com `daily-brief`, que mostra o que está em andamento, o que está bloqueado e
pelo quê, o que está pronto, e o que a entrada de ontem no diário deixou em aberto. Ela propõe uma
lista curta. **O desenvolvedor escolhe**, e nada fica em andamento antes de ele confirmar.

`daily-check` fica entre a escolha e a reivindicação. Ele só deixa passar uma task acordada, aberta,
sem bloqueio aberto e com critério de pronto. **O critério de pronto de uma task é o seu
`acceptance_criteria`.** Quando falta, a daily pergunta ao desenvolvedor e grava a resposta dele com
`bd update <id> --acceptance`. Ela nunca escreve um por conta própria. A reivindicação é
`bd update <id> --claim --actor "<name>"`, em nome do desenvolvedor, tirado de `git config user.name`.
Dentro do sandbox o bd gravaria `unknown`.

A daily não escreve código.

## O bloco do fim do dia

Review, retro e refinement rodam juntos no fim do dia, nessa ordem, em trinta a quarenta e cinco
minutos. O review fecha o que foi feito, a retro transforma isso no que foi aprendido, e o
refinement prepara o que vem depois.

## Pronto é explicado

**Testes passando são necessários e não bastam: uma task está pronta quando o desenvolvedor sabe
explicá-la.** O review mostra cada task contra o seu critério e pede ao desenvolvedor que explique a
mudança com as próprias palavras. Quando ele ainda não sabe, o agente percorre a mudança com ele até
saber. `review-accept` recusa uma aceitação sem essas palavras, e as guarda literalmente nas notas da
task.

**Aceitar não é fazer merge.** Uma task aceita fecha quando o seu pull request entra, o que o
`review-settle` confere com o `gh`. Um pull request aberto, fechado sem merge, ou ausente deixa a task
aberta, e o motivo é dito. Um `gh` que não consegue responder nunca é lido como merge. O
`review-reopen` guarda o que falta.

## O diário

A retro **nunca é pulada**. Num dia curto ela é curta, mas roda. O agente relata quatro coisas: o
que descobriu, com como achou cada uma e por que importa; o que o surpreendeu; o que deu errado; e
tudo o que decidiu sozinho. O desenvolvedor escreve ou aprova a linha sobre o que aprendeu. O agente
nunca escreve essa linha por conta própria.

A entrada do dia fica no rastreador, não num arquivo. É um `chore` com a label `journal`, fechado
quando é escrito para que nenhuma daily o ofereça como trabalho, e com a chave no metadado `day`. O
dia é a data local, então uma retro feita tarde da noite pertence àquele dia. `journal-write` a
escreve, e uma segunda retro no mesmo dia reescreve a mesma entrada. As seções, nesta ordem e com
estes nomes exatos, porque a daily e a skill de estudo as leem:

```
## Discovered
### <one discovery>
How it was found: …
Why it matters: …
Blog candidate: yes | no
## Surprised
## Went wrong
## Decided alone
## What I learned
## Left open
## Links
```

`journal-write` recusa uma entrada sem "What I learned", ou com "Decided alone" vazio; essa seção diz
"Nothing." quando não houve nada. `Blog candidate: yes` marca uma descoberta sobre a qual o
desenvolvedor escolheu escrever, e põe a label `blog-candidate` na entrada para a skill de estudo.
Quando o último dia com trabalho não tem entrada, a daily seguinte diz que a retro foi pulada.

## O que uma task registra

- **O seu critério de pronto**, em `acceptance_criteria`, escrito no refinement.
- **O seu pull request**, registrado quando o pull request é aberto, com
  `bd update <id> --set-metadata pr=<n>`. O review o lê para mostrar o que mudou e para fechar a task
  quando ele entra. É metadado, não `external_ref`, que guarda de onde um item veio, como `gh-154`
  para uma dívida aberta como issue do GitHub. Uma dívida corrigida por um pull request tem os dois.
- **A sua aceitação**, nas palavras do desenvolvedor, nas suas notas.

## Onde não se aplica

Um projeto sem rastreador não tem cerimônias. As skills estão na sua imagem e recusam numa linha. O
seu trabalho segue o [Workflow](WORKFLOW.md) como antes.
