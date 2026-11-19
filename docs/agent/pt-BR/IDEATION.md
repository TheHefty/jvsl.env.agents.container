# Ideação

As regras do container de ideação: o que o comando `Brainstorm` abre, onde uma ideia toma forma
antes de virar um projeto (épico *uma ideia toma forma num container próprio antes de virar um
projeto*). Elas ocupam ali o lugar das regras de desenvolvimento. [Modos](MODES.md) e
[Regras](RULES.md) governam um projeto; isto governa um container que não é um.

## Nenhum código é escrito

**Neste container nenhum código é escrito.** Nem protótipo, nem spike, nem script para testar uma
ideia. O que toma forma aqui é o que construir e por quê: para quem é, o que foi decidido, o que foi
descartado, qual stack. Código pertence a um projeto, que começa de uma ideia quando ela está
`ready` e passa pela sua própria inicialização, carta e SRS.

Quando uma questão só pode ser resolvida tentando algo, anote-a como pergunta em aberto. Ela vira um
spike no projeto, onde um spike é permitido e jogado fora.

## Uma pasta por ideia

Toda ideia é uma pasta própria: `ideas/<slug>/IDEA.md`, sob a pasta de ideias no
`~/.claude/agent-container/` do desenvolvedor. O slug é curto, em minúsculas, palavras unidas por
hífens, e escolhido com o desenvolvedor quando a ideia começa. Nada mais vai na pasta de ideias além
destas pastas, do marcador da memória e do `.devcontainer/` do próprio container, que o comando
`Brainstorm` escreve.

O `IDEA.md` segue o contrato que a extensão verifica, descrito no `ideas/README.md` do plugin
(`/opt/jvsl/plugins/agent-container/ideas/README.md` na imagem):

- um front matter com um `state:`, e um mapa `stacks:` assim que se fala de stack;
- quatro seções, escritas como o contrato as escreve, em inglês seja qual for a língua do resto:
  `## Purpose and who it is for`, `## Decisions and discarded alternatives`, `## Stack` e
  `## Open questions`.

Uma ideia nova começa `raw`, com os quatro títulos presentes e vazios.

## Os estados

- `raw`: acabou de começar; pouco mais que uma frase.
- `exploring`: sendo conversada.
- `ready`: inteira o bastante para começar um projeto, depois da consolidação abaixo.
- `discarded`: não vai adiante. Fica, com o porquê, nas suas decisões; uma ideia descartada é o que
  impede a mesma de ser moldada de novo do zero.
- `became project: <nome>`: um projeto foi criado a partir dela. **Só a extensão marca isto**,
  quando o *Create project* começa da ideia; o agente nunca o escreve.

O agente muda o estado só com a palavra do desenvolvedor, e diz quando muda.

## Uma conversa para todas as ideias

Há **uma conversa para todas as ideias**, e uma memória, mantida entre os dias. No começo de uma
sessão, liste as ideias com os seus estados e pergunte ao desenvolvedor qual ideia continuar ou se
quer começar outra. Não escolha por ele, e não misture duas ideias num `IDEA.md`.

## Antes de ready, consolide

A memória deste container não acompanha uma ideia até o projeto: a memória é uma por container. O
que atravessa é o `IDEA.md` e nada mais. Então **antes de uma ideia ser marcada `ready`, o que vive
só na memória é consolidado no `IDEA.md`**: as decisões, as alternativas descartadas e por quê, a
stack, e as perguntas ainda em aberto. Leia a memória da ideia, escreva o que falta, e mostre ao
desenvolvedor o que foi acrescentado antes de pedir a mudança de estado.

Uma ideia cujas quatro seções não estão todas preenchidas não está `ready`, e o contrato a recusa.
