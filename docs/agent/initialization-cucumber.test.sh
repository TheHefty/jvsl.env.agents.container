#!/usr/bin/env bash
# The initialization interview must make the project's Cucumber choice explicit
# in both languages, and say what each answer does before any task is written.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
EN="$HERE/en/INITIALIZATION.md"
PT="$HERE/pt-BR/INITIALIZATION.md"
FR="$ROOT/docs/SRS/functional-requirements.md"
EPICS="$ROOT/docs/SRS/epics-and-stories.md"

failures=0

require() {
    local file="$1" pattern="$2" message="$3"
    if grep -qiE -- "$pattern" "$file"; then
        echo "ok      $message"
    else
        echo "NOT OK  $message" >&2
        failures=$((failures + 1))
    fi
}

reject() {
    local file="$1" pattern="$2" message="$3"
    if grep -qiE -- "$pattern" "$file"; then
        echo "NOT OK  $message" >&2
        failures=$((failures + 1))
    else
        echo "ok      $message"
    fi
}

require "$EN" '^Eight questions are settled' "English initialization counts eight questions"
require "$PT" '^Oito perguntas são resolvidas' "pt-BR initialization counts eight questions"
reject "$EN" 'Seven questions are settled|until the seven questions' "English initialization no longer leaves the seven-question count"
reject "$PT" 'Sete perguntas são resolvidas|até as sete perguntas' "pt-BR initialization no longer leaves the seven-question count"
require "$EN" 'Beyond the eight questions' "English recommendation follows all eight questions"
require "$PT" 'Além das oito perguntas' "pt-BR recommendation follows all eight questions"

for file in "$EN" "$PT"; do
    require "$file" 'Cucumber' "$(basename "$(dirname "$file")") initialization asks about Cucumber"
    require "$file" '\.feature' "$(basename "$(dirname "$file")") question names feature files"
    require "$file" 'SRS' "$(basename "$(dirname "$file")") answer is recorded in the SRS"
done
require "$EN" 'Gherkin acceptance scenarios' "English question is scoped to Gherkin acceptance scenarios"
require "$PT" 'cenários de aceite Gherkin' "pt-BR question is scoped to Gherkin acceptance scenarios"

require "$EN" 'Yes.*record.*SRS' "English yes answer records the choice"
require "$EN" 'does not install or wire a runner' "English yes answer does not imply installation"
require "$EN" 'No.*record.*SRS' "English no answer records the choice"
require "$EN" 'native tests remain' "English no answer keeps native tests executable"

require "$PT" 'Sim.*registre.*SRS' "pt-BR yes answer records the choice"
require "$PT" 'não instala nem configura um runner' "pt-BR yes answer does not imply installation"
require "$PT" 'Não.*registre.*SRS' "pt-BR no answer records the choice"
require "$PT" 'testes executáveis usam' "pt-BR no answer keeps native tests executable"

require "$FR" 'FR-132.*Cucumber' "the SRS contains the new requirement"
require "$EPICS" 'FR-132.*testing strategy' "the story is mapped to the requirement"
require "$EPICS" 'jvsl_env_agents_container-56e' \
    "the SRS indexes the new epic"

echo
if [ "$failures" -eq 0 ]; then
    echo "initialization-cucumber.test: all checks passed"
else
    echo "initialization-cucumber.test: $failures check(s) failed" >&2
    exit 1
fi
