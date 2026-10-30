# Fonts

The site font is **Inter 4.1** by Rasmus Andersson, self-hosted so pages never
call a third-party font service. It's loaded with `next/font/local` in
`src/app/layout.js` and exposed to CSS as `--font-inter`.

- Source: `web/InterVariable.woff2` from
  [Inter-4.1.zip](https://github.com/rsms/inter/releases/download/v4.1/Inter-4.1.zip)
- License: SIL Open Font License 1.1 (see `LICENSE.txt`, which must stay next
  to the font)

## How the file was made

The original variable font is 352 KB, and Next preloads it on every page, so
it's trimmed to about 115 KB. The trimmed file keeps:

- every weight (100–900) and the optical-size axis
- Latin, Latin-1 and Latin Extended-A characters, punctuation, currency signs,
  and the arrows and symbols the UI uses
- the number features the CSS relies on (`tnum` for `tabular-nums`, plus
  fractions, superscripts and case-aware punctuation)

Characters outside that set fall back to the system font. There's no italic
file: browsers slant the upright font for `<em>`, as they did with the
previous font.

To rebuild it (for example, after a new Inter release), unzip the release and
run this with [fonttools](https://github.com/fonttools/fonttools)
(`pip install fonttools brotli`):

```bash
pyftsubset web/InterVariable.woff2 \
  --unicodes="U+0000-00FF,U+0100-017F,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0300-0304,U+0306-0308,U+030A-030C,U+0327-0329,U+2000-206F,U+20A0-20CF,U+2116,U+2122,U+2190-2199,U+21BB,U+2212,U+2215,U+2219,U+221E,U+2248,U+2260,U+2264-2265,U+2318,U+25A0-25A1,U+25B2,U+25B6,U+25BC,U+25C0,U+25CB,U+25CF,U+26A0,U+2713,U+FEFF,U+FFFD" \
  --layout-features="calt,ccmp,kern,liga,locl,mark,mkmk,rvrn,case,tnum,pnum,frac,numr,dnom,sups,subs,ordn,sinf,zero" \
  --flavor=woff2 \
  --output-file=src/app/fonts/InterVariable.woff2
```

If you add UI text with a new symbol, check it's in the list above; otherwise
it will render in the fallback font.
