const fs=require('fs'),path=require('path');
let la=fs.readFileSync(path.resolve(__dirname,'livery_analyzer.js'),'utf-8');

// === Step 1: CAR_NAME_MAP (regenerate if entry count mismatches Data_Car.str) ===
const d=fs.readFileSync(path.resolve(__dirname,'Data_Car.str'));
function rd(o){const e=[],eo=o+12,bo=eo+8*d.readUInt32LE(o+8);for(let i=0;i<d.readUInt32LE(o+8);i++){let p=bo+d.readUInt32LE(eo+i*8+4);while(p<d.length&&d[p]!==0)p++;e.push(d.slice(bo+d.readUInt32LE(eo+i*8+4),p).toString('utf-8'))}return e}
const valsOff=d.readUInt32LE(0x84),keysOff=d.readUInt32LE(0x88);
const vals=rd(valsOff),keys=rd(keysOff);
let dsCount=0;for(let i=0;i<keys.length;i++){if(keys[i].startsWith('IDS_DisplayName_'))dsCount++}
const existingCount=(la.match(/\d+: "/g)||[]).length;
let m=false;
if(existingCount!==dsCount||!/'\d{2}/.test(la.slice(la.indexOf('const CAR_NAME_MAP = {'),la.indexOf('};',la.indexOf('const CAR_NAME_MAP = {'))+2))||!la.includes('Porsche 911 Rallye')||!la.includes("911 GT3 RS '23")||!la.includes('Formula Drift #98 BMW')||!la.includes('Alumicraft #122 Class 1')){
  console.log('Regenerating map: '+existingCount+' → '+dsCount+' entries...');
  const cd={};for(let i=0;i<keys.length;i++){const m=keys[i].match(/^IDS_DisplayName_(\d+)/);if(m)cd[parseInt(m[1])]={d:vals[i],ms:vals[i+dsCount]}}
  const BR='Lamborghini|Koenigsegg|Mercedes-AMG|Mercedes-Benz|AMG Transport Dynamics|Aston Martin|Alfa Romeo|Land Rover|De Tomaso|Gordon Murray Automotive|Formula Drift|Ferrari|Porsche|McLaren|Maserati|Pagani|Bentley|Hennessey|Rimac|RIVIAN|Lucid|Saleen|Shelby|Abarth|Zenvo|Apollo|Mitsubishi|Nissan|Toyota|Mazda|Honda|Ford|Dodge|Chevrolet|Cadillac|Buick|GMC|Pontiac|Plymouth|Datsun|Audi|BMW|Volkswagen|Hyundai|Kia|Lexus|Jaguar|Lotus|MINI|Volvo|Acura|Lincoln|Jeep|RAM|Renault|Peugeot|Opel|SUBARU|Subaru|Holden|HSV|TVR|Noble|Ariel|KTM|BAC|Wuling|Penhall|Polaris|Alumicraft|Reliant|Ultima|Radical|DeLorean|MG|Austin-Healey|Autozam|Schuppan|Jimco|Meyers|GR'.split('|');
  const FW={Lambo:'Lamborghini',NISMO:'Nissan',Caddy:'Cadillac',SRT:'Dodge',DD:'DeBerti',GMA:'Gordon Murray Automotive',LR:'Land Rover','L.':'Lamborghini','P.':'Porsche','McL.':'McLaren','Mit.':'Mitsubishi','Nis.':'Nissan','N.':'Nissan','Toy.':'Toyota','T.':'Toyota','Mas.':'Maserati',AR:'Alfa Romeo',AMG:'Mercedes-AMG',MB:'Mercedes-Benz',AM:'Aston Martin',Alfa:'Alfa Romeo',Chevy:'Chevrolet',VW:'Volkswagen','M-B':'Mercedes-Benz','M-AMG':'Mercedes-AMG'};
  const MM={2470:'Aston Martin',1063:'Dodge',1175:'Pagani',1200:'Audi',1398:'Lamborghini',1481:'Austin-Healey',1513:'Maserati',1532:'Hennessey',1533:'Holden',1562:'Dodge',1564:'Chevrolet',1586:'Lincoln',1601:'Lamborghini',2006:'Chevrolet',2034:'Ferrari',2128:'Cadillac',2177:'Chevrolet',2262:'Cadillac',2263:'Dodge',2297:'Porsche',2421:'Cadillac',2469:'Toyota',2494:'Land Rover',2526:'Koenigsegg',2552:'Alumicraft',2574:'AMG Transport Dynamics',2649:'Ford',2652:'Mitsubishi',2659:'Nissan',2712:'Mitsubishi',2713:'Playground',2714:'Playground',2755:'Porsche',2792:'Ford',2794:'Porsche',2801:'Nissan',2872:'Hyundai',2902:'Playground',2903:'Subaru',2910:'Koenigsegg',2987:'Peel',3072:'Porsche',3082:'Maserati',3087:'McLaren',3088:'Chevrolet',3118:'Chevrolet',3120:'Lamborghini',3129:'Renault',3134:'Renault',3156:'McLaren',3189:'Ford',3198:'De Tomaso',3225:'Ferrari',3227:'Ferrari',3249:'Ferrari',3289:'Lamborghini',3318:'Audi',3363:'Nissan',3364:'Aston Martin',3367:'Ferrari',3369:'Chevrolet',3371:'Lamborghini',3414:'Land Rover',3441:'Toyota',3482:'McLaren',3486:'Jeep',3543:'Pagani',3595:'Ferrari',3599:'Gordon Murray Automotive',3600:'Hennessey',3611:'Maserati',3616:'Mercedes-AMG',3625:'Rimac',3631:'Aston Martin',3667:'Porsche',3668:'McLaren',3672:'Lamborghini',3686:'Polaris',3692:'Ford',3700:'McLaren',3722:'GMC',3726:'Acura',3736:'Ford',3750:'Mitsubishi',3753:'Lamborghini',3759:'Lamborghini',3760:'Porsche',3766:'Chevrolet',3771:'Chevrolet',3781:'Porsche',3785:'Toyota',3798:'Mazda',3827:'Hyundai',3829:'Hyundai',3840:'Lamborghini',3850:'Dodge',3855:'Nissan',3858:'Nissan',3859:'Honda',3860:'Nissan',3886:'Mitsubishi',3891:'Lamborghini',3914:'Toyota',3918:'Nissan',3921:'Nissan',3950:'Ferrari',3953:'Porsche',3955:'RAM',3959:'Dodge',4002:'Lamborghini',4038:'Toyota',4055:'Toyota',4057:'Nissan',4081:'Koenigsegg',4085:'Mitsubishi',4090:'Mitsubishi',4094:'Nissan',4114:'Nissan',4119:'Nissan',4124:'Mercedes-Benz',4125:'Honda',4126:'Honda',4127:'Mitsubishi',4128:'Subaru',4129:'Nissan',4145:'Mazda',4147:'Alfa Romeo',4160:'Nissan',4163:'Wuling',4167:'Nissan',4168:'Ford',4169:'Mercedes-Benz',4197:'Mazda',4198:'Dodge',4199:'Toyota',4205:'Nissan',4210:'Lotus',4214:'Toyota',4216:'Honda',4221:'Toyota',4223:'Nissan',4232:'Porsche',4255:'Toyota',4259:'Toyota',4260:'Nissan',4267:'Mitsubishi',4315:'Peel',4332:'Toyota',4333:'Toyota',4342:'Toyota',1297:'Mitsubishi',3937:'Honda',3954:'Chevrolet',4238:'Nissan',260:'Porsche',261:'Porsche',262:'Porsche',265:'Porsche',281:'Dodge',299:'Chevrolet',312:'Chevrolet',314:'Chevrolet',315:'Chevrolet',323:'Lancia',324:'Lamborghini',327:'Mitsubishi',343:'Nissan',344:'Nissan',345:'Nissan',374:'Mitsubishi',378:'Mitsubishi',440:'Nissan',458:'Lancia',639:'Dodge',1009:'Mitsubishi',1069:'Chevrolet',1093:'Chevrolet',1204:'Renault',1295:'Lancia',1381:'Mitsubishi',1661:'Lancia',2866:'Exomotive',2871:'Can-Am',2935:'Funco',3184:'Ford',3325:'Aston Martin',3404:'Ford',3523:'Toyota',3524:'Toyota',3539:'SIERRA',3540:'SIERRA',3665:'SIERRA',3774:'Lamborghini',3775:'Lamborghini',3910:'Porsche',4179:'Nissan',4254:'Honda',4261:'Porsche',2996:'Formula Drift',2997:'Formula Drift',3000:'Formula Drift',3003:'Formula Drift',3037:'Formula Drift',3232:'Formula Drift',3249:'Formula Drift',3400:'Formula Drift',3411:'Formula Drift',3523:'Formula Drift',3524:'Formula Drift',3551:'Formula Drift',3744:'Formula Drift',1335:'Mazda',1478:'Audi',2517:'Ford',2636:'Toyota',2663:'RJ Anderson',2793:'Ferrari',2937:'Ford',3007:'Volkswagen',3031:'Porsche',3128:'Ford',3214:'Porsche',3282:'Porsche',3549:'Alumicraft',3554:'Mitsubishi',3603:'Casey Currie Motorsports',3604:'Jimco',3605:'Jimco',3662:'RJ Anderson',3670:'Ford',3693:'Alumicraft',4211:'Honda',4212:'Nissan',4213:'Nissan',4231:'Honda',4277:'Honda'};
  function mfr(ms,code){for(const b of BR){if(new RegExp('^'+b.replace(/[- ]/g,'[- ]?'),'i').test(ms))return b}const f=ms.split(/[\s\d]/)[0].replace(/\.$/,'');if(FW[f])return FW[f];if(MM[code])return MM[code];return''}
  const lines=[];
  Object.entries(cd).sort((a,b)=>parseInt(a[0])-parseInt(b[0])).forEach(([code,v])=>{const b=mfr(v.ms,parseInt(code));let n=b&&!v.d.toLowerCase().startsWith(b.toLowerCase())?b+' '+v.d:v.d;let ym=v.ms.match(/'(\d{2})$/);if(!ym){const m2=v.ms.match(/\s(\d{2})$/);if(m2&&!new RegExp('\\b'+m2[1]+'\\b').test(v.d))ym=m2;}if(ym)n+=" '"+ym[1];lines.push('  '+code+': "'+n.replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'",')});
  const s=la.indexOf('const CAR_NAME_MAP = {'),e=la.indexOf('};',s)+2;
  la=la.slice(0,s)+'const CAR_NAME_MAP = {\n'+lines.join('\n')+'\n};'+la.slice(e);
  console.log('Map patched:',lines.length,'entries');m=true;
} else {console.log('Map OK ('+existingCount+' entries).');}

// === Step 2: HTML enhancements (always apply if missing) ===

// Folder column
if(!la.includes('col-folder')){
  la=la.replace('<td class="col-thumb">${thumbCell}</td>','<td class="col-thumb">${thumbCell}</td><td class="col-folder"><a href="file:///${escapeHtml(d.fullPath)}" onclick="event.preventDefault();copyPath(this)" data-path="${escapeHtml(d.fullPath)}">📁</a></td>');
  la=la.replace('<th>缩略图</th>','<th>缩略图</th><th>打开</th>');
  la=la.replace('.col-thumb{text-align:center}','.col-thumb{text-align:center}.col-folder{text-align:center;width:40px}.col-folder a{text-decoration:none;font-size:16px}.col-folder a:hover{opacity:0.7}');
  la=la.replace('min-width:800px','min-width:860px');m=true;
}

// Lightbox
if(!la.includes('onclick="openLightbox(this)"')){
  la=la.replace('thumbCell = `<img class="thumb-img" src="data:image/webp;base64,${thumbBase64}" alt="${escapeHtml(cleanTitle || \'缩略图\')}">`','thumbCell = `<img class="thumb-img" src="data:image/webp;base64,${thumbBase64}" alt="${escapeHtml(cleanTitle || \'缩略图\')}" onclick="openLightbox(this)">`');
  if(!la.includes('id="lightbox"')){
    la=la.replace('</style>','.lightbox{display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.9);z-index:9999;justify-content:center;align-items:center;cursor:pointer}.lightbox.show{display:flex}.lightbox img{max-width:92vw;max-height:92vh;border-radius:8px;box-shadow:0 4px 32px rgba(0,0,0,0.6)}.lightbox .close{position:absolute;top:16px;right:28px;font-size:36px;color:#fff;cursor:pointer;z-index:10000}</style>');
    la=la.replace('</body>','<div id="lightbox" class="lightbox" onclick="this.classList.remove(\'show\')"><span class="close">&times;</span><img id="lightbox-img" src="" onclick="event.stopPropagation()"></div></body>');
    la=la.replace('function filterTable()','function openLightbox(img){var lb=document.getElementById("lightbox");document.getElementById("lightbox-img").src=img.src;lb.classList.add("show")}function filterTable()');
  }
  m=true;
}

// copyPath + toast
if(!la.includes('function copyPath')){
  la=la.replace('function filterTable()','function copyPath(el){var p=el.getAttribute("data-path");navigator.clipboard.writeText(p).then(function(){var t=document.getElementById("toast");t.textContent="Path copied: "+p;t.classList.add("show");setTimeout(function(){t.classList.remove("show")},2500)}).catch(function(){window.open("file:///"+p.replace(/#/g,"%23"))})}function filterTable()');
  la=la.replace('</style>','.toast{position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:#1a1a2e;color:#fff;padding:10px 24px;border-radius:20px;font-size:13px;z-index:9998;opacity:0;transition:opacity 0.3s;pointer-events:none}.toast.show{opacity:1}</style>');
  la=la.replace('<div class="footer">','<div id="toast" class="toast"></div><div class="footer">');m=true;
}

// English output filename
if(!la.includes("'report.html'")){la=la.replace("'涂装分析报告.html'","'report.html'");m=true;}

// === Step 3: Duplicate detection (check only) ===
if(la.includes('data-dup-group')){console.log('Dup detection OK.');}
else{console.log('Dup detection MISSING — update livery_analyzer.js from source.');m=true;}

// === Step 4: Single/multi livery filter ===
if(!la.includes('data-car-unique')){
  // 4a: car unique count computation (Node.js part)
  la=la.replace('console.log(`重复检测: ${dupGroups.length} 组重复, 涉及 ${dupFileCount} 个涂装文件`);\n\nconsole.log(\'扫描完成。正在生成 HTML...\');','console.log(`重复检测: ${dupGroups.length} 组重复, 涉及 ${dupFileCount} 个涂装文件`);\n\n// 计算每车型唯一涂装数（重复组算1种）\nconst carUniqueSets = new Map();\nliveryItems.forEach((d, idx) => {\n\tif (!carUniqueSets.has(d.parsed.code)) carUniqueSets.set(d.parsed.code, new Set());\n\tconst key = d._dupGroup > 0 ? \'G\' + d._dupGroup : \'U\' + idx;\n\tcarUniqueSets.get(d.parsed.code).add(key);\n});\n\nconsole.log(\'扫描完成。正在生成 HTML...\');');
  // 4b: data-car-unique attribute in row template
  la=la.replace('data-dup-group="${d._dupGroup}" data-sort-default=','data-dup-group="${d._dupGroup}" data-car-unique="${carUniqueSets.get(d.parsed.code).size}" data-sort-default=');
  // 4c: filter buttons
  la=la.replace('<button id="btn-dup-filter" onclick="toggleDupFilter(this)">仅重复</button>','<button id="btn-dup-filter" onclick="toggleDupFilter(this)">仅重复</button>\n\t    <button id="btn-single-filter" onclick="toggleSingleFilter(this)">仅单涂装</button>\n\t    <button id="btn-multi-filter" onclick="toggleMultiFilter(this)">多涂装</button>');
  // 4d: JS variables
  la=la.replace('var dupFilterActive = false;','var dupFilterActive = false;\nvar singleFilterActive = false;\nvar multiFilterActive = false;');
  // 4e: toggle functions (before function openLightbox)
  la=la.replace('function openLightbox','function toggleSingleFilter(btn){singleFilterActive=!singleFilterActive;if(singleFilterActive){multiFilterActive=false;var mb=document.getElementById(\'btn-multi-filter\');mb.classList.remove(\'active\');mb.textContent=\'多涂装\';btn.classList.add(\'active\');btn.textContent=\'仅单涂装 ✓\'}else{btn.classList.remove(\'active\');btn.textContent=\'仅单涂装\'}filterTable()}\nfunction toggleMultiFilter(btn){multiFilterActive=!multiFilterActive;if(multiFilterActive){singleFilterActive=false;var sb=document.getElementById(\'btn-single-filter\');sb.classList.remove(\'active\');sb.textContent=\'仅单涂装\';btn.classList.add(\'active\');btn.textContent=\'多涂装 ✓\'}else{btn.classList.remove(\'active\');btn.textContent=\'多涂装\'}filterTable()}\nfunction openLightbox');
  // 4f: filterTable condition update
  la=la.replace('if (matchesSearch && (!dupFilterActive || isDup)) {','var uniqueCount = parseInt(tr[i].getAttribute(\'data-car-unique\')) || 0;\n\t        if (matchesSearch && (!dupFilterActive || isDup) && (!singleFilterActive || uniqueCount === 1) && (!multiFilterActive || uniqueCount > 1)) {');
  console.log('Single/multi livery filter injected.');
  m=true;
} else {console.log('Single/multi livery filter OK.');}

if(m){fs.writeFileSync('livery_analyzer.js',la);console.log('HTML patches applied.');}
else{console.log('HTML patches already applied.');}
