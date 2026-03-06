import sys
import os

file_path = 'C:/Users/cigar/Downloads/REAL_ACADEMY (3).svg'
out_path = 'c:/Users/cigar/OneDrive/Desktop/BOT-SQL/antigravity/CenterMind/REAL_ACADEMY_corregido.svg'

print(f"Reading from: {file_path}")
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

lines = content.split('\n')

clip_paths = '''<clipPath id="flag1-fold-clip">
<path d="M86.4689 21.7788L69.8007 26.5013C69.5079 26.5838 69.2442 26.7457 69.0415 26.9673C68.8388 27.1889 68.7058 27.4607 68.6585 27.75C68.6112 28.0392 68.6516 28.3335 68.7749 28.5973C68.8982 28.861 69.0991 29.0829 69.3533 29.2362L79.8975 35.6384C80.5378 36.0349 81.0016 36.6448 81.2029 37.3551C81.4041 38.0655 81.3292 38.828 80.9919 39.5015L75.373 50.483C75.237 50.7469 75.1823 51.0412 75.2157 51.3304C75.249 51.6197 75.369 51.8914 75.561 52.1129C75.753 52.3343 76.0089 52.496 76.2977 52.5783C76.5865 52.6607 76.8959 52.6602 77.1885 52.5769L105.474 44.5631C106.278 44.3353 106.962 43.8117 107.376 43.1073C107.791 42.4029 107.901 41.5755 107.684 40.8071L106.042 35.0125Z" />
</clipPath>
<clipPath id="flag1-main-clip">
<path d="M111.281 5.35933L87.0368 12.2283C86.2331 12.4561 85.5487 12.9797 85.1343 13.6841C84.7199 14.3885 84.6094 15.2158 84.8271 15.9843L91.394 39.1626L118.669 31.435Z" />
</clipPath>
<clipPath id="flag2-fold-clip">
<path d="M285.079 21.2838L301.792 25.8378C302.086 25.9174 302.351 26.0765 302.556 26.2961C302.761 26.5156 302.897 26.7861 302.947 27.0749C302.997 27.3636 302.96 27.6583 302.839 27.9232C302.719 28.1882 302.52 28.4121 302.267 28.568L291.789 35.0759C291.153 35.4788 290.695 36.0933 290.501 36.8056C290.307 37.5179 290.389 38.2797 290.733 38.9497L296.462 49.8736C296.601 50.136 296.658 50.4297 296.628 50.7193C296.597 51.0088 296.48 51.2818 296.291 51.5051C296.101 51.7285 295.847 51.8927 295.559 51.978C295.271 52.0632 294.961 52.0659 294.668 51.9855L266.306 44.2576C265.5 44.038 264.81 43.5213 264.389 42.8212C263.967 42.1211 263.848 41.2949 264.058 40.5243L265.642 34.7137Z" />
</clipPath>
<clipPath id="flag2-main-clip">
<path d="M260.104 5.11588L284.415 11.7398C285.221 11.9594 285.91 12.4761 286.332 13.1762C286.753 13.8764 286.872 14.7026 286.662 15.4731L280.329 38.7155L252.98 31.2636Z" />
</clipPath>'''

lines[66] = lines[66] + '\n' + clip_paths

# Flag 1 fold (lines 4, 5) -> indexes 3 and 4
lines[3] = '<g clip-path="url(#flag1-fold-clip)">\n' + lines[3]
lines[4] = lines[4] + '\n</g>'

# Flag 1 main (lines 7 to 14) -> indexes 6 to 13
lines[6] = '<g clip-path="url(#flag1-main-clip)">\n' + lines[6]
lines[13] = lines[13] + '\n</g>'

# Flag 2 fold (lines 16 to 18) -> indexes 15 to 17
lines[15] = '<g clip-path="url(#flag2-fold-clip)">\n' + lines[15]
lines[17] = lines[17] + '\n</g>'

# Flag 2 main (lines 20 to 24) -> indexes 19 to 23
lines[19] = '<g clip-path="url(#flag2-main-clip)">\n' + lines[19]
lines[23] = lines[23] + '\n</g>'

print(f"Writing to: {out_path}")
with open(out_path, 'w', encoding='utf-8') as f:
    f.write('\n'.join(lines))

print('File patched successfully.')
