/**
 * Script to scrape operators of all rarities
 */

import { ArknightsScraper } from './scraper';
import * as path from 'path';

async function scrapeAllRarities() {
  const rarities = [1, 2, 3, 4, 5, 6]; // All possible rarities
  const allOperators: Record<string, any> = {};

  for (const rarity of rarities) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`Scraping ${rarity}-star operators...`);
    console.log(`${'='.repeat(50)}\n`);

    // Try different URL formats for 4-star
    let baseUrl = `https://arknights.wiki.gg/wiki/Operator/${rarity}-star`;
    if (rarity === 4) {
      baseUrl = `https://arknights.wiki.gg/wiki/Operator/4_star`;
    }
    
    const scraper = new ArknightsScraper({
      baseUrl: baseUrl,
      rarity: rarity,
      outputDir: path.join(__dirname, '../data'),
      imagesDir: path.join(__dirname, '../public/images/operators')
    });

    try {
      const operatorsDict = await scraper.scrape();
      // Merge into combined dictionary
      Object.assign(allOperators, operatorsDict);
      
      // Wait between rarities to be respectful
      if (rarity < 6) {
        console.log('\nWaiting 2 seconds before next rarity...\n');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error) {
      console.error(`Failed to scrape ${rarity}-star operators:`, error);
      // For 4-star, try alternative URL
      if (rarity === 4 && baseUrl.includes('_star')) {
        console.log('Trying alternative URL format for 4-star...');
        const altScraper = new ArknightsScraper({
          baseUrl: 'https://arknights.wiki.gg/wiki/Operator/4-star',
          rarity: rarity,
          outputDir: path.join(__dirname, '../data'),
          imagesDir: path.join(__dirname, '../public/images/operators')
        });
        try {
          const operatorsDict = await altScraper.scrape();
          Object.assign(allOperators, operatorsDict);
        } catch (altError) {
          console.error('Alternative URL also failed:', altError);
        }
      }
      // Continue with next rarity
    }
  }

  // Save combined data as dictionary
  const fs = require('fs');
  const combinedFile = path.join(__dirname, '../data/operators-all.json');
  fs.writeFileSync(combinedFile, JSON.stringify(allOperators, null, 2));
  const operatorCount = Object.keys(allOperators).length;
  console.log(`\n🎉 Successfully scraped ${operatorCount} total operators!`);
  console.log(`📁 Combined data saved to: ${combinedFile}`);
}

// Run the scraper
scrapeAllRarities().catch(console.error);

