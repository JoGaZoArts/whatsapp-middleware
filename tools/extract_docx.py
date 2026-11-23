import zipfile, re, sys

def extract(path):
    with zipfile.ZipFile(path) as z:
        xml = z.read('word/document.xml').decode('utf-8')
    text = xml.replace('</w:p>', '\n').replace('<w:br/>', '\n').replace('<w:tab/>', '\t')
    text = re.sub(r'<[^>]+>', '', text)
    text = text.replace('&amp;','&').replace('&lt;','<').replace('&gt;','>').replace('&quot;','"').replace('&apos;',"'")
    return text

for p in sys.argv[1:]:
    print('='*80)
    print('FILE:', p)
    print('='*80)
    print(extract(p))