const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  sourceFile: 'messages/en.json',
  targetFile: 'messages/af.json',
  sourceLang: 'en',
  targetLang: 'af',
  googleApiKey: process.env.GOOGLE_TRANSLATE_API_KEY, // Set in .env
  batchSize: 50, // Google Translate API has character limits
  retryDelay: 1000, // ms between retries
};

// Google Translate API helper
async function translateText(text, sourceLang, targetLang) {
  if (!text || typeof text !== 'string' || text.trim() === '') {
    return text;
  }

  // Skip if already translated (contains Afrikaans characters)
  if (/[àâäçéèêëïîôöùûüÿñæœ]/.test(text)) {
    return text;
  }

  try {
    const url = `https://translation.googleapis.com/language/translate/v2?key=${CONFIG.googleApiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        q: text,
        source: sourceLang,
        target: targetLang,
        format: 'text',
      }),
    });

    if (!response.ok) {
      throw new Error(`Translation API failed: ${response.status}`);
    }

    const data = await response.json();
    return data.data.translations[0].translatedText;
  } catch (error) {
    console.error(`Translation failed for "${text}":`, error.message);
    return text; // Return original if translation fails
  }
}

// Process translations in batches
async function translateBatch(texts) {
  const results = [];
  
  for (let i = 0; i < texts.length; i += CONFIG.batchSize) {
    const batch = texts.slice(i, i + CONFIG.batchSize);
    const batchPromises = batch.map(async (text) => {
      const translated = await translateText(text, CONFIG.sourceLang, CONFIG.targetLang);
      return { original: text, translated };
    });
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    console.log(`Translated batch ${Math.floor(i / CONFIG.batchSize) + 1} of ${Math.ceil(texts.length / CONFIG.batchSize)}`);
    
    // Delay to avoid rate limiting
    if (i + CONFIG.batchSize < texts.length) {
      await new Promise(resolve => setTimeout(resolve, CONFIG.retryDelay));
    }
  }
  
  return results;
}

// Extract untranslated strings from target file
function extractUntranslatedStrings(targetData, sourceData) {
  const untranslated = {};
  
  function compareObjects(source, target, path = '') {
    for (const [key, value] of Object.entries(source)) {
      const currentPath = path ? `${path}.${key}` : key;
      
      if (typeof value === 'object' && value !== null) {
        if (!target[key]) {
          untranslated[currentPath] = value;
        } else {
          compareObjects(value, target[key], currentPath);
        }
      } else if (typeof value === 'string') {
        if (!target[key] || target[key] === value || isEnglishOnly(target[key])) {
          untranslated[currentPath] = value;
        }
      }
    }
  }
  
  compareObjects(sourceData, targetData);
  return untranslated;
}

// Check if text is likely English (not translated)
function isEnglishOnly(text) {
  if (typeof text !== 'string') return false;
  if (text.trim() === '') return false;
  
  // Check if it contains only English characters and no Afrikaans
  return !/[àâäçéèêëïîôöùûüÿñæœ]/.test(text) && 
         /[a-zA-Z]/.test(text) && 
         text.length > 1;
}

// Apply translations to the target file
function applyTranslations(targetData, translations) {
  function applyToPath(obj, path, value) {
    const keys = path.split('.');
    let current = obj;
    
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }
    
    const key = keys[keys.length - 1];
    const originalValue = current[key];
    
    if (typeof originalValue === 'string') {
      const translation = translations.find(t => t.original === originalValue);
      if (translation && translation.translated) {
        current[key] = translation.translated;
      }
    } else if (typeof originalValue === 'object' && originalValue !== null) {
      // For nested objects, we need to handle them differently
      Object.keys(originalValue).forEach(subKey => {
        const subPath = `${path}.${subKey}`;
        const subTranslation = translations.find(t => t.original === originalValue[subKey]);
        if (subTranslation && subTranslation.translated) {
          current[key][subKey] = subTranslation.translated;
        }
      });
    }
  }
  
  translations.forEach(({ original, translated }) => {
    // Find the path for this original text
    const pathEntry = Object.entries(targetData).find(([_, value]) => 
      value === original || (typeof value === 'object' && JSON.stringify(value) === JSON.stringify(original))
    );
    
    if (pathEntry) {
      const [key, value] = pathEntry;
      if (typeof value === 'string') {
        targetData[key] = translated;
      } else if (typeof value === 'object' && value !== null) {
        // Handle nested objects by iterating through them
        Object.keys(value).forEach(subKey => {
          if (value[subKey] === original) {
            targetData[key][subKey] = translated;
          }
        });
      }
    }
  });
  
  return targetData;
}

// Main function
async function main() {
  try {
    if (!CONFIG.googleApiKey) {
      console.error('Please set GOOGLE_TRANSLATE_API_KEY in your .env file');
      return;
    }

    console.log('Loading source file...');
    const sourceData = JSON.parse(fs.readFileSync(CONFIG.sourceFile, 'utf8'));
    
    console.log('Loading target file...');
    const targetData = JSON.parse(fs.readFileSync(CONFIG.targetFile, 'utf8'));
    
    console.log('Extracting untranslated strings...');
    const untranslated = extractUntranslatedStrings(targetData, sourceData);
    
    const untranslatedStrings = Object.values(untranslated);
    console.log(`Found ${untranslatedStrings.length} untranslated strings`);
    
    if (untranslatedStrings.length === 0) {
      console.log('No untranslated strings found!');
      return;
    }
    
    console.log('Starting translation process...');
    const translations = await translateBatch(untranslatedStrings);
    
    console.log('Applying translations...');
    const updatedData = applyTranslations({ ...targetData }, translations);
    
    console.log('Saving updated file...');
    fs.writeFileSync(CONFIG.targetFile, JSON.stringify(updatedData, null, 2) + '\n');
    
    console.log('Translation completed successfully!');
    console.log(`Translated ${translations.length} strings`);
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Run the script
if (require.main === module) {
  main();
}