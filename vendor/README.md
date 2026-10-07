# Bundled formula renderer

KaTeX 0.19.0, MIT license (see KaTeX-LICENSE.txt).
Source: https://registry.npmjs.org/katex/-/katex-0.19.0.tgz
Package SHA-512 integrity: `v6Tznz3zJ7u3niRCoDTsumM2+HA2XXcCu+WAacCeHD2z3p9A9Ks987o5FzfTGBN0e8A0vjEgIDvLbICrXpdw/Q==`.

Only the local script is bundled. It renders share-page data-math-source to MathML in a detached copy, with trust disabled, bounded input length/macro expansion and no external assets. It is not loaded by the original toolbar capture path. The existing sanitizer cleans the resulting MathML again.
