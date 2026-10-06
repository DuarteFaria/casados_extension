# Chrome Web Store listing

Everything to paste into the [developer dashboard](https://chrome.google.com/webstore/devconsole). Upload `dist/opto-rank-1.0.0.zip` (built with `npm run zip`).

## Store listing tab

**Name** (comes from the manifest): Opto Rank

**Summary** (from the manifest, 110/132 chars):
Extensão não oficial: dá nota aos episódios e filmes da Opto SIC (Intancável → Cinema) e conta os Momentos o7.

**Description:**

```
Dá nota a cada episódio da Opto e vê o que toda a gente achou. Sem conta, sem login.

Feita para o Casados à Primeira Vista, funciona em todas as séries e filmes da Opto SIC.

NOTAS DE 1 A 5
Intancável · Meh · Tancável · Vê-se bem · Cinema
Cada cartão de episódio mostra a média e o número de votos, e tem os botões para votares. Podes mudar o teu voto quando quiseres.

MOMENTOS O7
Um número partilhado por episódio: quantos momentos o7 teve? Qualquer pessoa pode atualizá-lo e toda a gente vê o valor mais recente.

RANKING DA TEMPORADA
Por cima da lista de episódios: um gráfico com a média de cada episódio, os Cinemas (os 3 melhores) e os Fillers (os 3 piores).

NO FIM DO EPISÓDIO
Nos últimos 2 minutos de um episódio ou filme aparece uma caixa para dares a tua nota, também em ecrã inteiro.

PRIVACIDADE
A extensão só funciona em opto.sic.pt. Guarda apenas um identificador anónimo e aleatório e as tuas notas. Não recolhe nome, email, conta da Opto nem histórico.

Extensão não oficial, sem qualquer ligação à SIC ou à Opto.
```

**Category:** Entertainment

**Language:** Portuguese (Portugal)

**Graphic assets** (all in this folder):

| Field | File |
|---|---|
| Store icon (128×128) | `../extension/icons/icon-128.png` |
| Screenshots (1280×800) | `screenshot-1-ranking.png`, `screenshot-2-cards.png`, `screenshot-3-end.png`, `screenshot-4-movie.png` |
| Small promo tile (440×280) | `promo-small-440x280.png` |
| Marquee promo tile (1400×560) | `promo-marquee-1400x560.png` |

## Privacy practices tab

**Single purpose:**
Let viewers rate episodes and movies on opto.sic.pt from 1 to 5, keep a shared "Momentos o7" count per episode, and see everyone's averages on the site.

**Permission justifications:**

- `storage`: Stores a random anonymous install ID, so each install gets one vote per episode without needing a login.
- Host permission `https://opto.sic.pt/*`: Shows the rating buttons, averages and season ranking on Opto's series, movie and player pages, and reads Opto's public catalogue to know which episode each card is.
- Host permission `https://agreeable-antelope-656.eu-west-1.convex.cloud/*`: The extension's own backend, where votes are saved and averages are read.

**Are you using remote code?** No. All JavaScript is in the package; the backend only returns data.

**Data usage:** don't tick any of the categories. The extension stores a random install ID and the votes themselves, not personally identifiable information, authentication data, location, web history, user activity or website content. Then tick all three certifications:

- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** https://github.com/DuarteFaria/casados_extension/blob/main/PRIVACY.md

## Distribution tab

**Visibility:** Unlisted. Only people with the link can find and install it.

**Regions:** All regions (or Portugal only).
