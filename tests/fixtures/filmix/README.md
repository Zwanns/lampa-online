# Synthetic Filmix format fixtures

These are locally authored JSON shapes for offline regression tests, not captured
Filmix responses. IDs, titles, voices and `media.example` URLs are synthetic; no
credentials, cookies, headers, device IDs or private proxy addresses are present.

Shapes were compared statically with the sources pinned in
`docs/Filmix_API_Diagnostics.md`: search arrays, `user_data`, movie arrays/keyed
objects, season → voice → episode maps/arrays, bracket and `%s` templates.
An Object movie fixture documents a known unsupported ZebMod parser format;
it does not assert that the live server currently returns that shape.

Only qualities explicitly included in a fixture may be expanded. The plain URL
case must retain the provider-supplied URL. Missing `%s` qualities must not cause
invented resolutions. Blocked or absent streams must not start playback.
