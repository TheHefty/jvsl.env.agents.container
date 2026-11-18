# Epic: the container keeps the developer's time

**Inside the container and the agent's sandbox, the time of day is the developer's own.**

Agreed on 2026-10-28, found while designing the retro. The container ran in UTC — `/etc/localtime`
pointing at `Etc/UTC`, no `TZ` — while the developer works at -0300, so the ceremonies' "today"
turned at 21:00 their time: a retro held late would write tomorrow's journal, and the next planning
would not find yesterday's. Commits made inside the sandbox carried UTC too. The epic closes when
`date` and `git commit` inside the agent's sandbox show the host's timezone, with nothing configured
by hand. Tracked as `jvsl_env_agents_container-7fd`.

**The host's timezone, read by the extension**, chosen by João Lima over a timezone key in the
manifest, which only the ceremonies would have followed, and over keeping UTC. The extension runs on
the host, where `Intl` reads the timezone the same way on Windows, WSL and macOS; it writes `TZ` into
the generated configuration, and the sandbox is handed `TZ` across `--clearenv`. `TZ` is not a
secret, so it joins the sandbox's allowlist as a decision recorded in its test.

| # | Story | Why in that order |
|---|---|---|
| 1 | the container and the sandbox use the host's timezone | one story; before the retro, so the journal's "today" is right from its first entry |
