import pandas as pd
import glob
import os
import json

path = r"C:\Users\cigar\OneDrive\Desktop\BOT-SQL\antigravity\CenterMind\PDV\*.xlsx"
files = glob.glob(path)

output = {}

for f in files:
    try:
        df = pd.read_excel(f, nrows=1)
        name = os.path.basename(f)
        output[name] = {
            "columns": list(df.columns),
            "first_row": {str(k): str(v) for k, v in df.iloc[0].to_dict().items()}
        }
    except Exception as e:
        output[os.path.basename(f)] = {"error": str(e)}

with open("temp_schema.json", "w", encoding="utf-8") as out:
    json.dump(output, out, indent=2, ensure_ascii=False)
