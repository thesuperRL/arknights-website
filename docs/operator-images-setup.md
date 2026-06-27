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
│   ├── default/             → Default image set
│   │   ├── silverash.png
│   │   ├── amiya.png
│   │   └── ... (420 operator images)
│   ├── all/                 → All skins organized by operator (optional)
│   │   ├── silverash/
│   │   │   ├── default.png
│   │   │   ├── winter-messenger.png
│   │   │   └── ...
│   │   └── ...
│   ├── scraper.ts           → Scraper lives in submodule
│   └── package.json         → Scraper dependencies
└── src/scraper.ts           → Deprecated (use submodule version)
```

## Working with Operator Images

### Running the Scraper

**The scraper now lives in the dataset repository.** To update images:

1. **Navigate to the submodule:**
   ```bash
   cd public/images/operators
   ```

2. **Install dependencies (first time only):**
   ```bash
   npm install
   ```

3. **Run the scraper:**
   ```bash
   npm run scrape:6star  # or other rarity: scrape:1star, scrape:2star, etc.
   ```

4. **Commit and push new images:**
   ```bash
   git add default/*.png
   git commit -m "Add new operator images"
   git push
   ```

5. **Update the submodule reference in website repo:**
   ```bash
   cd ../../..
   git add public/images/operators
   git commit -m "Update operator images submodule"
   git push
   ```

### Alternative: Update from Dataset Repo Directly

You can also work directly in a clone of the dataset repository:

```bash
# Clone the dataset repo separately
git clone git@github.com:thesuperRL/arknights-pfp-dataset.git
cd arknights-pfp-dataset

# Install and run scraper
npm install
npm run scrape:6star

# Commit and push
git add *.png
git commit -m "Add new operator images"
git push

# Then update the website submodule
cd /path/to/arknights-website
git submodule update --remote public/images/operators
git add public/images/operators
git commit -m "Update operator images to latest"
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
