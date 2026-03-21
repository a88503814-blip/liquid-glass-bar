/* LIQUID GLASS BAR — renderer.js v11 */
'use strict';

const $      = id   => document.getElementById(id);
const svgUse = (id, href) => { const u=$(id); if(u) u.setAttribute('href',href); };

// ── Clock ──────────────────────────────────────────────────────────────────
const DAYS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function tickClock() {
  const n=new Date();
  $('clock-time').textContent=`${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}:${String(n.getSeconds()).padStart(2,'0')}`;
  $('clock-date').textContent=`${DAYS[n.getDay()]}, ${MONTHS[n.getMonth()]} ${n.getDate()}`;
}
setInterval(tickClock,1000); tickClock();

// ── System Stats ───────────────────────────────────────────────────────────
window.electronAPI.onSystemStats(({cpu,ramPercent,uptime})=>{
  const $c=$('cpu-val'),$r=$('ram-val');
  $c.textContent=(cpu===null||cpu===undefined)?'--%':`${cpu}%`;
  $r.textContent=`${ramPercent}%`;
  $('uptime-val').textContent=uptime;
  $c.classList.toggle('hot',cpu!==null&&cpu>80);
  $r.classList.toggle('hot',ramPercent>85);
});

// ── Volume display ─────────────────────────────────────────────────────────
function applyVolBar(v){
  v=Math.max(0,Math.min(100,Math.round(v)));
  $('vol-bar-val').textContent=`${v}%`;
  svgUse('vol-bar-use',v===0?'#ic-vol-mute':v<55?'#ic-vol-mid':'#ic-vol-full');
}
window.electronAPI.getVolume().then(v=>applyVolBar(v||50));
window.electronAPI.onVolumeUpdate(v=>applyVolBar(v));

// ── Battery — drives power-save mode ──────────────────────────────────────
window.electronAPI.onBatteryInfo(({hasBattery,percent,isCharging})=>{
  const w=$('bat-widget');
  if(!hasBattery){w.style.display='none';return;}
  w.style.display='';
  $('bat-pct').textContent=`${percent}%`;
  const s=$('bat-svg');
  s.classList.remove('bat-full','bat-mid','bat-low','bat-charge');
  if(isCharging)     {svgUse('bat-use','#ic-bat-charge');s.classList.add('bat-charge');}
  else if(percent>70){svgUse('bat-use','#ic-bat-100');   s.classList.add('bat-full');}
  else if(percent>45){svgUse('bat-use','#ic-bat-75');    s.classList.add('bat-full');}
  else if(percent>20){svgUse('bat-use','#ic-bat-50');    s.classList.add('bat-mid');}
  else               {svgUse('bat-use','#ic-bat-25');    s.classList.add('bat-low');}

  // ── POWER SAVE: kill ALL animations when battery ≤ 20% and not charging ──
  if(!isCharging && percent<=20){
    document.body.classList.add('power-save');
  } else {
    document.body.classList.remove('power-save');
  }
});

// ── Network ────────────────────────────────────────────────────────────────
window.electronAPI.onNetworkInfo(({connected,type,ssid,ping})=>{
  const $p=$('net-ping'),$s=$('net-ssid'),ns=$('net-svg');
  if(!connected){
    svgUse('net-use','#ic-no-net');ns.style.color='var(--red)';
    $s.textContent='No Network';$p.textContent='--';$p.className='ping-val';return;
  }
  ns.style.color='';
  type==='wifi'?(svgUse('net-use','#ic-wifi-full'),$s.textContent=ssid||'Wi-Fi'):(svgUse('net-use','#ic-ethernet'),$s.textContent='Ethernet');
  if(ping!=null&&!isNaN(ping)&&ping>0){
    $p.textContent=`${ping}ms`;$p.className='ping-val';
    if(ping<50)$p.classList.add('ping-ok');else if(ping<120)$p.classList.add('ping-mid');else $p.classList.add('ping-bad');
  }else{$p.textContent='--ms';$p.className='ping-val';}
});

// ── Media ──────────────────────────────────────────────────────────────────
let lastTitle='';
window.electronAPI.onMediaInfo(({title,artist,isPlaying,app})=>{
  const $t=$('media-title'),$a=$('media-artist'),pi=$('media-play-icon');
  if(!title){
    svgUse('media-play-use','#ic-music');pi.style.color='var(--t3)';
    $t.textContent='Nothing Playing';$a.textContent='';return;
  }
  pi.style.color='var(--accent)';
  svgUse('media-play-use',isPlaying?'#ic-play':'#ic-pause');
  if(title!==lastTitle){lastTitle=title;}
  $t.textContent=title;
  $a.textContent=artist||(app?`via ${app}`:'');
});

$('media-widget').style.cursor='pointer';
$('media-widget').addEventListener('click',e=>{
  const rect=$('media-widget').getBoundingClientRect();
  window.electronAPI.showMediaPanel(rect.right);
  e.stopPropagation();
});

// ── Weather ────────────────────────────────────────────────────────────────
const WM={113:'#ic-sun',116:'#ic-partly-cloudy',119:'#ic-cloud',122:'#ic-cloud',143:'#ic-fog',176:'#ic-rain',179:'#ic-snow',182:'#ic-rain',185:'#ic-rain',200:'#ic-storm',227:'#ic-snow',230:'#ic-snow',248:'#ic-fog',260:'#ic-fog',263:'#ic-rain',266:'#ic-rain',281:'#ic-rain',284:'#ic-rain',293:'#ic-rain',296:'#ic-rain',299:'#ic-rain',302:'#ic-rain',305:'#ic-rain',308:'#ic-rain',317:'#ic-snow',320:'#ic-snow',323:'#ic-snow',326:'#ic-snow',329:'#ic-snow',332:'#ic-snow',335:'#ic-snow',338:'#ic-snow',350:'#ic-rain',353:'#ic-rain',356:'#ic-rain',359:'#ic-rain',362:'#ic-snow',365:'#ic-snow',368:'#ic-snow',371:'#ic-snow',374:'#ic-snow',377:'#ic-snow',386:'#ic-storm',389:'#ic-storm',392:'#ic-storm',395:'#ic-snow'};
const WC={'#ic-sun':'var(--yellow)','#ic-partly-cloudy':'var(--yellow)','#ic-cloud':'var(--t2)','#ic-fog':'var(--t3)','#ic-rain':'#60a5fa','#ic-snow':'#bfdbfe','#ic-storm':'#a78bfa'};
window.electronAPI.onWeatherInfo(({temp,code,desc})=>{
  const id=WM[code]||'#ic-thermo';
  svgUse('weather-use',id);$('weather-svg').style.color=WC[id]||'var(--t2)';
  $('weather-temp').textContent=(temp!==undefined&&temp!=='--')?`${temp}°C`:'--°C';
  $('weather-desc').textContent=desc||'';
});

// ── Workspaces ─────────────────────────────────────────────────────────────
window.electronAPI.onWorkspaceInfo(({workspaces})=>{
  const list=$('ws-list');list.innerHTML='';
  workspaces.forEach(ws=>{
    const b=document.createElement('button');
    b.className='ws';if(ws.active)b.classList.add('active');if(ws.occupied)b.classList.add('occupied');
    b.textContent=ws.name??String(ws.index);b.dataset.index=ws.index;
    list.appendChild(b);
  });
});
$('ws-list').addEventListener('click',e=>{
  const b=e.target.closest('.ws');if(!b)return;
  const idx=parseInt(b.dataset.index,10);if(isNaN(idx))return;
  document.querySelectorAll('#ws-list .ws').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  window.electronAPI.switchWorkspace(idx);
});

// ── Pomodoro ───────────────────────────────────────────────────────────────
// FIX: pomoCfg initialised BEFORE any click can happen.
// The getConfig call is purely to override defaults — click works instantly.
const pomoCfg={focus:25*60,brk:5*60};
window.electronAPI.getConfig().then(cfg=>{
  if(!cfg)return;
  pomoCfg.focus=(cfg?.pomodoro?.focusMinutes??25)*60;
  pomoCfg.brk  =(cfg?.pomodoro?.breakMinutes??5)*60;
  // Only reset display if pomo not already running
  if(!pomo.running)pomoReset();
});
window.electronAPI.onConfigUpdated(cfg=>{
  if(!cfg)return;
  pomoCfg.focus=(cfg?.pomodoro?.focusMinutes??25)*60;
  pomoCfg.brk  =(cfg?.pomodoro?.breakMinutes??5)*60;
});

// Pomo state — plain object, no class, minimal overhead
const pomo={running:false,mode:'focus',left:25*60,iv:null};
const $pw=$('pomo-widget'),$pt=$('pomo-time');
const fmtT=s=>`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;

function pomoApplyMode(){
  $pw.classList.toggle('break-mode',pomo.mode==='break');
  svgUse('pomo-use',pomo.mode==='break'?'#ic-coffee':'#ic-timer');
}

function pomoToggle(){
  if(pomo.running){
    clearInterval(pomo.iv);
    pomo.running=false;
    $pw.classList.remove('running');
    pomoApplyMode();
  } else {
    pomo.running=true;
    $pw.classList.add('running');
    svgUse('pomo-use','#ic-pause');
    pomo.iv=setInterval(()=>{
      pomo.left=Math.max(0,pomo.left-1);
      $pt.textContent=fmtT(pomo.left);
      if(pomo.left===0){
        clearInterval(pomo.iv);pomo.running=false;$pw.classList.remove('running');
        pomo.mode=pomo.mode==='focus'?'break':'focus';
        pomo.left=pomo.mode==='break'?pomoCfg.brk:pomoCfg.focus;
        pomoApplyMode();$pt.textContent=fmtT(pomo.left);
      }
    },1000);
  }
}

function pomoReset(){
  clearInterval(pomo.iv);
  pomo.running=false;pomo.mode='focus';pomo.left=pomoCfg.focus;
  $pw.classList.remove('running','break-mode');
  svgUse('pomo-use','#ic-timer');
  $pt.textContent=fmtT(pomoCfg.focus);
}

// INSTANT click — no debounce, no async, just toggle
$pw.addEventListener('click',pomoToggle);
$pw.addEventListener('contextmenu',e=>{e.preventDefault();pomoReset();});

// ── Auto-updater UI ────────────────────────────────────────────────────────
const $pill=$('update-pill'),$pillTxt=$('update-pill-text');
let updateState='idle';
window.electronAPI.onUpdateAvailable(({version})=>{updateState='available';$pillTxt.textContent=`v${version} available`;$pill.classList.remove('hidden');});
window.electronAPI.onUpdateProgress(({percent})=>{updateState='downloading';$pillTxt.textContent=`Downloading ${percent}%`;$pill.classList.remove('hidden');});
window.electronAPI.onUpdateReady(({version})=>{updateState='ready';$pillTxt.textContent='Restart to update';$pill.classList.remove('hidden');});
window.electronAPI.onUpdateError(()=>{updateState='idle';$pill.classList.add('hidden');});
$pill.addEventListener('click',()=>{
  if(updateState==='available'){$pillTxt.textContent='Starting…';window.electronAPI.updateDownload();}
  else if(updateState==='ready'){window.electronAPI.updateInstall();}
});

// ── Settings ───────────────────────────────────────────────────────────────
$('settings-btn').addEventListener('click',()=>window.electronAPI.openSettings());
window.electronAPI.onOpenSettings(()=>window.electronAPI.openSettings());

// ── Config: visibility + accent ───────────────────────────────────────────
const WMAP={workspaces:'ws-widget',media:'media-widget',weather:'weather-widget',pomodoro:'pomo-widget',network:'net-widget',system:'sys-widget',battery:'bat-widget'};
function applyConfig(cfg){
  if(!cfg)return;
  const w=cfg.widgets??{};
  Object.entries(WMAP).forEach(([k,id])=>{const el=$(id);if(el)el.style.display=w[k]!==false?'':'none';});
  const up=document.querySelector('.widget-uptime');if(up)up.style.display=w.uptime!==false?'':'none';
  if(cfg.bar?.accentColor){
    const h=cfg.bar.accentColor;
    const rgba=(hex,a)=>{const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);return `rgba(${r},${g},${b},${a})`;};
    document.documentElement.style.setProperty('--accent',h);
    document.documentElement.style.setProperty('--accent-dim',rgba(h,.18));
    document.documentElement.style.setProperty('--accent-glow',rgba(h,.40));
    document.documentElement.style.setProperty('--accent-ring',rgba(h,.25));
  }
}
window.electronAPI.getConfig().then(applyConfig);
window.electronAPI.onConfigUpdated(applyConfig);
