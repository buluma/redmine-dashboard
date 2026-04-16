import json
import urllib.request
import urllib.parse
import os
import time

locales = ["es", "de", "fr", "ja", "zh", "ru", "uk", "af", "tl", "pl", "vi"]
messages_dir = os.path.join(os.path.dirname(__file__), "../messages")
en_path = os.path.join(messages_dir, "en.json")

with open(en_path, "r") as f:
    en_data = json.load(f)

# Keep track of variable placeholders {name} to restore them after translation
import re

def translate_text(text, target_lang):
    if not text: return text
    # Extract placeholders like {count}
    placeholders = re.findall(r'\{[^}]+\}', text)
    # Temporarily replace them with un-translatable markers like __0__
    temp_text = text
    for i, p in enumerate(placeholders):
        temp_text = temp_text.replace(p, f'__{i}__')
    
    url = f'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl={target_lang}&dt=t&q={urllib.parse.quote(temp_text)}'
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        resp = urllib.request.urlopen(req)
        res = json.loads(resp.read().decode('utf-8'))
        translated = "".join([part[0] for part in res[0]])
        # Restore placeholders
        for i, p in enumerate(placeholders):
            translated = translated.replace(f'__{i}__', p)
        return translated
    except Exception as e:
        print(f"Error translating '{text}' to '{target_lang}':", e)
        return text

def translate_dict(d, target_lang, current_dict):
    out = {}
    for k, v in d.items():
        if isinstance(v, dict):
            out[k] = translate_dict(v, target_lang, current_dict.get(k, {}))
        elif isinstance(v, str):
            if current_dict.get(k) and False: # we can skip if already translated, but we want full replacement for now or just merge new
                # actually let's merge new keys only.
                pass
            
            # If current dict has it but it's identical to en (untouched) or missing
            if k not in current_dict or current_dict[k] == v:
                print(f"[{target_lang}] Translating: {v}")
                out[k] = translate_text(v, target_lang)
                time.sleep(0.1) # rate limit
            else:
                out[k] = current_dict[k]
        else:
            out[k] = v
    return out

for loc in locales:
    print(f"Processing locale: {loc}")
    target = loc
    if loc == "zh": target = "zh-CN"
    
    loc_path = os.path.join(messages_dir, f"{loc}.json")
    if os.path.exists(loc_path):
        with open(loc_path, "r") as f:
            try:
                current_data = json.load(f)
            except:
                current_data = {}
    else:
        current_data = {}
        
    new_data = translate_dict(en_data, target, current_data)
    with open(loc_path, "w") as f:
        json.dump(new_data, f, indent=2, ensure_ascii=False)

print("Done generating translations.")
