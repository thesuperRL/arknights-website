# IS Collectibles images

This folder is populated by the **scrape-collectibles** GitHub Action (or `npm run scrape:collectibles`). It contains images for each collectible scraped from [Arknights wiki.gg](https://arknights.wiki.gg/wiki/Category:Collectibles).

- **Do not delete** this folder or its contents when running `npm run update:ranked` or the build; the Vite preserve-images plugin restores the entire `public/images` tree after build.
- Data is stored in `data/collectibles.json` with fields: `id`, `name`, `description`, `isVersions`, `imagePath`.
