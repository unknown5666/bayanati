# Fonts

## Arabic contract PDFs

Arabic contracts need a Unicode Arabic font embedded in the PDF. Download
**Noto Naskh Arabic** (Open Font License) and place the regular weight here as:

```
src/assets/fonts/NotoNaskhArabic-Regular.ttf
```

Get it from Google Fonts: https://fonts.google.com/noto/specimen/Noto+Naskh+Arabic
(Download family → unzip → copy `NotoNaskhArabic-Regular.ttf` here.)

If the file is missing, English contracts still generate fine; Arabic generation
throws a clear error telling you to add it. For maximum Arabic fidelity on legal
documents, prefer typesetting the original Arabic clause text upstream and
pasting it into `src/lib/contract-templates.ts` rather than re-wrapping it here.
