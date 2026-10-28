# The study material's contract

A study topic is `docs/study/<slug>/`, built by the study skill and studied in the extension's Study
view. It holds three files:

| file | written by | what it is |
|---|---|---|
| `guide.md` | the study skill | the material to read, in seven sections, in this order: The problem, Fundamentals, What goes wrong without it, How the project solves it, Trade-offs, Sources, Points for the post |
| `practice.json` | the study skill | the exercises and questions with their answers, by `practice.schema.json` |
| `attempts.json` | the Study view | what the developer wrote before revealing each answer, by `attempts.schema.json`; **ignored by git** (`bin/study-ignore`) |

A practice set has 2 to 4 exercises and 5 to 8 questions. At least one question is a "what if…?"
variation (`"variation": true`), and at least one is about when the solution is the wrong one
(`"angle": "when-not-to-use"`). The schemas say so through `contains` with `minContains` and
`maxContains`.

Four rules are beyond what a schema can say, and `validate.mjs` checks them too:

- `topic` is the folder's name;
- item ids are unique;
- every key in `attempts.json` is an item id;
- no answer appears in `guide.md`. This is checked verbatim, ignoring case and spacing. An answer
  shorter than 12 characters (`null`, `8080`) cannot be told apart from ordinary prose, so it is not
  checked, and a rephrased answer is the developer's to notice.

## One validator, both sides

`validate.mjs` interprets the schema files themselves, so the schema is the single source of the
rules. It understands only the subset the contract uses, and **rejects any keyword it does not know**
rather than skipping it.

- **The study skill** runs it in the container through `bin/study-validate <topic-dir>`. That prints
  one `file: path: message` line per problem and exits 1, or exits 0 in silence.
- **The extension** bundles the same file for the Study view (`src/study/contract.ts`).

`example/bd-labels-are-null/` is a valid topic. The tests break it one rule at a time.
