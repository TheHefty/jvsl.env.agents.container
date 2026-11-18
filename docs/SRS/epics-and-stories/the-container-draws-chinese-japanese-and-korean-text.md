# Epic: the container draws Chinese, Japanese and Korean text

**A headless browser in the container draws Chinese, Japanese and Korean text as glyphs, not as
boxes.**

Agreed on 2026-10-28, from #219. The image had only DejaVu, so headless Chromium — what Playwright
uses for acceptance tests and screenshots — drew every CJK character as an empty box: a 320 px
screenshot of Iron Squid's `/ja-JP/` showed nothing else. Text assertions and axe still worked,
because they read the DOM; no visual check in those languages did. The epic closes when every image
the extension builds lists a font for `ja`, `ko`, `zh-cn` and `zh-tw`, and a headless Chromium
screenshot of Japanese text in such a container shows glyphs. Tracked as
`jvsl_env_agents_container-o3x`.

**The font is WenQuanYi Micro Hei, in core**, chosen by João Lima over Noto CJK sans-only in core
— about 45 MB in every image — and over leaving it to each project's manifest packages. In core,
because a project should not need to know this to see its own pages; this font, because 1.5 MB ends
the boxes.

**What it deliberately does not buy.** One font covers all four languages, drawn from Droid Sans
Fallback, so Japanese kanji take a Chinese design and widths approximate a real device's rather
than match them. A CJK width or overflow check passing here is evidence, not proof. A project that
needs exact rendering adds `fonts-noto-cjk` to its manifest's packages.

| # | Story | Why in that order |
|---|---|---|
| 1 | every image draws CJK text | no FR — what the image carries; one package, and the assertion that it is there |
