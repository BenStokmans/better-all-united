# Better All United

## Nederlands

Een kleine browserextensie die de All United-website verbetert door extra importfunctionaliteit (Excel/plak) en UI-hulpmiddelen toe te voegen.

### Functies

- Excel-import ondersteuning (gebruikt `xlsx`) voor evenementen
- Meer in de toekomst?

### Installatie
- Download de laatste release (better-all-united-vX.zip) van de [GitHub-pagina](https://github.com/BenStokmans/better-all-united/releases/latest)
- Unzip het gedownloade bestand
- Open de extensiepagina van je browser (bijv. Chrome: `chrome://extensions/`)
- Zet Developer mode aan
- Klik op "Load unpacked" en selecteer de uitgepakte map (de map met `manifest.json`)

### Vereisten

- Node.js (aanbevolen >= 18)
- pnpm (aanbevolen) of npm/yarn

### Installatie

Installeer afhankelijkheden:

```bash
pnpm install
```

Als je npm prefereert:

```bash
npm install
```

### Ontwikkeling

Start een development build met watch-modus:

```bash
pnpm dev
```

Dit draait `webpack --mode development --watch` en schrijft de bundel naar `dist/`.

### Build (productie)

Maak een productie-build:

```bash
pnpm build
```

Dit draait `webpack --mode production` en produceert een geminificeerde bundel in `dist/`.

### Type checking

Voer TypeScript typechecks uit (geen emit):

```bash
pnpm type-check
```

### Extensie laden in de browser

1. Bouw het project (`pnpm build` of `pnpm dev`).
2. Open de extensiepagina van je browser (bijv. Chrome: `chrome://extensions/`).
3. Zet Developer mode aan.
4. Klik op "Load unpacked" en selecteer de projectroot (de map met `manifest.json`).

De extensie wordt actief op pagina's onder `https://*.allunited.nl/*` zoals in `manifest.json` aangegeven.

### Tests

Er zijn nog geen geautomatiseerde tests opgenomen.

### Bijdragen

Bijdragen zijn welkom. Voorgestelde stappen:

1. Fork de repository
2. Maak een feature-branch
3. Maak je wijzigingen en voeg tests toe waar nodig
4. Open een pull request met een duidelijke omschrijving

### Licentie

Dit project staat onder de MIT-licentie (zie `package.json`).

### Opmerkingen

- Het project gebruikt `webpack` en `ts-loader` om TypeScript te compileren naar `dist/bundle.js`, dat door het manifest wordt gebruikt.
- Als je nieuwe bestanden toevoegt die in de extensiebundel moeten, zorg dat webpack hiervoor geconfigureerd is.
