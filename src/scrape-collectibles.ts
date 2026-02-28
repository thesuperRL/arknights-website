/**
 * Scrape IS Collectibles from Arknights wiki.gg:
 * - Category:Collectibles and second page (pagefrom=Silent+Squad)
 * - For each collectible page: image (.druid-main-image), name (.druid-title),
 *   IS versions (.druid-data.druid-data-theme1.druid-data-nonempty), description (.quote.desc)
 * - Output: data/collectibles.json and public/images/collectibles/*.png
 */

import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';

const WIKI_BASE = 'https://arknights.wiki.gg';
const CATEGORY_URLS = [
  `${WIKI_BASE}/wiki/Category:Collectibles`,
  `${WIKI_BASE}/wiki/Category:Collectibles?pagefrom=Silent+Squad#mw-pages`
];

const DATA_DIR = path.join(__dirname, '../data');
const IMAGES_DIR = path.join(__dirname, '../public/images/collectibles');

export interface CollectibleEntry {
  id: string;
  name: string;
  description: string;
  isVersions: string[];
  imagePath: string;
  imageUrl?: string;
}

async function fetchHtmlWithPuppeteer(url: string): Promise<string> {
  let puppeteer: any;
  try {
    puppeteer = require('puppeteer');
  } catch {
    throw new Error('Puppeteer is required. Install with: npm install puppeteer');
  }
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
    return await page.content();
  } finally {
    await browser.close();
  }
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function slugFromWikiUrl(href: string): string {
  const match = href.match(/\/wiki\/(.+)$/);
  const raw = match ? decodeURIComponent(match[1].replace(/\+/g, ' ')) : '';
  return raw.replace(/\s+/g, '_');
}

function collectibleIdFromSlug(slug: string): string {
  return slug.replace(/_/g, '-').toLowerCase();
}

async function downloadImage(imageUrl: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let fullUrl = imageUrl;
    if (imageUrl.startsWith('//')) fullUrl = 'https:' + imageUrl;
    else if (imageUrl.startsWith('/')) fullUrl = WIKI_BASE + imageUrl;
    else if (!/^https?:\/\//i.test(imageUrl)) fullUrl = WIKI_BASE + '/' + imageUrl;
    const protocol = fullUrl.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);
    protocol.get(fullUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; collectibles-scraper/1.0)' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const loc = res.headers.location;
        if (loc) return downloadImage(loc, destPath).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', (err) => { fs.unlink(destPath, () => {}); reject(err); });
  });
}

async function getCollectibleLinks(): Promise<string[]> {
  const links = new Set<string>();
  for (const url of CATEGORY_URLS) {
    console.log(`Fetching category: ${url}`);
    const html = await fetchHtmlWithPuppeteer(url);
    const $ = cheerio.load(html);
    // "Pages in category \"Collectibles\"" section: get collectible page links (exclude Category/File/Special)
  const $section = $('#mw-pages').add('.mw-category-group').add('.mw-category');
  const $scope = $section.length ? $section : $('body');
  $scope.find('a[href^="/wiki/"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    if (href.includes('Category:') || href.includes('File:') || href.includes('Special:') || href.includes('?')) return;
    if (href === '/wiki/Collectibles' || href === '/wiki/Collectible') return;
    links.add(href);
  });
    await new Promise(r => setTimeout(r, 1500));
  }
  return Array.from(links);
}

function extractCollectiblePage($: cheerio.CheerioAPI, pageUrl: string, slug: string): Partial<CollectibleEntry> & { imageUrl?: string } {
  const name = $('.druid-title').first().text().trim() || slug.replace(/_/g, ' ');
  const $img = $('.druid-main-image').first();
  let imageUrl = $img.find('img').attr('src') || $img.attr('src');
  if (imageUrl && !/^https?:\/\//.test(imageUrl) && !imageUrl.startsWith('//')) {
    imageUrl = imageUrl.startsWith('/') ? WIKI_BASE + imageUrl : WIKI_BASE + '/' + imageUrl;
  }
  if (imageUrl && imageUrl.startsWith('//')) imageUrl = 'https:' + imageUrl;

  const isVersions: string[] = [];
  $('.druid-data.druid-data-theme1.druid-data-nonempty').each((_, el) => {
    const $block = $(el);
    $block.find('a').each((__, a) => {
      const t = $(a).text().trim();
      if (t && !isVersions.includes(t)) isVersions.push(t);
    });
    if (isVersions.length === 0) {
      const text = $block.text().replace(/\s+/g, ' ').trim();
      if (text && text.length < 200) isVersions.push(text);
    }
  });
  if (isVersions.length === 0) {
    $('.druid-data a[href*="Integrated"], .druid-data a[href*="Fungimist"], .druid-data a[href*="Mizuki"], .druid-data a[href*="Phantom"], .druid-data a[href*="Sarkaz"], .druid-data a[href*="Sui"], .druid-data a[href*="Expeditioner"], .druid-data a[href*="Ceobe"]').each((_, a) => {
      const t = $(a).text().trim();
      if (t && !isVersions.includes(t)) isVersions.push(t);
    });
  }

  const description = $('.quote.desc').first().text().trim() || $('.druid-desc, [class*="desc"]').first().text().trim() || '';

  return { name, description, isVersions, imageUrl };
}

async function main() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

  const links = await getCollectibleLinks();
  console.log(`Found ${links.length} collectible page links.`);

  const results: CollectibleEntry[] = [];
  for (let i = 0; i < links.length; i++) {
    const href = links[i];
    const slug = slugFromWikiUrl(href);
    const pageUrl = href.startsWith('http') ? href : WIKI_BASE + href;
    const id = collectibleIdFromSlug(slug);
    console.log(`[${i + 1}/${links.length}] ${slug}`);

    try {
      const html = await fetchHtmlWithPuppeteer(pageUrl);
      const $ = cheerio.load(html);
      const extracted = extractCollectiblePage($, pageUrl, slug);
      let imagePath = '';
      if (extracted.imageUrl) {
        const ext = path.extname(new URL(extracted.imageUrl).pathname) || '.png';
        const baseName = sanitizeFilename(slug) || id;
        const fileName = baseName + ext;
        const destPath = path.join(IMAGES_DIR, fileName);
        await downloadImage(extracted.imageUrl, destPath);
        imagePath = `images/collectibles/${fileName}`;
      }
      results.push({
        id,
        name: extracted.name || slug.replace(/_/g, ' '),
        description: extracted.description || '',
        isVersions: extracted.isVersions || [],
        imagePath
      });
    } catch (err: any) {
      console.error(`  Error: ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 800));
  }

  const outPath = path.join(DATA_DIR, 'collectibles.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`\nWrote ${results.length} collectibles to ${outPath}`);
  console.log(`Images in ${IMAGES_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
