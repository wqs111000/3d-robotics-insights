"""Read public primary sources into a non-deployed review artifact."""
import concurrent.futures, hashlib, json, re, shutil, urllib.request
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlsplit
ROOT=Path('preview'); ROOT.mkdir(exist_ok=True)
shutil.copytree('.',ROOT/'repo',ignore=shutil.ignore_patterns('.git','preview','dist'),dirs_exist_ok=True)
PAPERS=['2611.11148','2611.07417','2611.08100','2611.06308','2611.05129','2611.04972','2611.03498','2610.37818','2610.38141','2610.38318','2610.39287']
PAGES={**{p:'https://arxiv.org/html/'+p+'v1' for p in PAPERS},'nvblox':'https://nvidia-isaac-ros.github.io/repositories_and_packages/isaac_ros_nvblox/index.html','gsplat':'https://docs.gsplat.studio/main/examples/colmap.html','isaac-sim':'https://docs.isaacsim.omniverse.nvidia.com/6.0.1/ros2_tutorials/tutorial_ros2_navigation.html','messynav':'https://messynav.github.io/','waytrace':'https://way-trace.github.io/','mosu2':'https://jinggm.github.io/mosu2/','snap':'https://snap-navigation.github.io/'}
ALLOWED={urlsplit(u).hostname for u in PAGES.values()}|{'export.arxiv.org','raw.githubusercontent.com','internrobotics.github.io','docs.nvidia.com','nvidia-isaac-ros.github.io'}

def get(url,limit=20000000):
 if urlsplit(url).scheme!='https' or urlsplit(url).hostname not in ALLOWED: raise ValueError('Origin not allowed')
 r=urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'}),timeout=35)
 if urlsplit(r.geturl()).hostname not in ALLOWED: raise ValueError('Redirect origin not allowed')
 b=r.read(limit+1)
 if len(b)>limit:raise ValueError('Too large')
 return b,r.headers.get('Content-Type','')
class Figures(HTMLParser):
 def __init__(self):super().__init__();self.images=[];self.fig=None;self.figures=[];self.capture=False
 def handle_starttag(self,t,a):
  d=dict(a)
  if t=='figure':self.fig={'id':d.get('id',''),'images':[],'caption':''}
  if t=='figcaption':self.capture=True
  if t=='img':
   img={'src':d.get('src',''),'alt':d.get('alt','')}
   self.images.append(img)
   if self.fig is not None:self.fig['images'].append(img)
 def handle_endtag(self,t):
  if t=='figcaption':self.capture=False
  if t=='figure' and self.fig is not None:self.figures.append(self.fig);self.fig=None
 def handle_data(self,s):
  if self.capture and self.fig is not None:self.fig['caption']+=s

def work(k,url):
 p=ROOT/k;p.mkdir(exist_ok=True);out={'key':k,'url':url}
 try:
  b,typ=get(url);(p/'source.html').write_bytes(b); text=b.decode('utf8');parser=Figures();parser.feed(text)
  out['figures']=parser.figures;out['images']=parser.images
  selected=[]
  if parser.figures:
   for f in parser.figures[:4]:
    for im in f['images']:
     if len(selected)<5:selected.append({**im,'caption':f['caption'],'figure_id':f['id']})
  else:
   selected=[im for im in parser.images if im['src'] and not re.search('logo|icon|badge|country|avatar',im['src'],re.I)][:6]
  out['downloaded']=[]
  for n,im in enumerate(selected):
   try:
    u=urljoin(url,im['src']);content,ct=get(u)
    suffix='.png' if content.startswith(b'\x89PNG') else '.jpg' if content.startswith(b'\xff\xd8') else '.gif' if content.startswith(b'GIF') else '.bin'
    fn=str(n)+suffix;(p/fn).write_bytes(content);out['downloaded'].append({**im,'url':u,'file':fn,'bytes':len(content),'type':ct})
   except Exception as e:out.setdefault('image_errors',[]).append(str(e))
  out['ok']=True
 except Exception as e:out['ok']=False;out['error']=str(e)
 (p/'metadata.json').write_text(json.dumps(out,ensure_ascii=False,indent=2))
 print(k,out.get('ok'),out.get('error',''),len(out.get('downloaded',[])),flush=True)
 return out
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:results=list(ex.map(lambda kv:work(*kv),PAGES.items()))
# Stable author-repository figures already associated with the projects.
DIRECT={'fast-livo2':'https://raw.githubusercontent.com/hku-mars/FAST-LIVO2/main/pics/Framework.png','skid-slam':'https://raw.githubusercontent.com/sparolab/SKiD-SLAM/main/assets/pipeline.png','gofish':'https://raw.githubusercontent.com/tuallen/GOFish/main/docs/assets/teaser.jpg','internnav':'https://internrobotics.github.io/internvla-n1.github.io/static/images/s1s2_overview.png'}
for k,u in DIRECT.items():
 try:
  b,t=get(u);(ROOT/(k+('.jpg' if b.startswith(b'\xff\xd8') else '.png'))).write_bytes(b)
 except Exception as e:print('DIRECT ERROR',k,e)
(ROOT/'manifest.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
