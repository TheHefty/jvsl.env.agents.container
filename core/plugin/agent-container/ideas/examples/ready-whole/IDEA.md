---
state: ready

stacks:
  node: 22
  python: undecided
---

# A tool that reads receipts aloud

## Purpose and who it is for

For people with low vision who keep paper receipts: it reads the total, the date and the shop aloud.

## Decisions and discarded alternatives

- A phone app, not a web page: the camera is the input. A web page was discarded because the
  camera permission prompts in a browser lose the person halfway.

## Stack

Node for the API, Python for the OCR model, its version still open.

## Open questions

- Which OCR model runs on a mid-range phone?
