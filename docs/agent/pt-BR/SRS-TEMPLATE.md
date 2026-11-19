# Especificação de Requisitos de Software

| | |
|---|---|
| **Status** | Rascunho |
| **Data** | AAAA-MM-DD |
| **Autor** | |

O que o sistema precisa fazer, acordado com o usuário antes de qualquer estória ser escrita — veja
[Fluxo de trabalho](WORKFLOW.md). Requisitos são enunciados para que uma pessoa possa prender o
sistema a eles, não para que um programador construa a partir deles: "um rascunho sobrevive ao
navegador ser fechado", não "chame `localStorage.setItem` no blur".

Esta também é a fonte da verdade de como o trabalho é decomposto. A seção de épicos e estórias
abaixo é o que `docs/PLANNING/` espelha; quando a árvore de pastas e este documento discordam, este
documento está certo.

## Requisitos funcionais

O que o sistema faz, agrupado por área. Numere-os para que uma estória e uma task possam citar o
requisito que implementam. Cada um é verificável: um leitor consegue olhar o sistema rodando e dizer
se ele vale.

Para um engajamento de **sustentação** (veja o Tipo no termo de abertura), esta seção é híbrida:
uma linha de base para cada área do sistema existente — o suficiente para um leitor saber o que
está lá e conseguir distinguir uma regressão de uma mudança — e detalhe completo só onde o trabalho
de sustentação alcança. A linha de base sai de engenharia reversa do código que já roda; a
parte detalhada é escrita do mesmo jeito que seria para um projeto novo.

## Requisitos não funcionais

As restrições sob as quais os requisitos funcionais são entregues — desempenho, disponibilidade,
acessibilidade, internacionalização, operabilidade. O piso de acessibilidade e internacionalização
de [Inicialização](INITIALIZATION.md) vai aqui, dimensionado honestamente ao que o projeto de fato
tem como superfície.

## Dados e aspectos legais

O mapa de dados, trazido da inicialização: que dado pessoal existe, por quê, onde mora, a base legal
de cada uso, por quanto tempo é retido, como um pedido do titular é respondido, e quem é o
controlador. **Se nenhum dado pessoal é processado, diga isso aqui** — é o registro que mais poupa
trabalho depois. Isto é andaime, não aconselhamento jurídico; o trabalho é tornar as decisões
explícitas para alguém qualificado revisar.

## Segurança

Do que o sistema precisa ser protegido, e o que foi decidido sobre isso. **Obrigatória: o SRS não é
oferecido para acordo enquanto faltar qualquer uma das três partes abaixo**, e o gate nomeia a parte
que falta — ela é exigida antes de o SRS ser acordado, não preenchida depois que o código existe. Uma
parte sem conteúdo diz isso numa frase ("nada é aceito como risco"), o que é uma decisão; um título
vazio não é.

### Modelo de ameaças

**Escrito pelo usuário, nas palavras dele.** O agente pergunta; não responde por ele. Três
perguntas, cada uma respondida concretamente para este sistema:

- **O que tem valor** — os dados, o dinheiro, o acesso ou a reputação que alguém poderia levar ou
  quebrar.
- **Quem o quereria** — as pessoas ou programas com motivo para tentar, de um usuário curioso a um
  scanner automatizado.
- **Por qual entrada** — todo caminho de entrada: as interfaces que o sistema expõe, as dependências
  que ele puxa, as pessoas e máquinas que guardam as suas credenciais.

### Controles

**Propostos pelo agente, como uma lista de opções, contra o modelo de ameaças acima;
o usuário escolhe.** Para cada ameaça, o menu tem a forma que [Modos](MODES.md) dá a todo trade-off: o
controle mais simples que pode funcionar está sempre nela, mesmo quando o agente não o recomendaria,
e cada opção diz o seu custo e o que teria de ser verdade para ela ser a certa. Registre o que foi
escolhido e por quê; o que não foi escolhido fica como uma linha, para que a escolha possa ser
revista.

### Riscos aceitos

**Escrito pelo usuário.** O que os controles escolhidos deixam aberto, de propósito, e por que isso
é aceitável por ora. Um risco que ninguém escreveu aqui não é aceito; é invisível.

## Épicos e estórias

A decomposição. Uma subseção por épico — uma frase dizendo para que o épico serve, e a lista de
estórias em que ele se quebra com uma linha cada. Esta é a camada de planejamento: um épico é a
unidade sobre a qual uma release é ("Trabalho tem um tema" em [Regras](RULES.md)), uma estória é uma
unidade de comportamento que interessa a uma pessoa, e cada estória ganha uma pasta sob
`docs/PLANNING/<epico>/<estoria>/` quando é grilada.

Mantenha esta seção atual conforme épicos e estórias são adicionados — uma estória nova adiciona uma
linha aqui no mesmo pull request que cria a pasta dela.

## Alternativas consideradas

Os formatos do sistema que estavam na mesa e perderam, uma linha de "rejeitado porque" cada. Inclua
não fazer nada.

## Desfecho

Preenchido quando o status sai de `Rascunho`: o que foi decidido, por quem, e o que o grilling
mudou. O texto original fica como foi escrito; uma mudança de direção posterior é um novo grilling
que emenda este documento, anotado aqui.
