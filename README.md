# arknights-website

A Node.js website built with TypeScript.

## Prerequisites

- Node.js (v25.2.1 or higher)
- npm (v11.6.2 or higher)

## Setup

Install dependencies:
```bash
npm install
```

## Development

### Starting the Server

**Option 1: Full Stack Development (Recommended)**
Run both backend and frontend together:
```bash
# Terminal 1: Backend server
npm run dev

# Terminal 2: Frontend (React with Vite)
npm run dev:frontend
```

**Option 2: Backend Only**
Run just the backend server:
```bash
npm run dev
```

**Option 3: Watch Mode**
Backend with automatic recompilation:
```bash
npm run watch
```

### Accessing the Website

Once the server is running, open your web browser and navigate to:

**http://localhost:3000**

The server will display a message in the terminal showing the exact URL to visit.

## Building

**Build Everything (Backend + Frontend):**
```bash
npm run build
```

**Build Separately:**
```bash
npm run build:backend  # Compile TypeScript backend
npm run build:frontend # Build React frontend with Vite
```

**Run Production Server:**
```bash
npm start
```

## Deploying to GitHub Pages

The frontend can be hosted on GitHub Pages while the backend runs elsewhere (e.g. Render, Railway).

### 1. Backend (required for full functionality)

- Deploy the Node/Express server to a host that runs Node (Render, Railway, Fly.io, etc.).
- Set environment variables (database, etc.) on that host.
- Set **CORS_ORIGIN** on the backend to your GitHub Pages origin, e.g. `https://<your-username>.github.io` (no trailing slash). This allows the browser to send cookies and use the API from the Pages site.

### 2. GitHub repo configuration

- **Settings → Pages**: Source = **GitHub Actions**.
- **Settings → Secrets and variables → Actions**: Add secret **VITE_API_BASE** = your backend URL (e.g. `https://your-app.onrender.com`) with no trailing slash. The frontend build uses this to call your API when served from GitHub Pages.

### 3. Deploy

- Pushing to `main` runs the **Deploy to GitHub Pages** workflow: it builds the frontend and deploys the `public/` output to GitHub Pages.
- The site will be at `https://<your-username>.github.io/arknights-website/`.

### 4. Cookie/auth (cross-origin)

The backend is already configured for cross-origin auth when **CORS_ORIGIN** is set: it uses `SameSite=None; Secure` for the session cookie so login works from GitHub Pages.

### 5. Account storage (Heroku Postgres)

Login and accounts use **PostgreSQL** only. Set **DATABASE_URL** on the backend (e.g. Heroku Postgres):

- Add the [Heroku Postgres](https://devcenter.heroku.com/articles/heroku-postgresql) add-on to your app, or use any PostgreSQL provider.
- Set `DATABASE_URL` to your Postgres connection string (Heroku sets this automatically when you add the add-on).
- The app creates the `accounts` table automatically on startup. See [Connecting to Heroku Postgres](https://devcenter.heroku.com/articles/connecting-heroku-postgres) for connection details.

**DATABASE_URL is required** for sign-up, login, and account features. To seed the database from a backup, use `npm run upload:accounts:pg` (expects a file at `data/accounts.json`; create it from a backup if needed).

## Project Structure

```
arknights-website/
├── src/              # TypeScript source files
│   └── index.ts     # Main entry point (Express server)
├── public/           # Static files (HTML, CSS, JS, images)
│   └── index.html   # Homepage
├── dist/            # Compiled JavaScript (generated)
├── package.json     # Project dependencies and scripts
├── tsconfig.json    # TypeScript configuration
└── README.md        # This file
```

## Available Scripts

- `npm run build` - Compile TypeScript to JavaScript
- `npm start` - Run the compiled JavaScript
- `npm run dev` - Run the development server
- `npm run watch` - Watch for changes and auto-reload
- `npm run clean` - Remove the dist directory
- `npm run scrape [rarity]` - Scrape operators of a specific rarity (default: 6)
- `npm run scrape:all` - Scrape operators of all rarities (1-6)

## Dependencies

- **Express** - Web framework for Node.js
- **TypeScript** - Type-safe JavaScript
- **ts-node** - Run TypeScript directly
- **nodemon** - Auto-reload on file changes

## Web Scraping

The project includes a web scraper to extract operator data from the Arknights Wiki.

### Scraping Operators

**Scrape a specific rarity:**
```bash
npm run scrape 6    # Scrape 6-star operators
npm run scrape 5    # Scrape 5-star operators
npm run scrape 4    # Scrape 4-star operators
# etc.
```

**Scrape all rarities:**
```bash
npm run scrape:all
```

### Output

- **Data files**: Saved to `data/operators-{rarity}star.json`
- **Images**: Downloaded to `public/images/operators/`
- **Combined data**: `data/operators-all.json` (when using scrape:all)

Each operator entry includes:
- `id`: Unique identifier
- `name`: Operator name
- `rarity`: Star rating (1-6)
- `class`: Operator class
- `profileImage`: Local path to downloaded image

## Tier Lists

The project includes a tier list system where operators are ranked by niche (e.g., DPS, Tank, Healing, etc.).

### Structure

Niche lists are stored in `data/niche-lists/` as JSON files. Each file represents one niche and contains a list of operators that can perform that role.

### Creating/Editing Tier Lists

1. **Create a new niche list file** in `data/niche-lists/`:
   ```json
   {
     "niche": "YourNiche",
     "description": "Description of what this niche represents",
     "lastUpdated": "2024-01-01",
     "tiers": {
       "EX": [],
       "S": [
         {
           "operatorId": "operator_id",
           "notes": "Optional notes"
         }
       ],
       "A": [],
       "B": [],
       "C": [],
       "D": [],
       "F": []
     }
   }
   ```

2. **Use operator IDs** from your `operators-{rarity}star.json` files
3. **Not all operators need to be included** - only add operators relevant to that niche
4. **Empty tiers are fine** - you can leave tiers empty if no operators fit
5. **Automatic detection** - New tier list files are automatically detected and appear on the homepage. Just add a new JSON file and restart the server!

### Example Tier Lists

- `dps.json` - Damage per second operators
- `tank.json` - Defensive/blocking operators
- `healing.json` - HP restoration operators
- `support.json` - Buff/debuff/utility operators
- `crowd-control.json` - Stun/freeze/bind operators

### Trash Operators

A special page lists operators with no optimal use. Edit `data/trash-operators.json` to add or remove operators from this list.

**Structure:**
```json
{
  "title": "Trash Operators",
  "description": "Operators that have no optimal use",
  "lastUpdated": "2025-12-25",
  "operators": [
    {
      "operatorId": "operator_id",
      "notes": "Optional explanation"
    }
  ]
}
```

Access the trash operators page at `/trash-operators` or via the link on the homepage.

### Validation

Validate your tier lists against operator data:
```bash
npm run validate:tiers
```

### Operator Niche Tracking

Each operator has a `niches` array attribute that lists all tier list niches where they appear. This is automatically updated during the build process.

**Update niche tracking:**
```bash
npm run update:ranked
```

This script:
- Checks all tier lists for operator IDs
- Updates the `niches` array in all operator JSON files with the list of niches where each operator appears
- Creates `data/unranked-operators.txt` listing all operators not in any tier list (empty niches array)

**Example:**
```json
{
  "id": "aak",
  "name": "Aak",
  "niches": ["Attack Buffing", "Support"]
}
```

The niche tracking is automatically updated when you run `npm run build`.

This will check that all operator IDs in tier lists exist in your operator data files.

### Utilities

The `src/tier-list-utils.ts` file provides helper functions:
- `loadAllTierLists()` - Load all tier lists
- `loadTierList(niche)` - Load a specific tier list
- `saveTierList(tierList)` - Save a tier list
- `validateTierList(tierList, operatorsData)` - Validate a tier list
- `getOperatorsInTier(niche, tier)` - Get operators in a specific tier
- `getNichesForOperator(operatorId)` - Find which niches include an operator

## Next Steps

1. Add more routes and API endpoints
2. Create frontend to display tier lists
3. Set up a database connection
4. Add authentication
5. Configure environment variables
6. Add CSS frameworks or build tools
