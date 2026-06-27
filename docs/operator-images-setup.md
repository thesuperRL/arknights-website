# Operator Images Setup

## Overview

Operator profile pictures are now stored in a separate git repository ([arknights-pfp-dataset](https://github.com/thesuperRL/arknights-pfp-dataset)) and included in this project as a git submodule at `public/images/operators/`.

This separation provides:
- Cleaner website repository (removed 7.2M of binary assets)
- Independent dataset repository that can be used by other projects
- Easier image management and updates
- Maintained backward compatibility (same URL paths)

## Structure

```
arknights-website/
├── public/images/operators/  → git submodule (arknights-pfp-dataset)
│   ├── silverash.png
│   ├── amiya.png
│   └── ... (420 operator images)
└── src/scraper.ts           → Downloads images to submodule
```

## Working with Operator Images

### Running the Scraper

The scraper automatically saves new operator images to the submodule:

```bash
npm run scrape:6star  # or other rarity commands
```

Images are downloaded to `public/images/operators/` which is the git submodule.

### Committing New Images

When new images are added by the scraper:

1. **Commit to the dataset repository:**
   ```bash
   cd public/images/operators
   git add .
   git commit -m "Add new operator images"
   git push
   cd ../../..
   ```

2. **Update the submodule reference in website repo:**
   ```bash
   git add public/images/operators
   git commit -m "Update operator images submodule"
   git push
   ```

### Cloning the Repository

When cloning the website repository, initialize submodules:

```bash
git clone git@github.com:thesuperRL/arknights-website.git
cd arknights-website
git submodule init
git submodule update
```

Or clone with submodules in one command:

```bash
git clone --recurse-submodules git@github.com:thesuperRL/arknights-website.git
```

### Updating Submodule to Latest

To pull the latest images from the dataset repository:

```bash
cd public/images/operators
git pull origin main
cd ../../..
git add public/images/operators
git commit -m "Update operator images to latest"
```

Or use git submodule commands:

```bash
git submodule update --remote public/images/operators
git add public/images/operators
git commit -m "Update operator images to latest"
```

## Repositories

- **Website**: [arknights-website](https://github.com/thesuperRL/arknights-website)
- **Dataset**: [arknights-pfp-dataset](https://github.com/thesuperRL/arknights-pfp-dataset)

## Migration Details

- Migrated: June 27, 2026
- Images moved: 420 operator profile pictures
- Size: 7.2M total
- Method: Git submodule
- Commit: `69c846f` (website), `ce95ea8` (dataset)
