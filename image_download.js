#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const https = require('https');

const animals = [
  "Lion", "Tiger", "Elephant", "Giraffe", "Zebra",
  "Rhinoceros", "Hippopotamus", "Leopard", "Cheetah", "Jaguar",
  "Wolf", "Fox", "Bear", "Panda", "Koala",
  "Kangaroo", "Deer", "Moose", "Elk", "Bison",
  "Buffalo", "Camel", "Horse", "Donkey", "Mule",
  "Cow", "Bull", "Goat", "Sheep", "Pig",
  "Dog", "Cat", "Rabbit", "Hare", "Squirrel",
  "Chipmunk", "Rat", "Mouse", "Hamster", "Guinea Pig",
  "Otter", "Beaver", "Raccoon", "Skunk", "Badger",
  "Weasel", "Ferret", "Monkey", "Gorilla", "Chimpanzee",
  "Orangutan", "Baboon", "Lemur", "Sloth", "Armadillo",
  "Anteater", "Hedgehog", "Porcupine", "Bat", "Dolphin",
  "Whale", "Shark", "Octopus", "Squid", "Jellyfish",
  "Starfish", "Seahorse", "Crab", "Lobster", "Shrimp",
  "Crocodile", "Alligator", "Turtle", "Tortoise", "Snake",
  "Lizard", "Chameleon", "Iguana", "Frog", "Toad",
  "Salamander", "Newt", "Eagle", "Hawk", "Falcon",
  "Owl", "Parrot", "Peacock", "Penguin", "Flamingo",
  "Swan", "Duck", "Goose", "Hen", "Rooster",
  "Turkey", "Pigeon", "Crow", "Sparrow", "Ostrich"
];

const CLIENT_ID = '2aa9a1e5ea161790ed085b55335b6b6ee8976b46e94b43e4d4432e7af472930f';

async function fetchImagesForQuery(query) {
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&page=1&per_page=1`;
    
    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            headers: {
                'Authorization': `Client-ID ${CLIENT_ID}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    try {
                        const json = JSON.parse(data);
                        resolve(json.results);
                    } catch (e) {
                        reject(e);
                    }
                } else {
                    reject(new Error(`API Error: ${res.statusCode} ${data}`));
                }
            });
        });
        req.on('error', reject);
    });
}

function downloadImage(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (res) => {
            // Handle redirects if any (Unsplash urls sometimes redirect)
            if (res.statusCode === 301 || res.statusCode === 302) {
                return downloadImage(res.headers.location, dest).then(resolve).catch(reject);
            }
            if (res.statusCode === 200) {
                res.pipe(file);
                file.on('finish', () => {
                    file.close(resolve);
                });
            } else {
                file.close();
                fs.unlink(dest, () => {});
                reject(new Error(`Failed to download image. Status code: ${res.statusCode}`));
            }
        }).on('error', (err) => {
            fs.unlink(dest, () => {});
            reject(err);
        });
    });
}

async function main() {
    const args = process.argv.slice(2);
    let queries = [];

    if (args.length > 0) {
        queries = [args[0]];
        console.log(`Searching images for: ${queries[0]}`);
    } else {
        queries = animals;
        console.log(`No query provided. Downloading images for all ${animals.length} animals in the array...`);
    }

    const outputDir = path.join(__dirname, 'inputs');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const downloadPromises = queries.map(async (query) => {
        try {
            console.log(`Fetching image list for ${query}...`);
            const results = await fetchImagesForQuery(query);
            
            if (!results || results.length === 0) {
                console.log(`No images found for ${query}.`);
                return;
            }
            
            const img = results[0];
            const url = img.urls.regular;
            const filename = `${query.replace(/[^a-zA-Z0-9]/g, '_')}.jpg`;
            const dest = path.join(outputDir, filename);
            
            console.log(`Downloading ${filename}...`);
            try {
                await downloadImage(url, dest);
                console.log(`Successfully downloaded ${filename}`);
            } catch (err) {
                console.error(`Failed to download ${filename}: ${err.message}`);
            }
        } catch (err) {
            console.error(`Error processing ${query}:`, err.message);
        }
    });

    await Promise.all(downloadPromises);
    console.log('\nAll downloads completed!');
}

main();
