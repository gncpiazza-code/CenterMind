import pandas as pd
import math

file_path = r"C:\Users\cigar\OneDrive\Desktop\resultados_Reporte.PadronDeClientes.xlsx"
df = pd.read_excel(file_path)

print("Total rows:", len(df))
print("idempresa counts:")
print(df['idempresa'].value_counts(dropna=False))

print("\nPeriodicidad counts:")
print(df['Periodicidad'].value_counts(dropna=False))

# Check row 5487
print("\nRow 5487 Periodicidad:")
print(df.iloc[5487]['Periodicidad'])
print(type(df.iloc[5487]['Periodicidad']))

print("\nRow 5487 idempresa:")
print(df.iloc[5487]['idempresa'])
