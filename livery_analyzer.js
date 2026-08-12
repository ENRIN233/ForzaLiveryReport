const fs = require('fs');
const path = require('path');

// ===== 配置 =====

/** 自动检测存档路径 */
function autoDetectBaseDir() {
    // 标准 Xbox GameSave 路径
    const gameSaveRoot = 'C:/XboxGames/GameSave/pgs';
    if (!fs.existsSync(gameSaveRoot)) return '';
    try {
        const dirs = fs.readdirSync(gameSaveRoot, { withFileTypes: true });
        let best = { path: '', count: 0 };
        for (const d of dirs) {
            if (!d.isDirectory() || !d.name.startsWith('u_')) continue;
            const containersPath = path.join(gameSaveRoot, d.name, 'current', 'ContainersRoot');
            if (!fs.existsSync(containersPath)) continue;
            try {
                const liveryCount = fs.readdirSync(containersPath, { withFileTypes: true })
                    .filter(f => f.isDirectory() && f.name.startsWith('Livery_')).length;
                if (liveryCount > best.count) {
                    best = { path: containersPath, count: liveryCount };
                }
            } catch (_) {}
        }
        return best.path;
    } catch (_) { return ''; }
}

let BASE_DIR = process.argv[2] || autoDetectBaseDir() || '';
const OUTPUT_FILE = process.argv[3] || path.resolve(__dirname, 'report.html');

/** 读取 UTF-16LE 字符串（从 startByte 起连续 count 个码元） */
function readUTF16(buf, startByte, count) {
    let s = '';
    for (let k = 0; k < count; k++) {
        const p = startByte + k * 2;
        if (p + 1 >= buf.length) break;
        s += String.fromCharCode(buf[p] | (buf[p + 1] << 8));
    }
    return s;
}

/** 判断 UTF-16 码元是否属于"可显示文本"（用于在二进制区域中定位作者串） */
function isTextUnit(u) {
    return (u >= 0x20 && u <= 0x7e) ||    // ASCII 可打印
           (u >= 0xa0 && u <= 0x24f) ||   // Latin-1 补充 + 拉丁扩展-A/B
           (u >= 0x2b0 && u <= 0x36f) ||  // 修饰符 + 组合音标
           (u >= 0x370 && u <= 0x52f) ||  // 希腊文 + 西里尔文
           (u >= 0x1e00 && u <= 0x1fff) ||
           (u >= 0x2c60 && u <= 0x2c7f) ||
           (u >= 0x2e80 && u <= 0xa4cf) || // CJK 部首/汉字/假名/谚文注音...
           (u >= 0xac00 && u <= 0xd7af) || // 谚文音节
           (u >= 0xf900 && u <= 0xfaff) || // CJK 兼容汉字
           (u >= 0xfe30 && u <= 0xfe4f) ||
           (u >= 0xff00 && u <= 0xffef);   // 全角字符
}

/**
 * 解析 header 文件 → { title, desc, author }
 * header 是 Forza 二进制容器：标题/描述以「u32 长度 + UTF-16LE」紧随文件头存储，
 * 作者串位于后续二进制区（u16=9 锚点 + u32 长度 + 一段可显示文本）。
 * 相比旧版"仅扫描 ASCII 段"的做法，可正确还原中文/日文等多字节标题与描述。
 */
function parseHeader(headerPath) {
    try {
        const h = fs.readFileSync(headerPath);
        if (h.length < 8) return { title: '', desc: '', author: '' };
        // 标题：文件头偏移 4 处为 u32 长度前缀
        const titleLen = h.readUInt32LE(4);
        if (titleLen > 200 || 8 + titleLen * 2 > h.length) {
            return { title: '', desc: '', author: '' };
        }
        const title = readUTF16(h, 8, titleLen);
        // 描述：紧跟标题的 u32 长度前缀（可为 0，表示无描述）
        let desc = '';
        let cursor = 8 + titleLen * 2;
        if (cursor + 4 <= h.length) {
            const descLen = h.readUInt32LE(cursor);
            if (descLen >= 0 && descLen <= 200 && cursor + 4 + descLen * 2 <= h.length) {
                desc = readUTF16(h, cursor + 4, descLen);
                cursor += 4 + descLen * 2;
            }
        }
        // 作者：在二进制区查找「u16=9 + u32 长度 + 全部可显示文本」的结构
        let author = '';
        for (let i = cursor; i + 6 <= h.length; i++) {
            if (h[i] !== 9 || h[i + 1] !== 0) continue;
            const len = h.readUInt32LE(i + 2);
            if (len < 1 || len > 100 || i + 6 + len * 2 > h.length) continue;
            let ok = true;
            for (let k = 0; k < len; k++) {
                if (!isTextUnit(h[i + 6 + k * 2] | (h[i + 6 + k * 2 + 1] << 8))) { ok = false; break; }
            }
            if (ok) { author = readUTF16(h, i + 6, len); break; }
        }
        return { title, desc, author };
    } catch { return { title: '', desc: '', author: '' }; }
}

/** 解析目录名 */
function parseDirName(name) {
    if (name.startsWith('Livery_')) {
        const parts = name.split('_');
        return { type: 'Livery', code: parts[1], ts: parts.slice(2).join('_') };
    }
    if (name.startsWith('SoulBoundLivery_')) {
        const rest = name.replace('SoulBound', '');
        const parts = rest.split('_');
        return { type: 'SoulBoundLivery', code: parts[1], ts: parts.slice(2).join('_') };
    }
    if (name.startsWith('BaseLivery_')) {
        const parts = name.split('_');
        return { type: 'BaseLivery', code: parts[1], ts: parts.slice(3).join('_') };
    }
    if (name.startsWith('Tuning_')) {
        const parts = name.split('_');
        return { type: 'Tuning', code: parts[1], ts: parts.slice(2).join('_') };
    }
    return { type: 'Other', code: '', ts: '' };
}

/** 格式化时间戳 */
function formatTimestamp(ts) {
    if (!ts || ts.length < 8) return ts;
    return `${ts.substring(0,4)}-${ts.substring(4,6)}-${ts.substring(6,8)} ${ts.substring(8,10)}:${ts.substring(10,12)}:${ts.substring(12,14)}`;
}

/** 获取缩略图 base64 */
function getThumbnailBase64(folderPath) {
    try {
        const bigPath = path.join(folderPath, 'bigThumb.webp');
        if (fs.existsSync(bigPath)) {
            const data = fs.readFileSync(bigPath);
            if (data.length > 0) return data.toString('base64');
        }
        const smallPath = path.join(folderPath, 'thumb.webp');
        if (fs.existsSync(smallPath)) {
            const data = fs.readFileSync(smallPath);
            if (data.length > 0) return data.toString('base64');
        }
    } catch {}
    return null;
}

/** HTML 转义 */
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#039;');
}

// ===== 车型代码 → 名称映射 =====
// 从 Data_Car.str 精确解析 (.str VALUES+KEYS section 哈希对齐)
// values[i].hash == keys[i].hash, keys[i] = "IDS_DisplayName_{code}"
// 验证: 1302/1302 哈希匹配, 与 media/Cars/*.zip 交叉一致
const CAR_NAME_MAP = {
  247: "Toyota 2000GT",
  249: "Ferrari 250 GTO",
  251: "Mercedes-Benz 300 SL Coupé",
  253: "Ferrari F355 Berlinetta",
  255: "Ferrari 512 TR",
  260: "Porsche 911 Carrera RS '73",
  261: "Porsche 911 GT2 '95",
  262: "Porsche 911 GT3 '04",
  265: "Porsche 911 Turbo 3.3 '82",
  268: "Porsche 944 Turbo",
  269: "Porsche 959",
  281: "Dodge Barracuda Formula S",
  289: "Chevrolet Camaro Super Sport Coupe '69",
  292: "Porsche Carrera GT",
  295: "Toyota Celica Sport Specialty II '03",
  296: "TVR Cerbera Speed 12",
  299: "Chevrolet Chevelle Super Sport 454 '70",
  302: "Honda Civic Type R '04",
  306: "Shelby Cobra 427 S/C",
  309: "Volkswagen Corrado VR6",
  312: "Chevrolet Corvette Stingray 427 '67",
  314: "Chevrolet Corvette Z06 '02",
  315: "Chevrolet Corvette ZR-1 '70",
  316: "Lamborghini Countach LP5000 QV",
  320: "Honda CR-X SiR",
  323: "Lancia Delta HF Integrale EVO",
  324: "Lamborghini Diablo GTR",
  325: "Lamborghini Diablo SV",
  326: "Ferrari Dino 246 GT",
  327: "Mitsubishi Eclipse GSX",
  333: "Ferrari Enzo Ferrari",
  336: "Jaguar E-type",
  338: "McLaren F1 GT",
  340: "Ferrari F40",
  342: "Ferrari F50",
  343: "Nissan Fairlady Z 432 '69",
  344: "Nissan Fairlady Z '03",
  345: "Nissan Fairlady Z Version S Twin Turbo '94",
  348: "Ford GT '05",
  353: "Volkswagen Golf GTi 16v Mk2 '92",
  357: "Mitsubishi GTO",
  358: "Ferrari 288 GTO",
  363: "SUBARU Impreza 22B-STi Version '98",
  364: "SUBARU IMPREZA WRX STI '04",
  365: "SUBARU IMPREZA WRX STI '05",
  368: "Acura Integra Type R",
  374: "Mitsubishi Lancer Evolution IX MR '06",
  378: "Mitsubishi Lancer Evolution VIII MR '04",
  379: "SUBARU LEGACY B4 2.0 GT",
  382: "BMW M3 '97",
  383: "BMW M3 '05",
  391: "Maserati MC12",
  398: "Toyota MR2 GT '95",
  405: "Ford Mustang SVT Cobra R '00",
  411: "Honda NSX-R '05",
  412: "Honda NSX-R '92",
  417: "Buick Regal GNX",
  419: "Audi RS 4 '06",
  420: "Audi RS 6 '03",
  422: "Acura RSX Type S",
  423: "Mazda Savanna RX-7 '90",
  427: "Honda S2000",
  433: "TVR Sagaris",
  440: "Nissan Silvia K's '94",
  455: "Toyota Sprinter Trueno GT Apex",
  458: "Lancia Stratos HF Stradale",
  460: "Toyota Supra 2.0 GT '92",
  461: "Toyota Supra RZ '98",
  483: "Dodge Viper GTS ACR '99",
  489: "Jaguar XJ220",
  513: "Dodge Charger R/T",
  567: "Nissan R390 (GT1)",
  568: "Mercedes-Benz AMG CLK GTR",
  569: "Honda NSX-R GT",
  615: "Peugeot 207 Super 2000",
  625: "Honda Civic Type R '07",
  633: "Audi Sport quattro",
  634: "Renault 5 Turbo",
  637: "Lamborghini Miura P400",
  639: "Dodge Challenger R/T '70",
  641: "Porsche 911 GT1 Strassenversion",
  1006: "Ferrari FXX",
  1007: "Koenigsegg CCGT",
  1009: "Mitsubishi Lancer Evolution X GSR '08",
  1011: "BMW M3 '08",
  1020: "Ferrari F50 GT",
  1022: "Ferrari 430 Scuderia",
  1023: "Ferrari F40 Competizione",
  1032: "Alfa Romeo 8C Competizione",
  1034: "Toyota Celica GT-Four ST205 '94",
  1040: "BMW M1",
  1041: "Ford Mustang SVT Cobra R '93",
  1042: "Nissan Skyline 2000GT-R '71",
  1045: "Pontiac Firebird Trans Am GTA '87",
  1046: "Dodge Viper SRT-10 ACR '08",
  1052: "Dodge Ram SRT-10",
  1059: "BMW Z4 M Coupé '08",
  1060: "SUBARU IMPREZA WRX STI '08",
  1063: "Dodge Charger Daytona HEMI",
  1064: "Chevrolet Camaro Z28 '79",
  1069: "Chevrolet Corvette ZR1 '09",
  1086: "Ford Focus RS '09",
  1090: "Mercedes-Benz SL 65 AMG Black Series",
  1093: "Chevrolet Corvette '60",
  1103: "Nissan 370Z",
  1104: "Datsun 510",
  1105: "Aston Martin DB5",
  1108: "Ford RS200 Evolution",
  1110: "Mazda MX-5 Miata '94",
  1124: "Abarth Fiat 131",
  1126: "BMW M5 '09",
  1130: "McLaren 12C Coupé",
  1131: "Ferrari 458 Italia",
  1150: "Alfa Romeo Giulia Sprint GTA Stradale",
  1155: "Shelby Cobra Daytona Coupe",
  1171: "Ferrari 599XX",
  1173: "Lamborghini Murciélago LP 670-4 SV",
  1175: "Pagani Zonda R",
  1184: "Audi RS 6 '09",
  1200: "Audi R8 LMS",
  1204: "Renault Megane RS 250",
  1215: "NULL CAR",
  1216: "Audi RS 3 Sportback",
  1220: "Audi TT RS Coupé",
  1221: "Mazdaspeed 3",
  1229: "Mazda Furai",
  1231: "Volkswagen Golf R '10",
  1253: "Noble M600",
  1260: "Lexus LFA",
  1269: "BMW 2002 Turbo",
  1270: "DeLorean DMC-12",
  1272: "Ford Escort RS Cosworth '92",
  1273: "Honda Civic Type R '97",
  1276: "Pontiac Firebird Trans Am '77",
  1277: "Plymouth Cuda 426 HEMI",
  1278: "Ford XB Falcon GT",
  1282: "Nissan 240SX '93",
  1283: "Ford Thunderbird '57",
  1291: "Chevrolet El Camino Super Sport 454",
  1293: "Ford Sierra Cosworth RS500",
  1294: "GMC Syclone",
  1295: "Lancia 037 Stradale",
  1296: "Mercedes-Benz 190 E 2.5-16 Evolution II '90",
  1297: "Mitsubishi Starion ESI-R",
  1299: "Volvo 242 Turbo Evolution",
  1300: "Chevrolet Impala Super Sport 409",
  1301: "Jaguar D-Type",
  1314: "McLaren F1",
  1323: "SUBARU WRX STI '11",
  1330: "Chevrolet Camaro Z28 '70",
  1332: "Dodge Dart HEMI Super Stock '68",
  1335: "#55 Mazda 787B",
  1350: "BMW X5 M",
  1352: "Dodge Coronet Super Bee",
  1355: "Ford Mustang GT Coupe '65",
  1367: "BMW M5 '03",
  1368: "BMW M5 '88",
  1369: "Pagani Zonda Cinque Roadster",
  1376: "Lotus Elise Series 1 Sport 190 '99",
  1379: "Chevrolet Impala Super Sport '96",
  1381: "Mitsubishi Galant VR-4",
  1382: "SUBARU LEGACY RS",
  1388: "BMW M5 '12",
  1392: "Lamborghini Sesto Elemento",
  1393: "Alfa Romeo 155 Q4",
  1394: "GMC Typhoon",
  1395: "Toyota MR2 SC '89",
  1397: "Koenigsegg Agera",
  1398: "Lamborghini Aventador LP700-4 '12",
  1417: "Audi RS 5 Coupé",
  1418: "BMW M5 '95",
  1426: "Mazda RX-8 R3",
  1428: "Volkswagen Scirocco R '11",
  1429: "Chevrolet Nova Super Sport 396 '69",
  1435: "Volkswagen Beetle",
  1459: "Chevrolet Bel Air",
  1477: "Ford Transit SuperSportVan",
  1478: "#2 Audi Sport quattro S1",
  1480: "Mazda RX-7 GSL-SE '85",
  1481: "Austin-Healey 3000 MKIII",
  1493: "BMW 850CSi",
  1500: "Mercedes-Benz C 63 AMG Coupé Black Series",
  1513: "Maserati Ghibli Cup '97",
  1514: "Mazda RX-3",
  1517: "Toyota Celica GT-Four RC ST185 '92",
  1522: "Jeep Wrangler Rubicon",
  1529: "Ford Capri RS3100",
  1532: "Hennessey Venom GT",
  1533: "Holden Torana A9X",
  1537: "Toyota Corolla SR5",
  1549: "Alfa Romeo 33 Stradale",
  1559: "Mercedes-Benz 300 SLR",
  1562: "Dodge Viper GTS '13",
  1564: "Chevrolet Corvette '53",
  1568: "Honda Civic RS '74",
  1575: "Chevrolet Monte Carlo Super Sport",
  1578: "Ferrari 250 GT Berlinetta Lusso",
  1586: "Lincoln Continental '62",
  1587: "Mazda Cosmo 110S Series II",
  1591: "Peugeot 205 Turbo 16",
  1592: "Toyota Celica GT",
  1598: "BMW M3 GTS",
  1599: "Ferrari 599XX Evolution",
  1601: "Lamborghini Gallardo LP570-4 Spyder Performante",
  1607: "Audi RS 4 Avant '13",
  1627: "Mercedes-Benz G 65 AMG",
  1650: "Honda Civic Si '86",
  1651: "Ariel Atom 500 V8",
  1654: "Ford Mustang Shelby GT500 '13",
  1655: "SUBARU BRZ",
  1658: "Mercedes-Benz A 45 AMG",
  1661: "Lancia Delta S4",
  1662: "MINI Cooper S '65",
  1667: "McLaren P1",
  1668: "Ford Mustang Boss 302 '69",
  2002: "Nissan GT-R Black Edition (R35) '12",
  2003: "MINI John Cooper Works GP '12",
  2004: "Mazda MX-5 '13",
  2006: "Chevrolet Corvette ZR-1 '95",
  2007: "Toyota 86",
  2009: "Audi RS 7 Sportback",
  2010: "Audi R8 Coupé V10 plus 5.2 FSI quattro '13",
  2017: "Abarth 595 esseesse '68",
  2019: "Ford Focus RS '03",
  2034: "Ferrari LaFerrari",
  2038: "Alfa Romeo 4C",
  2040: "BAC Mono",
  2042: "Lamborghini Veneno",
  2119: "Honda Civic CRX Mugen '84",
  2121: "Honda Prelude Si",
  2128: "Cadillac XTS Limousine",
  2131: "HSV GEN-F GTS",
  2133: "BMW i8",
  2140: "SUBARU BRAT GL",
  2142: "Volkswagen Golf R '14",
  2145: "Ford Ranger T6 Rally Raid",
  2147: "MG Metro 6R4",
  2148: "MINI X-Raid All4 Racing Countryman",
  2149: "Renault Clio Williams '93",
  2151: "Volkswagen Type 2 De Luxe",
  2154: "BMW M4 Coupé '14",
  2161: "Alfa Romeo Giulia TZ2",
  2163: "Honda Civic Type R '16",
  2164: "Lamborghini Huracán LP 610-4",
  2168: "SUBARU WRX STI '15",
  2171: "Mazdaspeed MX-5 '05",
  2175: "Lexus RC F",
  2177: "Chevrolet Corvette Z06 '15",
  2178: "Audi RS 4 Avant '01",
  2179: "Audi S1",
  2180: "Audi RS 6 Avant '15",
  2183: "Chevrolet Camaro Z/28 '15",
  2184: "Ferrari 458 Speciale",
  2188: "Koenigsegg One:1",
  2205: "Honda S800",
  2216: "Plymouth Fury",
  2217: "SUBARU SVX",
  2242: "Mercedes-Benz GT S",
  2262: "Cadillac ATS-V",
  2263: "Dodge Challenger SRT Hellcat '15",
  2267: "Mazda MX-5 '16",
  2270: "Nissan Skyline H/T 2000GT-R '73",
  2272: "Datsun 2000 Roadster",
  2290: "Porsche 918 Spyder",
  2297: "Porsche 911 GT3 RS 4.0 '12",
  2357: "Ford Focus RS '17",
  2363: "Ford GT '17",
  2371: "Ferrari FXX K",
  2372: "Ford De Luxe Five-Window Coupe '32",
  2400: "Ford Mustang Shelby GT350R '16",
  2412: "BMW Isetta 300 Export",
  2416: "Meyers Manx",
  2420: "Opel Manta 400",
  2421: "Cadillac CTS-V Sedan '16",
  2422: "HSV Limited Edition Gen-F GTS Maloo '14",
  2430: "Ariel Nomad",
  2467: "Ferrari 488 GTB",
  2468: "Dodge Charger SRT Hellcat",
  2469: "Toyota Sports 800 '65",
  2470: "Aston Martin Vulcan",
  2471: "Mercedes-Benz C 63 S Coupé '16",
  2472: "McLaren 570S Coupé",
  2473: "Audi R8 V10 plus",
  2486: "Radical RXC Turbo",
  2489: "Abarth 695 Biposto '16",
  2494: "Land Rover Range Rover Sport SVR '15",
  2507: "Chevrolet 150 Utility Sedan",
  2512: "Nissan Skyline GTS-R '87",
  2515: "Penhall The Cholla",
  2517: "#11 Rockstar F-150 Trophy Truck",
  2526: "Koenigsegg Regera",
  2527: "Aston Martin DB11",
  2534: "Porsche 968 Turbo S",
  2535: "Porsche 928 GTS",
  2542: "Alfa Romeo Giulia Quadrifoglio '17",
  2544: "Dodge Viper ACR '16",
  2549: "Porsche #3 917 LH",
  2551: "Ford FPV Limited Edition Pursuit Ute '14",
  2552: "Alumicraft Class 10 Race Car",
  2563: "Reliant Supervan III",
  2566: "Toyota FJ40",
  2568: "Volkswagen Class 5/1600 Baja Bug",
  2569: "Ultima Evolution Coupe 1020",
  2574: "AMG Transport Dynamics M12S Warthog CST",
  2577: "Ferrari F12tdf",
  2613: "GMC Jimmy",
  2614: "Ford Mustang GT 2+2 Fastback '68",
  2616: "Lamborghini Centenario LP 770-4",
  2618: "Nissan GT-R (R35) '17",
  2625: "Bentley Bentayga",
  2628: "BMW M4 GTS '16",
  2636: "#1 T100 Baja Truck",
  2647: "Pagani Huayra BC Coupe",
  2649: "Ford Crown Victoria Police Interceptor",
  2652: "Mitsubishi Montero Evolution",
  2654: "Mercedes-Benz GT R",
  2659: "Nissan Silvia K's Aero '98",
  2663: "#37 Polaris RZR Pro 2 Truck",
  2711: "Mazda 3 Traffic",
  2712: "Mitsubishi Galant Traffic",
  2713: "Playground Box Truck",
  2714: "Playground Bus",
  2738: "Nissan NISMO GT-R LM '95",
  2739: "Chevrolet Camaro ZL1 '17",
  2740: "Abarth 124 Spider '17",
  2742: "Jeep Trailcat",
  2743: "Toyota Land Cruiser Arctic Trucks AT37",
  2745: "Honda Ridgeline Baja Trophy Truck '15",
  2755: "Porsche 911 GT2 RS '18",
  2773: "Porsche Cayenne Turbo",
  2792: "Ford #2 GT40 Mk II",
  2793: "#24 Ferrari Spa 330 P4",
  2794: "Porsche 911 Turbo S Leichtbau '93",
  2801: "Nissan #11 Tomica Skyline Turbo Super Silhouette",
  2822: "Nissan Safari Turbo",
  2825: "Lotus Elise GT1",
  2841: "Jeep Grand Cherokee Trackhawk",
  2866: "Exomotive Exocet Sport V8 XP-5 '18",
  2870: "Honda Civic Type R '18",
  2871: "Can-Am Maverick X RS Turbo R",
  2872: "Hyundai Veloster N",
  2902: "Playground Flatbed",
  2903: "Subaru LEGACY B4 2.0 GT Traffic",
  2909: "Dodge Challenger SRT Demon",
  2910: "Koenigsegg Agera RS",
  2935: "Funco F9",
  2937: "#14 Rahal Letterman Lanigan Racing Fiesta",
  2968: "Aston Martin Valkyrie",
  2974: "Ferrari 812 Superfast",
  2986: "Mercedes-Benz Unimog U5023",
  2987: "Peel P50",
  2992: "Jaguar Lightweight E-Type",
  2993: "TVR Griffith",
  2995: "Volkswagen Golf GTI '83",
  2996: "#13 Ford Mustang",
  2997: "#530 HSV Maloo GEN-F",
  3000: "#777 Nissan 240SX",
  3003: "#43 Dodge Viper SRT-10 ACR",
  3007: "#34 Andretti Rally Cross Beetle",
  3031: "#185 959 Prodrive Rally Raid",
  3035: "KTM X-Bow GT4",
  3037: "#98 BMW 325i",
  3051: "Ford M-Sport Fiesta RS",
  3055: "Jaguar C-X75",
  3062: "Ferrari 512 S",
  3063: "Mercedes-Benz X-Class",
  3064: "Mercedes-Benz GT 4-Door Coupé '18",
  3072: "Porsche 911 GT3 RS '19",
  3082: "Maserati MC12 Versione Corsa '08",
  3087: "McLaren 650S Spider",
  3088: "Chevrolet Silverado 1500 Drift Truck",
  3091: "Aston Martin Vantage '19",
  3107: "Mercedes-Benz G 63 AMG 6x6",
  3108: "Ford Mustang RTR Spec 5",
  3110: "Jeep Wrangler Unlimited",
  3117: "Porsche 718 Cayman GTS",
  3118: "Chevrolet Corvette ZR1 '19",
  3120: "Lamborghini Urus '19",
  3123: "Porsche 911 Carrera S '19",
  3128: "#25 'Brocky' Ultra4 Bronco RTR",
  3129: "Renault Mégane R26.R",
  3132: "MINI X-Raid John Cooper Works Buggy",
  3134: "Renault Megane R.S. '18",
  3141: "Apollo Intensa Emozione '19",
  3149: "Chevrolet Camaro ZL1 1LE '18",
  3153: "McLaren 600LT Coupé",
  3156: "McLaren Speedtail '19",
  3170: "Ford Supervan 3",
  3173: "BMW Z4 Roadster '19",
  3176: "Mercedes-AMG AMG Hammer Coupe",
  3180: "Peugeot 205 Rallye",
  3184: "Ford #5 Escort RS1800 MkII '77",
  3185: "Aston Martin DBS Superleggera '19",
  3187: "Porsche Macan LPR Rally Raid",
  3189: "Ford F-150 VelociRaptor 6X6 '19",
  3190: "Ford F-150 SVT Lightning",
  3198: "De Tomaso Pantera GT5",
  3211: "Aston Martin Vulcan AMR Pro",
  3212: "Zenvo TSR-S",
  3214: "#70 Porsche Motorsport 935",
  3225: "Ferrari Portofino '18",
  3226: "Ferrari J50 '17",
  3227: "Ferrari 488 Pista '19",
  3228: "Ford Racing Puma",
  3232: "#777 Chevrolet Corvette",
  3235: "Volkswagen Pickup LX '82",
  3241: "SUBARU WRX STI ARX Supercar",
  3249: "Ferrari #117 599 GTB Fiorano",
  3250: "Mercedes-AMG E 63 S",
  3255: "Jeep JT",
  3257: "Nissan Pulsar GTI-R",
  3277: "Ford Mustang Shelby GT500 '20",
  3282: "#203 Porsche AG 961",
  3287: "Jaguar Sport XJR-15",
  3288: "Schuppan 962CR",
  3289: "Lamborghini Aventador SVJ",
  3293: "Jaguar XJ220S TWR",
  3304: "Alfa Romeo SE 048SP",
  3307: "Nissan 370Z Nismo '19",
  3311: "Ferrari FXX-K Evo",
  3312: "Ferrari Monza SP2",
  3315: "Koenigsegg Jesko",
  3318: "Audi RS 4 Avant '18",
  3325: "Aston Martin DB7 GT",
  3359: "Audi RS e-tron GT",
  3363: "Nissan #23 Pennzoil NISMO Skyline GT-R",
  3364: "Aston Martin Valhalla Concept Car",
  3367: "Ferrari F8 Tributo '19",
  3369: "Chevrolet Corvette Stingray Coupe '20",
  3371: "Lamborghini Huracán EVO",
  3373: "Toyota 4Runner TRD Pro",
  3374: "Toyota Tacoma TRD Pro",
  3395: "Renault 8 Gordini",
  3400: "#99 Mazda RX-8",
  3402: "Toyota GR Supra '20",
  3404: "Ford #2069 Ford Performance Bronco R",
  3411: "#34 Toyota Supra MkIV",
  3412: "SUBARU STI S209",
  3413: "Volkswagen Golf R '21",
  3414: "Land Rover Defender 110 X '20",
  3434: "BMW M2 Competition Coupé",
  3439: "Ford Super Duty F-250 Lariat 'Transformer'",
  3441: "DeBerti Toyota Tacoma TRD 'The Performance Truck'",
  3445: "Porsche Taycan Turbo S",
  3449: "Lotus Evija '20",
  3454: "Audi RS 3 Sedan '20",
  3476: "Ford Super Duty F-450 DRW PLATINUM",
  3477: "Chevrolet Silverado LT Trail Boss",
  3482: "McLaren 765LT Coupé '21",
  3486: "Jeep Wrangler Rubicon Traffic",
  3494: "Alfa Romeo Autodelta Tipo 33/2 Daytona",
  3498: "Saleen S7 LM",
  3518: "BMW M8 Competition Coupé",
  3520: "Lexus LC 500 '21",
  3523: "Toyota #151 Toyota GR Supra",
  3524: "Toyota #411 Toyota Corolla Hatchback",
  3533: "Volkswagen Golf R '22",
  3534: "MINI John Cooper Works GP '21",
  3539: "SIERRA #23 Yokohama ALPHA",
  3540: "SIERRA RX3",
  3543: "Pagani Huayra R '21",
  3548: "Wuling Sunshine S",
  3549: "#122 Class 1 Buggy",
  3551: "#91 BMW M2",
  3554: "#1 Sierra Sierra Enterprises Lancer Evolution Time Attack",
  3580: "Aston Martin DBX '21",
  3583: "Audi RS 6 Avant '21",
  3584: "Audi RS 7 Sportback '21",
  3590: "Chevrolet K-10 Custom '72",
  3594: "Ferrari Roma",
  3595: "Ferrari SF90 Stradale",
  3597: "Ford F-150 XLT Lariat '86",
  3599: "Gordon Murray Automotive T.50",
  3600: "Hennessey Venom F5",
  3603: "#4402 Ultra 4 'Trophy Jeep'",
  3604: "#179 Hammerhead Class 1",
  3605: "#240 Fastball Racing Class 6100 Spec Trophy Truck",
  3606: "Lamborghini Essenza SCV12",
  3608: "Lamborghini Sián Roadster",
  3611: "Maserati MC20",
  3616: "Mercedes-AMG GT Black Series",
  3617: "Mercedes-AMG SL 63 '21",
  3622: "Nissan GT-R NISMO (R35) '20",
  3625: "Rimac Nevera",
  3629: "Toyota GR Yaris",
  3631: "Aston Martin Valkyrie AMR Pro",
  3645: "BMW M4 Competition Coupé '21",
  3650: "Mercedes-AMG ONE",
  3655: "McLaren 620R",
  3657: "RIVIAN R1T",
  3661: "Lotus Exige Cup 430 '18",
  3662: "#37 Polaris RZR Pro 4 Truck",
  3665: "SIERRA 700R",
  3667: "Porsche 911 GT3 '21",
  3668: "McLaren Artura '23",
  3670: "#4 Ford Focus RS",
  3672: "Lamborghini Huracán STO",
  3678: "Hyundai i30 N",
  3686: "Polaris RZR Pro XP Factory Racing Limited Edition",
  3687: "Polaris RZR Pro XP Ultimate",
  3692: "Ford F-150 Lightning",
  3693: "#6165 Trick Truck",
  3698: "Porsche Mission R",
  3700: "McLaren Sabre '21",
  3716: "Lotus Emira",
  3719: "Cadillac CT4-V Blackwing",
  3720: "Cadillac CT5-V Blackwing",
  3722: "GMC HUMMER EV Pickup",
  3724: "Ferrari 296 GTB",
  3726: "Acura Integra A-Spec '23",
  3728: "Bentley Continental GT Convertible",
  3735: "SUBARU BRZ '22",
  3736: "Ford Bronco Raptor",
  3737: "BMW iX xDrive50 '22",
  3744: "#64 Forsberg Racing Nissan Z",
  3745: "Audi R8 V10 performance '20",
  3750: "Mitsubishi Montero Exceed 2800 TD '95",
  3753: "Lamborghini Huracán Tecnica",
  3755: "Ford Supervan 4",
  3759: "Lamborghini Huracán EVO Spyder",
  3760: "Porsche 718 Cayman GT4 RS",
  3761: "Toyota GR86 '22",
  3763: "BMW M2 '23",
  3764: "BMW M5 CS '22",
  3766: "Chevrolet Corvette Z06 '23",
  3767: "Acura NSX Type S '22",
  3771: "Chevrolet Corvette E-Ray",
  3773: "Honda Civic Type R '23",
  3774: "Lamborghini Countach LPI 800-4 '21",
  3775: "Lamborghini Aventador LP 780-4 Ultimae '21",
  3781: "Porsche 911 GT3 RS",
  3783: "Volkswagen Rallye Golf",
  3785: "Toyota Soarer 2.5 GT-T '97",
  3789: "Wuling Hongguang Mini EV",
  3795: "Meyers Manx 2.0",
  3798: "Mazda MX-5 Cup '17",
  3811: "Lucid Air Sapphire",
  3819: "SUBARU WRX '22",
  3823: "Mazda MX-5 Miata RF",
  3827: "Hyundai IONIQ 5 N '23",
  3829: "Hyundai N Vision 74 '22",
  3840: "Lamborghini Huracán Sterrato",
  3846: "Ford Mustang GT '24",
  3847: "Ford Mustang Dark Horse",
  3848: "Toyota Camry TRD '23",
  3849: "Ford F-150 Raptor R",
  3850: "Dodge Durango SRT Hellcat '21",
  3851: "Toyota Sera '91",
  3852: "Honda Beat '91",
  3854: "Autozam AZ-1 '93",
  3855: "Nissan Figaro '91",
  3856: "Nissan Be-1 '87",
  3858: "Nissan Stagea RS FOUR V '97",
  3859: "Honda City E II '84",
  3860: "Nissan S-Cargo '89",
  3865: "Honda Acty '94",
  3880: "GR Corolla '23",
  3886: "Mitsubishi Lancer Evolution III GSR '95",
  3891: "Lamborghini Revuelto '24",
  3895: "Mercedes-AMG SLC 43 Final Edition '20",
  3903: "Ford Fiesta ST '23",
  3904: "Ford Focus ST '22",
  3908: "Honda e '22",
  3910: "Porsche 911 Rallye",
  3914: "Toyota Chaser GT Twin Turbo '91",
  3917: "Audi R8 Coupé V10 GT RWD '23",
  3918: "Nissan Gloria Gran Turismo '95",
  3921: "Nissan Z NISMO '24",
  3928: "Hyundai i20 N",
  3929: "Nissan PAO '89",
  3933: "Toyota Chaser 2.5 Tourer V",
  3937: "Honda N600 '70",
  3950: "Ferrari 275 GTB4 Spider '67",
  3953: "Porsche 911 Turbo S '23",
  3954: "Chevrolet Camaro ZL1 '24",
  3955: "RAM 1500 TRX '24",
  3959: "Dodge Challenger SRT Super Stock '22",
  3960: "SUBARU Vivio RX-R '94",
  3964: "Toyota Prius Prime XSE Premium '24",
  3983: "BMW X6 M Competition '24",
  3999: "Nissan Silvia Spec-R",
  4002: "Lamborghini Temerario",
  4034: "Honda Z GT '72",
  4038: "Toyota Altezza RS200 Z EDITION '99",
  4055: "Toyota Starlet Glanza V '96",
  4057: "Nissan Skyline GT-R V-Spec '97",
  4069: "BMW M3 '88",
  4081: "Koenigsegg Gemera",
  4084: "Datsun #269 Attacking the Clock Racing 240Z 'All Carbon Hill Climb Beast'",
  4085: "Mitsubishi #269 Attacking the Clock Racing Minicab Time Attack",
  4090: "Mitsubishi Lancer Evolution VI GSR TM Edition",
  4094: "Nissan GT-R NISMO '24",
  4114: "Nissan Skyline GT-R '92",
  4119: "Nissan Skyline GT-R 40th Anniversary",
  4124: "Mercedes-Benz G 65 Traffic",
  4125: "Honda Acty Traffic",
  4126: "Honda e Traffic",
  4127: "Mitsubishi Montero Traffic",
  4128: "Subaru WRX Traffic",
  4129: "Nissan Stagea Traffic",
  4144: "Mazda RX-7 Type R '92",
  4145: "Mazda #123 Mad Mike 808 Wagon 'FURSTY'",
  4147: "Alfa Romeo Giulia GTAm",
  4156: "Ferrari F80 '24",
  4158: "Lexus LFA Forza Edition",
  4160: "Nissan S-Cargo Forza Edition",
  4162: "Toyota Sprinter Trueno GT-APEX Forza Edition",
  4163: "Wuling Sunshine S Forza Edition",
  4164: "SUBARU BRZ Forza Edition",
  4165: "Mazda RX-3 Forza Edition",
  4166: "BMW M2 Forza Edition '23",
  4167: "Nissan GT-R Black Edition (R35) Forza Edition '12",
  4168: "Ford Mustang GT 2+2 Fastback Forza Edition '68",
  4169: "Mercedes-Benz 190 E 2.5-16 Evolution II Forza Edition",
  4171: "Ford F-150 XLT Lariat Forza Edition",
  4175: "Ford Super Duty F-450 DRW PLATINUM Forza Edition",
  4179: "Nissan #12 Skyline GT-R (BNR32 Gr.A) JTC",
  4197: "Mazda MX-5 Miata Forza Edition '94",
  4198: "Dodge Viper GTS ACR Forza Edition '99",
  4199: "Toyota Tacoma TRD Pro Forza Edition",
  4200: "Lotus Evija Forza Edition",
  4205: "Nissan Patrol '72",
  4210: "Lotus Scura Motorsports Exige WTAC",
  4211: "#19 101 Motorsport CRX WTAC",
  4212: "#32 Skyline WTAC 'Xtreme GTR'",
  4213: "#36 Dream Project S15 Silvia WTAC",
  4214: "Toyota J&J Motorsport Supra WTAC",
  4216: "Honda Acty 'RakuRaku Express'",
  4221: "GR GT (Prototype)",
  4222: "Nissan Silvia K's",
  4223: "Nissan Skyline GT-R V·spec II '00",
  4231: "#52 Evasive Motorsports S2000 WTAC",
  4232: "Porsche Cayman GT3 WTAC",
  4234: "Honda Civic Type R '08",
  4238: "Nissan Skyline 2000 Turbo RS '83",
  4250: "Toyota Sprinter Trueno GT Apex 'Touge Edition'",
  4251: "Honda S2000 'Touge Edition'",
  4252: "SUBARU Impreza 22B-STi Version 'Touge Edition'",
  4254: "Honda #33 BYP Racing Integra WTAC",
  4255: "Toyota Crown Super Deluxe Taxi",
  4257: "Toyota JPN Taxi",
  4259: "Toyota 86 'Stories'",
  4260: "Nissan GT-R NISMO 'Initial Drive'",
  4261: "Porsche 911 GT2 'Initial Drive'",
  4263: "GR GT (Prototype)",
  4264: "Ferrari FXX-K Evo 'Welcome Pack'",
  4265: "Mercedes-AMG GT Black Series 'Welcome Pack'",
  4266: "BMW M4 Competition Coupé 'Welcome Pack'",
  4267: "Mitsubishi Lancer Evolution VIII MR 'Welcome Pack'",
  4268: "Ford F-150 Raptor R 'Welcome Pack'",
  4277: "#21 Hardrace/JDMYard Civic WTAC",
  4278: "Toyota Land Cruiser '25",
  4287: "SUBARU Vivio RX-R Forza Edition",
  4303: "Nissan GT-R Black Edition (R35) 'Touge Edition'",
  4313: "Porsche #3 917 LH Forza Edition",
  4315: "Peel P50 Trolli Edition",
  4332: "Toyota Crown Super Deluxe Taxi Traffic",
  4333: "Toyota JPN Taxi Traffic",
  4341: "Ferrari J50 Preorder Car",
  4342: "Toyota Sports 800 Fanta Edition",
};

// ===== 主逻辑 =====

console.log('正在扫描: ' + BASE_DIR);
console.log('');

const items = fs.readdirSync(BASE_DIR, { withFileTypes: true });

// 收集配对信息
const tuningCodes = new Set();
const baseCodes = new Set();
const soulBoundCodes = new Set();

items.forEach(item => {
    if (!item.isDirectory()) return;
    const parsed = parseDirName(item.name);

    if (parsed.type === 'Tuning') { tuningCodes.add(parsed.code); return; }
    if (parsed.type === 'BaseLivery') { baseCodes.add(parsed.code); return; }
    if (parsed.type === 'SoulBoundLivery') { soulBoundCodes.add(parsed.code); return; }
});

// 只扫描 Livery 文件夹
const liveryItems = [];
items.forEach(item => {
    if (!item.isDirectory()) return;
    const parsed = parseDirName(item.name);
    if (parsed.type !== 'Livery') return;
    const fullPath = path.join(BASE_DIR, item.name);

    const files = fs.readdirSync(fullPath);
    const hasHeader = files.includes('header');

    let title = '', desc = '', author = '';
    if (hasHeader) {
        const ph = parseHeader(path.join(fullPath, 'header'));
        title = ph.title;
        desc = ph.desc;
        author = ph.author;
    }

    liveryItems.push({
        name: item.name,
        parsed,
        fullPath,
        title,
        desc,
        author,
        hasThumb: files.includes('bigThumb.webp') || files.includes('thumb.webp')
    });
});

// ===== 重复涂装检测 =====
// 缩略图主导 + 标题/描述拆分：
// (1) 同车型缩略图大小固定锚点聚类（0.5%容差，无链式放大）→ 候选组
// (2) 组内按 title|description 二次分组 → 最终重复组
// 作者不参与判定。

// 提取缩略图大小和标题
liveryItems.forEach(d => {
	let thumbSize = 0;
	try {
		const bigPath = path.join(d.fullPath, 'bigThumb.webp');
		if (fs.existsSync(bigPath)) thumbSize = fs.statSync(bigPath).size;
		else {
			const smallPath = path.join(d.fullPath, 'thumb.webp');
			if (fs.existsSync(smallPath)) thumbSize = fs.statSync(smallPath).size;
		}
	} catch {}
	d._thumbSize = thumbSize;
	// 标题/描述/作者已在扫描阶段精确解析（支持中文等多字节字符）
	// 标题原样显示：游戏默认标题 "Forza Livery"（未起名）也保留
	const isSentinel = s => s === 'Forza BaseLivery' || s === 'Forza Livery' || s === 'Forza SoulBoundLivery';
	d._title = (d.title === 'Forza BaseLivery' || d.title === 'Forza SoulBoundLivery') ? '' : d.title;
	d._author = isSentinel(d.author) ? '' : d.author;
	// 描述：哨兵值或与标题/作者重复时不显示
	d._desc = (isSentinel(d.desc) || d.desc === d.title || d.desc === d.author) ? '' : d.desc;
});

// 固定锚点聚类：同车型内按缩略图大小排序，以最小文件为锚点，
// 收集所有在 0.5% 容差内的项为一组，移除已分组项后重复。
// 相比滑窗相邻比较，避免了 A-B-C-D-E 链式串组的问题。
function clusterByThumbSize(items, tolerance) {
	const byCode = new Map();
	items.forEach(d => {
		if (!byCode.has(d.parsed.code)) byCode.set(d.parsed.code, []);
		byCode.get(d.parsed.code).push(d);
	});
	const groups = [];
	byCode.forEach((list, code) => {
		if (list.length < 2) return;
		list.sort((a, b) => a._thumbSize - b._thumbSize);
		const used = new Set();
		for (let i = 0; i < list.length; i++) {
			if (used.has(i)) continue;
			const cluster = [list[i]];
			used.add(i);
			const anchorSize = list[i]._thumbSize;
			for (let j = i + 1; j < list.length; j++) {
				if (used.has(j)) continue;
				const diff = Math.abs(list[j]._thumbSize - anchorSize);
				const maxDiff = Math.max(list[j]._thumbSize, anchorSize) * tolerance;
				if (diff <= maxDiff) {
					cluster.push(list[j]);
					used.add(j);
				}
			}
			if (cluster.length >= 2) groups.push(cluster);
		}
	});
	return groups;
}

// Step 1: 缩略图固定锚点聚类 → 候选组
const candidateGroups = clusterByThumbSize(
	liveryItems.filter(d => d._thumbSize > 0),
	0.005  // 0.5% 容差: ~100KB 缩略图允许 +-512 bytes
);

// Step 2: 组内按 title|description 二次分组，拆开不同标题/描述的涂装
const dupGroups = [];
candidateGroups.forEach(group => {
	const keyMap = new Map();
	group.forEach(d => {
		const key = `${d._title}||${d._desc}||${d._author}`;
		if (!keyMap.has(key)) keyMap.set(key, []);
		keyMap.get(key).push(d);
	});
	keyMap.forEach(subGroup => {
		if (subGroup.length >= 2) dupGroups.push(subGroup);
	});
});

// 标记每个涂装所属重复组（1-based，0=无重复）
const dupGroupIdx = new Map();
dupGroups.forEach((group, idx) => {
	group.forEach(d => dupGroupIdx.set(d, idx + 1));
});
liveryItems.forEach(d => {
	d._dupGroup = dupGroupIdx.get(d) || 0;
});

const dupFileCount = dupGroups.reduce((s, g) => s + g.length, 0);
console.log(`重复检测: ${dupGroups.length} 组重复, 涉及 ${dupFileCount} 个涂装文件`);

// 计算每车型唯一涂装数（重复组算1种）
const carUniqueSets = new Map();
liveryItems.forEach((d, idx) => {
	if (!carUniqueSets.has(d.parsed.code)) carUniqueSets.set(d.parsed.code, new Set());
	const key = d._dupGroup > 0 ? 'G' + d._dupGroup : 'U' + idx;
	carUniqueSets.get(d.parsed.code).add(key);
});

console.log('扫描完成。正在生成 HTML...');

// 排序：按创建者代码 + 时间戳
liveryItems.sort((a, b) => {
    const ca = parseInt(a.parsed.code) || 0;
    const cb = parseInt(b.parsed.code) || 0;
    if (ca !== cb) return ca - cb;
    return a.name.localeCompare(b.name);
});

// ===== 构建 HTML 行 =====

let rowsHtml = '';
let rowIdx = 0;

liveryItems.forEach(d => {
    const p = d.parsed;
    const curIdx = rowIdx++;

    // 标题/描述/作者已在扫描与重复检测阶段解析并清洗（支持中文等非 ASCII 文本）
    const title = d._title;
    const desc = d._desc;
    const author = d._author;
    const cleanTitle = title;
    const cleanAuthor = author;

    // 查车型名
    const codeNum = parseInt(p.code);
    const carName = CAR_NAME_MAP[codeNum] || '';

    const thumbBase64 = getThumbnailBase64(d.fullPath);
    let thumbCell;
    if (thumbBase64) {
        thumbCell = `<img class="thumb-img" src="data:image/webp;base64,${thumbBase64}" alt="${escapeHtml(cleanTitle || '缩略图')}" onclick="openLightbox(this)">`;
    } else {
        thumbCell = `<div class="no-thumb">无</div>`;
    }

    rowsHtml += `<tr class="${d._dupGroup > 0 ? 'dup-row dup-group-' + d._dupGroup : ''}" data-dup-group="${d._dupGroup}" data-car-unique="${carUniqueSets.get(d.parsed.code).size}" data-sort-default="${curIdx}" data-sort-date="${escapeHtml(p.ts)}" data-sort-car="${escapeHtml(carName)}" data-sort-author="${escapeHtml(cleanAuthor)}">
        <td class="col-date">${escapeHtml(formatTimestamp(p.ts))}</td>
        <td class="col-grid">${Math.floor(curIdx / 2) + 1}列${(curIdx % 2) + 1}个</td>
        <td class="col-car">${escapeHtml(carName)}</td>
        <td class="col-title">${escapeHtml(cleanTitle)}</td>
        <td class="col-desc">${escapeHtml(desc)}</td>
        <td class="col-author">${escapeHtml(cleanAuthor)}</td>
        <td class="col-thumb">${thumbCell}</td><td class="col-folder"><a href="file:///${escapeHtml(d.fullPath)}" onclick="event.preventDefault();copyPath(this)" data-path="${escapeHtml(d.fullPath)}">📁</a></td>
    </tr>\n`;
});

// ===== 构建完整 HTML =====

const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Forza Horizon 6 涂装分析报告</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans SC", sans-serif;
    background: #f0f2f5;
    color: #333;
    padding: 20px;
}
h1 {
    text-align: center;
    font-size: 24px;
    color: #1a1a2e;
    margin-bottom: 12px;
    font-weight: 700;
}
.stats-bar {
    text-align: center;
    margin-bottom: 12px;
    font-size: 14px;
    color: #555;
}
.search-bar {
    text-align: center;
    margin-bottom: 12px;
}
.search-bar input {
    width: 360px;
    max-width: 90%;
    padding: 8px 16px;
    border: 1px solid #ddd;
    border-radius: 20px;
    font-size: 14px;
    outline: none;
    background: #fff;
}
.search-bar input:focus { border-color: #1a1a2e; }
.sortable {
    cursor: pointer;
    user-select: none;
    transition: background 0.15s;
}
.sortable:hover { background: #2a2a5e; }
.sort-indicator { font-size: 11px; margin-left: 4px; opacity: 0.5; }
.sort-indicator.active { opacity: 1; }
.sort-row {
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    flex-wrap: wrap;
}
.sort-row button {
    padding: 5px 14px;
    border: 1px solid #ccc;
    border-radius: 16px;
    background: #fff;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.15s;
}
.sort-row button:hover { border-color: #1a1a2e; background: #f0f2ff; }
.sort-row button.active { background: #1a1a2e; color: #fff; border-color: #1a1a2e; }
.hidden-row { display: none; }
.table-wrap {
    overflow-x: auto;
    background: #fff;
    border-radius: 12px;
    box-shadow: 0 2px 12px rgba(0,0,0,0.08);
}
table {
    border-collapse: collapse;
    width: 100%;
    min-width: 800px;
    font-size: 13px;
}
th {
    background: #1a1a2e;
    color: #fff;
    padding: 8px 10px;
    user-select: none;
    white-space: nowrap;
    font-weight: 600;
    position: sticky;
    top: 0;
    z-index: 1;
}
td {
    padding: 4px 10px;
    border-bottom: 1px solid #eee;
    vertical-align: middle;
}
tr:nth-child(even) { background: #f8f9fc; }
tr:hover { background: #e3f0fa; }
.col-date { white-space: nowrap; font-family: "SF Mono", "Cascadia Code", Consolas, monospace; font-size: 12px; }
.col-grid { white-space: nowrap; font-family: "SF Mono", "Cascadia Code", Consolas, monospace; font-size: 12px; text-align: center; color: #555; }
.col-car { font-weight: 600; color: #1a1a2e; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.col-title { max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.col-desc { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #666; }
.col-author { max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.col-thumb { text-align: center; }
.thumb-img { width: 80px; height: auto; border-radius: 4px; display: block; }
.no-thumb {
    width: 80px; height: 45px;
    background: linear-gradient(135deg, #e8e8e8, #d0d0d0);
    border-radius: 4px;
    display: flex; align-items: center; justify-content: center;
    color: #aaa; font-size: 10px; margin: 0 auto;
}
.dup-row { border-left: 4px solid transparent; }
.dup-group-1 { border-left-color: #ff9800; background: #fff8e1; }
.dup-group-2 { border-left-color: #4caf50; background: #e8f5e9; }
.dup-group-3 { border-left-color: #2196f3; background: #e3f2fd; }
.dup-group-4 { border-left-color: #e91e63; background: #fce4ec; }
.dup-group-5 { border-left-color: #9c27b0; background: #f3e5f5; }
.dup-group-6 { border-left-color: #009688; background: #e0f2f1; }
.dup-group-7 { border-left-color: #fdd835; background: #fffde7; }
.dup-group-8 { border-left-color: #ff5722; background: #fbe9e7; }
#btn-dup-filter.active { background: #e65100; color: #fff; border-color: #e65100; }
.footer {
    text-align: center;
    margin-top: 16px;
    color: #999;
    font-size: 12px;
}
@media (max-width: 768px) {
    body { padding: 10px; }
    .thumb-img, .no-thumb { width: 60px; }
    .no-thumb { height: 34px; font-size: 9px; }
}
.lightbox{display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.9);z-index:9999;justify-content:center;align-items:center;cursor:pointer}.lightbox.show{display:flex}.lightbox img{max-width:92vw;max-height:92vh;border-radius:8px;box-shadow:0 4px 32px rgba(0,0,0,0.6)}.lightbox .close{position:absolute;top:16px;right:28px;font-size:36px;color:#fff;cursor:pointer;z-index:10000}.toast{position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:#1a1a2e;color:#fff;padding:10px 24px;border-radius:20px;font-size:13px;z-index:9998;opacity:0;transition:opacity 0.3s;pointer-events:none}.toast.show{opacity:1}</style>
</head>
<body>

<h1>Forza Horizon 6 涂装分析报告</h1>

<div class="stats-bar">共计 <strong>${liveryItems.length}</strong> 个涂装${dupGroups.length > 0 ? `，其中 <strong style="color:#e65100;">${dupGroups.length}</strong> 组重复（<strong>${dupFileCount}</strong> 个文件）` : ''}</div>

<div class="sort-row">
    <span style="font-size:13px;color:#555;">排序：</span>
    <button id="btn-sort-default" class="active" onclick="sortTable(1,'number',this)">默认 ▲</button>
    <button id="btn-sort-date" onclick="sortTable(0,'string',this)">日期</button>
    <button id="btn-sort-car" onclick="sortTable(2,'string',this)">车型</button>
    <button id="btn-sort-author" onclick="sortTable(5,'string',this)">作者</button>
    <span style="margin-left:12px;font-size:13px;color:#555;">筛选：</span>
    <button id="btn-dup-filter" onclick="toggleDupFilter(this)">仅重复</button>
	    <button id="btn-single-filter" onclick="toggleSingleFilter(this)">仅单涂装</button>
	    <button id="btn-multi-filter" onclick="toggleMultiFilter(this)">多涂装</button>
</div>

<div class="search-bar">
    <input type="text" id="searchInput" placeholder="搜索车型、作者或涂装标题..." oninput="filterTable()">
</div>

<div class="table-wrap">
<table id="report-table">
<thead>
<tr>
    <th>创建日期</th>
    <th>游戏内位置</th>
    <th>车型</th>
    <th>涂装标题</th>
    <th>描述</th>
    <th>作者</th>
    <th>缩略图</th><th>打开</th>
</tr>
</thead>
<tbody>
${rowsHtml}
</tbody>
</table>
</div>

<div id="toast" class="toast"></div><div class="footer">
    <div>生成时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</div>
    <div>数据来源: ${escapeHtml(BASE_DIR)}</div>
</div>

<script>
var currentSort = {col: 1, asc: true};
var dupFilterActive = false;
var singleFilterActive = false;
var multiFilterActive = false;

function sortTable(colIndex, dataType, btn) {
    // Toggle direction or set new sort column
    if (currentSort.col === colIndex) {
        currentSort.asc = !currentSort.asc;
    } else {
        currentSort.col = colIndex;
        currentSort.asc = true;
    }

    var table = document.getElementById('report-table');
    var tbody = table.querySelector('tbody');
    var rows = Array.from(tbody.querySelectorAll('tr'));

    // col: 0=date, 1=default, 2-4=car, 5=author
    var attrs = ['data-sort-date','data-sort-default','data-sort-car','data-sort-car','data-sort-car','data-sort-author'];
    var attr = attrs[colIndex];

    rows.sort(function(a, b) {
        var va = a.getAttribute(attr) || '';
        var vb = b.getAttribute(attr) || '';
        var cmp;
        if (dataType === 'number') {
            cmp = parseInt(va) - parseInt(vb);
        } else {
            cmp = va.localeCompare(vb, 'zh-CN');
        }
        // secondary sort by date when primary keys equal
        if (cmp === 0 && colIndex !== 0) {
            var da = a.getAttribute('data-sort-date') || '';
            var db = b.getAttribute('data-sort-date') || '';
            cmp = da.localeCompare(db, 'zh-CN');
        }
        return currentSort.asc ? cmp : -cmp;
    });

    for (var i = 0; i < rows.length; i++) {
        tbody.appendChild(rows[i]);
    }

    // Update buttons
    var btnLabels = ['日期','默认','车型','作者'];
    var btnIds = ['btn-sort-date','btn-sort-default','btn-sort-car','btn-sort-author'];
    var bi = colIndex === 0 ? 0 : colIndex === 1 ? 1 : colIndex <= 4 ? 2 : 3;
    document.querySelectorAll('.sort-row button').forEach(function(b){b.classList.remove('active');});
    var activeBtn = document.getElementById(btnIds[bi]);
    if (activeBtn) {
        activeBtn.classList.add('active');
        activeBtn.innerHTML = btnLabels[bi] + ' ' + (currentSort.asc ? '&#9650;' : '&#9660;');
    }

    // Re-apply search filter
    filterTable();
}

function toggleDupFilter(btn) {
    dupFilterActive = !dupFilterActive;
    if (dupFilterActive) {
        btn.classList.add('active');
        btn.textContent = '仅重复 ✓';
    } else {
        btn.classList.remove('active');
        btn.textContent = '仅重复';
    }
    filterTable();
}
function toggleSingleFilter(btn){singleFilterActive=!singleFilterActive;if(singleFilterActive){multiFilterActive=false;var mb=document.getElementById('btn-multi-filter');mb.classList.remove('active');mb.textContent='多涂装';btn.classList.add('active');btn.textContent='仅单涂装 ✓'}else{btn.classList.remove('active');btn.textContent='仅单涂装'}filterTable()}
function toggleMultiFilter(btn){multiFilterActive=!multiFilterActive;if(multiFilterActive){singleFilterActive=false;var sb=document.getElementById('btn-single-filter');sb.classList.remove('active');sb.textContent='仅单涂装';btn.classList.add('active');btn.textContent='多涂装 ✓'}else{btn.classList.remove('active');btn.textContent='多涂装'}filterTable()}
function openLightbox(img){var lb=document.getElementById("lightbox");document.getElementById("lightbox-img").src=img.src;lb.classList.add("show")}function copyPath(el){var p=el.getAttribute("data-path");navigator.clipboard.writeText(p).then(function(){var t=document.getElementById("toast");t.textContent="Path copied: "+p;t.classList.add("show");setTimeout(function(){t.classList.remove("show")},2500)}).catch(function(){window.open("file:///"+p.replace(/#/g,"%23"))})}function filterTable() {
    var input = document.getElementById('searchInput');
    var filter = input.value.toLowerCase();
    var table = document.getElementById('report-table');
    var tr = table.querySelectorAll('tbody tr');
    for (var i = 0; i < tr.length; i++) {
        var car = tr[i].cells[2].textContent.toLowerCase();
        var title = tr[i].cells[3].textContent.toLowerCase();
        var author = tr[i].cells[5].textContent.toLowerCase();
        var matchesSearch = car.indexOf(filter) > -1 || title.indexOf(filter) > -1 || author.indexOf(filter) > -1;
        var isDup = tr[i].getAttribute('data-dup-group') !== '0';
        var uniqueCount = parseInt(tr[i].getAttribute('data-car-unique')) || 0;
        if (matchesSearch && (!dupFilterActive || isDup) && (!singleFilterActive || uniqueCount === 1) && (!multiFilterActive || uniqueCount > 1)) {
            tr[i].classList.remove('hidden-row');
        } else {
            tr[i].classList.add('hidden-row');
        }
    }
}
</script>

<div id="lightbox" class="lightbox" onclick="this.classList.remove('show')"><span class="close">&times;</span><img id="lightbox-img" src="" onclick="event.stopPropagation()"></div></body>
</html>`;

// ===== 写入文件 =====

fs.writeFileSync(OUTPUT_FILE, htmlContent, 'utf-8');

const fileSizeMB = (Buffer.byteLength(htmlContent, 'utf-8') / (1024 * 1024)).toFixed(2);

console.log('');
console.log('✅ HTML 报告已生成: ' + OUTPUT_FILE);
console.log('   共 ' + liveryItems.length + ' 个涂装文件夹');
console.log('   文件体积: ' + fileSizeMB + ' MB');
console.log('');
console.log('提示: 支持拖拽 ContainersRoot 文件夹到本脚本上运行');
console.log('   用法: node livery_analyzer.js <文件夹路径> [输出html路径]');