import fs from 'node:fs';
import path from 'node:path';

// Editorial mechanism diagrams, not images copied from papers.
const flows={
 'arxiv-2611-16205':['LiDAR–IMU 后验','多相机健康与互补性','单视角定位更新','多视角语义风险图'],
 'arxiv-2611-16918':['离散 LIO 位姿流','有界历史缓存','SE(3) 鲁棒三次拟合','固定时滞连续位姿'],
 'arxiv-2611-13528':['LiDAR–相机标定','关键帧与 Gaussian 地图','离线全局细化','失跟后重定位'],
 'arxiv-2611-15689':['带误差的目标检测','空间目标概率信念','信息增益选观察点','确认或继续搜索'],
 'arxiv-2611-17163':['短句 + 第一视角 + 状态','混合示范预训练','连续动作与后训练','任务判据 + 实机验证'],
 'arxiv-2611-11148':['GPS 路线与环境观测','局部可通行候选','按需多模态推理','轨迹选择与安全兜底'],
 'arxiv-2611-07417':['场景与阻挡物识别','可操作性判断','导航或移动障碍','执行监测与恢复'],
 'arxiv-2611-08100':['目标检测与 RGB-D','时空标定与坐标变换','Nav2 / 行为树','底盘执行与反馈'],
 'arxiv-2611-06308':['VGGT 子地图','固定根尺度约束','短序列回环验证','Sim(3) 全局一致性'],
 'arxiv-2611-05129':['地图与自然语言','路径条件与图像轨迹','视觉导航跟踪','终点与路径评测'],
 'arxiv-2611-04972':['VLM 语义目标','局部 SDF 几何约束','可行步态/动作筛选','物理执行反馈'],
 'arxiv-2611-03498':['视觉与几何观测','统一 BEV 表达','动态目标与地形','下游导航决策'],
 'gofish':['多视角鱼眼图像','畸变和几何校准','三维场景重建','仿真资产几何检查'],
 'skid-slam':['多机器人局部观测','稀疏地图或图约束','带宽受限数据交换','跨机器人地图对齐'],
 'navigator-memory':['当前画面与指令','任务/时间/空间记忆','历史相关内容检索','导航决策与更新'],
 'openflyv2':['机载视觉与语言','端侧航点预测','轨迹/飞控执行','闭环成功与时延'],
 'fast-livo2':['LiDAR + IMU + RGB','时间/外参对齐','紧耦合位姿估计','稠密/稀疏地图'],
 'isaac-ros-nvblox':['RGB-D / 深度 + 位姿','GPU TSDF / ESDF','可通行代价表达','Nav2 规划与控制'],
 'internnav':['视觉与语言任务','VLN 模型与动作空间','局部运动执行','统一条件下评测'],
 'gsplat':['相机视图与参数','3D Gaussian 优化','可微光栅化渲染','图像/几何分别评估'],
 'isaac-sim-nav2':['仿真场景与传感器','ROS 2 Bridge 与 TF','地图与 Nav2','控制回传与回归验证']
};
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function safeUrl(x){const u=new URL(x);if(u.protocol!=='https:')throw Error('Non-HTTPS source');return u.href;}
function flowSvg(steps,name){
 const w=820,h=166,rectw=176,start=9,sep=29;
 const parts=steps.map((s,i)=>{const x=start+i*(rectw+sep);
 return '<rect x="'+x+'" y="40" width="'+rectw+'" height="86" rx="9" fill="'+(i===3?'#edf6ed':'#f6f7f3')+'" stroke="'+(i===3?'#57987c':'#c5d4c8')+'" stroke-width="1.5"/>'+
  '<text x="'+(x+rectw/2)+'" y="70" text-anchor="middle" fill="#60786b" font-size="12" font-weight="500">0'+(i+1)+'</text>'+
  '<text x="'+(x+rectw/2)+'" y="95" text-anchor="middle" fill="#234438" font-size="13" font-weight="600" textLength="'+Math.min(156,[...s].length*13)+'" lengthAdjust="spacingAndGlyphs">'+escape(s)+'</text>'+
  (i<3?'<path d="M'+(x+rectw+5)+' 83 h20 m-7 -6 7 6 -7 6" fill="none" stroke="#85a695" stroke-width="1.7"/>':'');
 }).join('');
 return '<figure class="mechanism" aria-label="'+escape(name)+' 方法流程示意"><div class="mechanism-scroll"><svg role="img" viewBox="0 0 '+w+' '+h+'" width="'+w+'" height="'+h+'" aria-label="'+escape(steps.join('，接下来'))+'"><title>'+escape(name)+' · 技术机制</title>'+parts+'</svg></div><figcaption>技术机制示意 · 据原始研究内容整理</figcaption></figure>';
}
const css=String.raw`:root{--ink:#182c29;--muted:#687a70;--line:#dce4da;--green:#257f62;--paper:#f6f5f0}
*{box-sizing:border-box}body{background:var(--paper);color:var(--ink);margin:0;font:16px/1.9 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}a{color:var(--green);text-underline-offset:3px}
.site-header{border-bottom:1px solid var(--line);background:var(--paper)}.header-inner{max-width:1000px;margin:auto;padding:12px 23px;display:flex;align-items:center;justify-content:space-between;gap:15px}
.brand{font-weight:700;color:var(--ink);text-decoration:none;font-size:15px;line-height:1.35}.brand small{font-weight:400;font-size:11px;display:block;color:var(--muted)}nav{display:flex;gap:18px;font-size:13px;white-space:nowrap}nav a{text-decoration:none}
main{max-width:820px;margin:0 auto;padding:32px 22px 75px}h1{font-size:33px;line-height:1.38;letter-spacing:-.03em;margin:7px 0 13px}h2{font-size:21px;line-height:1.5;letter-spacing:-.01em;margin:37px 0 14px;border-bottom:1px solid var(--line);padding-bottom:9px}
.eyebrow{font-size:12px;color:var(--green);margin:0}.sub{font-size:17px;line-height:1.8;color:#50685a;margin:15px 0}.metadata{display:flex;flex-wrap:wrap;gap:7px 15px;font-size:12px;color:var(--muted)}
article p{margin:13px 0}.fact{padding:10px 0;border-bottom:1px solid #e5e9e1}.fact:last-child{border:0}.cite{font-size:12px;white-space:nowrap}
.mechanism{margin:27px 0 20px;border:1px solid var(--line);background:white;border-radius:9px;padding:10px 12px}.mechanism-scroll{overflow-x:auto}.mechanism svg{display:block;max-width:none;margin:auto}.mechanism figcaption{font-size:12px;color:var(--muted);padding:0 6px 8px}
.note{color:#5b6e61}.sources{list-style:none;padding:0}.sources li{border-bottom:1px solid var(--line);padding:9px 0}.sources a{font-size:14px}.last{margin-top:46px;padding-top:16px;border-top:1px solid var(--line);font-size:13px;color:var(--muted)}.last a{margin-right:20px}
@media(max-width:700px){.header-inner{padding:11px 16px}.brand{font-size:13px}nav{gap:12px;font-size:12px}main{padding:24px 17px 50px}h1{font-size:27px}h2{font-size:19px}.mechanism{padding:5px}.mechanism svg{width:820px;height:166px}}
@media print{body{background:#fff}.site-header,nav,.last{display:none}main{padding:0}.mechanism-scroll{overflow:visible}.mechanism svg{max-width:100%}h2{break-after:avoid}figure{break-inside:avoid}}`;
export function buildObservations({data,outDir='dist'}={}){
 const dir=path.join(outDir,'observations');fs.rmSync(dir,{recursive:true,force:true});fs.mkdirSync(dir,{recursive:true});
 const topics=Object.fromEntries(data.topics.map(t=>[t.id,t.label]));
 const ids=new Set();
 for(const i of data.items){
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(i.id)||ids.has(i.id))throw Error('Bad observation ID: '+i.id);ids.add(i.id);
  if(i.publish_approved!==true||i.owner_reviewed!==false||i.independently_tested!==false)throw Error('Evidence must be truthful: '+i.id);
  if(!flows[i.id]||flows[i.id].length!==4)throw Error('Missing research mechanism: '+i.id);
  const sourceMap=Object.fromEntries((i.sources||[]).map(s=>[s.id,s]));
  const facts=(i.facts||[]).map(f=>{
   const cites=(f.source_ids||[]).map(id=>{const s=sourceMap[id];if(!s)throw Error('Unknown source ref '+id+' in '+i.id);return '<a class="cite" href="'+escape(safeUrl(s.url))+'" target="_blank" rel="noopener noreferrer">[来源]</a>';}).join(' ');
   return '<p class="fact">'+escape(f.text)+' '+cites+'</p>';
  }).join('');
  const sources=(i.sources||[]).map(s=>'<li><a href="'+escape(safeUrl(s.url))+'" target="_blank" rel="noopener noreferrer">'+escape(s.label)+'</a></li>').join('');
  const body='<p class="eyebrow">'+escape(topics[i.topic]||'技术观察')+' · 技术观察</p><h1>'+escape(i.title)+'</h1><p class="sub">'+escape(i.summary)+'</p>'+
   '<div class="metadata"><span>'+escape(i.name)+'</span><span>事件 '+escape(i.event_date||'日期待核')+'</span><span>来源核查 '+escape(i.checked_on||'待核')+'</span><span>公开资料研究，未独立实测</span></div>'+
   '<h2>研究问题与技术机制</h2><p>'+escape(i.summary)+'</p>'+flowSvg(flows[i.id],i.name)+
   '<h2>关键技术进展</h2>'+facts+
   '<h2>工程意义与适用边界</h2><p>'+escape(i.judgment||'')+'</p><p class="note">'+escape(i.limitations||'')+'</p>'+
   '<h2>如何做最小验证</h2><p>'+escape(i.experiment||'')+'</p>'+
   (i.watch?'<h2>继续跟踪什么</h2><p>'+escape(i.watch)+'</p>':'')+
   '<h2>原始资料</h2><ul class="sources">'+sources+'</ul><div class="last"><a href="../../#articles">返回技术观察</a><a href="../../reports/">深度报告</a></div>';
  const canon='https://wqs111000.github.io/3d-robotics-insights/observations/'+i.id+'/';
  const html='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="'+escape(i.summary)+'"><title>'+escape(i.title)+' · 技术观察</title><link rel="canonical" href="'+canon+'"><style>'+css+'</style></head><body><header class="site-header"><div class="header-inner"><a href="../../" class="brand">3D &amp; Robotics<small>Insights</small></a><nav><a href="../../#articles">技术观察</a><a href="../../reports/">深度报告</a></nav></div></header><main><article>'+body+'</article></main></body></html>';
  const target=path.join(dir,i.id);fs.mkdirSync(target,{recursive:true});fs.writeFileSync(path.join(target,'index.html'),html);
 }
 console.log('Built '+ids.size+' static observation articles with original technical mechanism diagrams');
 return ids.size;
}
