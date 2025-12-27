/**
 * Debug script to examine the structure of user data from ArkPRTS API
 * Run this with: ts-node src/debug-user-data.ts
 */

import axios from 'axios';

const ARKPRTS_API_BASE = 'https://arkprts.ashlen.top';

async function debugUserData() {
  // You'll need to provide actual credentials to test
  const server = 'en';
  const channeluid = process.argv[2];
  const token = process.argv[3];

  if (!channeluid || !token) {
    console.error('Usage: ts-node src/debug-user-data.ts <channeluid> <token>');
    console.error('Get these from a successful login');
    process.exit(1);
  }

  try {
    console.log('Fetching user data from ArkPRTS API...\n');
    const response = await axios.get(`${ARKPRTS_API_BASE}/api/raw/user`, {
      params: {
        server,
        channeluid,
        token
      }
    });

    const userData = response.data;

    console.log('=== Top-level keys ===');
    console.log(Object.keys(userData));

    console.log('\n=== Checking for character data ===');
    
    // Check various possible locations
    const locations = [
      { path: 'troop.chars', data: userData?.troop?.chars },
      { path: 'chars', data: userData?.chars },
      { path: 'troop.charInfoMap', data: userData?.troop?.charInfoMap },
      { path: 'charInfoMap', data: userData?.charInfoMap },
      { path: 'troop', data: userData?.troop },
    ];

    for (const loc of locations) {
      if (loc.data) {
        console.log(`\n✓ Found data at: ${loc.path}`);
        if (typeof loc.data === 'object' && !Array.isArray(loc.data)) {
          const keys = Object.keys(loc.data);
          console.log(`  Type: object with ${keys.length} keys`);
          console.log(`  First 10 keys:`, keys.slice(0, 10));
          
          // Show sample entry
          if (keys.length > 0) {
            const firstKey = keys[0];
            console.log(`  Sample entry (${firstKey}):`, JSON.stringify(loc.data[firstKey], null, 2).substring(0, 500));
          }
        } else if (Array.isArray(loc.data)) {
          console.log(`  Type: array with ${loc.data.length} items`);
          if (loc.data.length > 0) {
            console.log(`  First item:`, JSON.stringify(loc.data[0], null, 2).substring(0, 500));
          }
        }
      } else {
        console.log(`✗ No data at: ${loc.path}`);
      }
    }

    // Save full response to file for inspection
    const fs = require('fs');
    const path = require('path');
    const outputFile = path.join(__dirname, '../debug-user-data-response.json');
    fs.writeFileSync(outputFile, JSON.stringify(userData, null, 2));
    console.log(`\n✓ Full response saved to: ${outputFile}`);

  } catch (error: any) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

debugUserData();

