# writes a short content hash for every picture/data file into index.html (between the VER markers),
# so phones only download a file again when that file really changed
import hashlib,os,re,json
os.chdir(os.path.dirname(os.path.abspath(__file__))+'/..')
V={}
for root,_,fs in os.walk('.'):
  if root.startswith(('./.git','./ref','./server','./tools')):continue
  for f in fs:
    if f.endswith(('.webp','.json','.png')) and f!='package.json':
      p=os.path.join(root,f)[2:];V[p]=hashlib.md5(open(p,'rb').read()).hexdigest()[:8]
s=open('index.html').read()
s=re.sub(r"/\*VER\*/.*?/\*END\*/","/*VER*/var VER="+json.dumps(V,separators=(',',':'),sort_keys=True)+";/*END*/",s,flags=re.S)
open('index.html','w').write(s);print(len(V),'files')
