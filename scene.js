
    import * as THREE from 'three';
    import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
    import { Reflector } from 'three/addons/objects/Reflector.js';
    import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
    import { clipLightToMiniature,createSnowField,stepSnowField } from './scene-space.js';
    import { IdleOrbitMotion, ORBIT_CONFIG, orbitDirection } from './orbit-motion.js';
    import { gsap } from 'gsap';

    // =========================================================
    // 1. HIGH-FPS RENDERER, SCENE & MINIATURE TELEPHOTO CAMERA
    // =========================================================
    const container = document.getElementById('canvas-container');
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x161233);

    const camera = new THREE.PerspectiveCamera(25, window.innerWidth / window.innerHeight, 0.1, 900);
    camera.position.set(34.0, 21.5, 36.0);
    camera.layers.enable(0);
    camera.layers.enable(1);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.target.set(0, 1.6, 0.2);
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
    controls.minDistance = 4;
    controls.maxDistance = 400;

    // =========================================================
    // 1.5 ANIME SKY DOME (紫黄雨后黄昏 / 雨夜深蓝 / 湿润白昼)
    // =========================================================
    const skyUniforms = {
      uTopColor: { value: new THREE.Color(0x1a1438) },
      uMidColor: { value: new THREE.Color(0x6d28d9) },
      uBotColor: { value: new THREE.Color(0xf59e0b) }
    };
    skyUniforms.uDuskAmount={value:0};
    skyUniforms.uViewportHeight={value:renderer.domElement.height};
    const skyDome = new THREE.Mesh(
      new THREE.SphereGeometry(600, 24, 16),
      new THREE.ShaderMaterial({
        uniforms: skyUniforms,
        side: THREE.BackSide,
        depthWrite: false,
        vertexShader: `
          varying vec3 vWorldPos;
          void main() {
            vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
            gl_Position = projectionMatrix * viewMatrix * vec4(vWorldPos, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 uTopColor;
          uniform vec3 uMidColor;
          uniform vec3 uBotColor;
          uniform float uDuskAmount;
          uniform float uViewportHeight;
          varying vec3 vWorldPos;
          void main() {
            float h = normalize(vWorldPos).y;
            vec3 col = mix(uBotColor, uMidColor, smoothstep(-0.04, 0.18, h));
            col = mix(col, uTopColor, smoothstep(0.18, 0.68, h));
            float v=clamp(gl_FragCoord.y/uViewportHeight,0.,1.);
            vec3 dusk=mix(uBotColor,uMidColor,smoothstep(.02,.56,v));
            dusk=mix(dusk,uTopColor,smoothstep(.56,1.,v));
            gl_FragColor=mix(vec4(col,1.),linearToOutputTexel(vec4(dusk,1.)),uDuskAmount);
          }
        `
      })
    );
    scene.add(skyDome);
    const skyViewport=new THREE.Vector4();
    skyDome.onBeforeRender=()=>{renderer.getCurrentViewport(skyViewport);skyUniforms.uViewportHeight.value=skyViewport.w;};

    // =========================================================
    // 2. CEL-SHADING & COMIC INK LINE ENGINE (三渲二核心 + 材质缓存)
    // =========================================================
    function createCelRamp() {
      const data = new Uint8Array([
        95, 112, 145, 255,
        185, 198, 218, 255,
        255, 255, 255, 255
      ]);
      const tex = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
      tex.minFilter = THREE.NearestFilter;
      tex.magFilter = THREE.NearestFilter;
      tex.needsUpdate = true;
      return tex;
    }
    const celRamp = createCelRamp();

    const allInkLines = [];
    const extInkMat = new THREE.LineBasicMaterial({ color: 0x090d16, transparent: true, opacity: 0.88 });
    const intInkMat = new THREE.LineBasicMaterial({ color: 0x3b2314, transparent: true, opacity: 0.55 });

    const matCache = new Map();
    function makeCelMat(colorHex, isInterior = false) {
      const key = `${colorHex}_${isInterior ? 1 : 0}`;
      if (matCache.has(key)) return matCache.get(key);
      const m = new THREE.MeshToonMaterial({
        color: colorHex,
        gradientMap: celRamp,
        emissive: new THREE.Color(colorHex),
        emissiveIntensity: isInterior ? 0.36 : 0.04,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1
      });
      matCache.set(key, m);
      return m;
    }

    function addInkOutline(mesh, isInterior = false, angleThreshold = 24) {
      const edges = new THREE.EdgesGeometry(mesh.geometry, angleThreshold);
      const line = new THREE.LineSegments(edges, isInterior ? intInkMat : extInkMat);
      line.layers.set(1);
      mesh.add(line);
      allInkLines.push(line);
      return mesh;
    }

    function box(w, h, d, colorHex, isInterior = false, edgeAngle = 24) {
      const geo = new THREE.BoxGeometry(w, h, d);
      const m = new THREE.Mesh(geo, makeCelMat(colorHex, isInterior));
      m.castShadow = !isInterior;
      m.receiveShadow = !isInterior;
      return addInkOutline(m, isInterior, edgeAngle);
    }

    function boxFast(w, h, d, colorHex, isInterior = true) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), makeCelMat(colorHex, isInterior));
      m.layers.set(1);
      return m;
    }

    function cyl(rt, rb, h, segs, colorHex, isInterior = false) {
      const geo = new THREE.CylinderGeometry(rt, rb, h, segs);
      const m = new THREE.Mesh(geo, makeCelMat(colorHex, isInterior));
      m.castShadow = !isInterior;
      m.receiveShadow = !isInterior;
      return addInkOutline(m, isInterior, 40);
    }

    function cylFast(rt, rb, h, segs, colorHex, isInterior = true) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, segs), makeCelMat(colorHex, isInterior));
      m.layers.set(1);
      return m;
    }

    function makeFrontBackBox(w, h, d, faceTex, sideColorHex = 0x1e293b, isInterior = false) {
      const faceMat = new THREE.MeshBasicMaterial({ map: faceTex });
      const sideMat = makeCelMat(sideColorHex, isInterior);
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        [sideMat, sideMat, sideMat, sideMat, faceMat, faceMat]
      );
      return addInkOutline(m, isInterior);
    }

    // =========================================================
    // 3. OPTIMIZED LIGHTING
    // =========================================================
    const hemiLight = new THREE.HemisphereLight(0xa78bfa, 0x1e1b4b, 0.88);
    scene.add(hemiLight);

    const moonLight = new THREE.DirectionalLight(0xfdba74, 0.98);
    moonLight.position.set(16, 28, 20);
    moonLight.castShadow = true;
    moonLight.shadow.mapSize.set(1024, 1024);
    const sc = 23.5;
    moonLight.shadow.camera.left = -sc;
    moonLight.shadow.camera.right = sc;
    moonLight.shadow.camera.top = sc;
    moonLight.shadow.camera.bottom = -sc;
    moonLight.shadow.bias = -0.0006;
    scene.add(moonLight);

    const storeLights = [];
    [
      [0.0, 3.1, -2.6, 0xffe8a3, 4.8, 16],
      [0.8, 1.9,  1.4, 0xffc300, 3.8, 12]
    ].forEach(([x, y, z, col, intensity, dist]) => {
      const pl = new THREE.PointLight(col, intensity, dist, 1.2);
      pl.position.set(x, y, z);
      scene.add(pl);
      storeLights.push({ light: pl, base: intensity });
    });

    // =========================================================
    // 4. PROCEDURAL TEXTURES & GPU RAIN SHADER
    // =========================================================
    function fillFittedText(ctx, text, x, y, maxWidth, initialSize, weight = '900', fontFamily = '"Hiragino Sans", "Microsoft YaHei", sans-serif') {
      let sz = initialSize;
      ctx.font = `${weight} ${sz}px ${fontFamily}`;
      while (ctx.measureText(text).width > maxWidth && sz > 10) {
        sz -= 2;
        ctx.font = `${weight} ${sz}px ${fontFamily}`;
      }
      ctx.fillText(text, x, y);
    }

    function createWindowLightSpillTexture() {
      const c = document.createElement('canvas');
      c.width = 1024;
      c.height = 512;
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, 1024, 512);

      function drawProjectedBay(x1Top, x2Top, x1Bot, x2Bot, yTop, yBot, alphaPeak, colorRGB = '255, 208, 92') {
        const grad = ctx.createLinearGradient(0, yTop, 0, yBot);
        grad.addColorStop(0.0, `rgba(${colorRGB}, ${alphaPeak})`);
        grad.addColorStop(0.35, `rgba(255, 185, 56, ${alphaPeak * 0.72})`);
        grad.addColorStop(0.75, `rgba(251, 146, 60, ${alphaPeak * 0.28})`);
        grad.addColorStop(1.0, `rgba(251, 146, 60, 0.0)`);

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(x1Top, yTop);
        ctx.lineTo(x2Top, yTop);
        ctx.lineTo(x2Bot, yBot);
        ctx.lineTo(x1Bot, yBot);
        ctx.closePath();
        ctx.fill();
      }

      ctx.filter = 'blur(8px)';
      drawProjectedBay(110, 175, 75, 165, 18, 360, 0.52);
      drawProjectedBay(195, 330, 155, 340, 18, 430, 0.68, '255, 224, 115');
      [
        [352, 482, 345, 505],
        [496, 626, 515, 670],
        [640, 770, 680, 835],
        [784, 912, 845, 995]
      ].forEach(([xt1, xt2, xb1, xb2]) => {
        drawProjectedBay(xt1, xt2, xb1, xb2, 18, 485, 0.76);
      });
      drawProjectedBay(15, 92, 5, 105, 45, 290, 0.45, '56, 189, 248');
      ctx.filter = 'none';

      const sillGrad = ctx.createLinearGradient(110, 0, 915, 0);
      sillGrad.addColorStop(0, 'rgba(254, 240, 138, 0.0)');
      sillGrad.addColorStop(0.15, 'rgba(254, 240, 138, 0.65)');
      sillGrad.addColorStop(0.85, 'rgba(254, 240, 138, 0.75)');
      sillGrad.addColorStop(1, 'rgba(254, 240, 138, 0.0)');
      ctx.fillStyle = sillGrad;
      ctx.fillRect(100, 10, 820, 22);

      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    }

    function createSideWindowSpillTexture() {
      const c = document.createElement('canvas');
      c.width = 512;
      c.height = 512;
      const ctx = c.getContext('2d');
      ctx.filter = 'blur(10px)';

      const grad = ctx.createLinearGradient(20, 0, 460, 0);
      grad.addColorStop(0.0, 'rgba(255, 210, 96, 0.70)');
      grad.addColorStop(0.5, 'rgba(251, 176, 59, 0.35)');
      grad.addColorStop(1.0, 'rgba(251, 146, 60, 0.0)');
      ctx.fillStyle = grad;

      ctx.beginPath();
      ctx.moveTo(20, 60); ctx.lineTo(440, 20); ctx.lineTo(440, 235); ctx.lineTo(20, 240);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(20, 265); ctx.lineTo(440, 260); ctx.lineTo(440, 480); ctx.lineTo(20, 445);
      ctx.closePath();
      ctx.fill();

      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    }

    function createWetStreetTexture() {
      const c = document.createElement('canvas');
      c.width = 1024;
      c.height = 1024;
      const ctx = c.getContext('2d');

      ctx.fillStyle = 'rgba(17, 24, 39, 0.76)';
      ctx.fillRect(0, 0, 1024, 1024);

      ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
      ctx.lineWidth = 2;
      for (let x = 0; x <= 1024; x += 32) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 620); ctx.stroke();
      }
      for (let y = 0; y <= 620; y += 32) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1024, y); ctx.stroke();
      }

      const puddles = [
        [340, 520, 170, 75],
        [640, 510, 220, 85],
        [480, 760, 290, 120],
        [210, 810, 180, 90],
        [790, 800, 210, 105]
      ];
      ctx.globalCompositeOperation = 'destination-out';
      puddles.forEach(([px, py, rx, ry]) => {
        const g = ctx.createRadialGradient(px, py, 12, px, py, rx);
        g.addColorStop(0.0, 'rgba(0,0,0,0.72)');
        g.addColorStop(0.65, 'rgba(0,0,0,0.40)');
        g.addColorStop(1.0, 'rgba(0,0,0,0.0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalCompositeOperation = 'source-over';

      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    }

    function finishStoreSignTexture(canvas,name){
      const tex=new THREE.CanvasTexture(canvas);tex.name=name;tex.colorSpace=THREE.SRGBColorSpace;
      tex.anisotropy=Math.min(16,renderer.capabilities.getMaxAnisotropy());tex.generateMipmaps=true;
      tex.minFilter=THREE.LinearMipmapLinearFilter;tex.magFilter=THREE.LinearFilter;
      return tex;
    }
    function createFasciaTexture(){
      // 4096:320 matches the physical 11.9:.92 fascia; letters retain their proper proportions.
      const c=document.createElement('canvas');c.width=4096;c.height=320;const ctx=c.getContext('2d');
      ctx.fillStyle='#fffdf3';ctx.fillRect(0,0,4096,320);
      ctx.fillStyle='#0284c7';ctx.fillRect(0,0,4096,36);
      ctx.fillStyle='#f5a91a';ctx.fillRect(0,282,4096,16);ctx.fillStyle='#dc2850';ctx.fillRect(0,298,4096,22);
      const jp='"Yu Gothic","Meiryo","Microsoft YaHei",sans-serif';
      ctx.fillStyle='#eaa522';ctx.beginPath();ctx.roundRect(48,55,208,208,22);ctx.fill();
      ctx.fillStyle='#fffdf3';ctx.font=`900 154px ${jp}`;ctx.textAlign='center';ctx.fillText('星',152,219);
      ctx.fillStyle='#142d3b';ctx.textAlign='left';ctx.font=`900 184px ${jp}`;ctx.fillText('星野マート',316,222);
      ctx.fillStyle='#075c8a';ctx.font='800 122px "Segoe UI",Arial,sans-serif';ctx.fillText('HOSHINO MART',1400,160);
      ctx.fillStyle='#334650';ctx.font=`700 58px ${jp}`;ctx.fillText('銀行ATM · 珈琲 · お酒',1406,240);
      ctx.fillStyle='#cf2448';ctx.beginPath();ctx.roundRect(3070,61,956,204,22);ctx.fill();
      ctx.fillStyle='#ffffff';ctx.textAlign='center';ctx.font='900 142px "Segoe UI",Arial,sans-serif';ctx.fillText('24H OPEN',3548,181);
      ctx.font=`700 52px ${jp}`;ctx.fillText('年中無休 · 桜町三丁目店',3548,243);
      ctx.strokeStyle='#243a45';ctx.lineWidth=5;ctx.strokeRect(2.5,2.5,4091,315);
      return finishStoreSignTexture(c,'便利店正面高清门头');
    }
    function createSideFasciaTexture(){
      const c=document.createElement('canvas');c.width=1536;c.height=384;const ctx=c.getContext('2d');
      ctx.fillStyle='#fffdf3';ctx.fillRect(0,0,1536,384);ctx.fillStyle='#0284c7';ctx.fillRect(0,0,1536,42);
      ctx.fillStyle='#f5a91a';ctx.fillRect(0,340,1536,18);ctx.fillStyle='#dc2850';ctx.fillRect(0,358,1536,26);
      ctx.textAlign='center';ctx.fillStyle='#142d3b';ctx.font='900 168px "Yu Gothic","Meiryo","Microsoft YaHei",sans-serif';ctx.fillText('星野マート',768,224);
      ctx.fillStyle='#075c8a';ctx.font='800 64px "Segoe UI","Microsoft YaHei",sans-serif';ctx.fillText('24H OPEN · 銀行ATM',768,312);
      ctx.strokeStyle='#243a45';ctx.lineWidth=4;ctx.strokeRect(2,2,1532,380);
      return finishStoreSignTexture(c,'便利店侧面高清门头');
    }

    function createPylonMainTexture() {
      const c = document.createElement('canvas');
      c.width = 360;
      c.height = 840;
      const ctx = c.getContext('2d');

      ctx.fillStyle = '#fffdf7';
      ctx.fillRect(0, 0, 360, 840);

      ctx.fillStyle = '#0284c7';
      ctx.fillRect(0, 0, 30, 840);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(30, 0, 12, 840);
      ctx.fillStyle = '#e11d48';
      ctx.fillRect(330, 0, 30, 840);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(318, 0, 12, 840);

      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.roundRect(80, 28, 200, 118, 24);
      ctx.fill();
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 6;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.font = '900 68px "Hiragino Sans", "Microsoft YaHei", sans-serif';
      ctx.fillText('★星野', 180, 108);

      ctx.fillStyle = '#0f172a';
      const chars = ['星', '野', 'マ', 'ー', 'ト'];
      chars.forEach((ch, i) => {
        ctx.font = '900 78px "Hiragino Sans", "Microsoft YaHei", sans-serif';
        ctx.fillText(ch, 180, 238 + i * 92);
      });

      ctx.fillStyle = '#e11d48';
      ctx.beginPath();
      ctx.roundRect(56, 680, 248, 126, 18);
      ctx.fill();
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 5;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      fillFittedText(ctx, '24時間営業', 180, 736, 220, 38, '900');
      ctx.fillStyle = '#fde047';
      fillFittedText(ctx, 'OPEN 24 HOURS', 180, 784, 220, 24, '800', 'system-ui, sans-serif');

      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 8;
      ctx.strokeRect(4, 4, 352, 832);

      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    }

    function createIllustratedPosterTexture({ bgTop, bgBot, badgeBg, badgeTxt, title, subtitle, price, motif }) {
      const c = document.createElement('canvas');
      c.width = 320;
      c.height = 440;
      const ctx = c.getContext('2d');

      const grad = ctx.createLinearGradient(0, 0, 0, 440);
      grad.addColorStop(0, bgTop);
      grad.addColorStop(1, bgBot);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 320, 440);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.beginPath();
      ctx.arc(160, 225, 108, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.save();
      if (motif === 'oden') {
        ctx.fillStyle = '#1e293b';
        ctx.beginPath(); ctx.arc(160, 245, 72, 0, Math.PI); ctx.fill();
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath(); ctx.ellipse(160, 245, 68, 22, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#fef08a'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(115, 250); ctx.lineTo(205, 185); ctx.stroke();
        ctx.fillStyle = '#fffbeb';
        ctx.beginPath(); ctx.arc(145, 228, 20, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fde047';
        ctx.beginPath(); ctx.arc(178, 206, 18, 0, Math.PI * 2); ctx.fill();
      } else if (motif === 'coffee') {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(122, 165); ctx.lineTo(198, 165); ctx.lineTo(186, 295); ctx.lineTo(134, 295);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#b45309';
        ctx.fillRect(126, 205, 68, 48);
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(116, 150, 88, 18);
      } else if (motif === 'parfait') {
        ctx.fillStyle = '#dcfce7';
        ctx.beginPath();
        ctx.moveTo(125, 190); ctx.lineTo(195, 190); ctx.lineTo(175, 295); ctx.lineTo(145, 295);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#22c55e';
        ctx.beginPath(); ctx.arc(150, 180, 28, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#f43f5e';
        ctx.beginPath(); ctx.arc(178, 172, 20, 0, Math.PI * 2); ctx.fill();
      } else if (motif === 'onigiri') {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(160, 145); ctx.lineTo(222, 275); ctx.lineTo(98, 275);
        ctx.closePath(); ctx.fill();
        ctx.lineWidth = 4; ctx.strokeStyle = '#0f172a'; ctx.stroke();
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(132, 215, 56, 60);
      } else {
        ctx.fillStyle = '#fde047';
        ctx.beginPath(); ctx.arc(160, 225, 64, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#e11d48';
        ctx.beginPath(); ctx.arc(160, 225, 42, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();

      ctx.fillStyle = badgeBg;
      ctx.beginPath();
      ctx.roundRect(22, 18, 276, 46, 10);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      fillFittedText(ctx, badgeTxt, 160, 50, 250, 25, '900');

      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 7;
      ctx.font = '900 38px "Hiragino Sans", "Microsoft YaHei", sans-serif';
      ctx.strokeText(title, 160, 112);
      ctx.fillText(title, 160, 112);

      ctx.fillStyle = 'rgba(15, 23, 42, 0.86)';
      ctx.beginPath();
      ctx.roundRect(18, 325, 284, 94, 12);
      ctx.fill();

      ctx.fillStyle = '#f8fafc';
      fillFittedText(ctx, subtitle, 160, 358, 260, 21, '700');

      ctx.fillStyle = '#fde047';
      fillFittedText(ctx, price, 160, 404, 260, 34, '900', 'system-ui, sans-serif');

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 10;
      ctx.strokeRect(5, 5, 310, 430);
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, 316, 436);

      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    }

    function createShelfRowTexture(themePalette, isNoodleAisle = false) {
      const c = document.createElement('canvas');
      c.width = 512;
      c.height = 256;
      const ctx = c.getContext('2d');

      ctx.fillStyle = '#fef8ec';
      ctx.fillRect(0, 0, 512, 256);

      const tiers = 3;
      const tierH = 256 / tiers;
      for (let t = 0; t < tiers; t++) {
        const y0 = t * tierH;
        ctx.fillStyle = '#e2ceb0';
        ctx.fillRect(0, y0, 512, 14);

        for (let i = 0; i < 12; i++) {
          const px = 8 + i * 41.5;
          const pw = 35;
          const ph = tierH - 26;
          const py = y0 + 12;
          const col = themePalette[(t * 5 + i) % themePalette.length];

          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.roundRect(px, py, pw, ph, isNoodleAisle ? 8 : 3);
          ctx.fill();

          ctx.fillStyle = '#ffffff';
          ctx.fillRect(px + 3, py + ph * 0.28, pw - 6, ph * 0.34);

          ctx.fillStyle = '#0f172a';
          ctx.fillRect(px + 7, py + ph * 0.38, pw - 14, 4);

          ctx.strokeStyle = '#1e293b';
          ctx.lineWidth = 2;
          ctx.strokeRect(px, py, pw, ph);
        }

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, y0 + tierH - 14, 512, 14);
        ctx.fillStyle = '#facc15';
        ctx.fillRect(0, y0 + tierH - 8, 512, 5);
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2;
        ctx.strokeRect(0, y0 + tierH - 14, 512, 14);
      }

      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    }

    function createGraphicSign(w, h, bg, border, title, sub) {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = border || '#0f172a';
      ctx.lineWidth = Math.max(5, h * 0.05);
      ctx.strokeRect(3, 3, w - 6, h - 6);

      const darkBg = ['#0f172a', '#1e293b', '#0284c7', '#e11d48', '#0d9488', '#451a03', '#10b981', '#7c2d12', '#b45309'].includes(bg);
      ctx.fillStyle = darkBg ? '#fffbeb' : '#0f172a';
      ctx.textAlign = 'center';

      const maxW = w * 0.86;
      fillFittedText(ctx, title, w / 2, sub ? h * 0.48 : h * 0.62, maxW, Math.floor(h * 0.35), '900');

      if (sub) {
        ctx.fillStyle = darkBg ? '#fde047' : '#e11d48';
        fillFittedText(ctx, sub, w / 2, h * 0.80, maxW, Math.floor(h * 0.21), '700', 'system-ui, sans-serif');
      }
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    }

    function createStoreFloorTex() {
      const c = document.createElement('canvas');
      c.width = 1024; c.height = 1024;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff9eb';
      ctx.fillRect(0, 0, 1024, 1024);

      const n = 16, s = 1024 / n;
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          if ((x + y) % 2 === 0) {
            ctx.fillStyle = '#fceed2';
            ctx.fillRect(x * s, y * s, s, s);
          }
        }
      }
      ctx.strokeStyle = '#e5cfa8'; ctx.lineWidth = 3;
      for (let i = 0; i <= n; i++) {
        ctx.beginPath();
        ctx.moveTo(i * s, 0); ctx.lineTo(i * s, 1024);
        ctx.moveTo(0, i * s); ctx.lineTo(1024, i * s);
        ctx.stroke();
      }

      ctx.fillStyle = '#0d9488';
      ctx.beginPath(); ctx.roundRect(185, 815, 215, 130, 12); ctx.fill();
      ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 5; ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center';
      ctx.font = '900 24px sans-serif'; ctx.fillText('いらっしゃいませ', 292, 875);
      ctx.font = '700 18px sans-serif'; ctx.fillText('WELCOME', 292, 910);

      [510, 640].forEach((qy, i) => {
        ctx.fillStyle = i === 0 ? '#e11d48' : '#f59e0b';
        ctx.beginPath(); ctx.roundRect(105, qy, 145, 46, 8); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 18px sans-serif';
        ctx.fillText('レジ待機位置', 177, qy + 30);
      });

      ctx.fillStyle = '#0284c7';
      ctx.beginPath(); ctx.roundRect(450, 860, 420, 42, 8); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 20px sans-serif';
      ctx.fillText('← レジ・おでん  |  お弁当・飲料 →', 660, 888);

      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    }

    // =========================================================
    // 5. DIORAMA PLINTH, OPTIMIZED WET MIRROR ROAD & WINDOW LIGHT SPILL
    // =========================================================
    const diorama = new THREE.Group();
    scene.add(diorama);

    const woodPlinth = box(38.6, 0.82, 34.6, 0x2c1d14, false);
    woodPlinth.position.set(0, -0.95, -6.2);
    diorama.add(woodPlinth);

    const concreteRim = box(38.0, 0.54, 34.0, 0x1e293b, false);
    concreteRim.position.set(0, -0.30, -6.2);
    diorama.add(concreteRim);

    const brassPlaque = makeFrontBackBox(
      5.4, 0.52, 0.08,
      createGraphicSign(640, 96, '#f59e0b', '#0f172a', '桜町三丁目 • 星野マート＆桜町公園 1:35', 'ANIME NEIGHBORHOOD MINIATURE DIORAMA'),
      0x1e293b
    );
    brassPlaque.position.set(0, -0.94, 11.14);
    diorama.add(brassPlaque);

    const roadMirror = new Reflector(new THREE.PlaneGeometry(37.6, 33.6), {
      clipBias: 0.003,
      textureWidth: 512,
      textureHeight: 512,
      color: 0x8ea4c8
    });
    roadMirror.rotation.x = -Math.PI / 2;
    roadMirror.position.set(0, 0.0, -6.2);
    diorama.add(roadMirror);

    const wetRoadTex = createWetStreetTexture();
    wetRoadTex.wrapS = THREE.RepeatWrapping;
    wetRoadTex.wrapT = THREE.RepeatWrapping;
    wetRoadTex.repeat.set(2, 2);
    const wetRoadOverlay = new THREE.Mesh(
      new THREE.PlaneGeometry(37.6, 33.6),
      new THREE.MeshStandardMaterial({
        map: wetRoadTex,
        transparent: true,
        opacity: 0.45,
        roughness: 0.3,
        depthWrite: false
      })
    );
    wetRoadOverlay.rotation.x = -Math.PI / 2;
    wetRoadOverlay.position.set(0, 0.015, -6.2);
    wetRoadOverlay.receiveShadow = true;
    diorama.add(wetRoadOverlay);

    // Main Block Sidewalk Platform (Left & Center: Konbini + Sakura Park + West/North Houses)
    const sidewalkPlatform = box(27.8, 0.13, 25.0, 0x334155, false);
    sidewalkPlatform.position.set(-4.8, 0.095, -10.3);
    sidewalkPlatform.material = sidewalkPlatform.material.clone();
    sidewalkPlatform.material.transparent = true;
    sidewalkPlatform.material.opacity = 0.86;
    diorama.add(sidewalkPlatform);

    // East Block Sidewalk Platform (Across the Side Street X = +9.1 to +12.3)
    const eastBlockPlatform = box(6.3, 0.13, 25.0, 0x334155, false);
    eastBlockPlatform.position.set(15.55, 0.095, -10.3);
    eastBlockPlatform.material = eastBlockPlatform.material.clone();
    eastBlockPlatform.material.transparent = true;
    eastBlockPlatform.material.opacity = 0.86;
    diorama.add(eastBlockPlatform);

    // South Roadside Sidewalk Strip (Front Edge of Diorama Z = +9.4 to +10.6)
    const southSidewalk = box(37.4, 0.13, 1.3, 0x334155, false);
    southSidewalk.position.set(0, 0.095, 10.05);
    diorama.add(southSidewalk);
    const southCurb = box(37.4, 0.16, 0.20, 0x64748b, false);
    southCurb.position.set(0, 0.095, 9.32);
    diorama.add(southCurb);

    const frontLightSpillTex = createWindowLightSpillTexture();
    const frontLightSpillMat = new THREE.MeshBasicMaterial({
      map: frontLightSpillTex,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const sidewalkSpillMesh = new THREE.Mesh(new THREE.PlaneGeometry(14.6, 5.4), frontLightSpillMat);
    sidewalkSpillMesh.rotation.x = -Math.PI / 2;
    sidewalkSpillMesh.position.set(-0.3, 0.168, 2.75);
    diorama.add(sidewalkSpillMesh);

    const roadSpillMesh = new THREE.Mesh(new THREE.PlaneGeometry(14.6, 4.2), frontLightSpillMat);
    roadSpillMesh.rotation.x = -Math.PI / 2;
    roadSpillMesh.position.set(-0.3, 0.026, 4.3);
    diorama.add(roadSpillMesh);

    const sideSpillMat = new THREE.MeshBasicMaterial({
      map: createSideWindowSpillTexture(),
      transparent: true,
      opacity: 0.82,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const sideSpillMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 3.6), sideSpillMat);
    sideSpillMesh.rotation.x = -Math.PI / 2;
    sideSpillMesh.position.set(7.45, 0.168, -1.55);
    diorama.add(sideSpillMesh);

    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xffe082,
      transparent: true,
      opacity: 0.065,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const volumetricBeams = [];
    [-3.2, -1.2, 0.75, 2.65, 4.55].forEach(bx => {
      const beamGeo = new THREE.PlaneGeometry(1.65, 3.4);
      const beam = new THREE.Mesh(beamGeo, beamMat.clone());
      beam.rotation.x = -Math.PI / 3.1;
      beam.position.set(bx, 1.05, 1.35);
      beam.layers.set(1);
      diorama.add(beam);
      volumetricBeams.push(beam);
    });

    const curbBeam = box(27.8, 0.16, 0.22, 0x64748b, false);
    curbBeam.position.set(-4.8, 0.095, 2.22);
    diorama.add(curbBeam);

    const eastCurbBeam = box(6.3, 0.16, 0.22, 0x64748b, false);
    eastCurbBeam.position.set(15.55, 0.095, 2.22);
    diorama.add(eastCurbBeam);

    const tactileBeam = box(26.8, 0.025, 0.30, 0xeab308, false);
    tactileBeam.position.set(-4.8, 0.175, 1.82);
    diorama.add(tactileBeam);

    [-14.5, -4.5, 2.2, 14.2].forEach(gx => {
      const grate = boxFast(0.75, 0.02, 0.42, 0x0f172a, false);
      grate.position.set(gx, 0.028, 2.55);
      diorama.add(grate);
    });

    // Road paint is shaded in the asphalt fragment itself: no stacked faces or depth bias.
    wetRoadOverlay.name='湿路与同表面交通标线';
    wetRoadOverlay.material.onBeforeCompile=shader=>{
      shader.uniforms.uRoadPaintWhite={value:new THREE.Color(0xe2e8f0)};
      shader.uniforms.uRoadPaintGray={value:new THREE.Color(0x94a3b8)};
      shader.vertexShader='varying vec2 vRoadPaintWorld;\n'+shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvRoadPaintWorld=(modelMatrix*vec4(transformed,1.)).xz;');
      shader.fragmentShader=`varying vec2 vRoadPaintWorld;
        uniform vec3 uRoadPaintWhite;uniform vec3 uRoadPaintGray;
        float roadPaintBox(vec2 p,vec2 center,vec2 halfSize){
          vec2 aa=max(fwidth(p),vec2(.002));
          vec2 coverage=1.-smoothstep(halfSize-aa,halfSize+aa,abs(p-center));
          return coverage.x*coverage.y;
        }
        float roadPaintBand(float p,float origin,float period,float halfWidth){
          float distanceToCenter=abs(mod(p-origin+period*.5,period)-period*.5);
          float aa=max(fwidth(p),.002);
          return 1.-smoothstep(halfWidth-aa,halfWidth+aa,distanceToCenter);
        }
      `+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        vec2 roadP=vRoadPaintWorld;
        float crossingMain=roadPaintBox(roadP,vec2(6.2,5.73),vec2(1.175,3.06))*roadPaintBand(roadP.y,2.85,.72,.18);
        float crossingSide=roadPaintBox(roadP,vec2(10.64,1.15),vec2(1.4,.825))*roadPaintBand(roadP.x,9.4,.62,.16);
        float stopLine=roadPaintBox(roadP,vec2(3.6,7.35),vec2(.13,1.5));
        float roadWhite=max(max(crossingMain,crossingSide),stopLine);
        float dashRange=max(roadPaintBox(roadP,vec2(-6.7,5.75),vec2(11.225,.07)),roadPaintBox(roadP,vec2(14.3,5.75),vec2(2.225,.07)));
        float roadGray=dashRange*roadPaintBand(roadP.x,-17.2,3.,.725);
        float roadPaint=max(roadWhite,roadGray);
        diffuseColor.rgb=mix(diffuseColor.rgb,uRoadPaintGray,roadGray);
        diffuseColor.rgb=mix(diffuseColor.rgb,uRoadPaintWhite,roadWhite);
        diffuseColor.a=mix(diffuseColor.a,1.,roadPaint);
      `);
      shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,.82,roadPaint);');
    };
    // Snow lies over the asphalt and paint; light pools and shafts remain above that layer.
    for(const light of [sidewalkSpillMesh,roadSpillMesh,sideSpillMesh])light.renderOrder=2;
    for(const beam of volumetricBeams)beam.renderOrder=3;

    function createGuardrail(x, z) {
      const gr = new THREE.Group();
      gr.position.set(x, 0.16, z);
      const p1 = cylFast(0.035, 0.035, 0.72, 8, 0xf8fafc, false);
      p1.position.set(-0.65, 0.36, 0);
      const p2 = cylFast(0.035, 0.035, 0.72, 8, 0xf8fafc, false);
      p2.position.set(0.65, 0.36, 0);
      const topBar = box(1.38, 0.06, 0.06, 0xf8fafc, false);
      topBar.position.set(0, 0.70, 0);
      const midBar = boxFast(1.30, 0.04, 0.04, 0xf8fafc, false);
      midBar.position.set(0, 0.38, 0);
      const band1 = boxFast(0.08, 0.08, 0.08, 0x10b981, false);
      band1.position.set(-0.65, 0.56, 0);
      const band2 = band1.clone();
      band2.position.x = 0.65;
      gr.add(p1, p2, topBar, midBar, band1, band2);
      diorama.add(gr);
    }
    [-16.2, -14.4, -12.6, -7.4, -5.6, 8.1, 13.5, 15.3, 17.1].forEach(gx => createGuardrail(gx, 2.08));

    // =========================================================
    // 6. THE KONBINI ARCHITECTURE, POSTERS & GPU DOWNWARD GLASS RAINDROPS
    // =========================================================
    const konbini = new THREE.Group();
    diorama.add(konbini);

    const storeFloor = new THREE.Mesh(
      new THREE.BoxGeometry(11.0, 0.08, 5.8),
      new THREE.MeshBasicMaterial({ map: createStoreFloorTex() })
    );
    addInkOutline(storeFloor, true);
    storeFloor.position.set(0, 0.20, -2.8);
    konbini.add(storeFloor);

    const backWall = box(11.2, 3.5, 0.22, 0xfff8eb, true);
    backWall.position.set(0, 1.95, -5.7);
    konbini.add(backWall);

    const leftWall = box(0.22, 3.5, 6.0, 0xfff8eb, true);
    leftWall.position.set(-5.5, 1.95, -2.8);
    konbini.add(leftWall);

    const rightWallBack = box(0.22, 3.5, 2.6, 0xfff8eb, true);
    rightWallBack.position.set(5.5, 1.95, -4.5);
    konbini.add(rightWallBack);

    [[-5.5, 0.1], [-4.3, 0.1], [-2.1, 0.1], [5.5, 0.1], [5.5, -3.2]].forEach(([px, pz]) => {
      const col = box(0.24, 3.5, 0.24, 0x1e293b, false);
      col.position.set(px, 1.95, pz);
      konbini.add(col);
    });

    const kickRight = box(7.36, 0.40, 0.18, 0x1e293b, false);
    kickRight.position.set(1.7, 0.38, 0.1);
    const kickLeft = box(0.96, 0.40, 0.18, 0x1e293b, false);
    kickLeft.position.set(-4.9, 0.38, 0.1);
    const kickSide = box(0.18, 0.40, 3.26, 0x1e293b, false);
    kickSide.position.set(5.5, 0.38, -1.55);
    konbini.add(kickRight, kickLeft, kickSide);

    [-0.2, 1.7, 3.6].forEach(mx => {
      const mullion = box(0.08, 2.85, 0.16, 0x0f172a, false);
      mullion.position.set(mx, 1.96, 0.1);
      konbini.add(mullion);
    });
    const sideMullion = box(0.16, 2.85, 0.08, 0x0f172a, false);
    sideMullion.position.set(5.5, 1.96, -1.55);
    konbini.add(sideMullion);

    function placePoster(w, h, x, y, z, rotY, posterSpec, isInterior = false) {
      const tex = createIllustratedPosterTexture(posterSpec);
      const pMat = new THREE.MeshBasicMaterial({ map: tex });
      const bMat = makeCelMat(0x0f172a, isInterior);
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, 0.03),
        [bMat, bMat, bMat, bMat, pMat, pMat]
      );
      addInkOutline(mesh, isInterior);
      mesh.position.set(x, y, z);
      mesh.rotation.y = rotY;
      konbini.add(mesh);
      return mesh;
    }

    placePoster(0.95, 1.32, 5.64, 2.15, -4.05, Math.PI / 2, {
      bgTop: '#be123c', bgBot: '#f97316', badgeBg: '#facc15', badgeTxt: '冬季限定 • 深夜割',
      title: '熱々おでん', subtitle: 'こだわりの黄金出汁', price: '全品 70円~', motif: 'oden'
    });
    placePoster(0.95, 1.32, 5.64, 2.15, -5.15, Math.PI / 2, {
      bgTop: '#0369a1', bgBot: '#1d4ed8', badgeBg: '#10b981', badgeTxt: 'HOSHINO CAFE',
      title: '挽きたて珈琲', subtitle: 'アラビカ豆 100%使用', price: '¥110 (税込)', motif: 'coffee'
    });

    placePoster(0.76, 1.08, -4.9, 1.95, 0.22, 0, {
      bgTop: '#db2777', bgBot: '#f43f5e', badgeBg: '#fde047', badgeTxt: '春いちごフェア',
      title: '濃厚パフェ', subtitle: '宇治抹茶＆完熟苺', price: '¥298', motif: 'parfait'
    });
    placePoster(1.05, 1.42, -5.64, 2.10, -2.2, -Math.PI / 2, {
      bgTop: '#0f766e', bgBot: '#0284c7', badgeBg: '#f59e0b', badgeTxt: '朝ごはんセール',
      title: '手巻おにぎり', subtitle: '有明海産パリパリ海苔', price: '100円均一', motif: 'onigiri'
    });
    placePoster(1.05, 1.42, -5.64, 2.10, -3.8, -Math.PI / 2, {
      bgTop: '#4c1d95', bgBot: '#7c3aed', badgeBg: '#ec4899', badgeTxt: '夜食ラーメン',
      title: '濃厚豚骨麺', subtitle: '星野マート限定コラボ', price: '¥238', motif: 'star'
    });

    placePoster(0.62, 0.86, -1.15, 2.68, 0.16, 0, {
      bgTop: '#e11d48', bgBot: '#fb7185', badgeBg: '#0f172a', badgeTxt: 'NEW 新発売',
      title: '特製肉まん', subtitle: 'ジューシー豚肉100%', price: '¥140', motif: 'oden'
    }, true);
    placePoster(0.62, 0.86, 0.75, 2.68, 0.16, 0, {
      bgTop: '#059669', bgBot: '#34d399', badgeBg: '#0f172a', badgeTxt: 'SWEETS',
      title: '抹茶パフェ', subtitle: '京都宇治抹茶使用', price: '¥320', motif: 'parfait'
    }, true);
    placePoster(0.62, 0.86, 4.55, 2.68, 0.16, 0, {
      bgTop: '#d97706', bgBot: '#fbbf24', badgeBg: '#78350f', badgeTxt: 'CAFE LATTE',
      title: 'カフェラテ', subtitle: '北海道産生乳使用', price: '¥180', motif: 'coffee'
    }, true);

    placePoster(0.88, 1.18, -5.36, 2.45, -1.35, Math.PI / 2, {
      bgTop: '#0284c7', bgBot: '#38bdf8', badgeBg: '#e11d48', badgeTxt: 'ポイント5倍',
      title: '星野Pay', subtitle: 'スマホ決済キャンペーン', price: '最大20%還元', motif: 'star'
    }, true);
    placePoster(0.88, 1.18, -5.36, 2.45, -2.75, Math.PI / 2, {
      bgTop: '#ea580c', bgBot: '#f59e0b', badgeBg: '#0f172a', badgeTxt: '揚げたて',
      title: '星野チキン', subtitle: 'サクサク特製スパイス', price: '¥198', motif: 'oden'
    }, true);
    placePoster(0.95, 0.78, 4.65, 2.75, -5.54, 0, {
      bgTop: '#1e293b', bgBot: '#0f172a', badgeBg: '#10b981', badgeTxt: '24時間対応',
      title: '銀行ATM・宅配', subtitle: 'マルチコピー • チケット発券', price: '手数料 0円~', motif: 'star'
    }, true);

    const rainGlassUniforms = {
      uTime: { value: 0.0 },
      uActive: { value: 1.0 }
    };
    const glassMat = new THREE.ShaderMaterial({
      uniforms: rainGlassUniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uActive;
        varying vec2 vUv;

        float hash(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }

        void main() {
          if (uActive < 0.5) discard;
          vec2 grid = vec2(32.0, 1.0);
          vec2 id = floor(vUv * grid);
          float h = hash(id);
          float spd = 0.22 + h * 0.28;
          float yPhase = fract(h + vUv.y + uTime * spd);
          float xCenter = 0.5 + 0.16 * sin(vUv.y * 10.0 + h * 6.28 + uTime * 1.4);
          float dx = abs(fract(vUv.x * grid.x) - xCenter);

          float trail = smoothstep(0.13, 0.01, dx) * smoothstep(0.0, 0.32, yPhase) * smoothstep(0.38, 0.32, yPhase);
          float dy = (yPhase - 0.04) * 14.0;
          float bead = smoothstep(0.22, 0.02, length(vec2(dx, dy)));

          float alpha = trail * 0.28 + bead * 0.65;
          vec3 col = mix(vec3(0.88, 0.96, 1.0), vec3(1.0, 0.96, 0.84), bead);
          gl_FragColor = vec4(col, alpha);
        }
      `
    });

    const frontGlass = new THREE.Mesh(new THREE.PlaneGeometry(7.3, 2.65), glassMat);
    frontGlass.position.set(1.7, 1.94, 0.20);
    frontGlass.layers.set(1);
    const sideGlass = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.65), glassMat);
    sideGlass.rotation.y = Math.PI / 2;
    sideGlass.position.set(5.60, 1.94, -1.55);
    sideGlass.layers.set(1);
    konbini.add(frontGlass, sideGlass);

    function makeDoorLeaf() {
      const g = new THREE.Group();
      const frame = box(0.98, 2.68, 0.06, 0x0f172a, false);
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 2.52), glassMat);
      pane.position.z = 0.04;
      pane.layers.set(1);
      const decal = boxFast(0.86, 0.10, 0.08, 0x0284c7, false);
      decal.position.y = 0.06;
      g.add(frame, pane, decal);
      return g;
    }
    const doorLeft = makeDoorLeaf();
    doorLeft.position.set(-3.7, 1.54, 0.12);
    const doorRight = makeDoorLeaf();
    doorRight.position.set(-2.7, 1.54, 0.12);
    konbini.add(doorLeft, doorRight);

    let doorOpen = false;
    function setDoorOpenRatio(ratio) {
      doorLeft.position.x = -3.7 - 0.85 * ratio;
      doorRight.position.x = -2.7 + 0.85 * ratio;
      if (volumetricBeams[0]) {
        volumetricBeams[0].material.opacity = 0.065 + 0.075 * ratio;
      }
      doorOpen = ratio > 0.5;
      document.getElementById('toggle-door').classList.toggle('active', doorOpen);
      document.getElementById('toggle-door').textContent=doorOpen?'🚪 关闭自动门':'🚪 打开自动门';
    }

    function toggleDoor(force = null) {
      doorOpen = force !== null ? force : !doorOpen;
      gsap.to(doorLeft.position, { overwrite: true, x: doorOpen ? -4.55 : -3.7, duration: 0.65, ease: 'power2.inOut' });
      gsap.to(doorRight.position, { overwrite: true, x: doorOpen ? -1.85 : -2.7, duration: 0.65, ease: 'power2.inOut' });
      if (volumetricBeams[0]) {
        gsap.to(volumetricBeams[0].material, { opacity: doorOpen ? 0.14 : 0.065, duration: 0.65 });
      }
      document.getElementById('toggle-door').classList.toggle('active', doorOpen);
      document.getElementById('toggle-door').textContent=doorOpen?'🚪 关闭自动门':'🚪 打开自动门';
      if (doorOpen) playKonbiniChime();
    }

    const roofGroup = new THREE.Group();
    konbini.add(roofGroup);

    const roofSlab = box(11.6, 0.26, 6.4, 0x334155, false);
    roofSlab.position.set(0, 3.68, -2.75);
    const parapet = box(11.8, 0.34, 6.6, 0x1e293b, false);
    parapet.position.set(0, 3.98, -2.75);
    roofGroup.add(roofSlab, parapet);

    const roofRainSheen = new THREE.Mesh(
      new THREE.PlaneGeometry(11.2, 6.0),
      glassMat
    );
    roofRainSheen.rotation.x = -Math.PI / 2;
    roofRainSheen.position.set(0, 3.825, -2.75);
    roofRainSheen.layers.set(1);
    roofGroup.add(roofRainSheen);

    [-3.4, -1.2].forEach(hx => {
      const unit = box(1.65, 0.72, 1.15, 0x94a3b8, false);
      unit.position.set(hx, 4.38, -4.2);
      const fanHousing = cyl(0.36, 0.36, 0.76, 12, 0x1e293b, false);
      fanHousing.position.set(hx - 0.25, 4.38, -4.2);
      const pipe = boxFast(0.14, 0.14, 1.8, 0x64748b, false);
      pipe.position.set(hx + 0.5, 4.08, -3.2);
      roofGroup.add(unit, fanHousing, pipe);
    });

    const fasciaTex = createFasciaTexture();
    const frontSign = makeFrontBackBox(11.9, 0.92, 0.28, fasciaTex, 0x1e293b);
    frontSign.position.set(0, 3.44, 0.48);

    const sideFasciaTex = createSideFasciaTexture();
    const sideFaceMat = new THREE.MeshBasicMaterial({ map: sideFasciaTex });
    const darkSideMat = makeCelMat(0x1e293b);
    const sideSign = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.92, 3.8),
      [sideFaceMat, sideFaceMat, darkSideMat, darkSideMat, darkSideMat, darkSideMat]
    );
    addInkOutline(sideSign);
    sideSign.position.set(5.82, 3.44, -1.3);

    const soffitStrip = new THREE.Mesh(
      new THREE.BoxGeometry(11.4, 0.05, 0.44),
      new THREE.MeshBasicMaterial({ color: 0xfff3c4 })
    );
    soffitStrip.position.set(0, 2.96, 0.35);
    roofGroup.add(frontSign, sideSign, soffitStrip);

    // =========================================================
    // 7. HIGH-CRAFT KONBINI INTERIOR
    // =========================================================
    const interior = new THREE.Group();
    konbini.add(interior);

    const cashier = new THREE.Group();
    cashier.position.set(-4.1, 0.25, -2.5);
    interior.add(cashier);

    const cBody = box(1.04, 0.84, 3.2, 0xfbbf24, true);
    cBody.position.set(0, 0.42, 0);
    const cTop = box(1.16, 0.08, 3.32, 0xffffff, true);
    cTop.position.set(0, 0.88, 0);
    cashier.add(cBody, cTop);

    const impulseTex = createShelfRowTexture(['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#ec4899']);
    const impulsePanel = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.62, 1.45),
      new THREE.MeshBasicMaterial({ map: impulseTex })
    );
    addInkOutline(impulsePanel, true);
    impulsePanel.position.set(0.57, 0.44, 0.68);
    cashier.add(impulsePanel);

    [0.52, 1.18].forEach(rz => {
      const regBase = boxFast(0.42, 0.12, 0.42, 0x1e293b, true);
      regBase.position.set(0.05, 0.99, rz);
      const regScreen = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.28, 0.36),
        new THREE.MeshBasicMaterial({ map: createGraphicSign(160, 110, '#0f172a', '#38bdf8', '¥540', 'PayPay OK') })
      );
      addInkOutline(regScreen, true);
      regScreen.position.set(0.05, 1.20, rz);
      cashier.add(regBase, regScreen);
    });

    const odenOuter = box(0.58, 0.16, 0.78, 0x94a3b8, true);
    odenOuter.position.set(0.08, 1.01, -0.35);
    const odenBroth = boxFast(0.50, 0.04, 0.70, 0xd97706, true);
    odenBroth.position.set(0.08, 1.115, -0.35);
    cashier.add(odenOuter, odenBroth);
    for (let ox = -0.12; ox <= 0.12; ox += 0.24) {
      for (let oz = -0.22; oz <= 0.22; oz += 0.22) {
        const item = cylFast(0.055, 0.055, 0.06, 8, (ox + oz > 0) ? 0xfef3c7 : 0xf59e0b, true);
        item.position.set(0.08 + ox, 1.165, -0.35 + oz);
        cashier.add(item);
      }
    }

    const bunCase = box(0.52, 0.58, 0.52, 0xfef08a, true);
    bunCase.position.set(0.08, 1.22, -1.12);
    const bunHeader = makeFrontBackBox(0.56, 0.14, 0.56, createGraphicSign(256, 64, '#e11d48', '#0f172a', '特製 中華まん', null), 0xe11d48, true);
    bunHeader.position.set(0.08, 1.59, -1.12);
    cashier.add(bunCase, bunHeader);

    const coffeeBar = new THREE.Group();
    coffeeBar.position.set(-4.85, 0.25, -4.7);
    interior.add(coffeeBar);
    const cfCabinet = box(0.88, 0.88, 1.6, 0x78350f, true);
    cfCabinet.position.y = 0.44;
    const cfMac1 = box(0.56, 0.70, 0.46, 0x1e293b, true);
    cfMac1.position.set(0.05, 1.24, -0.35);
    const cfMac2 = box(0.56, 0.70, 0.46, 0xe11d48, true);
    cfMac2.position.set(0.05, 1.24, 0.22);
    const cupStack = cylFast(0.065, 0.055, 0.36, 10, 0xffffff, true);
    cupStack.position.set(0.1, 1.07, 0.62);
    coffeeBar.add(cfCabinet, cfMac1, cfMac2, cupStack);

    const bentoCase = new THREE.Group();
    bentoCase.position.set(-1.5, 0.25, -5.12);
    interior.add(bentoCase);

    const bcFrame = box(3.8, 2.25, 0.76, 0x1e293b, true);
    bcFrame.position.set(0, 1.125, -0.06);
    const bcGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(3.6, 1.95),
      new THREE.MeshBasicMaterial({ color: 0xfffbeb })
    );
    bcGlow.position.set(0, 1.12, 0.33);
    const bcHeader = makeFrontBackBox(3.84, 0.32, 0.82, createGraphicSign(512, 96, '#10b981', '#0f172a', 'お弁当 • おにぎり • サンド', 'FRESH BENTO & ONIGIRI'), 0x10b981, true);
    bcHeader.position.set(0, 2.42, 0);
    bentoCase.add(bcFrame, bcGlow, bcHeader);

    const onigiriGeo = new THREE.ConeGeometry(0.095, 0.14, 3);
    for (let t = 0; t < 4; t++) {
      const sy = 0.38 + t * 0.44;
      const shelf = boxFast(3.66, 0.045, 0.70, 0xffffff, true);
      shelf.position.set(0, sy, 0.04);
      bentoCase.add(shelf);

      if (t === 2) {
        for (let ox = -1.55; ox <= 1.55; ox += 0.28) {
          const rice = new THREE.Mesh(onigiriGeo, makeCelMat(0xffffff, true));
          rice.layers.set(1);
          rice.position.set(ox, sy + 0.10, 0.14);
          const nori = boxFast(0.075, 0.075, 0.10, 0x0f172a, true);
          nori.position.set(ox, sy + 0.07, 0.16);
          bentoCase.add(rice, nori);
        }
      } else {
        const bCols = [0xf97316, 0xef4444, 0xfacc15, 0x22c55e, 0x38bdf8];
        for (let bx = -1.5; bx <= 1.5; bx += 0.50) {
          const tray = boxFast(0.36, 0.08, 0.42, 0x1e293b, true);
          tray.position.set(bx, sy + 0.07, 0.12);
          const lid = boxFast(0.32, 0.04, 0.38, bCols[Math.abs(Math.round(bx * 10 + t)) % 5], true);
          lid.position.set(bx, sy + 0.135, 0.12);
          bentoCase.add(tray, lid);
        }
      }
    }

    const drinkCooler = new THREE.Group();
    drinkCooler.position.set(2.45, 0.25, -5.12);
    interior.add(drinkCooler);

    const dcFrame = box(3.6, 2.25, 0.76, 0x0284c7, true);
    dcFrame.position.set(0, 1.125, -0.06);
    const drinkShelfTex = createShelfRowTexture(['#22c55e', '#0ea5e9', '#ef4444', '#f59e0b', '#facc15', '#a855f7'], true);
    const dcDisplay = new THREE.Mesh(
      new THREE.PlaneGeometry(3.42, 1.98),
      new THREE.MeshBasicMaterial({ map: drinkShelfTex })
    );
    dcDisplay.position.set(0, 1.12, 0.34);
    const dcHeader = makeFrontBackBox(3.64, 0.32, 0.82, createGraphicSign(512, 96, '#0284c7', '#0f172a', '冷たいお飲み物 • お酒 • ビール', 'COLD DRINKS & BEER'), 0x0284c7, true);
    dcHeader.position.set(0, 2.42, 0);
    drinkCooler.add(dcFrame, dcDisplay, dcHeader);

    const aisles = [
      { x: -1.4, title: '1 スナック・菓子', col: '#f59e0b', pal: ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#ec4899'] },
      { x:  0.8, title: '2 カップ麺・パン', col: '#e11d48', pal: ['#ef4444', '#facc15', '#f97316', '#22c55e', '#0284c7'] },
      { x:  3.0, title: '3 日用品・雑貨',   col: '#0284c7', pal: ['#38bdf8', '#a855f7', '#2dd4bf', '#f43f5e', '#fbbf24'] }
    ];

    aisles.forEach((a, idx) => {
      const g = new THREE.Group();
      g.position.set(a.x, 0.25, -2.35);
      interior.add(g);

      const base = box(0.84, 0.14, 2.58, 0x1e293b, true);
      base.position.y = 0.07;

      const rowTex = createShelfRowTexture(a.pal, idx === 1);
      const sideMat = new THREE.MeshBasicMaterial({ map: rowTex });
      const capMat = makeCelMat(0xfffbeb, true);
      const merchBody = new THREE.Mesh(
        new THREE.BoxGeometry(0.76, 1.24, 2.48),
        [sideMat, sideMat, capMat, capMat, capMat, capMat]
      );
      addInkOutline(merchBody, true);
      merchBody.position.y = 0.77;

      for (let k = 0; k < 6; k++) {
        const kz = -0.95 + k * 0.38;
        const cHex = parseInt(a.pal[k % a.pal.length].replace('#', '0x'));
        const topItem = boxFast(0.28, 0.20, 0.26, cHex, true);
        topItem.position.set(k % 2 === 0 ? -0.16 : 0.16, 1.50, kz);
        g.add(topItem);
      }

      const signTex = createGraphicSign(384, 80, a.col, '#0f172a', a.title, null);
      const sFaceMat = new THREE.MeshBasicMaterial({ map: signTex });
      const sign = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.24, 1.35),
        [sFaceMat, sFaceMat, capMat, capMat, capMat, capMat]
      );
      addInkOutline(sign, true);
      sign.position.set(0, 1.78, 0);

      g.add(base, merchBody, sign);
    });

    const iceChest = new THREE.Group();
    iceChest.position.set(-0.4, 0.25, -0.45);
    interior.add(iceChest);

    const icBody = box(1.62, 0.58, 0.72, 0xffffff, true);
    icBody.position.y = 0.29;
    const icRim = box(1.66, 0.12, 0.76, 0x0284c7, true);
    icRim.position.y = 0.65;
    const icWell = boxFast(1.50, 0.04, 0.60, 0xe0f2fe, true);
    icWell.position.y = 0.74;
    iceChest.add(icBody, icRim, icWell);

    const tubColors = [0xf43f5e, 0x22c55e, 0xfacc15, 0xa855f7, 0x38bdf8, 0xf97316];
    for (let ix = 0; ix < 4; ix++) {
      for (let iz = 0; iz < 2; iz++) {
        const tub = boxFast(0.30, 0.05, 0.22, tubColors[(ix + iz * 2) % 6], true);
        tub.position.set(-0.51 + ix * 0.34, 0.795, -0.13 + iz * 0.26);
        iceChest.add(tub);
      }
    }

    const icGlassLid = new THREE.Mesh(
      new THREE.PlaneGeometry(1.48, 0.58),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28 })
    );
    icGlassLid.rotation.x = -Math.PI / 2;
    icGlassLid.position.y = 0.835;
    iceChest.add(icGlassLid);

    const magStand = new THREE.Group();
    magStand.position.set(2.85, 0.25, -0.35);
    interior.add(magStand);

    const msBase = box(3.45, 0.92, 0.46, 0xe2e8f0, true);
    msBase.position.y = 0.46;
    magStand.add(msBase);
    for (let m = 0; m < 9; m++) {
      const book = boxFast(0.30, 0.36, 0.05, tubColors[m % 6], true);
      book.position.set(-1.40 + m * 0.35, 0.78, 0.14);
      book.rotation.x = -0.22;
      magStand.add(book);
    }

    const atmGroup = new THREE.Group();
    atmGroup.position.set(4.8, 0.25, -3.9);
    interior.add(atmGroup);
    const atmBody = box(0.74, 1.52, 0.74, 0xf8fafc, true);
    atmBody.position.y = 0.76;
    const atmTop = box(0.78, 0.26, 0.78, 0x10b981, true);
    atmTop.position.y = 1.66;
    atmGroup.add(atmBody, atmTop);

    const staffDoor = box(1.04, 2.12, 0.08, 0x94a3b8, true);
    staffDoor.position.set(-4.3, 1.31, -5.52);
    const exitSign = boxFast(0.54, 0.20, 0.08, 0x10b981, true);
    exitSign.position.set(-4.3, 2.55, -5.52);
    interior.add(staffDoor, exitSign);

    [
      [-4.1, -1.8, '#e11d48', 'お会計 REGISTER'],
      [-1.2, -4.2, '#10b981', 'お弁当 • おにぎり'],
      [ 2.4, -4.2, '#0284c7', 'お飲み物 • お酒']
    ].forEach(([lx, lz, bg, title]) => {
      const lb = makeFrontBackBox(1.48, 0.32, 0.10, createGraphicSign(384, 96, bg, '#0f172a', title, null), 0x1e293b, true);
      lb.position.set(lx, 3.04, lz);
      interior.add(lb);
    });

    // =========================================================
    // 8. DETAILED VENDING MACHINES & STREET-CORNER PYLON BILLBOARD
    // =========================================================
    function createDetailedVendingMachine({ x, z, bodyColor, trimColor, headerBg, brandTitle, brandSub, canColors }) {
      const vm = new THREE.Group();
      vm.position.set(x, 0.17, z);

      [-0.44, 0.44].forEach(fx => {
        [-0.28, 0.28].forEach(fz => {
          const foot = boxFast(0.14, 0.08, 0.14, 0x0f172a, false);
          foot.position.set(fx, 0.04, fz);
          vm.add(foot);
        });
      });

      const mainShell = box(1.14, 2.12, 0.68, bodyColor, false);
      mainShell.position.set(0, 1.14, -0.04);
      vm.add(mainShell);

      const leftPillar = box(0.08, 2.12, 0.12, trimColor, false);
      leftPillar.position.set(-0.53, 1.14, 0.32);
      const rightPillar = box(0.30, 1.48, 0.12, trimColor, false);
      rightPillar.position.set(0.42, 1.12, 0.32);
      const bottomApron = box(1.14, 0.42, 0.12, trimColor, false);
      bottomApron.position.set(0, 0.29, 0.32);
      vm.add(leftPillar, rightPillar, bottomApron);

      const topSignTex = createGraphicSign(384, 96, headerBg, '#0f172a', brandTitle, brandSub);
      const topSignBox = makeFrontBackBox(1.10, 0.32, 0.14, topSignTex, trimColor, false);
      topSignBox.position.set(0, 2.02, 0.33);
      vm.add(topSignBox);

      const cavityBack = new THREE.Mesh(
        new THREE.PlaneGeometry(0.74, 1.04),
        new THREE.MeshBasicMaterial({ color: 0xfffef5 })
      );
      cavityBack.position.set(-0.11, 1.32, 0.31);
      vm.add(cavityBack);

      const canGeo = new THREE.CylinderGeometry(0.036, 0.036, 0.15, 8);
      const tallBottleGeo = new THREE.CylinderGeometry(0.034, 0.038, 0.20, 8);

      for (let tier = 0; tier < 3; tier++) {
        const sy = 0.88 + tier * 0.33;
        const shelf = boxFast(0.72, 0.025, 0.12, 0xcbd5e1, true);
        shelf.position.set(-0.11, sy, 0.33);
        const barCol = tier === 0 ? 0xef4444 : 0x0284c7;
        const priceBar = new THREE.Mesh(
          new THREE.BoxGeometry(0.72, 0.035, 0.02),
          new THREE.MeshBasicMaterial({ color: barCol })
        );
        priceBar.layers.set(1);
        priceBar.position.set(-0.11, sy - 0.025, 0.395);
        vm.add(shelf, priceBar);

        for (let c = 0; c < 6; c++) {
          const cx = -0.39 + c * 0.112;
          const dCol = canColors[(tier * 3 + c) % canColors.length];
          const isBottle = tier === 2 && c % 2 === 0;
          const drinkMesh = new THREE.Mesh(
            isBottle ? tallBottleGeo : canGeo,
            makeCelMat(dCol, true)
          );
          drinkMesh.layers.set(1);
          drinkMesh.position.set(cx, sy + (isBottle ? 0.11 : 0.088), 0.34);
          vm.add(drinkMesh);
        }
      }

      const glassCover = new THREE.Mesh(
        new THREE.PlaneGeometry(0.74, 1.04),
        new THREE.MeshBasicMaterial({ color: 0xe0f2fe, transparent: true, opacity: 0.22 })
      );
      glassCover.position.set(-0.11, 1.32, 0.40);
      const windowFrame = box(0.76, 1.06, 0.03, 0x0f172a, false);
      windowFrame.position.set(-0.11, 1.32, 0.30);
      vm.add(windowFrame, glassCover);

      const ledDisplay = new THREE.Mesh(
        new THREE.PlaneGeometry(0.18, 0.08),
        new THREE.MeshBasicMaterial({ color: 0x10b981 })
      );
      ledDisplay.position.set(0.42, 1.56, 0.385);

      const icReader = boxFast(0.18, 0.14, 0.03, 0x38bdf8, true);
      icReader.position.set(0.42, 1.36, 0.39);

      const billSlot = boxFast(0.16, 0.06, 0.03, 0x0f172a, false);
      billSlot.position.set(0.42, 1.18, 0.39);

      const coinSlot = cylFast(0.035, 0.035, 0.03, 8, 0x94a3b8, false);
      coinSlot.rotation.x = Math.PI / 2;
      coinSlot.position.set(0.42, 1.04, 0.39);

      vm.add(ledDisplay, icReader, billSlot, coinSlot);

      const pickupWell = boxFast(0.76, 0.28, 0.08, 0x0f172a, false);
      pickupWell.position.set(-0.10, 0.32, 0.35);
      const pickupFlap = makeFrontBackBox(
        0.68, 0.18, 0.03,
        createGraphicSign(256, 64, '#1e293b', '#38bdf8', 'PUSH 取出し口', null),
        0x1e293b,
        false
      );
      pickupFlap.position.set(-0.10, 0.32, 0.395);
      vm.add(pickupWell, pickupFlap);

      diorama.add(vm);
    }

    createDetailedVendingMachine({
      x: -6.45,
      z: -0.85,
      bodyColor: 0xf8fafc,
      trimColor: 0x0284c7,
      headerBg: '#0284c7',
      brandTitle: 'HOSHINO DRINK',
      brandSub: 'つめた〜い • あたたかい ¥110~',
      canColors: [0x22c55e, 0x0ea5e9, 0xfacc15, 0xef4444, 0xa855f7, 0xf97316]
    });

    createDetailedVendingMachine({
      x: -7.75,
      z: -0.85,
      bodyColor: 0xfef3c7,
      trimColor: 0x78350f,
      headerBg: '#b45309',
      brandTitle: 'BOSS 珈琲 24H',
      brandSub: '厳選焙煎 • HOT & COLD',
      canColors: [0x78350f, 0xd97706, 0xef4444, 0x1e293b, 0xfacc15, 0x0284c7]
    });

    const recycleBin = new THREE.Group();
    recycleBin.position.set(-8.68, 0.17, -0.85);
    const rbBody = box(0.46, 1.05, 0.52, 0xe2e8f0, false);
    rbBody.position.y = 0.525;
    const rbHood = box(0.48, 0.28, 0.54, 0x0284c7, false);
    rbHood.position.y = 1.18;
    [-0.10, 0.10].forEach(hx => {
      const hole = cylFast(0.06, 0.06, 0.04, 10, 0x0f172a, false);
      hole.rotation.x = Math.PI / 2;
      hole.position.set(hx, 1.18, 0.27);
      recycleBin.add(hole);
    });
    const rbSign = makeFrontBackBox(0.38, 0.42, 0.03, createGraphicSign(160, 180, '#0284c7', '#ffffff', 'リサイクル', '空き缶・PET'), 0x0284c7, false);
    rbSign.position.set(0, 0.62, 0.265);
    recycleBin.add(rbBody, rbHood, rbSign);
    diorama.add(recycleBin);

    const umbStand = new THREE.Group();
    umbStand.position.set(-1.65, 0.17, 0.48);
    const uFrame = box(0.52, 0.48, 0.26, 0x94a3b8, false);
    uFrame.position.y = 0.24;
    umbStand.add(uFrame);
    [0x38bdf8, 0xf43f5e, 0xfacc15].forEach((c, i) => {
      const u = cylFast(0.028, 0.015, 0.70, 8, c, false);
      u.position.set(-0.14 + i * 0.14, 0.42, 0);
      umbStand.add(u);
    });
    diorama.add(umbStand);

    const pylon = new THREE.Group();
    pylon.position.set(6.9, 0.17, 0.65);

    const planterBase = box(1.85, 0.38, 0.86, 0x475569, false);
    planterBase.position.y = 0.19;
    const planterRim = boxFast(1.92, 0.08, 0.92, 0x94a3b8, false);
    planterRim.position.y = 0.40;
    pylon.add(planterBase, planterRim);
    [-0.55, 0.0, 0.55].forEach(sx => {
      const shrub = cylFast(0.22, 0.26, 0.24, 8, 0x15803d, false);
      shrub.position.set(sx, 0.52, 0);
      pylon.add(shrub);
    });

    [-0.68, 0.68].forEach(px => {
      const col = cyl(0.11, 0.13, 6.2, 10, 0x1e293b, false);
      col.position.set(px, 3.1, 0);
      const flange = cylFast(0.18, 0.20, 0.16, 10, 0x64748b, false);
      flange.position.set(px, 0.48, 0);
      pylon.add(col, flange);
    });
    [1.2, 2.2, 3.4, 5.8].forEach(by => {
      const brace = boxFast(1.36, 0.09, 0.09, 0x334155, false);
      brace.position.set(0, by, 0);
      pylon.add(brace);
    });

    const mainPylonFrame = box(1.24, 2.58, 0.28, 0x0f172a, false);
    mainPylonFrame.position.set(0, 4.48, 0);
    const mainPylonBox = makeFrontBackBox(1.14, 2.46, 0.34, createPylonMainTexture(), 0x1e293b, false);
    mainPylonBox.position.set(0, 4.48, 0);
    pylon.add(mainPylonFrame, mainPylonBox);

    const crownTex = createGraphicSign(384, 128, '#0284c7', '#fde047', 'HOSHINO MART', '星野マート • 桜町店');
    const crownBox = makeFrontBackBox(1.28, 0.42, 0.32, crownTex, 0x0284c7, false);
    crownBox.position.set(0, 6.04, 0);
    pylon.add(crownBox);

    const subSigns = [
      { y: 2.86, bg: '#10b981', title: '銀行ATM 24H', sub: '手数料0円 • 各種カード' },
      { y: 2.38, bg: '#78350f', title: '挽きたて珈琲', sub: 'HOSHINO CAFE ¥110' },
      { y: 1.90, bg: '#0284c7', title: '酒 • たばこ • 弁当', sub: 'TAX FREE • 宅配便' }
    ];
    subSigns.forEach(ss => {
      const plate = makeFrontBackBox(
        1.18, 0.38, 0.26,
        createGraphicSign(384, 120, ss.bg, '#ffffff', ss.title, ss.sub),
        0x1e293b,
        false
      );
      plate.position.set(0, ss.y, 0);
      pylon.add(plate);
    });

    [-0.38, 0.38].forEach(lx => {
      const arm = boxFast(0.06, 0.18, 0.56, 0x1e293b, false);
      arm.position.set(lx, 6.32, 0);
      const lampHood = boxFast(0.22, 0.08, 0.18, 0xfef08a, true);
      lampHood.position.set(lx, 6.26, 0.26);
      const lampHoodBack = lampHood.clone();
      lampHoodBack.position.z = -0.26;
      pylon.add(arm, lampHood, lampHoodBack);
    });

    diorama.add(pylon);

    const uPole = new THREE.Group();
    uPole.position.set(-8.35, 0.17, 1.45);
    const poleCyl = cyl(0.14, 0.20, 7.2, 10, 0x475569, false);
    poleCyl.position.y = 3.6;
    const xArm = box(1.8, 0.1, 0.1, 0x1e293b, false);
    xArm.position.set(0, 6.6, 0);
    const trans = cyl(0.26, 0.26, 0.75, 10, 0x64748b, false);
    trans.position.set(0.38, 5.2, 0.16);
    uPole.add(poleCyl, xArm, trans);
    diorama.add(uPole);

    const trafficLight = new THREE.Group();
    trafficLight.position.set(7.6, 0.17, 1.65);
    const tPole = cyl(0.10, 0.12, 4.4, 10, 0x1e293b, false);
    tPole.position.y = 2.2;
    const tArm = box(2.1, 0.1, 0.1, 0x1e293b, false);
    tArm.position.set(-0.95, 4.1, 0);
    const tBox = box(1.05, 0.34, 0.34, 0x0f172a, false);
    tBox.position.set(-1.6, 4.1, 0);

    const redOrbMat = new THREE.MeshBasicMaterial({ color: 0x3f1d24 });
    const yelOrbMat = new THREE.MeshBasicMaterial({ color: 0x422006 });
    const grnOrbMat = new THREE.MeshBasicMaterial({ color: 0x34d399 });
    const rOrb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), redOrbMat);
    rOrb.position.set(-1.9, 4.1, 0.19);
    const yOrb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), yelOrbMat);
    yOrb.position.set(-1.6, 4.1, 0.19);
    const gOrb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), grnOrbMat);
    gOrb.position.set(-1.3, 4.1, 0.19);
    trafficLight.add(tPole, tArm, tBox, rOrb, yOrb, gOrb);
    diorama.add(trafficLight);


    // =========================================================
    // 8.5 HIGH-CRAFT SAKURA PARK (桜町公園: せせらぎ水路・花筏・朱塗り太鼓橋・木造東屋・野点傘・ぼんぼり提灯・遊具広場・多層花枝夜桜)
    // =========================================================
    const parkGroup = new THREE.Group();
    diorama.add(parkGroup);

    // Procedural Texture 1: High-DPI Alpha-Cutout Sakura Blossom Branch Spray (五弁桜と小枝の透過テクスチャ — 告别棉花糖球感！)
    function createSakuraBlossomSprayTex(seedOffset = 0) {
      const c = document.createElement('canvas');
      c.width = 512;
      c.height = 512;
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, 512, 512);

      let seed = 1337 + seedOffset * 97;
      function rand() {
        seed = (seed * 16807) % 2147483647;
        return (seed - 1) / 2147483646;
      }

      // Draw dark cherry-bark twigs (桜の小枝) radiating from center/bottom
      ctx.strokeStyle = '#2d1810';
      ctx.lineCap = 'round';
      const branches = [
        [[256, 460], [240, 270], [150, 110]],
        [[240, 270], [340, 180], [430, 115]],
        [[250, 340], [130, 260], [65, 205]],
        [[255, 310], [360, 290], [450, 255]],
        [[240, 220], [255, 120], [275, 55]]
      ];
      branches.forEach(pts => {
        ctx.lineWidth = 9;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        ctx.quadraticCurveTo(pts[1][0], pts[1][1], pts[2][0], pts[2][1]);
        ctx.stroke();

        // Fine sub-twigs
        for (let k = 0; k < 3; k++) {
          const t = 0.3 + k * 0.28;
          const bx = pts[0][0] * (1 - t) + pts[2][0] * t;
          const by = pts[0][1] * (1 - t) + pts[2][1] * t;
          ctx.lineWidth = 4.5;
          ctx.beginPath();
          ctx.moveTo(bx, by);
          ctx.lineTo(bx + (rand() - 0.5) * 95, by - 25 - rand() * 55);
          ctx.stroke();
        }
      });

      // Helper to paint an authentic 5-petal Japanese Sakura flower (五弁桜)
      function drawFivePetalSakura(cx, cy, radius, rot, palIdx) {
        const palettes = [
          { petal: '#fce7f3', edge: '#f9a8d4', core: '#db2777' },
          { petal: '#fbcfe8', edge: '#f472b6', core: '#be185d' },
          { petal: '#fff1f2', edge: '#fbcfe8', core: '#e11d48' },
          { petal: '#f9a8d4', edge: '#ec4899', core: '#9d174d' }
        ];
        const pal = palettes[palIdx % palettes.length];
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rot);

        for (let p = 0; p < 5; p++) {
          ctx.save();
          ctx.rotate((p * Math.PI * 2) / 5);
          ctx.fillStyle = pal.petal;
          ctx.strokeStyle = pal.edge;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.bezierCurveTo(-radius * 0.55, -radius * 0.45, -radius * 0.48, -radius * 1.02, -radius * 0.12, -radius * 0.98);
          ctx.lineTo(0, -radius * 0.80); // Characteristic Sakura petal notch (桜の花びらの切れ込み)
          ctx.lineTo(radius * 0.12, -radius * 0.98);
          ctx.bezierCurveTo(radius * 0.48, -radius * 1.02, radius * 0.55, -radius * 0.45, 0, 0);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }

        // Deep crimson-pink calyx & stamens in the flower center
        ctx.fillStyle = pal.core;
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.20, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Paint 145 layered 5-petal sakura blossoms clustered along the twigs
      for (let i = 0; i < 145; i++) {
        const angle = rand() * Math.PI * 2;
        const dist = Math.pow(rand(), 0.72) * 215;
        const fx = 256 + Math.cos(angle) * dist;
        const fy = 235 + Math.sin(angle) * dist * 0.88;
        const r = 13 + rand() * 16;
        drawFivePetalSakura(fx, fy, r, rand() * Math.PI * 2, i);
      }

      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    }

    const sakuraSprayTex1 = createSakuraBlossomSprayTex(1);
    const sakuraSprayTex2 = createSakuraBlossomSprayTex(2);

    // Procedural Texture 2: Fallen Sakura Petal Carpet (散り桜の絨毯)
    function createSakuraPetalCarpetTex() {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 256;
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, 256, 256);

      const g = ctx.createRadialGradient(128, 128, 12, 128, 128, 120);
      g.addColorStop(0.0, 'rgba(249, 168, 212, 0.52)');
      g.addColorStop(0.6, 'rgba(251, 207, 232, 0.25)');
      g.addColorStop(1.0, 'rgba(251, 207, 232, 0.0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(128, 128, 120, 0, Math.PI * 2);
      ctx.fill();

      // Individual fallen petals scattered radially
      const cols = ['#fce7f3', '#fbcfe8', '#f9a8d4', '#f472b6'];
      for (let i = 0; i < 180; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.pow(Math.random(), 0.65) * 114;
        const px = 128 + Math.cos(a) * d;
        const py = 128 + Math.sin(a) * d;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(Math.random() * Math.PI * 2);
        ctx.fillStyle = cols[i % cols.length];
        ctx.beginPath();
        ctx.ellipse(0, 0, 4.2, 2.3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    }
    const sharedPetalCarpetTex = createSakuraPetalCarpetTex();

    // Procedural Texture 3: Park Stream with Hana-Ikada (花筏 — 水面漂流樱花瓣与锦鲤)
    function createStreamWaterTex() {
      const c = document.createElement('canvas');
      c.width = 512;
      c.height = 256;
      const ctx = c.getContext('2d');

      const grad = ctx.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0.0, '#0f2942');
      grad.addColorStop(0.5, '#164e63');
      grad.addColorStop(1.0, '#0f2942');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 512, 256);

      // Shimmering water ripples
      ctx.strokeStyle = 'rgba(125, 211, 252, 0.25)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 28; i++) {
        const rx = Math.random() * 460;
        const ry = 20 + Math.random() * 216;
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.quadraticCurveTo(rx + 25, ry - 6, rx + 50, ry);
        ctx.stroke();
      }

      // Swimming Koi fish silhouettes (錦鯉)
      [
        [140, 110, '#ef4444', 0.2],
        [165, 135, '#f8fafc', 0.15],
        [335, 125, '#f59e0b', -0.25],
        [370, 95,  '#ef4444', -0.1]
      ].forEach(([kx, ky, col, ang]) => {
        ctx.save();
        ctx.translate(kx, ky);
        ctx.rotate(ang);
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(0, 0, 14, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-12, 0); ctx.lineTo(-20, -6); ctx.lineTo(-20, 6); ctx.closePath();
        ctx.fill();
        ctx.restore();
      });

      // Pink Hana-ikada sakura petal ribbons floating along the stream banks
      for (let i = 0; i < 220; i++) {
        const px = Math.random() * 512;
        const bankBias = Math.random() < 0.7 ? (Math.random() < 0.5 ? 18 + Math.random() * 55 : 238 - Math.random() * 55) : Math.random() * 256;
        ctx.fillStyle = i % 2 === 0 ? '#fbcfe8' : '#f472b6';
        ctx.beginPath();
        ctx.ellipse(px, bankBias, 3.8, 2.0, Math.random() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }

      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    }

    // 1. Multi-Layered Park Lawn, Mossy Mounds & Natural Stone Curbs (X: -8.6 to +8.4, Z: -16.2 to -6.5)
    const parkLawnBase = box(17.0, 0.12, 9.6, 0x1b4332, false);
    parkLawnBase.position.set(-0.1, 0.21, -11.35);
    parkGroup.add(parkLawnBase);

    const innerGrassMound = boxFast(16.4, 0.05, 9.0, 0x2d6a4f, false);
    innerGrassMound.position.set(-0.1, 0.27, -11.35);
    parkGroup.add(innerGrassMound);

    // Sculpted gentle garden hillocks (築山) in the corners
    [
      [-5.8, -8.5, 2.8, 2.2],
      [ 5.6, -8.4, 2.5, 2.1],
      [-5.9, -14.2, 2.7, 2.2]
    ].forEach(([hx, hz, rx, rz]) => {
      const hill = cylFast(rx * 0.72, rx, 0.16, 12, 0x40916c, false);
      hill.scale.set(1, 1, rz / rx);
      hill.position.set(hx, 0.34, hz);
      parkGroup.add(hill);
    });

    // 2. Winding Sakura Stream (せせらぎ水路・花筏) & River Cobblestone Banks (玉石護岸)
    const streamGroup = new THREE.Group();
    streamGroup.position.set(-1.1, 0.28, -11.35);
    parkGroup.add(streamGroup);

    const streamBed = new THREE.Mesh(
      new THREE.PlaneGeometry(11.6, 1.85),
      new THREE.MeshBasicMaterial({ map: createStreamWaterTex() })
    );
    streamBed.rotation.x = -Math.PI / 2;
    streamBed.position.set(0, 0.02, 0);
    streamGroup.add(streamBed);

    // Natural River Cobblestones lining both banks of the stream
    const rockGeo = new THREE.DodecahedronGeometry(0.18, 0);
    for (let sx = -5.6; sx <= 5.6; sx += 0.48) {
      [-0.96, 0.96].forEach((sz, bIdx) => {
        if (Math.abs(sx - 1.0) < 0.95) return; // Leave opening under the bridge
        const rCol = (Math.abs(Math.round(sx * 10)) + bIdx) % 2 === 0 ? 0x64748b : 0x475569;
        const rock = new THREE.Mesh(rockGeo, makeCelMat(rCol, false));
        rock.layers.set(1);
        rock.scale.set(1.2, 0.65, 0.95);
        rock.position.set(sx + (bIdx ? 0.08 : -0.08), 0.06, sz);
        streamGroup.add(rock);
      });
    }

    // 3. Arched Vermilion Japanese Wooden Drum Bridge (朱塗り太鼓橋) spanning the Stream
    const bridgeGroup = new THREE.Group();
    bridgeGroup.position.set(-0.1, 0.28, -11.35);
    parkGroup.add(bridgeGroup);

    const vermilion = 0xdc2626;
    const bridgeGold = 0xfbbf24;
    const bridgeWood = 0x991b1b;

    // Arched bridge deck segments & side handrails
    for (let seg = -4; seg <= 4; seg++) {
      const zOff = seg * 0.28;
      const archY = Math.cos((seg / 4.5) * (Math.PI / 2)) * 0.34;
      const tiltX = -Math.sin((seg / 4.5) * (Math.PI / 2)) * 0.24;

      const plank = box(1.65, 0.07, 0.27, bridgeWood, false);
      plank.position.set(0, 0.06 + archY, zOff);
      plank.rotation.x = tiltX;
      bridgeGroup.add(plank);
    }

    // Curved Vermilion Handrails (欄干) & Brass Giboshi Finials (擬宝珠)
    [-0.78, 0.78].forEach(rx => {
      [-1.12, 0.0, 1.12].forEach((pz, pIdx) => {
        const postY = pIdx === 1 ? 0.38 : 0.08;
        const post = box(0.10, 0.62, 0.10, vermilion, false);
        post.position.set(rx, postY + 0.31, pz);
        const giboshi = cylFast(0.04, 0.065, 0.12, 8, bridgeGold, true);
        giboshi.position.set(rx, postY + 0.66, pz);
        bridgeGroup.add(post, giboshi);
      });

      const rail1 = box(0.08, 0.07, 1.22, vermilion, false);
      rail1.position.set(rx, 0.56, -0.56);
      rail1.rotation.x = -0.25;
      const rail2 = box(0.08, 0.07, 1.22, vermilion, false);
      rail2.position.set(rx, 0.56, 0.56);
      rail2.rotation.x = 0.25;
      bridgeGroup.add(rail1, rail2);
    });

    // Stepping stone paths (飛石・延段) connecting South Konbini Alley -> Bridge -> North Exit & East Entrance
    for (let pz = -15.6; pz <= -7.0; pz += 0.78) {
      if (Math.abs(pz - (-11.35)) < 1.35) continue;
      const stone = boxFast(1.25, 0.05, 0.54, 0x94a3b8, false);
      stone.position.set(-0.1, 0.285, pz);
      parkGroup.add(stone);
    }
    for (let px = 0.8; px <= 7.8; px += 0.82) {
      const stone = boxFast(0.58, 0.05, 1.05, 0x94a3b8, false);
      stone.position.set(px, 0.285, -9.65);
      parkGroup.add(stone);
    }

    // 4. Traditional Wooden Park Pavilion / Azumaya (木造東屋・四阿) in Northwest Scenic Zone
    const azumaya = new THREE.Group();
    azumaya.position.set(-4.3, 0.28, -13.55);
    parkGroup.add(azumaya);

    const azStoneBase = box(2.95, 0.18, 2.95, 0x64748b, false);
    azStoneBase.position.y = 0.09;
    const azWoodDeck = box(2.75, 0.08, 2.75, 0x78350f, false);
    azWoodDeck.position.y = 0.22;
    azumaya.add(azStoneBase, azWoodDeck);

    // 4 Timber Corner Pillars + Open Perimeter Benches + Center Tea Table
    [[-1.18, -1.18], [1.18, -1.18], [-1.18, 1.18], [1.18, 1.18]].forEach(([px, pz]) => {
      const col = box(0.14, 2.15, 0.14, 0x451a03, false);
      col.position.set(px, 1.25, pz);
      azumaya.add(col);
    });
    const azBenchBack = box(2.45, 0.08, 0.42, 0x92400e, false);
    azBenchBack.position.set(0, 0.56, -1.02);
    const azBenchLeft = box(0.42, 0.08, 2.15, 0x92400e, false);
    azBenchLeft.position.set(-1.02, 0.56, 0);
    const azTable = box(1.10, 0.07, 1.10, 0x92400e, false);
    azTable.position.set(0.1, 0.68, 0.1);
    const azTableLeg = boxFast(0.18, 0.44, 0.18, 0x451a03, false);
    azTableLeg.position.set(0.1, 0.44, 0.1);
    azumaya.add(azBenchBack, azBenchLeft, azTable, azTableLeg);

    // Pyramidal Japanese Hogyo Tiled Roof (宝形造瓦屋根) + Warm Hanging Lantern
    const azRoofEave = box(3.45, 0.14, 3.45, 0x1e293b, false);
    azRoofEave.position.y = 2.36;
    const azRoofPeak = new THREE.Mesh(
      new THREE.ConeGeometry(2.55, 1.05, 4),
      makeCelMat(0x1e293b, false)
    );
    azRoofPeak.rotation.y = Math.PI / 4;
    addInkOutline(azRoofPeak, false, 24);
    azRoofPeak.position.y = 2.92;
    const azFinial = cylFast(0.06, 0.14, 0.28, 8, 0xfbbf24, true);
    azFinial.position.y = 3.52;
    const azLantern = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xfef08a })
    );
    azLantern.position.set(0, 2.08, 0);
    azumaya.add(azRoofEave, azRoofPeak, azFinial, azLantern);

    // 5. Outdoor Hanami Tea Seating with Red Nodate-gasa Umbrella (野点傘と緋毛氈の床几・三色団子)
    const chayaGroup = new THREE.Group();
    chayaGroup.position.set(-3.8, 0.28, -9.15);
    parkGroup.add(chayaGroup);

    const nodatePole = cylFast(0.04, 0.04, 2.35, 8, 0x451a03, false);
    nodatePole.position.y = 1.18;
    const nodateCanopy = new THREE.Mesh(
      new THREE.ConeGeometry(1.35, 0.42, 16),
      makeCelMat(0xdc2626, true)
    );
    addInkOutline(nodateCanopy, false, 30);
    nodateCanopy.position.y = 2.25;
    chayaGroup.add(nodatePole, nodateCanopy);

    // Two Red-Cloth Chaya Benches (緋毛氈の床几) + Hanami Dango Plate
    [-0.85, 0.85].forEach(bx => {
      const bTop = box(1.28, 0.08, 0.48, 0xdc2626, false);
      bTop.position.set(bx, 0.42, 0);
      const bLeg1 = boxFast(0.08, 0.40, 0.42, 0x1f140e, false);
      bLeg1.position.set(bx - 0.48, 0.20, 0);
      const bLeg2 = bLeg1.clone();
      bLeg2.position.x = bx + 0.48;
      chayaGroup.add(bTop, bLeg1, bLeg2);
    });
    // Dango tray & green tea cups on bench
    const dangoTray = boxFast(0.32, 0.03, 0.22, 0xfef3c7, true);
    dangoTray.position.set(-0.65, 0.48, 0);
    const dPink = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), new THREE.MeshBasicMaterial({ color: 0xf472b6 }));
    dPink.position.set(-0.72, 0.52, 0);
    const dWhite = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    dWhite.position.set(-0.65, 0.52, 0);
    const dGreen = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), new THREE.MeshBasicMaterial({ color: 0x4ade80 }));
    dGreen.position.set(-0.58, 0.52, 0);
    chayaGroup.add(dangoTray, dPink, dWhite, dGreen);

    // 6. Low Stone Park Boundary Walls, Wooden Notice Board (公園案内板) & Park Entrance Gate
    [
      [-5.2, -6.6, 6.6, 0.38, 0.28],
      [ 5.0, -6.6, 6.6, 0.38, 0.28],
      [-5.2, -16.1, 6.6, 0.38, 0.28],
      [ 5.0, -16.1, 6.6, 0.38, 0.28],
      [-8.5, -11.35, 0.28, 0.38, 6.8],
      [ 8.3, -13.2, 0.28, 0.38, 4.8]
    ].forEach(([wx, wz, ww, wh, wd]) => {
      const wall = box(ww, wh, wd, 0x475569, false);
      wall.position.set(wx, 0.36, wz);
      const cap = boxFast(ww + 0.06, 0.06, wd + 0.06, 0x94a3b8, false);
      cap.position.set(wx, 0.57, wz);
      parkGroup.add(wall, cap);
    });

    // Sculpted Pruned Azalea Shrubs (ツツジの玉物低木) along the park perimeter
    [
      [-3.2, -6.95, 0.52, 0x15803d], [-2.3, -6.95, 0.42, 0x166534],
      [ 2.5, -6.95, 0.50, 0x15803d], [ 3.4, -6.95, 0.44, 0x166534],
      [-7.9, -10.8, 0.55, 0x15803d], [-7.9, -11.9, 0.45, 0x166534]
    ].forEach(([sx, sz, sr, col]) => {
      const bush = new THREE.Mesh(new THREE.SphereGeometry(sr, 10, 8), makeCelMat(col, false));
      bush.scale.set(1.15, 0.72, 1.15);
      bush.position.set(sx, 0.28 + sr * 0.45, sz);
      bush.layers.set(1);
      parkGroup.add(bush);
    });

    // Park Entrance Archway ("桜町公園 SAKURA PARK") & Roofed Wooden Park Map Board (公園案内板)
    const parkArch = new THREE.Group();
    parkArch.position.set(8.3, 0.22, -9.65);
    const archP1 = cyl(0.11, 0.13, 2.85, 8, 0x451a03, false);
    archP1.position.set(0, 1.425, -1.25);
    const archP2 = cyl(0.11, 0.13, 2.85, 8, 0x451a03, false);
    archP2.position.set(0, 1.425, 1.25);
    const archBeam = box(0.28, 0.24, 3.1, 0x78350f, false);
    archBeam.position.set(0, 2.78, 0);
    const archSign = makeFrontBackBox(
      1.75, 0.44, 0.14,
      createGraphicSign(384, 96, '#fef3c7', '#78350f', '区立 桜町公園', 'SAKURA-CHO HANAMI PARK'),
      0x78350f,
      true
    );
    archSign.rotation.y = Math.PI / 2;
    archSign.position.set(0.08, 2.85, 0);
    parkArch.add(archP1, archP2, archBeam, archSign);
    parkGroup.add(parkArch);

    // Roofed Park Notice & Map Board (案内板)
    const noticeBoard = new THREE.Group();
    noticeBoard.position.set(6.8, 0.28, -7.55);
    const nbP1 = boxFast(0.08, 1.45, 0.08, 0x451a03, false);
    nbP1.position.set(-0.55, 0.725, 0);
    const nbP2 = nbP1.clone();
    nbP2.position.x = 0.55;
    const nbPanel = makeFrontBackBox(
      1.25, 0.72, 0.08,
      createGraphicSign(256, 160, '#fffbeb', '#15803d', '桜町公園 案内図', '夜桜ライトアップ開催中'),
      0x451a03,
      true
    );
    nbPanel.position.set(0, 0.98, 0);
    const nbRoof = box(1.45, 0.08, 0.36, 0x1e293b, false);
    nbRoof.position.set(0, 1.42, 0);
    noticeBoard.add(nbP1, nbP2, nbPanel, nbRoof);
    parkGroup.add(noticeBoard);

    // Central Vintage Park Clock Post & Drinking Fountain (時計塔と水飲み場)
    const clockPost = cyl(0.08, 0.12, 2.65, 10, 0x0f172a, false);
    clockPost.position.set(1.65, 1.55, -10.8);
    const clockHead = makeFrontBackBox(
      0.56, 0.56, 0.22,
      createGraphicSign(160, 160, '#fffbeb', '#0f172a', '18:45', 'SAKURA PARK'),
      0x0f172a,
      true
    );
    clockHead.position.set(1.65, 2.95, -10.8);
    parkGroup.add(clockPost, clockHead);

    // Park Benches & Warm Yozakura Bonbori Paper Lanterns (夜桜ぼんぼり提灯)
    function createParkBench(x, z, rotY) {
      const bg = new THREE.Group();
      bg.position.set(x, 0.28, z);
      bg.rotation.y = rotY;
      const seat = box(1.35, 0.07, 0.44, 0x92400e, false);
      seat.position.y = 0.36;
      const back = box(1.35, 0.36, 0.06, 0x92400e, false);
      back.position.set(0, 0.58, -0.19);
      [-0.55, 0.55].forEach(lx => {
        const leg = boxFast(0.08, 0.36, 0.42, 0x1e293b, false);
        leg.position.set(lx, 0.18, 0);
        bg.add(leg);
      });
      bg.add(seat, back);
      parkGroup.add(bg);
    }
    createParkBench( 2.8, -8.6, -0.25);
    createParkBench( 2.8, -11.2, -0.45);

    function createBonboriLantern(x, z) {
      const lg = new THREE.Group();
      lg.position.set(x, 0.26, z);
      const pole = cyl(0.05, 0.07, 2.55, 8, 0x271c19, false);
      pole.position.y = 1.275;
      // Traditional hexagonal/pink-and-white Yozakura Bonbori shade (ぼんぼり)
      const shade = cyl(0.22, 0.16, 0.38, 6, 0xfbcfe8, true);
      shade.position.y = 2.65;
      const cap = cylFast(0.26, 0.26, 0.05, 6, 0x1e293b, false);
      cap.position.y = 2.86;
      lg.add(pole, shade, cap);
      parkGroup.add(lg);
    }
    [
      [-2.1, -9.6],
      [ 1.8, -9.6],
      [-2.1, -13.1],
      [ 1.8, -13.1],
      [-0.8, -7.5],
      [ 0.8, -15.0]
    ].forEach(([lx, lz]) => createBonboriLantern(lx, lz));

    // 7. Complete Japanese Playground Zone (遊具広場: ブランコ・滑り台・砂場) in Southeast Corner
    const swingSet = new THREE.Group();
    swingSet.position.set(5.6, 0.26, -13.8);
    const swTop = cyl(0.05, 0.05, 2.5, 8, 0x0284c7, false);
    swTop.rotation.z = Math.PI / 2;
    swTop.position.set(0, 2.10, 0);
    [-1.1, 1.1].forEach(sx => {
      const leg1 = cylFast(0.045, 0.045, 2.25, 8, 0x0284c7, false);
      leg1.position.set(sx, 1.08, 0.42);
      leg1.rotation.x = -0.18;
      const leg2 = cylFast(0.045, 0.045, 2.25, 8, 0x0284c7, false);
      leg2.position.set(sx, 1.08, -0.42);
      leg2.rotation.x = 0.18;
      swingSet.add(leg1, leg2);
    });
    [-0.42, 0.42].forEach(sx => {
      const chain1 = cylFast(0.012, 0.012, 1.50, 6, 0x94a3b8, false);
      chain1.position.set(sx - 0.16, 1.32, 0);
      const chain2 = cylFast(0.012, 0.012, 1.50, 6, 0x94a3b8, false);
      chain2.position.set(sx + 0.16, 1.32, 0);
      const seat = boxFast(0.40, 0.04, 0.20, 0xf59e0b, true);
      seat.position.set(sx, 0.55, 0);
      swingSet.add(chain1, chain2, seat);
    });
    parkGroup.add(swingSet);

    // Colorful Anime Park Slide (滑り台) & Sandbox (砂場)
    const slideGroup = new THREE.Group();
    slideGroup.position.set(3.4, 0.28, -14.2);
    const slPlatform = box(0.65, 0.08, 0.65, 0xef4444, false);
    slPlatform.position.set(0, 1.25, 0);
    [[-0.26, -0.26], [0.26, -0.26], [-0.26, 0.26], [0.26, 0.26]].forEach(([px, pz]) => {
      const post = cylFast(0.035, 0.035, 1.45, 6, 0x0284c7, false);
      post.position.set(px, 0.725, pz);
      slideGroup.add(post);
    });
    const chute = box(0.48, 0.08, 1.85, 0xfacc15, false);
    chute.rotation.x = 0.68;
    chute.position.set(0, 0.65, 0.95);
    const ladder = box(0.44, 1.35, 0.08, 0xef4444, false);
    ladder.rotation.x = -0.35;
    ladder.position.set(0, 0.62, -0.52);
    slideGroup.add(slPlatform, chute, ladder);
    parkGroup.add(slideGroup);

    // Sakura crowns are branch-supported sprays of small, cupped five-petal flowers.
    // No opaque canopy masses or intersecting billboard planes.
    const sakuraCanopies = [];
    const sakuraFlowerGeo = (()=>{
      const pos=[],col=[];
      const centerColor=new THREE.Color(0xb6617c),baseColor=new THREE.Color(0xe6b2be),tipColor=new THREE.Color(0xffede5);
      const push=(v,c)=>{pos.push(...v);col.push(c.r,c.g,c.b);};
      for(let p=0;p<5;p++){
        const angle=p*Math.PI*2/5,ca=Math.cos(angle),sa=Math.sin(angle);
        const turn=([r,t,z])=>[ca*r-sa*t,sa*r+ca*t,z];
        const edge=[[.14,-.10,0],[.49,-.30,.04],[.83,-.30,.12],[1,-.13,.20],[.90,0,.21],[1,.13,.20],[.83,.30,.12],[.49,.30,.04],[.14,.10,0]];
        for(let i=0;i<edge.length;i++){
          const a=edge[i],b=edge[(i+1)%edge.length];
          push(turn([.52,0,.055]),baseColor);push(turn(a),a[0]>.7?tipColor:baseColor);push(turn(b),b[0]>.7?tipColor:baseColor);
        }
      }
      for(let i=0;i<7;i++){
        const a=i*Math.PI*2/7,b=(i+1)*Math.PI*2/7;
        push([0,0,.07],centerColor);push([Math.cos(a)*.16,Math.sin(a)*.16,.075],centerColor);push([Math.cos(b)*.16,Math.sin(b)*.16,.075],centerColor);
      }
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(col,3));geo.computeVertexNormals();return geo;
    })();
    const sakuraFlowerMat=new THREE.MeshToonMaterial({color:0xffffff,vertexColors:true,gradientMap:celRamp,side:THREE.DoubleSide,emissive:0xf1c4d0,emissiveIntensity:.24});
    const sakuraBarkMat=new THREE.MeshToonMaterial({color:0x624535,gradientMap:celRamp});

    function createSakuraTree(x,z,scale=1,seedIdx=0){
      let seed=(seedIdx+1)*97137;
      function rnd(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
      const tree=new THREE.Group();tree.position.set(x,.26,z);tree.scale.setScalar(scale);parkGroup.add(tree);
      const crown=new THREE.Group();crown.position.y=1.45;tree.add(crown);
      const rootGeos=[],branchGeos=[],flowerTransforms=[],flowerColors=[];
      const up=new THREE.Vector3(0,1,0),helper=new THREE.Object3D(),rot=new THREE.Quaternion();
      const lean=(rnd()-.5)*.28,twist=rnd()*Math.PI*2;
      const v=(a)=>new THREE.Vector3(...a);
      function branch(a,b,r0,r1,upper=true){
        const va=v(a),vb=v(b),delta=vb.clone().sub(va),geo=new THREE.CylinderGeometry(r1,r0,delta.length(),7,1);
        rot.setFromUnitVectors(up,delta.normalize());
        const midpoint=va.add(vb).multiplyScalar(.5);if(upper)midpoint.y-=1.45;
        geo.applyMatrix4(new THREE.Matrix4().compose(midpoint,rot,new THREE.Vector3(1,1,1)));
        (upper?branchGeos:rootGeos).push(geo);
      }
      function spray(center,radius,count){
        for(let i=0;i<count;i++){
          // A lopsided cloud around a real terminal twig; some air remains between sprays.
          const az=rnd()*Math.PI*2,cosY=rnd()*2-1,r=Math.cbrt(rnd())*radius,sinY=Math.sqrt(1-cosY*cosY);
          helper.position.set(center[0]+Math.cos(az)*sinY*r,center[1]-1.45+cosY*r*.80,center[2]+Math.sin(az)*sinY*r);
          helper.rotation.set((rnd()-.5)*Math.PI*1.6,(rnd()-.5)*Math.PI*2,rnd()*Math.PI*2);
          const size=.063+rnd()*.024;helper.scale.setScalar(size);helper.updateMatrix();flowerTransforms.push(helper.matrix.clone());
          // Warm ivory blush with restrained, irregular pink accents.
          flowerColors.push(new THREE.Color().setRGB(.93+rnd()*.07,.80+rnd()*.19,.84+rnd()*.15));
        }
      }
      const trunkTop=[lean,1.90,.08];
      branch([0,.03,0],[lean*.3,.88,-.05],.24,.18,false);
      branch([lean*.3,.88,-.05],trunkTop,.18,.13,false);
      for(let i=0;i<5;i++){
        const a=i*Math.PI*2/5+rnd()*.3;
        branch([Math.cos(a)*.40,.02,Math.sin(a)*.40],[lean*.1,.38,0],.055,.12,false);
      }
      // Unequal bough lengths, fork heights and azimuths make each tree its own silhouette.
      for(let b=0;b<7;b++){
        const angle=twist+b*Math.PI*2/7+(rnd()-.5)*.35,reach=1.40+rnd()*.74;
        const base=[lean,1.35+rnd()*.50,.04],fork=[Math.cos(angle)*reach*.48,2.25+rnd()*.35,Math.sin(angle)*reach*.48];
        branch(base,fork,.105,.055);
        spray([fork[0],fork[1]+.62,fork[2]],.48,140);
        for(let t=0;t<3;t++){
          const a=angle+(t-1)*.40+(rnd()-.5)*.16;
          const end=[Math.cos(a)*reach,2.80+rnd()*.85+(b%3===0?.20:0),Math.sin(a)*reach];
          const mid=[fork[0]*.38+end[0]*.62,end[1]-.26-rnd()*.12,fork[2]*.38+end[2]*.62];
          branch(fork,mid,.046,.023);branch(mid,end,.023,.009);
          spray(mid,.35,75);
          for(let k=0;k<3;k++){
            const side=a+(k-1)*.78;
            const tip=[end[0]+Math.cos(side)*(.24+rnd()*.18),end[1]+(rnd()-.35)*.48,end[2]+Math.sin(side)*(.24+rnd()*.18)];
            branch(end,tip,.015,.0045);spray(tip,.32+rnd()*.11,50);
          }
        }
      }
      const leader=[lean+.18,3.65+rnd()*.32,-.18];branch(trunkTop,leader,.095,.023);
      spray([lean+.10,3.20,-.02],.62,450);
      for(let i=0;i<6;i++){
        const a=twist+i*2.399,tip=[leader[0]+Math.cos(a)*(.38+rnd()*.45),leader[1]+(rnd()-.45)*.43,leader[2]+Math.sin(a)*(.38+rnd()*.45)];
        branch([lean+.1,3.05,0],tip,.028,.006);spray(tip,.42,70);
      }
      const trunkGeometry=mergeGeometries(rootGeos),branchGeometry=mergeGeometries(branchGeos);
      const trunkMesh=new THREE.Mesh(trunkGeometry,sakuraBarkMat),branchMesh=new THREE.Mesh(branchGeometry,sakuraBarkMat);
      trunkMesh.castShadow=branchMesh.castShadow=true;trunkMesh.receiveShadow=branchMesh.receiveShadow=true;tree.add(trunkMesh);crown.add(branchMesh);
      rootGeos.forEach(g=>g.dispose());branchGeos.forEach(g=>g.dispose());
      const blossoms=new THREE.InstancedMesh(sakuraFlowerGeo,sakuraFlowerMat,flowerTransforms.length);
      flowerTransforms.forEach((matrix,i)=>{blossoms.setMatrixAt(i,matrix);blossoms.setColorAt(i,flowerColors[i]);});
      blossoms.instanceMatrix.needsUpdate=true;blossoms.instanceColor.needsUpdate=true;blossoms.computeBoundingSphere();crown.add(blossoms);
      sakuraCanopies.push({group:crown,phase:seedIdx*1.3});
      const carpet=new THREE.Mesh(new THREE.PlaneGeometry(3.7,3.7),new THREE.MeshBasicMaterial({map:sharedPetalCarpetTex,transparent:true,depthWrite:false,opacity:.55}));
      carpet.rotation.x=-Math.PI/2;carpet.position.y=.03;tree.add(carpet);
      const housing=cylFast(.065,.09,.13,8,0x1e293b);housing.position.set(.4,.08,.4);tree.add(housing);
    }

    createSakuraTree(-6.4,-8.3,1.08,1);
    createSakuraTree(6.1,-8.2,1.05,2);
    createSakuraTree(-6.7,-14.3,1.10,3);
    createSakuraTree(6.2,-14.2,1.04,4);
    createSakuraTree(-1.8,-11.5,1.22,5);


    // Soft Pink-Warm Bounce PointLight for Sakura Park
    const sakuraParkLight = new THREE.PointLight(0xffd5d2, 2.0, 20, 1.2);
    sakuraParkLight.position.set(-0.2, 4.0, -11.35);
    scene.add(sakuraParkLight);
    storeLights.push({ light: sakuraParkLight, base: 2.0 });

    // Falling Sakura Petals Particle System (飘落樱花瓣)
    const petalCount = 160;
    const petalGeo = new THREE.BufferGeometry();
    const petalPositions = new Float32Array(petalCount * 3);
    const petalMeta = Array.from({ length: petalCount }, () => ({
      x: (Math.random() - 0.5) * 20.0 - 0.5,
      y: Math.random() * 6.5 + 0.4,
      z: -6.0 - Math.random() * 11.5,
      vx: -0.35 - Math.random() * 0.35,
      vy: 0.65 + Math.random() * 0.45,
      phase: Math.random() * Math.PI * 2
    }));
    petalGeo.setAttribute('position', new THREE.BufferAttribute(petalPositions, 3));
    const sakuraPetalsMesh = new THREE.Points(
      petalGeo,
      new THREE.PointsMaterial({ color: 0xfbcfe8, size: 0.16, transparent: true, opacity: 0.9 })
    );
    sakuraPetalsMesh.layers.set(1);
    scene.add(sakuraPetalsMesh);

    // =========================================================
    // 8.5B AUTHENTIC JAPANESE NEIGHBORHOOD ARCHITECTURE (6 栋各具特色的日式町屋、一户建、木造公寓与古书店)
    // =========================================================
    const neighborhoodGroup = new THREE.Group();
    diorama.add(neighborhoodGroup);

    // Procedural Japanese Shoji / Lattice / Curtain Window Texture Generator
    function createJapaneseWindowTex(style = 'shoji', isLit = true) {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 256;
      const ctx = c.getContext('2d');

      if (!isLit) {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, 256, 256);
      } else if (style === 'cool') {
        const g = ctx.createLinearGradient(0, 0, 0, 256);
        g.addColorStop(0, '#38bdf8');
        g.addColorStop(1, '#bae6fd');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 256, 256);
      } else {
        const g = ctx.createRadialGradient(128, 140, 15, 128, 128, 160);
        g.addColorStop(0.0, '#fffbeb');
        g.addColorStop(0.55, '#fde047');
        g.addColorStop(1.0, '#f59e0b');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 256, 256);
      }

      if (style === 'shoji') {
        // Traditional Japanese Shoji kumiko paper lattice grid + bottom kick-panel (腰付障子)
        ctx.fillStyle = '#451a03';
        ctx.fillRect(0, 196, 256, 60);
        ctx.strokeStyle = '#78350f';
        ctx.lineWidth = 4;
        ctx.strokeRect(8, 204, 114, 44);
        ctx.strokeRect(134, 204, 114, 44);

        ctx.strokeStyle = '#451a03';
        ctx.lineWidth = 5;
        for (let x = 0; x <= 256; x += 42.6) {
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 196); ctx.stroke();
        }
        for (let y = 0; y <= 196; y += 39.2) {
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke();
        }
        ctx.lineWidth = 8;
        ctx.beginPath(); ctx.moveTo(128, 0); ctx.lineTo(128, 256); ctx.stroke();
      } else if (style === 'machiya') {
        // Fine vertical Senbon-goshi wooden lattice (千本格子)
        ctx.strokeStyle = '#3e1f0d';
        ctx.lineWidth = 6;
        for (let x = 8; x < 256; x += 18) {
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 256); ctx.stroke();
        }
        [48, 128, 208].forEach(y => {
          ctx.fillStyle = '#3e1f0d';
          ctx.fillRect(0, y - 4, 256, 8);
        });
      } else {
        // Japanese sliding sash window (引き違い窓) with curtains
        if (isLit) {
          ctx.fillStyle = 'rgba(217, 119, 6, 0.28)';
          ctx.beginPath();
          ctx.moveTo(0, 0); ctx.lineTo(68, 0); ctx.lineTo(42, 256); ctx.lineTo(0, 256);
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(256, 0); ctx.lineTo(188, 0); ctx.lineTo(214, 256); ctx.lineTo(256, 256);
          ctx.fill();
        }
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 10;
        ctx.strokeRect(4, 4, 248, 248);
        ctx.beginPath();
        ctx.moveTo(128, 0); ctx.lineTo(128, 256);
        ctx.moveTo(0, 136); ctx.lineTo(256, 136);
        ctx.stroke();
      }

      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 8;
      ctx.strokeRect(2, 2, 252, 252);

      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    }

    const winTexShoji = createJapaneseWindowTex('shoji', true);
    const winTexMachiya = createJapaneseWindowTex('machiya', true);
    const winTexWarmSash = createJapaneseWindowTex('sash', true);
    const winTexCoolSash = createJapaneseWindowTex('cool', true);
    const winTexDarkSash = createJapaneseWindowTex('sash', false);

    // Procedural Japanese Noren (暖簾) Curtain Texture
    function createNorenTexture(chars, bgHex = '#1e3a8a', txtHex = '#ffffff') {
      const c = document.createElement('canvas');
      c.width = 512;
      c.height = 192;
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, 512, 192);

      const panels = chars.length;
      const pw = (512 - (panels - 1) * 12) / panels;
      chars.forEach((ch, i) => {
        const x0 = i * (pw + 12);
        ctx.fillStyle = bgHex;
        ctx.fillRect(x0, 0, pw, 184);
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 4;
        ctx.strokeRect(x0 + 2, 2, pw - 4, 180);

        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x0 + pw / 2, 102, pw * 0.34, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = txtHex;
        ctx.textAlign = 'center';
        ctx.font = '900 68px "Hiragino Sans", "Microsoft YaHei", sans-serif';
        ctx.fillText(ch, x0 + pw / 2, 126);
      });

      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    }

    // Authentic Japanese Pitched Kirizuma Gable Roof (切妻造・本瓦葺き屋根 + 破風板 + 鬼瓦 + 垂木)
    function createKirizumaRoof({ w, d, pitchH = 1.25, tileCol = 0x1e293b, timberCol = 0x3e1f0d, wallCol = 0xfef3c7, ridgeAlongX = true }) {
      const rg = new THREE.Group();
      const spanW = ridgeAlongX ? w : d;
      const spanD = ridgeAlongX ? d : w;
      const eaveW = spanW + 0.72;
      const halfSpan = spanD / 2 + 0.42;
      const slopeLen = Math.hypot(halfSpan, pitchH);
      const slopeAngle = Math.atan2(pitchH, halfSpan);

      // Triangular Gable Pediment Walls (妻壁) on both ends
      const triShape = new THREE.Shape();
      triShape.moveTo(-spanD / 2, 0);
      triShape.lineTo( spanD / 2, 0);
      triShape.lineTo( 0, pitchH);
      triShape.closePath();

      const pedimentGeo = new THREE.ExtrudeGeometry(triShape, { depth: spanW - 0.08, bevelEnabled: false });
      pedimentGeo.translate(0, 0, -(spanW - 0.08) / 2);
      pedimentGeo.rotateY(Math.PI / 2);
      const pedimentMesh = new THREE.Mesh(pedimentGeo, makeCelMat(wallCol, false));
      addInkOutline(pedimentMesh, false, 24);
      rg.add(pedimentMesh);

      // Decorative Timber Collar Beams on Gable Ends (妻飾り・貫)
      [-spanW / 2 - 0.01, spanW / 2 + 0.01].forEach(gx => {
        const beamH = boxFast(0.06, 0.10, spanD * 0.56, timberCol, false);
        beamH.position.set(gx, pitchH * 0.44, 0);
        const kingPost = boxFast(0.06, pitchH * 0.52, 0.10, timberCol, false);
        kingPost.position.set(gx, pitchH * 0.70, 0);
        rg.add(beamH, kingPost);
      });

      // Front & Back Pitched Kawara Roof Slopes (瓦屋根斜面)
      [-1, 1].forEach(side => {
        const slopeGroup = new THREE.Group();
        slopeGroup.position.set(0, pitchH / 2, side * (halfSpan / 2));
        slopeGroup.rotation.x = side * slopeAngle;

        const slab = box(eaveW, 0.14, slopeLen + 0.12, tileCol, false);
        slab.material=homeRoofMaterial(tileCol,eaveW,slopeLen);
        slopeGroup.add(slab);

        // Stepped Kawara Tile Ribs (瓦の段差リブ)
        for (let r = -slopeLen * 0.42; r <= slopeLen * 0.42; r += 0.44) {
          const rib = boxFast(eaveW - 0.06, 0.04, 0.08, tileCol, false);
          rib.position.set(0, 0.08, r);
          slopeGroup.add(rib);
        }

        // Exposed Wooden Rafters under Eave (垂木)
        for (let rx = -eaveW * 0.44; rx <= eaveW * 0.44; rx += 0.65) {
          const rafter = boxFast(0.06, 0.06, slopeLen * 0.95, timberCol, false);
          rafter.position.set(rx, -0.09, 0);
          slopeGroup.add(rafter);
        }
        rg.add(slopeGroup);
      });

      // Heavy Japanese Ridge Beam (大棟) & Onigawara End Caps (鬼瓦)
      const mainRidge = box(eaveW + 0.12, 0.22, 0.24, 0x0f172a, false);
      mainRidge.position.set(0, pitchH + 0.08, 0);
      rg.add(mainRidge);

      [-eaveW / 2 - 0.06, eaveW / 2 + 0.06].forEach(ox => {
        const onigawara = box(0.14, 0.34, 0.32, 0x334155, false);
        onigawara.position.set(ox, pitchH + 0.14, 0);
        rg.add(onigawara);
      });

      if (!ridgeAlongX) {
        rg.rotation.y = Math.PI / 2;
      }
      return rg;
    }

    // 1st-Floor Overhanging Japanese Pent Roof (庇・霧除け屋根)
    function createHisashiEave(w, d, tileCol = 0x1e293b, timberCol = 0x3e1f0d) {
      const hg = new THREE.Group();
      const roof = box(w, 0.10, d, tileCol, false);
      roof.rotation.x = 0.18;
      const fascia = boxFast(w + 0.04, 0.08, 0.06, timberCol, false);
      fascia.position.set(0, -0.06, d / 2 - 0.02);
      hg.add(roof, fascia);
      for (let bx = -w * 0.42; bx <= w * 0.42; bx += Math.max(0.8, w * 0.28)) {
        const bracket = boxFast(0.06, 0.08, d * 0.9, timberCol, false);
        bracket.position.set(bx, -0.06, 0);
        hg.add(bracket);
      }
      return hg;
    }

    const residentialWindows=[];
    const residentialLightParts=[];
    const homeWindowMaterials=new Map();
    function homeWindowMaterial(tex,color=0xe8dbc5){const key=`${tex.uuid}_${color}`;if(!homeWindowMaterials.has(key))homeWindowMaterials.set(key,new THREE.MeshBasicMaterial({map:tex,color}));return homeWindowMaterials.get(key);}
    const homePalette={plaster:0xe7dcc4,trim:0x675545,roof:0x46776b,stone:0x878d89,wood:0x755541};
    const homeRoofMaterials=new Map();
    function homeRoofMaterial(color,w,d){
      const key=`${color}_${w.toFixed(2)}_${d.toFixed(2)}`;if(homeRoofMaterials.has(key))return homeRoofMaterials.get(key);
      const c=document.createElement('canvas');c.width=96;c.height=96;const ctx=c.getContext('2d');
      ctx.fillStyle=`#${color.toString(16).padStart(6,'0')}`;ctx.fillRect(0,0,96,96);
      const curve=ctx.createLinearGradient(0,0,96,0);curve.addColorStop(0,'rgba(10,22,22,.16)');curve.addColorStop(.18,'rgba(214,226,202,.10)');curve.addColorStop(.55,'rgba(10,22,22,.02)');curve.addColorStop(1,'rgba(10,22,22,.18)');ctx.fillStyle=curve;ctx.fillRect(0,0,96,96);
      ctx.fillStyle='rgba(10,20,22,.22)';ctx.fillRect(0,0,96,3);ctx.fillRect(0,91,96,5);ctx.fillRect(0,0,2,96);ctx.fillStyle='rgba(209,224,199,.14)';ctx.fillRect(0,6,96,2);
      const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.repeat.set(w/.29,d/.39);tex.anisotropy=renderer.capabilities.getMaxAnisotropy();
      const mat=new THREE.MeshToonMaterial({map:tex,gradientMap:celRamp});homeRoofMaterials.set(key,mat);return mat;
    }
    function homeBox(g,w,h,d,color,x,y,z,ink=false){
      const m=ink?box(w,h,d,color):new THREE.Mesh(new THREE.BoxGeometry(w,h,d),makeCelMat(color));
      m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;g.add(m);return m;
    }
    function homeRod(g,a,b,r,color){
      const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),diff=bv.clone().sub(av);
      const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,diff.length(),7),makeCelMat(color));
      m.position.copy(av).add(bv).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),diff.normalize());m.castShadow=true;g.add(m);return m;
    }
    function softWindowTexture(cool=false,shoji=false){
      const c=document.createElement('canvas');c.width=256;c.height=256;const ctx=c.getContext('2d');
      const glow=ctx.createRadialGradient(145,110,12,128,128,178);
      glow.addColorStop(0,cool?'#c9dedb':'#fff1cd');glow.addColorStop(.52,cool?'#a5c4cb':'#e7bd86');glow.addColorStop(1,cool?'#526c82':'#987558');ctx.fillStyle=glow;ctx.fillRect(0,0,256,256);
      if(shoji){ctx.fillStyle='#6d5a43';for(let i=0;i<256;i+=43)ctx.fillRect(i,0,3,256);for(let i=0;i<256;i+=51)ctx.fillRect(0,i,256,3);}
      else{
        // Pleated curtains, a ceiling pendant and quiet silhouettes behind the glazing.
        for(const side of [0,1]){ctx.fillStyle=side?'#e5c7a2':'#cfb497';ctx.beginPath();ctx.moveTo(side?202:0,0);ctx.lineTo(side?256:54,0);ctx.quadraticCurveTo(side?221:25,120,side?205:50,256);ctx.lineTo(side?256:0,256);ctx.closePath();ctx.fill();
          for(let i=0;i<5;i++){ctx.strokeStyle='rgba(92,69,53,.18)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(side?212+i*9:i*9,0);ctx.lineTo(side?208+i*10:8+i*9,256);ctx.stroke();}}
        ctx.fillStyle=cool?'#52616a':'#8f755d';ctx.fillRect(70,204,110,9);ctx.fillRect(83,210,5,46);ctx.fillRect(164,210,5,46);
        ctx.fillRect(138,0,2,40);ctx.fillStyle='#fff2c9';ctx.beginPath();ctx.ellipse(139,43,20,8,0,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#7f8b6b';ctx.beginPath();ctx.ellipse(192,177,8,18,-.4,0,Math.PI*2);ctx.fill();ctx.fillStyle='#9b7861';ctx.fillRect(185,188,15,17);
      }
      const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;return tex;
    }
    const homeWarmTex=softWindowTexture(),homeCoolTex=softWindowTexture(true),homeShojiTex=softWindowTexture(false,true);
    function createFramedWindow(w,h,tex,frameCol=0x584a3a,hasTobukuro=false,hasLattice=false){
      const wg=new THREE.Group();
      homeBox(wg,w+.14,h+.14,.15,frameCol,0,0,-.015);
      const isDark=tex===winTexDarkSash;
      const t=isDark?tex:tex===winTexCoolSash?homeCoolTex:(tex===winTexShoji||hasLattice)?homeShojiTex:homeWarmTex;
      const pane=new THREE.Mesh(new THREE.PlaneGeometry(w,h),homeWindowMaterial(t,isDark?0x80909e:0xe8dbc5));pane.position.z=.066;wg.add(pane);
      homeBox(wg,.035,h,.065,frameCol,0,0,.105);
      homeBox(wg,w,.035,.065,frameCol,0,-h*.18,.105);
      homeBox(wg,w+.25,.07,.25,0xa0937c,0,-h/2-.06,.04);
      homeBox(wg,w+.22,.045,.22,frameCol,0,h/2+.055,.025);
      if(hasTobukuro){homeBox(wg,.30,h+.12,.16,0x59534a,w/2+.22,0,0);for(let y=-h*.4;y<h*.45;y+=.12)homeBox(wg,.29,.012,.018,0x777061,w/2+.22,y,.09);}
      if(hasLattice){for(let x=-w*.43;x<w*.46;x+=.17)homeBox(wg,.022,h,.035,frameCol,x,0,.17);homeBox(wg,w,.032,.04,frameCol,0,h*.25,.17);}
      residentialWindows.push({mesh:wg,w,h,dark:isDark,cool:tex===winTexCoolSash,pane});
      return wg;
    }
    function homeWindow(g,w,h,x,y,z,rotation=0,kind='warm',lit=true){
      const tex=!lit?winTexDarkSash:kind==='shoji'?winTexShoji:kind==='cool'?winTexCoolSash:winTexWarmSash;
      const m=createFramedWindow(w,h,tex,0x635541,false,kind==='shoji');m.position.set(x,y,z);m.rotation.y=rotation;g.add(m);return m;
    }
    function homePlanter(g,x,y,z,color=0x9a7159,flowers=false){
      const p=new THREE.Mesh(new THREE.CylinderGeometry(.17,.12,.24,9),makeCelMat(color));p.position.set(x,y+.12,z);g.add(p);
      for(let i=0;i<6;i++){const a=i*2.399;const leaf=new THREE.Mesh(new THREE.IcosahedronGeometry(.12,0),makeCelMat(i%2?0x71966d:0x547b5d));leaf.position.set(x+Math.cos(a)*.11,y+.31+(i%2)*.08,z+Math.sin(a)*.11);leaf.scale.y=1.5;g.add(leaf);
        if(flowers&&i%2){const flower=new THREE.Mesh(new THREE.IcosahedronGeometry(.067,0),makeCelMat(i%3?0xe3b4a2:0xe6d9b0));flower.position.copy(leaf.position);flower.position.y+=.13;g.add(flower);}}
    }
    function homeLamp(g,x,y,z){
      homeBox(g,.18,.28,.18,0x394844,x,y,z);
      const pane=new THREE.Mesh(new THREE.BoxGeometry(.13,.18,.20),new THREE.MeshBasicMaterial({color:0xffe2aa}));pane.position.set(x,y,z+.015);g.add(pane);
      const glowCanvas=document.createElement('canvas');glowCanvas.width=64;glowCanvas.height=64;const ctx=glowCanvas.getContext('2d'),grad=ctx.createRadialGradient(32,32,0,32,32,32);grad.addColorStop(0,'rgba(255,218,157,.50)');grad.addColorStop(.18,'rgba(255,197,115,.20)');grad.addColorStop(1,'rgba(255,176,91,0)');ctx.fillStyle=grad;ctx.fillRect(0,0,64,64);
      const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(glowCanvas),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));glow.position.set(x,y,z+.12);glow.scale.set(.85,.85,1);g.add(glow);
      residentialLightParts.push({sprite:glow,base:.80});
    }

    // Exterior AC Compressor Unit (室外機)
    function createACUnit() {
      const ac = new THREE.Group();
      const body = box(0.66, 0.48, 0.28, 0xe2e8f0, false);
      body.position.y = 0.24;
      const fan = cylFast(0.17, 0.17, 0.04, 10, 0x1e293b, false);
      fan.rotation.x = Math.PI / 2;
      fan.position.set(-0.08, 0.25, 0.14);
      ac.add(body, fan);
      return ac;
    }

    // ---------------------------------------------------------
    // BUILDING 1 (West of Konbini, X: -13.6, Z: -2.3): 老舗甘味処・和菓子「星影茶屋」 (2-Story Kyoto/Edo Machiya Teahouse)
    // ---------------------------------------------------------
    {
      const machiya = new THREE.Group();
      machiya.position.set(-13.6, 0.22, -2.3);
      neighborhoodGroup.add(machiya);

      const timberCol = 0x2c1609;
      const plasterCol = 0xfaf5e8;
      const tileCol = 0x1e293b;

      // 1st Floor Machiya Timber & Plaster Body
      const f1 = box(6.4, 2.55, 4.8, plasterCol, false);
      f1.position.y = 1.275;
      machiya.add(f1);

      // Exposed Traditional Timber Posts (柱) & Horizontal Nuki Beams (貫)
      [-3.16, -1.1, 1.1, 3.16].forEach(px => {
        const post = boxFast(0.14, 2.56, 0.16, timberCol, false);
        post.position.set(px, 1.28, 2.38);
        machiya.add(post);
      });
      [0.12, 1.98, 2.48].forEach(by => {
        const beam = boxFast(6.46, 0.11, 0.14, timberCol, false);
        beam.position.set(0, by, 2.38);
        machiya.add(beam);
      });

      // Lower Charred Cedar Wainscoting (腰壁・焼杉)
      const wainscot = box(6.44, 0.72, 0.10, 0x1f140e, false);
      wainscot.position.set(0, 0.36, 2.38);
      machiya.add(wainscot);

      // 1st-Floor Left: Warm-Lit Wagashi Display Window & Senbon-goshi Lattice
      const wagashiWin = createFramedWindow(1.85, 1.18, winTexMachiya, timberCol, false, true);
      wagashiWin.position.set(-2.05, 1.32, 2.40);
      const rightWin = createFramedWindow(1.65, 1.18, winTexShoji, timberCol, false, true);
      rightWin.position.set(2.10, 1.32, 2.40);
      machiya.add(wagashiWin, rightWin);

      // Center Sliding Lattice Entrance Door (千本格子引き戸) + 4-Panel Indigo Noren Curtain (暖簾)
      const doorRecess = box(1.75, 2.05, 0.16, timberCol, false);
      doorRecess.position.set(0.0, 1.025, 2.34);
      const doorGlow = new THREE.Mesh(
        new THREE.PlaneGeometry(1.52, 1.88),
        new THREE.MeshBasicMaterial({ map: winTexMachiya })
      );
      doorGlow.position.set(0.0, 1.025, 2.43);
      doorGlow.material=homeWindowMaterial(homeWarmTex);
      machiya.add(doorRecess, doorGlow);
      residentialWindows.push({mesh:doorGlow,w:1.52,h:1.88,pane:doorGlow});

      // 4-Panel Japanese Noren Curtain ("星 影 茶 屋")
      const norenMat = new THREE.MeshBasicMaterial({
        map: createNorenTexture(['星', '影', '茶', '屋'], '#1e3a8a', '#fef9c3'),
        transparent: true,
        side: THREE.DoubleSide
      });
      const norenMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.95, 0.68), norenMat);
      norenMesh.position.set(0.0, 1.82, 2.68);
      norenMesh.rotation.x = -0.08;
      machiya.add(norenMesh);

      // Overhanging 1st-Floor Hisashi Tiled Roof (一階庇屋根)
      const hisashi = createHisashiEave(6.75, 1.15, tileCol, timberCol);
      hisashi.position.set(0, 2.38, 2.82);
      machiya.add(hisashi);

      // Two Glowing Red Chochin Paper Lanterns (赤提灯) under Hisashi Eave
      [-1.08, 1.08].forEach(lx => {
        const chochin = cyl(0.18, 0.18, 0.42, 10, 0xef4444, true);
        chochin.position.set(lx, 2.02, 3.12);
        const capT = cylFast(0.11, 0.11, 0.05, 8, 0x0f172a, false);
        capT.position.set(lx, 2.24, 3.12);
        const capB = capT.clone();
        capB.position.y = 1.80;
        machiya.add(chochin, capT, capB);
      });

      // Traditional Red-Cloth Tea Bench (床几) & Floor Andon Lantern (行灯) outside
      const benchTop = box(1.75, 0.08, 0.52, 0xdc2626, false);
      benchTop.position.set(-2.1, 0.42, 3.05);
      const benchLeg1 = boxFast(0.10, 0.40, 0.46, 0x1f140e, false);
      benchLeg1.position.set(-2.8, 0.20, 3.05);
      const benchLeg2 = benchLeg1.clone();
      benchLeg2.position.x = -1.4;
      machiya.add(benchTop, benchLeg1, benchLeg2);

      const andonFrame = box(0.38, 0.72, 0.38, timberCol, false);
      andonFrame.position.set(1.38, 0.36, 3.02);
      const andonGlow = boxFast(0.30, 0.54, 0.30, 0xfef08a, true);
      andonGlow.position.set(1.38, 0.38, 3.02);
      const andonRoof = box(0.48, 0.08, 0.48, tileCol, false);
      andonRoof.position.set(1.38, 0.75, 3.02);
      machiya.add(andonFrame, andonGlow, andonRoof);

      // 2nd Floor Recessed Machiya Upper Story (二階・虫籠窓＆障子 + 木造高欄)
      const f2 = box(6.0, 2.05, 4.1, plasterCol, false);
      f2.position.set(0, 3.56, -0.18);
      machiya.add(f2);

      [-2.85, 0.0, 2.85].forEach(px => {
        const post2 = boxFast(0.12, 2.05, 0.14, timberCol, false);
        post2.position.set(px, 3.56, 1.86);
        machiya.add(post2);
      });

      [-1.55, 1.55].forEach(wx => {
        const w2 = createFramedWindow(1.85, 1.25, winTexShoji, timberCol, true, false);
        w2.position.set(wx, 3.52, 1.86);
        machiya.add(w2);
      });

      // 2nd Floor Wooden Veranda Balustrade (木製高欄・手摺)
      const railDeck = box(6.1, 0.10, 0.56, timberCol, false);
      railDeck.position.set(0, 2.62, 2.08);
      const railTop = box(6.1, 0.08, 0.08, timberCol, false);
      railTop.position.set(0, 3.18, 2.32);
      machiya.add(railDeck, railTop);
      for (let rx = -2.85; rx <= 2.85; rx += 0.38) {
        const bal = boxFast(0.04, 0.52, 0.04, timberCol, false);
        bal.position.set(rx, 2.90, 2.32);
        machiya.add(bal);
      }

      // Traditional Wooden Kanban Signboard above Hisashi
      const kanban = makeFrontBackBox(
        3.2, 0.54, 0.14,
        createGraphicSign(512, 96, '#2c1609', '#f59e0b', '甘味・和菓子 星影茶屋', 'HOSHIKAGE MACHIYA TEAHOUSE'),
        timberCol,
        true
      );
      kanban.position.set(0, 2.92, 2.48);
      machiya.add(kanban);

      // Sweeping Kirizuma Kawara Roof on Top
      const mRoof = createKirizumaRoof({ w: 6.2, d: 4.3, pitchH: 1.38, tileCol, timberCol, wallCol: plasterCol, ridgeAlongX: true });
      mRoof.position.set(0, 4.58, -0.18);
      machiya.add(mRoof);
    }

    // ---------------------------------------------------------
    // A second garden-house type: timber engawa, shoji rooms and a planted stone court.
    const gardenHouse=new THREE.Group();gardenHouse.position.set(-14.3,.22,-12.1);gardenHouse.rotation.y=Math.PI/2;gardenHouse.name='木造縁側庭院';neighborhoodGroup.add(gardenHouse);
    {
      const g=gardenHouse;
      homeBox(g,6.7,.12,7.15,0x8a8a76,0,.06,-.35);
      homeBox(g,6.1,.30,3.65,0x8a8b7f,0,.24,-1.48);
      homeBox(g,5.98,2.23,3.57,0xd5c5a6,0,1.49,-1.48,true);
      homeBox(g,3.70,1.85,3.35,0xe5d6b6,-.65,3.54,-1.51,true);
      const upper=createKirizumaRoof({w:3.9,d:3.6,pitchH:1.0,tileCol:0x5c6970,timberCol:0x65513c,wallCol:0xe5d6b6});upper.position.set(-.65,4.48,-1.52);g.add(upper);
      const eave=createHisashiEave(6.42,1.17,0x5b6b6c,0x65513c);eave.position.set(0,2.60,.73);g.add(eave);
      homeBox(g,4.35,.14,1.03,0x806342,-.58,.40,.77);
      for(let x=-2.68;x<1.67;x+=.14)homeBox(g,.012,.015,.97,0xa58b62,x,.48,.78);
      homeBox(g,2.0,.14,.39,0x928c7b,-.60,.21,1.49);
      for(const x of [-1.85,.0])homeWindow(g,1.68,1.66,x,1.46,.33,0,'shoji');
      homeWindow(g,1.08,1.86,2.22,1.37,.34,0,'shoji');
      homeWindow(g,1.34,1.00,-1.65,3.52,.20,0,'warm');homeWindow(g,1.34,1.0,.34,3.52,.20,0,'shoji');
      for(const side of [-1,1]){homeWindow(g,1.12,1.08,side*3.01,1.55,-1.65,side*Math.PI/2,'shoji');homeRod(g,[side*2.91,.30,-3.25],[side*2.91,2.59,-3.25],.035,0x627070);}
      for(const x of [-2.95,-.96,.96,2.95])homeBox(g,.10,2.26,.12,0x65513c,x,1.47,.34);
      for(const y of [.48,2.58])homeBox(g,6.12,.09,.12,0x65513c,0,y,.34);
      for(let y=.52;y<1.06;y+=.10)homeBox(g,6.06,.025,.04,0x927756,0,y,.39);
      homeBox(g,4.24,.58,.14,0x9e9c87,-1.11,.42,3.04);homeBox(g,.80,.58,.14,0x9e9c87,2.83,.42,3.04);
      for(let x=-3.15;x<3.19;x+=.26){if(x>1.0&&x<2.4)continue;homeBox(g,.10,.28,.095,0x84795d,x,.85,3.04);}
      homeBox(g,4.30,.075,.23,0x666e62,-1.11,.75,3.04);homeBox(g,.84,.075,.23,0x666e62,2.83,.75,3.04);
      // Gate on the near-right corner, instead of a solid wall hiding the garden.
      for(let x=1.12;x<2.40;x+=.16)homeBox(g,.08,1.00,.075,0x75624b,x,.66,3.04);
      homeBox(g,1.29,.075,.08,0x75624b,1.72,.40,3.04);homeBox(g,1.29,.075,.08,0x75624b,1.72,1.10,3.04);
      for(const x of [1.01,2.43])homeBox(g,.18,1.21,.23,0x6d5b42,x,.73,3.07);
      homeBox(g,1.66,.10,.47,0x5b6b6c,1.72,1.40,3.07);homeLamp(g,2.43,1.55,3.08);
      for(let i=0;i<4;i++)homeBox(g,.55,.05,.40,0xb0aa94,1.65-i*.33,.165,2.65-i*.33);
      for(let i=0;i<20;i++){const a=i*2.399,r=.18+(i%4)*.10;const stone=new THREE.Mesh(new THREE.IcosahedronGeometry(.13,0),makeCelMat(i%2?0x8b8f81:0xb0ae9c));stone.position.set(-1.43+Math.cos(a)*r,.21,2.22+Math.sin(a)*r*.65);stone.scale.y=.42;g.add(stone);}
      const basin=new THREE.Mesh(new THREE.CylinderGeometry(.28,.22,.25,12),makeCelMat(0x8c9486));basin.position.set(-1.44,.28,2.22);g.add(basin);
      const water=new THREE.Mesh(new THREE.CircleGeometry(.23,16),new THREE.MeshBasicMaterial({color:0x657e7c}));water.rotation.x=-Math.PI/2;water.position.set(-1.44,.415,2.22);g.add(water);
      homeRod(g,[-1.65,.25,2.18],[-1.65,.88,2.18],.025,0x94865b);homeRod(g,[-1.65,.82,2.18],[-1.40,.74,2.18],.023,0x94865b);
      for(let i=0;i<13;i++){const a=i*2.399;const bush=new THREE.Mesh(new THREE.IcosahedronGeometry(.22+(i%3)*.03,1),makeCelMat(i%2?0x5d7856:0x71835b));bush.position.set(-2.49+Math.cos(a)*.24,.38+(i%3)*.12,1.93+Math.sin(a)*.35);g.add(bush);}
      homePlanter(g,.72,.15,1.28,0xa57b5b,true);homePlanter(g,2.71,.15,1.60);
      homeLamp(g,2.78,2.04,.48);
    }


    // BUILDING 3 (North-West behind Sakura Park, X: -4.4, Z: -19.8): コーポ桜町 (Classic 2-Story Anime "Mokuzō Apāto" with External Steel Staircase, Doors, Gas Meters & Pitched Roof)
    // ---------------------------------------------------------
    {
      const apato = new THREE.Group();
      apato.position.set(-4.4, 0.22, -19.8);
      neighborhoodGroup.add(apato);

      const apWallCol = 0xf1f5f9;
      const apRoofCol = 0x0f4c81; // Classic anime blue-slate tiled roof
      const steelCol = 0x334155;

      // 2-Story Apartment Main Body (Width 8.4, Height 5.1, Depth 4.2)
      const body = box(8.4, 5.1, 4.2, apWallCol, false);
      body.position.y = 2.55;
      apato.add(body);

      // Pitched Kirizuma Roof on top of the Apato (切妻屋根)
      const apRoof = createKirizumaRoof({ w: 8.6, d: 4.4, pitchH: 1.25, tileCol: apRoofCol, timberCol: steelCol, wallCol: apWallCol, ridgeAlongX: true });
      apRoof.position.set(0, 5.10, 0);
      apato.add(apRoof);

      // Apartment Name Signboard ("コーポ桜町")
      const apSign = makeFrontBackBox(
        2.65, 0.46, 0.14,
        createGraphicSign(384, 96, '#0284c7', '#ffffff', 'コーポ桜町', 'CORP SAKURA-CHO'),
        0x0284c7,
        true
      );
      apSign.position.set(-2.6, 4.55, 2.18);
      apato.add(apSign);

      // Open 2nd-Floor Walkway Corridor (共用廊下) + Steel Support Pillars
      const walkway = box(8.4, 0.14, 0.92, 0x64748b, false);
      walkway.position.set(0, 2.52, 2.54);
      const railTop = box(8.4, 0.07, 0.07, steelCol, false);
      railTop.position.set(0, 3.38, 2.96);
      const railBot = box(8.4, 0.18, 0.08, 0x475569, false);
      railBot.position.set(0, 2.68, 2.96);
      apato.add(walkway, railTop, railBot);

      for (let bx = -4.0; bx <= 4.0; bx += 0.32) {
        const bar = boxFast(0.03, 0.72, 0.03, steelCol, false);
        bar.position.set(bx, 3.02, 2.96);
        apato.add(bar);
      }
      [-3.9, -1.3, 1.3, 3.9].forEach(px => {
        const col = box(0.12, 2.52, 0.12, steelCol, false);
        col.position.set(px, 1.26, 2.92);
        apato.add(col);
      });

      // External Steel Staircase on the Left Side (鉄骨外階段)
      const stairGroup = new THREE.Group();
      stairGroup.position.set(-4.65, 0, 2.54);
      const landing = box(0.95, 0.12, 0.92, 0x64748b, false);
      landing.position.set(0, 2.52, 0);
      const stringer = box(0.12, 3.25, 0.18, steelCol, false);
      stringer.rotation.x = -0.66;
      stringer.position.set(0, 1.28, 1.05);
      const handrail = boxFast(0.06, 3.25, 0.06, steelCol, false);
      handrail.rotation.x = -0.66;
      handrail.position.set(-0.38, 1.92, 1.05);
      stairGroup.add(landing, stringer, handrail);
      for (let s = 0; s < 8; s++) {
        const step = boxFast(0.78, 0.05, 0.24, 0x94a3b8, false);
        step.position.set(0, 0.28 + s * 0.28, 1.95 - s * 0.24);
        stairGroup.add(step);
      }
      apato.add(stairGroup);

      // 6 Apartment Units across 2 Floors (3 units per floor: Doors + Gas Meters + Windows + Corridor Lamps)
      for (let fl = 0; fl < 2; fl++) {
        const fy = fl * 2.52;
        [-2.7, 0.0, 2.7].forEach((ux, uIdx) => {
          // Unit Entrance Door (アパート玄関ドア)
          const doorCol = (fl + uIdx) % 2 === 0 ? 0x0f766e : 0xb45309;
          const door = box(0.76, 1.82, 0.08, doorCol, false);
          door.position.set(ux - 0.72, fy + 0.94, 2.12);
          // Frosted Glass Transom on Door
          const doorWin = new THREE.Mesh(
            new THREE.PlaneGeometry(0.42, 0.45),
            new THREE.MeshBasicMaterial({ color: 0xfef08a })
          );
          doorWin.position.set(0, 0.42, 0.05);
          door.add(doorWin);
          apato.add(door);

          // Wall-Mounted Gas Meter (ガスメーター) & Pipe next to Door
          const gasMeter = boxFast(0.18, 0.24, 0.12, 0x94a3b8, false);
          gasMeter.position.set(ux - 0.18, fy + 1.35, 2.15);
          apato.add(gasMeter);

          // Main Apartment Window (1 dark, 1 cool TV/monitor glow, 4 warm cozy glow)
          let wTex = winTexWarmSash;
          if (fl === 1 && uIdx === 1) wTex = winTexCoolSash;
          if (fl === 0 && uIdx === 2) wTex = winTexDarkSash;
          const unitWin = createFramedWindow(1.18, 1.02, wTex, 0x1e293b, false, true);
          unitWin.position.set(ux + 0.48, fy + 1.25, 2.12);
          apato.add(unitWin);

          // Glowing Corridor Ceiling Light Orb (共用廊下灯)
          const orb = new THREE.Mesh(
            new THREE.SphereGeometry(0.09, 8, 8),
            new THREE.MeshBasicMaterial({ color: 0xfef9c3 })
          );
          orb.position.set(ux - 0.72, fy + 2.12, 2.22);
          homeLamp(apato,ux - 0.72, fy + 2.12, 2.22);
        });
      }
    }

    // ---------------------------------------------------------
    // BUILDING 4 (North-East behind Sakura Park, X: +4.8, Z: -19.6): 青葉邸 (Modern Tokyo Architectural "Katanagare" House with Cedar Louvers & Carport)
    // ---------------------------------------------------------
    {
      const modern = new THREE.Group();
      modern.position.set(4.8, 0.22, -19.6);
      neighborhoodGroup.add(modern);

      const slateDark = 0x1e293b;
      const cedarWarm = 0xb45309;
      const whiteStucco = 0xf8fafc;

      // Left Main 2-Story Volume (Charcoal Slate & Cedar Wood)
      const leftVol = box(3.8, 5.0, 4.4, slateDark, false);
      leftVol.position.set(-1.1, 2.5, 0);
      // Right Recessed 2nd-Floor Volume over Carport
      const rightVol2 = box(2.8, 2.5, 4.2, whiteStucco, false);
      rightVol2.position.set(1.9, 3.55, 0);
      modern.add(leftVol, rightVol2);

      // Ground-Floor Carport Pillars & Parked White Compact Car inside Carport
      const cpPillar = box(0.22, 2.3, 4.2, slateDark, false);
      cpPillar.position.set(3.2, 1.15, 0);
      modern.add(cpPillar);

      // Asymmetric Butterfly / Shed Roofs (段違い片流れ屋根) with Cedar Wood Soffit
      const shedRoofLeft = box(4.3, 0.18, 5.0, 0x0f172a, false);
      shedRoofLeft.position.set(-1.1, 5.28, 0);
      shedRoofLeft.rotation.z = 0.16;
      const shedSoffitL = boxFast(4.1, 0.05, 4.8, cedarWarm, false);
      shedSoffitL.position.set(-1.1, 5.18, 0);
      shedSoffitL.rotation.z = 0.16;

      const shedRoofRight = box(3.3, 0.16, 4.8, 0x0f172a, false);
      shedRoofRight.position.set(1.9, 4.88, 0);
      shedRoofRight.rotation.z = -0.14;
      modern.add(shedRoofLeft, shedSoffitL, shedRoofRight);

      // Floor-to-Ceiling Vertical Cedar Louver Privacy Screen (木製縦ルーバー格子) with Warm Interior Glow behind it
      const backGlowPane = new THREE.Mesh(
        new THREE.PlaneGeometry(1.55, 4.1),
        new THREE.MeshBasicMaterial({ color: 0xfde047 })
      );
      backGlowPane.position.set(-2.0, 2.45, 2.22);
      backGlowPane.material=homeWindowMaterial(homeWarmTex);
      modern.add(backGlowPane);
      for(const y of [1.40,3.75]){const emitter=new THREE.Object3D();emitter.position.set(-2.0,y,2.23);modern.add(emitter);residentialWindows.push({mesh:emitter,w:1.55,h:1.45,pane:backGlowPane});}
      for (let lx = -2.75; lx <= -1.20; lx += 0.14) {
        const louver = boxFast(0.04, 4.25, 0.14, cedarWarm, false);
        louver.position.set(lx, 2.45, 2.28);
        modern.add(louver);
      }

      // Large Modern Panoramic Windows & Cantilevered Glass Balcony
      const modWin1 = createFramedWindow(1.55, 1.25, winTexWarmSash, 0x0f172a, false, false);
      modWin1.position.set(-0.05, 1.35, 2.22);
      const modWin2 = createFramedWindow(1.55, 1.25, winTexWarmSash, 0x0f172a, false, false);
      modWin2.position.set(-0.05, 3.65, 2.22);
      const modWin3 = createFramedWindow(1.85, 1.32, winTexCoolSash, 0x0f172a, false, false);
      modWin3.position.set(1.85, 3.65, 2.12);
      modern.add(modWin1, modWin2, modWin3);

      // Parked White Coupe inside the Right Carport
      const parkedCar = box(1.32, 0.78, 2.65, 0xe2e8f0, false);
      parkedCar.position.set(1.85, 0.48, 0.35);
      const parkedCabin = box(1.16, 0.52, 1.45, 0x38bdf8, true);
      parkedCabin.position.set(1.85, 0.98, 0.20);
      modern.add(parkedCar, parkedCabin);
    }

    // ---------------------------------------------------------
    // A Showa suburban family house: two unequal gables, a bay window and an enclosed garden.
    const courtyardHouse=new THREE.Group();courtyardHouse.position.set(15.45,.22,-2.25);courtyardHouse.name='昭和绿瓦小院';neighborhoodGroup.add(courtyardHouse);
    {
      const g=courtyardHouse,p=homePalette;
      homeBox(g,5.95,.11,8.1,0x8b8d7d,0,.055,-.25);
      homeBox(g,5.60,.055,3.05,0x677f59,0,.14,2.15);
      // Raised foundation, recessed upper story, and a low genkan wing.
      homeBox(g,5.18,.35,4.0,0x94938a,0,.24,-1.55,true);
      homeBox(g,5.10,2.22,3.94,p.plaster,0,1.51,-1.55,true);
      homeBox(g,3.42,2.12,3.78,0xece2cc,-.79,3.62,-1.63,true);
      homeBox(g,5.18,.13,4.05,p.trim,0,2.57,-1.55);
      const upperRoof=createKirizumaRoof({w:3.50,d:3.85,pitchH:1.02,tileCol:p.roof,timberCol:p.trim,wallCol:0xece2cc,ridgeAlongX:false});upperRoof.position.set(-.79,4.69,-1.63);g.add(upperRoof);
      const lowerRoof=createKirizumaRoof({w:1.65,d:3.92,pitchH:.59,tileCol:0x527c6a,timberCol:p.trim,wallCol:p.plaster,ridgeAlongX:false});lowerRoof.position.set(1.75,2.64,-1.57);g.add(lowerRoof);
      // Bay projects into the garden, with three pieces of glass and a shallow green cap.
      homeBox(g,2.44,1.42,.42,0x7e6e57,-1.05,1.56,.60);
      homeWindow(g,2.22,1.20,-1.05,1.58,.823);
      const bayCap=createHisashiEave(2.75,.71,0x4f7968,p.trim);bayCap.position.set(-1.05,2.36,.64);g.add(bayCap);
      homeBox(g,2.55,.095,.63,p.trim,-1.05,.83,.67);
      homeWindow(g,2.07,1.22,-.80,3.64,.285);
      homeWindow(g,1.12,1.05,2.575,1.59,-1.22,Math.PI/2);
      homeWindow(g,1.37,1.17,.945,3.60,-1.34,Math.PI/2,'cool');
      homeWindow(g,1.30,1.02,-2.565,1.62,-1.95,-Math.PI/2,'warm',false);
      homeWindow(g,1.22,1.05,-.76,3.59,-3.545,Math.PI,'warm',false);
      homeWindow(g,1.14,1.04,1.72,1.57,-3.535,Math.PI,'shoji');
      // Solid timber entry, transom, door furniture and a tiny umbrella shelf.
      homeBox(g,.91,1.99,.13,0x6b4b37,1.70,1.37,.48,true);
      for(let i=0;i<6;i++)homeBox(g,.021,1.77,.018,0x936c49,1.34+i*.143,1.34,.555);
      homeWindow(g,.72,.35,1.70,2.30,.56,0,'shoji');
      homeBox(g,.035,.23,.04,0xc1b291,1.99,1.35,.586);
      homeBox(g,1.35,.18,.83,0xa5a193,1.67,.23,.91);
      homeBox(g,1.64,.12,.68,0xb4ad98,1.66,.115,1.29);
      const entryEave=createHisashiEave(1.63,1.04,p.roof,p.trim);entryEave.position.set(1.67,2.60,.81);g.add(entryEave);
      homeLamp(g,2.27,2.03,.60);
      const nameplate=makeFrontBackBox(.25,.48,.03,createGraphicSign(120,200,'#ede4cf','#4c5145','青山','3-12'),0x86755d);nameplate.position.set(2.30,1.49,.60);g.add(nameplate);
      // Garden walls have a low concrete foot and individual timber fence boards.
      for(const side of [-1,1]){
        homeBox(g,.13,.48,3.25,0x9c9c91,side*2.84,.36,2.04);
        for(let z=.48;z<3.68;z+=.19)homeBox(g,.075,.46,.10,0x8b7962,side*2.84,.81,z);
        homeRod(g,[side*2.84,1.06,.45],[side*2.84,1.06,3.69],.038,0x665d4f);
      }
      for(const [x,w] of [[-1.75,2.17],[2.18,1.25]]){
        homeBox(g,w,.48,.14,0x9b9b8f,x,.36,3.72);
        for(let xx=x-w/2+.07;xx<x+w/2;xx+=.18)homeBox(g,.10,.43,.075,0x8b7962,xx,.80,3.72);
        homeBox(g,w,.07,.13,0x665d4f,x,1.03,3.72);
      }
      for(const x of [-.53,1.48]){homeBox(g,.27,1.12,.30,0xa6a395,x,.66,3.72);homeBox(g,.34,.09,.37,0x6f7b70,x,1.265,3.72);}
      // Gate is partly open, leaving the stepping-stone route readable from the street.
      const gate=new THREE.Group();gate.position.set(-.39,0,3.72);gate.rotation.y=-.26;g.add(gate);
      for(let x=0;x<1.68;x+=.18)homeBox(gate,.10,.80,.075,0x6b6151,x,.66,0);
      homeBox(gate,1.64,.08,.075,0x6b6151,.78,.36,0);homeBox(gate,1.64,.08,.075,0x6b6151,.78,1.00,0);
      homeLamp(g,1.48,1.36,3.72);
      homeBox(g,.27,.31,.11,0x8b4d3e,1.48,.92,3.91);homeBox(g,.20,.024,.02,0x393d37,1.48,1.00,3.98);
      const address=makeFrontBackBox(.20,.33,.012,createGraphicSign(100,180,'#efe7d4','#52564a','青山','3-12'),0x77786b);address.position.set(-.53,.86,3.89);g.add(address);
      for(let i=0;i<5;i++)homeBox(g,.66,.045,.43,i%2?0xb1aa98:0xa09d8d,.5+i*.14,.204,3.35-i*.47);
      // Low shrubs, a clipped garden tree, stepping stones, flower pots, hose and watering can.
      for(let i=0;i<7;i++){const bush=new THREE.Mesh(new THREE.IcosahedronGeometry(.23,1),makeCelMat(i%2?0x607f51:0x748b5a));bush.position.set(-2.42+i*.39,.40,3.17);bush.scale.set(1,.75,.90);g.add(bush);}
      homeRod(g,[-1.68,.20,1.99],[-1.59,1.53,1.90],.075,0x69513b);
      for(let i=0;i<17;i++){let a=i*2.399;const leaf=new THREE.Mesh(new THREE.IcosahedronGeometry(.22+(i%3)*.035,1),makeCelMat(i%2?0x718759:0x5a784f));leaf.position.set(-1.59+Math.cos(a)*.38,1.30+(i%4)*.16,1.90+Math.sin(a)*.32);leaf.scale.y=.8;g.add(leaf);}
      homePlanter(g,2.23,.18,1.42,0x9c7256,true);homePlanter(g,2.31,.18,2.09,0x8c755c,true);homePlanter(g,-2.17,.18,1.19);
      const hose=new THREE.Mesh(new THREE.TorusGeometry(.21,.022,6,24,Math.PI*1.85),makeCelMat(0x6d8a71));hose.rotation.y=Math.PI/2;hose.position.set(2.66,.55,-.05);g.add(hose);
      const can=new THREE.Mesh(new THREE.CylinderGeometry(.13,.14,.25,9),makeCelMat(0x668d83));can.position.set(2.30,.29,.49);g.add(can);homeRod(g,[2.30,.37,.49],[2.10,.48,.58],.035,0x668d83);
      // Upper balcony, laundry, side cladding, drains and visible service details.
      homeBox(g,2.57,.10,.54,0x898c83,-.80,2.98,.57);
      for(let i=0;i<13;i++)homeBox(g,.026,.57,.032,0x69756e,-1.96+i*.19,3.30,.83);
      homeRod(g,[-2.02,3.60,.83],[.42,3.60,.83],.024,0x69756e);
      homeRod(g,[-1.77,4.31,.54],[.17,4.31,.54],.014,0xa4aaa0);
      for(let i=0;i<3;i++){const cloth=homeBox(g,.32,.43,.023,[0xdbd4b8,0xa6b8b9,0xc2b0a5][i],-1.51+i*.50,4.05,.54);cloth.rotation.z=(i-1)*.06;}
      for(const x of [-2.53,2.53]){homeRod(g,[x,.22,-3.49],[x,2.59,-3.49],.035,0x74796e);homeBox(g,.13,.055,4.10,0x74796e,x,2.57,-1.55);}
      for(let y=.55;y<2.5;y+=.22)homeBox(g,.028,.018,3.84,0xc3b79c,2.565,y,-1.55);
      const ac=createACUnit();ac.position.set(2.64,.23,-2.65);ac.rotation.y=Math.PI/2;g.add(ac);
    }



    // BUILDING 5 (East Across Side Street, X: +15.4, Z: -12.8): 桜町古書店「文鳥堂」 (Retro Showa-Era 2-Story Corner Bookstore)
    // ---------------------------------------------------------
    {
      const bookstore = new THREE.Group();
      bookstore.position.set(15.4, 0.22, -12.8);
      bookstore.rotation.y = -Math.PI / 2; // Faces West toward Konbini & Side Street
      neighborhoodGroup.add(bookstore);

      const copperRoof = 0x0f766e; // Patina green copper roof & Kanban-kenchiku facade
      const warmWood = 0x5c2d16;

      const f1 = box(5.8, 2.65, 4.5, 0xfffbeb, false);
      f1.position.y = 1.325;
      const f2 = box(5.6, 2.25, 4.2, 0xfef3c7, false);
      f2.position.set(0, 3.775, -0.1);
      bookstore.add(f1, f2);

      // Stepped Showa Kanban-Kenchiku Copper Parapet & Kirizuma Tiled Roof behind it
      const copperParapet = box(5.75, 0.85, 0.22, copperRoof, false);
      copperParapet.position.set(0, 5.15, 1.95);
      const bRoof = createKirizumaRoof({ w: 5.7, d: 4.3, pitchH: 1.22, tileCol: copperRoof, timberCol: warmWood, wallCol: 0xfef3c7, ridgeAlongX: true });
      bRoof.position.set(0, 4.90, -0.15);
      bookstore.add(copperParapet, bRoof);

      // 2nd Floor Retro Study Windows with Wooden Mullions
      [-1.55, 1.55].forEach(wx => {
        const w2 = createFramedWindow(1.65, 1.18, winTexShoji, warmWood, false, true);
        w2.position.set(wx, 3.78, 2.02);
        bookstore.add(w2);
      });

      // 1st Floor Bookstore Display Windows, Striped Awning & Outdoor Sloped Book Carts (古本ワゴン)
      const shopSign = makeFrontBackBox(
        4.8, 0.56, 0.18,
        createGraphicSign(512, 96, '#0f766e', '#fef08a', '古書・漫画 文鳥堂書店', 'BUNCHODO BOOKS & MANGA'),
        warmWood,
        true
      );
      shopSign.position.set(0, 2.68, 2.34);

      // Protruding Vertical Street Sign (袖看板)
      const sleeveSign = makeFrontBackBox(
        0.52, 1.95, 0.16,
        createGraphicSign(128, 384, '#fef08a', '#0f766e', '古本・新刊', '文鳥堂'),
        0x0f766e,
        true
      );
      sleeveSign.position.set(-2.85, 3.85, 2.45);

      const awning = createHisashiEave(5.4, 0.95, 0xb45309, warmWood);
      awning.position.set(0, 2.22, 2.65);
      bookstore.add(shopSign, sleeveSign, awning);

      // Outdoor Sloped Bargain Book Racks with Colorful Manga Spines
      [-1.55, 1.55].forEach(bx => {
        const win1 = createFramedWindow(1.75, 1.25, winTexWarmSash, warmWood, false, false);
        win1.position.set(bx, 1.38, 2.26);
        const rack = box(1.55, 0.72, 0.58, warmWood, false);
        rack.position.set(bx, 0.36, 2.62);
        const bookRow = boxFast(1.45, 0.18, 0.42, bx < 0 ? 0xf43f5e : 0x38bdf8, true);
        bookRow.rotation.x = 0.35;
        bookRow.position.set(bx, 0.80, 2.62);
        bookstore.add(win1, rack, bookRow);
      });

      const bookDoor = createFramedWindow(1.15, 1.92, winTexMachiya, warmWood, false, false);
      bookDoor.position.set(0, 0.98, 2.26);
      bookstore.add(bookDoor);
    }

    // ---------------------------------------------------------
    // Finish every visible side, including the walls that the main overview looks toward.
    for(const building of neighborhoodGroup.children){
      if(building===courtyardHouse||building===gardenHouse)continue;
      const isBook=Math.abs(building.position.x-15.4)<.1;
      const isModern=Math.abs(building.position.x-4.8)<.1;
      const isApartment=Math.abs(building.position.x+4.4)<.1;
      building.name=isBook?'文鸟古书店':isModern?'青叶现代住宅':isApartment?'樱町木造公寓':'星影茶屋';
      const w=isBook?5.8:isModern?6.9:isApartment?8.4:6.4;
      const d=isBook?4.5:isModern?4.4:isApartment?4.2:4.8;
      const eaveY=isModern?4.8:isApartment?5.0:4.5;
      for(const side of [-1,1]){
        for(const y of [1.30,3.62]){
          const sideX=isModern?(side<0?-3.02:3.32):side*((y>3?(isBook?5.6:isApartment?8.4:6.0):w)*.5+.021);
          homeWindow(building,1.02,1.03,sideX,y,-.55,side*Math.PI/2,y>3&&side===-1?'cool':'warm',!(side===-1&&y<2));
        }
        homeRod(building,[side*(w*.5-.12),.15,-d*.5],[side*(w*.5-.12),eaveY,-d*.5],.035,0x68736d);
      }
      const upperBackZ=isApartment?-2.125:isBook?-2.225:isModern?-2.225:-2.255;
      for(const x of [-w*.27,w*.27])homeWindow(building,1.18,1.06,x,3.61,upperBackZ,Math.PI,'warm',x<0);
      homeBox(building,w+.06,.22,d+.04,0x85877d,0,.12,0);
      // Fine siding courses, corner trims and deeper eave shadow create scale cues.
      for(const side of [-1,1]){
        homeBox(building,.085,4.40,.085,isModern?0x768281:0x89765c,side*w*.5,2.32,d*.5-.03);
        for(let y=.48;y<2.3;y+=.23)homeBox(building,.018,.013,d-.10,isModern?0x606c70:0xb6a88e,side*(w*.5+.014),y,0);
      }
      if(isBook){
        // Individual book spines on the outdoor carts replace two featureless color bars.
        for(const bx of [-1.55,1.55])for(let i=0;i<12;i++){
          const book=homeBox(building,.083,.24+(i%3)*.035,.30,[0xa96e58,0x768779,0xb7a178,0x697b91,0xb7998c][i%5],bx-.55+i*.10,.87,2.64);
          book.rotation.x=.20;homeBox(building,.058,.015,.008,0xd6c7a4,bx-.55+i*.10,.92,2.799);
        }
        homeLamp(building,-2.54,2.06,2.54);homeLamp(building,2.54,2.06,2.54);
      }else if(isModern){
        // Slatted terrace, a restrained planter line and a lantern under the carport.
        homeBox(building,3.15,.11,.88,0x848c87,1.80,2.47,2.46);
        for(let x=.32;x<3.3;x+=.15)homeBox(building,.035,.72,.045,0x67716c,x,2.90,2.88);
        homeRod(building,[.24,3.28,2.88],[3.28,3.28,2.88],.025,0x67716c);
        homePlanter(building,2.85,2.54,2.54,0x75827a);homeLamp(building,2.93,2.10,1.98);
      }else if(isApartment){
        for(let x=-3.7;x<3.8;x+=1.35)homeBox(building,.18,.21,.09,0x9da297,x,1.32,2.19);
        homeRod(building,[-4.18,.2,1.90],[-4.18,5.0,1.90],.037,0x68746f);
      }else{
        homeLamp(building,-2.84,1.94,2.76);homeLamp(building,2.84,1.94,2.76);
      }
    }

    // Soft projected window-grid pools, shared by all the neighborhood emitters.
    const residentialSpillTex=(()=>{
      const c=document.createElement('canvas');c.width=256;c.height=512;const ctx=c.getContext('2d');
      const grad=ctx.createLinearGradient(0,0,0,512);grad.addColorStop(0,'rgba(255,216,158,.44)');grad.addColorStop(.28,'rgba(255,201,125,.34)');grad.addColorStop(.7,'rgba(241,168,93,.12)');grad.addColorStop(1,'rgba(229,150,85,0)');
      ctx.fillStyle=grad;ctx.beginPath();ctx.moveTo(42,0);ctx.lineTo(214,0);ctx.lineTo(255,512);ctx.lineTo(0,512);ctx.closePath();ctx.fill();
      ctx.globalCompositeOperation='destination-out';ctx.fillStyle='rgba(0,0,0,.72)';ctx.beginPath();ctx.moveTo(124,0);ctx.lineTo(132,0);ctx.lineTo(138,512);ctx.lineTo(118,512);ctx.closePath();ctx.fill();ctx.fillRect(0,165,256,14);
      ctx.globalCompositeOperation='destination-in';const soft=ctx.createLinearGradient(0,0,256,0);soft.addColorStop(0,'rgba(0,0,0,0)');soft.addColorStop(.13,'#000');soft.addColorStop(.87,'#000');soft.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=soft;ctx.fillRect(0,0,256,512);
      const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
    })();
    const residentialEffects=new THREE.Group();diorama.add(residentialEffects);
    const residentialBeamMaterials=new Map(),residentialSpillMaterials=new Map();
    neighborhoodGroup.updateMatrixWorld(true);
    const houseWorld=new THREE.Vector3(),houseNormal=new THREE.Vector3(),houseQuat=new THREE.Quaternion();
    const lightingCoverage=new Map(neighborhoodGroup.children.map(h=>[h,{name:h.name||`${h.position.x},${h.position.z}`,windows:0,beams:0}]));
    for(const source of residentialWindows){
      if(source.dark)continue;
      const paneMaterial=source.pane?.material||source.mesh.material;
      if(paneMaterial?.isMeshBasicMaterial)residentialLightParts.push({pane:paneMaterial,baseColor:paneMaterial.color.clone()});
      source.mesh.getWorldPosition(houseWorld);source.mesh.getWorldQuaternion(houseQuat);houseNormal.set(0,0,1).applyQuaternion(houseQuat);
      if(houseWorld.y>4.5||source.h<.6)continue;
      let owner=source.mesh;while(owner.parent&&owner.parent!==neighborhoodGroup)owner=owner.parent;
      const isHero=owner===courtyardHouse||owner===gardenHouse;
      const isApartment=Math.abs(owner.position.x+4.4)<.1;
      const isModern=Math.abs(owner.position.x-4.8)<.1;
      const isBook=Math.abs(owner.position.x-15.4)<.1;
      const coverage=lightingCoverage.get(owner);if(coverage)coverage.windows++;
      const upstairs=houseWorld.y>2.9;
      const origin=houseWorld.clone().addScaledVector(houseNormal,.12);
      const localPos=owner.worldToLocal(houseWorld.clone());
      const localNormal=houseNormal.clone().applyQuaternion(owner.getWorldQuaternion(new THREE.Quaternion()).invert());
      let floorY=isHero?.40:.19,distance=THREE.MathUtils.clamp(houseWorld.y*.72,1.25,3.1),spillLengthScale=1.55;
      // Every old building participates. Upper lights land on its own architectural receiver.
      if(upstairs){
        if(localNormal.z>.8){
          if(owner===courtyardHouse){floorY=3.22;distance=.38;}
          else if(owner===gardenHouse){floorY=2.92;distance=.65;}
          else if(isApartment){floorY=2.82;distance=.55;spillLengthScale=1.15;}
          else if(isBook){floorY=2.57;distance=.40;spillLengthScale=1.15;}
          else if(isModern&&localPos.x>.20){floorY=2.76;distance=.42;spillLengthScale=1.15;}
          else if(!isModern){floorY=2.90;distance=.32;spillLengthScale=1.1;}
        }
      }
      const end=origin.clone().addScaledVector(houseNormal,distance);end.y=floorY;
      const right=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),houseNormal).normalize();
      const widths=[source.w*.46,source.w*.86],heights=[source.h*.42,.015],ends=[origin,end],vertices=[],uv=[];
      const corners=[];
      for(let k=0;k<2;k++)corners[k]=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>ends[k].clone().addScaledVector(right,x*widths[k]).add(new THREE.Vector3(0,y*heights[k],0)));
      for(let s=0;s<4;s++){const t=(s+1)%4;for(const [k,j,u,v] of [[0,s,0,0],[1,s,0,1],[0,t,1,0],[0,t,1,0],[1,s,0,1],[1,t,1,1]]){vertices.push(...corners[k][j].toArray());uv.push(u,v);}}
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
      const color=source.cool?new THREE.Color(0xc2d7d8):new THREE.Color(0xffd19b);
      const lightKey=source.cool?'cool':'warm';
      let beamMat=residentialBeamMaterials.get(lightKey);
      if(!beamMat){beamMat=new THREE.ShaderMaterial({uniforms:{uColor:{value:color},uStrength:{value:.12}},transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
        vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader:'uniform vec3 uColor;uniform float uStrength;varying vec2 vUv;void main(){float edge=pow(max(0.,sin(vUv.x*3.14159265)),1.25);float fall=pow(1.-vUv.y,1.1)*smoothstep(0.,.06,vUv.y);float shaft=1.-.24*exp(-pow((vUv.x-.5)*30.,2.));gl_FragColor=vec4(uColor,uStrength*edge*fall*shaft);}'
      });residentialBeamMaterials.set(lightKey,beamMat);}
      const beam=new THREE.Mesh(geo,beamMat);beam.renderOrder=3;residentialEffects.add(beam);residentialLightParts.push({beam:beamMat,base:.12});if(coverage)coverage.beams++;
      let spillMat=residentialSpillMaterials.get(lightKey);if(!spillMat){spillMat=new THREE.MeshBasicMaterial({map:residentialSpillTex,color,transparent:true,opacity:.78,depthWrite:false,blending:THREE.AdditiveBlending});residentialSpillMaterials.set(lightKey,spillMat);}
      const spill=new THREE.Mesh(new THREE.PlaneGeometry(source.w*2.15,distance*spillLengthScale),spillMat);
      spill.rotation.set(-Math.PI/2,0,-Math.atan2(houseNormal.x,houseNormal.z));spill.position.copy(origin).addScaledVector(houseNormal,distance*.65);spill.position.y=floorY;spill.renderOrder=2;residentialEffects.add(spill);residentialLightParts.push({spill:spillMat,base:.78});
    }
    for(const house of neighborhoodGroup.children){
      const local=house===courtyardHouse?[1.8,1.75,1.0]:house===gardenHouse?[1.65,1.65,.95]:[0,1.8,2.85];
      const light=new THREE.PointLight(0xffd4a0,1.45,5,1.5);light.position.copy(new THREE.Vector3(...local).applyMatrix4(house.matrixWorld));scene.add(light);residentialLightParts.push({light,base:1.45});
    }
    let residentialGain=1,lastResidentialGain=-1;
    function updateResidentialLighting(){
      const duskFactor=THREE.MathUtils.clamp((1.37-hemiLight.intensity)*1.7,.18,1.0),gain=residentialGain*duskFactor;
      if(Math.abs(lastResidentialGain-gain)<.005)return;lastResidentialGain=gain;
      for(const p of residentialLightParts){if(p.beam)p.beam.uniforms.uStrength.value=p.base*gain;if(p.spill)p.spill.opacity=p.base*gain;if(p.sprite)p.sprite.material.opacity=p.base*gain;if(p.light)p.light.intensity=p.base*gain;if(p.pane)p.pane.color.copy(p.baseColor).multiplyScalar(THREE.MathUtils.clamp(gain*.88+.12,.14,1.35));}
    }
    document.getElementById('home-light-slider').addEventListener('input',e=>{residentialGain=Number(e.target.value);updateResidentialLighting();});
    updateResidentialLighting();
    // Light cards must end on the physical miniature, including east-facing windows.
    scene.updateMatrixWorld(true);
    for(const mesh of [...residentialEffects.children,sidewalkSpillMesh,roadSpillMesh,sideSpillMesh,...volumetricBeams])clipLightToMiniature(mesh);

    // 8.6 SCULPTED 3D VEHICLES & NATURAL ANIME WET-ROAD HEADLIGHT GLARE (无手电筒光筒！采用车灯柔光光晕精灵 + 纯数学无边界地面漫反射Shader)
    // =========================================================
    const trafficGroup = new THREE.Group();
    diorama.add(trafficGroup);
    const movingVehicles = [];

    // Radial Lens-Glow Sprite Texture for Headlamps & Taillamps (车灯镜头柔光光晕贴图)
    function createLampHaloSpriteTex(coreHex, midRGBA) {
      const c = document.createElement('canvas');
      c.width = 128;
      c.height = 128;
      const ctx = c.getContext('2d');
      const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
      g.addColorStop(0.0, coreHex);
      g.addColorStop(0.28, midRGBA);
      g.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    }

    const headlampHaloTex = createLampHaloSpriteTex('#ffffff', 'rgba(254, 240, 138, 0.55)');
    const taillampHaloTex = createLampHaloSpriteTex('#ffe4e6', 'rgba(244, 63, 94, 0.52)');

    // Pure Mathematical GLSL Shader for Wet-Asphalt Headlight Reflection (100% 消除矩形边界与手电筒生硬感!)
    function createWetRoadHeadlightShaderMat() {
      return new THREE.ShaderMaterial({
        uniforms: {
          uOpacity: { value: 0.72 }
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform float uOpacity;
          varying vec2 vUv;
          void main() {
            // vUv.x: 0.0 at front bumper -> 1.0 far ahead on road
            // vUv.y: 0.0 (left edge) -> 1.0 (right edge), center = 0.5
            float x = vUv.x;
            float y = (vUv.y - 0.5) * 2.0; // -1.0 to +1.0

            // Dual low-beam centers at y = -0.26 and +0.26 that widen naturally as x increases
            float beamWidth = 0.16 + x * 0.52;
            float dLeft  = (y + 0.25) / beamWidth;
            float dRight = (y - 0.25) / beamWidth;
            float dualLobe = exp(-dLeft * dLeft * 2.2) + exp(-dRight * dRight * 2.2);

            // Smooth longitudinal falloff & guaranteed 0.000 alpha at all 4 UV edges!
            float longFade = smoothstep(0.0, 0.08, x) * pow(max(0.0, 1.0 - x), 1.65);
            float latWindow = smoothstep(1.0, 0.55, abs(y));

            float intensity = dualLobe * longFade * latWindow * uOpacity;
            vec3 col = mix(vec3(1.0, 0.90, 0.48), vec3(1.0, 0.99, 0.90), smoothstep(0.35, 0.05, x));
            gl_FragColor = vec4(col, clamp(intensity * 0.62, 0.0, 0.78));
          }
        `
      });
    }

    // Pure Mathematical GLSL Shader for Wet-Asphalt Red Taillight Puddle Reflection
    function createWetRoadTaillightShaderMat() {
      return new THREE.ShaderMaterial({
        uniforms: {
          uOpacity: { value: 0.62 }
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform float uOpacity;
          varying vec2 vUv;
          void main() {
            // vUv.x: 1.0 at rear bumper -> 0.0 behind vehicle
            float x = 1.0 - vUv.x;
            float y = (vUv.y - 0.5) * 2.0;

            float w = 0.22 + x * 0.42;
            float d1 = (y + 0.28) / w;
            float d2 = (y - 0.28) / w;
            float lobes = exp(-d1 * d1 * 2.4) + exp(-d2 * d2 * 2.4);

            float fade = smoothstep(0.0, 0.10, x) * pow(max(0.0, 1.0 - x), 1.8) * smoothstep(1.0, 0.52, abs(y));
            float alpha = lobes * fade * uOpacity * 0.52;
            gl_FragColor = vec4(vec3(0.98, 0.18, 0.34), clamp(alpha, 0.0, 0.65));
          }
        `
      });
    }

    function createAnimeVehicle({ z, dir, speed, type, bodyCol, roofCol, labelTitle, labelSub, startX }) {
      const vg = new THREE.Group();
      vg.position.set(startX, 0.04, z);
      if (dir < 0) vg.rotation.y = Math.PI;

      const tireGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.18, 12);
      tireGeo.rotateX(Math.PI / 2);
      const hubGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.19, 10);
      hubGeo.rotateX(Math.PI / 2);
      const tireMat = makeCelMat(0x0f172a, false);
      const hubMat = makeCelMat(0xe2e8f0, true);

      let frontX = 1.44;
      let backX = -1.44;

      if (type === 'truck') {
        frontX = 1.68;
        backX = -1.72;
        const chassis = box(3.42, 0.26, 1.36, 0x1e293b, false);
        chassis.position.y = 0.30;
        const frontBumper = box(0.16, 0.22, 1.42, 0x334155, false);
        frontBumper.position.set(1.66, 0.30, 0);

        const cabLower = box(1.04, 0.68, 1.34, 0xf8fafc, false);
        cabLower.position.set(1.14, 0.74, 0);
        const cabUpper = box(0.92, 0.56, 1.28, 0xf8fafc, false);
        cabUpper.position.set(1.08, 1.32, 0);

        const windshield = new THREE.Mesh(
          new THREE.PlaneGeometry(0.56, 1.18),
          new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
        );
        windshield.rotation.order = 'YXZ';
        windshield.rotation.y = Math.PI / 2;
        windshield.rotation.x = -0.18;
        windshield.position.set(1.58, 1.28, 0);

        const sideWin = boxFast(0.62, 0.44, 1.32, 0x38bdf8, true);
        sideWin.position.set(1.12, 1.30, 0);

        const deflector = box(0.55, 0.24, 1.24, 0x0284c7, false);
        deflector.rotation.z = -0.32;
        deflector.position.set(0.95, 1.68, 0);

        const cargoTex = createGraphicSign(512, 220, '#fffbeb', '#0284c7', labelTitle || '★星野マート 配送便', labelSub || 'FRESH CHILLED DELIVERY 24H');
        const cargoMat = new THREE.MeshBasicMaterial({ map: cargoTex });
        const cargoSide = makeCelMat(0xf8fafc, true);
        const cargoBox = new THREE.Mesh(
          new THREE.BoxGeometry(2.28, 1.62, 1.42),
          [cargoSide, cargoSide, cargoSide, cargoSide, cargoMat, cargoMat]
        );
        addInkOutline(cargoBox, false);
        cargoBox.position.set(-0.56, 1.25, 0);
        vg.add(chassis, frontBumper, cabLower, cabUpper, windshield, sideWin, deflector, cargoBox);
      } else {
        const isKei = type === 'kei';
        const len = isKei ? 2.30 : 2.92;
        frontX = len / 2;
        backX = -len / 2;

        const lowerBody = box(len, 0.48, 1.30, bodyCol, false);
        lowerBody.position.y = 0.42;
        const fBumper = box(0.14, 0.20, 1.34, 0x1e293b, false);
        fBumper.position.set(frontX - 0.02, 0.28, 0);
        const rBumper = box(0.14, 0.20, 1.34, 0x1e293b, false);
        rBumper.position.set(backX + 0.02, 0.28, 0);

        const hood = box(len * 0.28, 0.14, 1.24, bodyCol, false);
        hood.rotation.z = -0.12;
        hood.position.set(len * 0.32, 0.68, 0);

        const cabLen = isKei ? len * 0.64 : len * 0.54;
        const cabX = isKei ? -0.14 : -0.10;
        const cabin = box(cabLen, 0.50, 1.14, roofCol || bodyCol, false);
        cabin.position.set(cabX, 0.94, 0);

        const sideGlass = boxFast(cabLen * 0.92, 0.38, 1.18, 0x7dd3fc, true);
        sideGlass.position.set(cabX, 0.94, 0);

        const frontWindshield = box(0.42, 0.46, 1.12, 0x38bdf8, true);
        frontWindshield.rotation.z = -0.52;
        frontWindshield.position.set(cabX + cabLen * 0.52, 0.88, 0);

        [-0.68, 0.68].forEach(mz => {
          const mirror = boxFast(0.10, 0.09, 0.12, bodyCol, false);
          mirror.position.set(cabX + cabLen * 0.38, 0.74, mz);
          vg.add(mirror);
        });

        vg.add(lowerBody, fBumper, rBumper, hood, cabin, sideGlass, frontWindshield);

        if (type === 'taxi') {
          const stripe = boxFast(len + 0.02, 0.10, 1.32, 0xfacc15, true);
          stripe.position.y = 0.45;
          const sign = makeFrontBackBox(
            0.46, 0.20, 0.24,
            createGraphicSign(128, 64, '#fde047', '#0f172a', 'TAXI', '桜町'),
            0xfde047,
            true
          );
          sign.position.set(cabX, 1.29, 0);
          vg.add(stripe, sign);
        }
      }

      // 4 Detailed Wheels with Silver Hubcaps
      const wheelOffsets = type === 'truck'
        ? [[-1.06, 0.66], [-1.06, -0.66], [1.08, 0.66], [1.08, -0.66]]
        : [[-0.82, 0.62], [-0.82, -0.62], [0.82, 0.62], [0.82, -0.62]];
      wheelOffsets.forEach(([wx, wz]) => {
        const wMesh = new THREE.Mesh(tireGeo, tireMat);
        wMesh.position.set(wx, 0.24, wz);
        const hMesh = new THREE.Mesh(hubGeo, hubMat);
        hMesh.position.set(wx, 0.24, wz);
        vg.add(wMesh, hMesh);
      });

      // Front Grille, License Plates, 3D Headlight/Taillight Lenses & Soft Lens-Glow Halo Sprites
      const grille = boxFast(0.05, 0.18, 0.56, 0x0f172a, false);
      grille.position.set(frontX + 0.01, 0.44, 0);
      const plateMat = new THREE.MeshBasicMaterial({ color: 0xfef9c3 });
      const fPlate = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.26), plateMat);
      fPlate.position.set(frontX + 0.02, 0.29, 0);
      const rPlate = fPlate.clone();
      rPlate.position.x = backX - 0.02;
      vg.add(grille, fPlate, rPlate);

      const headLensMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const amberMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
      const tailLensMat = new THREE.MeshBasicMaterial({ color: 0xff1744 });
      const haloSprites = [];

      [-0.44, 0.44].forEach(lz => {
        // Front Headlight Lens + Amber Corner Light
        const hl = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.13, 0.20), headLensMat);
        hl.position.set(frontX + 0.01, 0.48, lz);
        const amb = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.11, 0.08), amberMat);
        amb.position.set(frontX + 0.01, 0.48, lz + (lz > 0 ? 0.13 : -0.13));

        // Soft Anime Bloom Halo Sprite right on the Headlight Lens (no mid-air flashlight cones!)
        const hSpriteMat = new THREE.SpriteMaterial({
          map: headlampHaloTex,
          transparent: true,
          opacity: 0.85,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        });
        const hSprite = new THREE.Sprite(hSpriteMat);
        hSprite.scale.set(0.62, 0.62, 1);
        hSprite.position.set(frontX + 0.08, 0.48, lz);
        hSprite.layers.set(1);

        // Rear Taillight Lens + Red Halo Sprite
        const tl = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.26), tailLensMat);
        tl.position.set(backX - 0.01, 0.50, lz);
        const tSpriteMat = new THREE.SpriteMaterial({
          map: taillampHaloTex,
          transparent: true,
          opacity: 0.75,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        });
        const tSprite = new THREE.Sprite(tSpriteMat);
        tSprite.scale.set(0.52, 0.52, 1);
        tSprite.position.set(backX - 0.08, 0.50, lz);
        tSprite.layers.set(1);

        haloSprites.push(hSpriteMat, tSpriteMat);
        vg.add(hl, amb, hSprite, tl, tSprite);
      });

      // Analytical GLSL Wet-Road Headlight Glare (zero rectangular edge artifacts!)
      const groundBeamMat = createWetRoadHeadlightShaderMat();
      const groundBeam = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 2.2), groundBeamMat);
      groundBeam.rotation.x = -Math.PI / 2;
      groundBeam.position.set(frontX + 1.72, 0.012, 0);
      groundBeam.layers.set(1);
      vg.add(groundBeam);

      // Analytical GLSL Wet-Road Taillight Reflection
      const tailGlowMat = createWetRoadTaillightShaderMat();
      const tailGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.5), tailGlowMat);
      tailGlow.rotation.x = -Math.PI / 2;
      tailGlow.position.set(backX - 0.68, 0.012, 0);
      tailGlow.layers.set(1);
      vg.add(tailGlow);

      trafficGroup.add(vg);
      movingVehicles.push({
        mesh: vg,
        dir,
        speed,
        minX: -15.8,
        maxX: 15.8,
        groundBeamMat,
        tailGlowMat,
        haloSprites
      });
    }

    createAnimeVehicle({ z: 7.35, dir: 1,  speed: 3.8, type: 'truck', startX: -10.5, bodyCol: 0xffffff });
    createAnimeVehicle({ z: 7.35, dir: 1,  speed: 3.8, type: 'kei',   startX:   4.8, bodyCol: 0xfacc15, roofCol: 0xfef9c3 });
    createAnimeVehicle({ z: 4.05, dir: -1, speed: 4.2, type: 'taxi',  startX:   7.5, bodyCol: 0x10b981, roofCol: 0xfacc15 });
    createAnimeVehicle({ z: 4.05, dir: -1, speed: 4.2, type: 'sedan', startX:  -8.0, bodyCol: 0x0284c7, roofCol: 0xe0f2fe });

    // =========================================================
    // 8.7 ANIMATED PEDESTRIANS WITH UMBRELLAS (撑伞漫步的二次元行人与公园游客)
    // =========================================================
    const pedestrians = [];

    function createUmbrellaPedestrian({ pathPoints, speed, coatCol, skirtOrPantsCol, umbrellaCol, hasUmbrella = true, startProg = 0 }) {
      const pg = new THREE.Group();

      // Head & Hair
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 10), makeCelMat(0xffedd5, true));
      head.position.y = 1.18;
      const hair = new THREE.Mesh(new THREE.SphereGeometry(0.142, 10, 10), makeCelMat(0x1e293b, false));
      hair.position.set(0, 1.21, -0.02);
      pg.add(head, hair);

      // Torso / Coat / Sailor Uniform
      const torso = box(0.28, 0.44, 0.18, coatCol, true);
      torso.position.y = 0.82;
      const lower = boxFast(0.26, 0.22, 0.17, skirtOrPantsCol, false);
      lower.position.y = 0.52;
      pg.add(torso, lower);

      // Articulated Left & Right Legs
      const legGeo = new THREE.BoxGeometry(0.09, 0.42, 0.10);
      legGeo.translate(0, -0.21, 0);
      const legMat = makeCelMat(0x1e293b, false);
      const leftLeg = new THREE.Mesh(legGeo, legMat);
      leftLeg.position.set(-0.07, 0.44, 0);
      const rightLeg = new THREE.Mesh(legGeo, legMat);
      rightLeg.position.set(0.07, 0.44, 0);
      pg.add(leftLeg, rightLeg);

      // Japanese Umbrella (ビニール傘 / 彩伞)
      if (hasUmbrella) {
        const umbGroup = new THREE.Group();
        umbGroup.position.set(0.08, 1.38, 0.05);
        umbGroup.rotation.x = -0.12;
        const shaft = cylFast(0.012, 0.012, 0.55, 6, 0x94a3b8, false);
        shaft.position.y = -0.18;
        const canopy = new THREE.Mesh(
          new THREE.ConeGeometry(0.56, 0.26, 12, 1, true),
          new THREE.MeshToonMaterial({
            color: umbrellaCol,
            gradientMap: celRamp,
            transparent: true,
            opacity: 0.82,
            side: THREE.DoubleSide
          })
        );
        addInkOutline(canopy, false, 35);
        umbGroup.add(shaft, canopy);
        pg.add(umbGroup);
      }

      trafficGroup.add(pg);
      pedestrians.push({
        group: pg,
        leftLeg,
        rightLeg,
        path: pathPoints,
        speed,
        prog: startProg,
        walkPhase: Math.random() * 10
      });
    }

    // 7 Pedestrians strolling along the front konbini sidewalk, side street, and Sakura Park paths
    createUmbrellaPedestrian({
      pathPoints: [[-15.5, 0.17, 1.25], [8.2, 0.17, 1.25]],
      speed: 0.048, coatCol: 0x1e3a8a, skirtOrPantsCol: 0x334155, umbrellaCol: 0x38bdf8, startProg: 0.25
    });
    createUmbrellaPedestrian({
      pathPoints: [[8.2, 0.17, 0.72], [-15.5, 0.17, 0.72]],
      speed: 0.052, coatCol: 0xf43f5e, skirtOrPantsCol: 0x1e293b, umbrellaCol: 0xfef08a, startProg: 0.62
    });
    createUmbrellaPedestrian({
      pathPoints: [[-7.2, 0.28, -11.35], [7.2, 0.28, -11.35]],
      speed: 0.065, coatCol: 0xfbbf24, skirtOrPantsCol: 0x1e293b, umbrellaCol: 0xf472b6, startProg: 0.15
    });
    createUmbrellaPedestrian({
      pathPoints: [[7.2, 0.28, -11.35], [-7.2, 0.28, -11.35]],
      speed: 0.060, coatCol: 0x10b981, skirtOrPantsCol: 0x0f172a, umbrellaCol: 0xe0f2fe, startProg: 0.72
    });
    createUmbrellaPedestrian({
      pathPoints: [[-0.1, 0.28, -15.2], [-0.1, 0.28, -7.2]],
      speed: 0.085, coatCol: 0xa855f7, skirtOrPantsCol: 0x1e293b, umbrellaCol: 0xfbcfe8, startProg: 0.40
    });
    createUmbrellaPedestrian({
      pathPoints: [[8.6, 0.17, 1.5], [8.6, 0.17, -16.5]],
      speed: 0.058, coatCol: 0x0284c7, skirtOrPantsCol: 0x1e293b, umbrellaCol: 0x34d399, startProg: 0.50
    });
    createUmbrellaPedestrian({
      pathPoints: [[-15.5, 0.17, 10.0], [15.5, 0.17, 10.0]],
      speed: 0.042, coatCol: 0xf97316, skirtOrPantsCol: 0x1e293b, umbrellaCol: 0x60a5fa, startProg: 0.80
    });

    // =========================================================
    // 9. RAIN STREAKS, EAVES DRIPS & RIPPLES
    // =========================================================
    const rainCount = 450;
    const rainGeo = new THREE.BufferGeometry();
    const rainPos = new Float32Array(rainCount * 6);
    const rainMeta = Array.from({ length: rainCount }, () => ({
      x: (Math.random() - 0.5) * 35.0,
      y: Math.random() * 12 + 0.2,
      z: (Math.random() - 0.5) * 31.0 - 6.0,
      len: 0.46 + Math.random() * 0.30,
      spd: 12 + Math.random() * 5
    }));
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
    const rainLines = new THREE.LineSegments(
      rainGeo,
      new THREE.LineBasicMaterial({ color: 0xcbd5e1, transparent: true, opacity: 0.30 })
    );
    rainLines.layers.set(1);
    scene.add(rainLines);

    const ripples = [];
    const rGeo = new THREE.RingGeometry(0.04, 0.065, 16);
    rGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 20; i++) {
      const rMat = new THREE.MeshBasicMaterial({ color: 0xfef3c7, transparent: true, opacity: 0.45, depthWrite: false });
      const rMesh = new THREE.Mesh(rGeo, rMat);
      rMesh.layers.set(1);
      rMesh.position.set((Math.random() - 0.5) * 15, 0.036, 2.5 + Math.random() * 4.5);
      diorama.add(rMesh);
      ripples.push({ mesh: rMesh, mat: rMat, p: Math.random(), spd: 0.6 + Math.random() * 0.5 });
    }

    const eaveDrops = [];
    const dropGeo = new THREE.SphereGeometry(0.028, 6, 6);
    dropGeo.scale(0.8, 1.6, 0.8);
    const dropMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
    for (let i = 0; i < 14; i++) {
      const dm = new THREE.Mesh(dropGeo, dropMat);
      dm.layers.set(1);
      const dx = -5.4 + (i / 13) * 10.8;
      dm.position.set(dx, 2.95, 0.62);
      diorama.add(dm);
      eaveDrops.push({ mesh: dm, x: dx, phase: Math.random() * 2.0 });
    }

    // =========================================================
    // 10. WEB AUDIO API PROCEDURAL RAIN & KONBINI DOOR CHIME
    // =========================================================
    let audioCtx = null;
    let audioEnabled = false;
    let rainGainNode = null;

    function initAudio() {
      if (audioCtx) return;
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      audioCtx = new AudioContextClass();

      // Gentle filtered rain noise loop
      const bufferSize = audioCtx.sampleRate * 2;
      const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.997 * b0 + white * 0.029;
        b1 = 0.985 * b1 + white * 0.032;
        b2 = 0.950 * b2 + white * 0.048;
        output[i] = (b0 + b1 + b2) * 0.14;
      }
      const whiteNoise = audioCtx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;
      whiteNoise.loop = true;

      const filter = audioCtx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 950;
      filter.Q.value = 0.7;

      rainGainNode = audioCtx.createGain();
      rainGainNode.gain.value = 0.0;

      whiteNoise.connect(filter);
      filter.connect(rainGainNode);
      rainGainNode.connect(audioCtx.destination);
      whiteNoise.start(0);
    }

    function playKonbiniChime() {
      if (!audioEnabled || !audioCtx) return;
      const notes = [659.25, 523.25, 392.00, 523.25, 587.33, 783.99];
      const times = [0.0, 0.22, 0.44, 0.66, 0.88, 1.15];
      notes.forEach((freq, idx) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        const startT = audioCtx.currentTime + times[idx];
        gain.gain.setValueAtTime(0.001, startT);
        gain.gain.linearRampToValueAtTime(0.06, startT + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0008, startT + 0.45);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(startT);
        osc.stop(startT + 0.48);
      });
    }

    document.getElementById('btn-audio').addEventListener('click', e => {
      initAudio();
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
      audioEnabled = !audioEnabled;
      if (rainGainNode && audioCtx) {
        rainGainNode.gain.setTargetAtTime(audioEnabled ? 0.18 : 0.0, audioCtx.currentTime, 0.15);
      }
      e.currentTarget.textContent = audioEnabled ? '🔊 雨夜音效: 开' : '🔇 雨夜音效: 关';
      e.currentTarget.classList.toggle('active', audioEnabled);
      if (audioEnabled) playKonbiniChime();
    });

    // =========================================================
    // 11. UI SKY MODES, CAMERA PRESETS & INTERACTIVE CONTROLS
    // =========================================================
    const skyPresets = {
      rainNight: {
        label: '🌧️ 雨夜深蓝',
        top: 0x050914, mid: 0x0f1b38, bot: 0x1e294b,
        hemiSky: 0x4f75d8, hemiGnd: 0x0f172a, hemiInt: 0.72,
        moonCol: 0x7aa2f7, moonInt: 0.82
      },
      afterRainDusk: {
        label: '🌆 紫黄雨后黄昏',
        top: 0x1a1438, mid: 0x6d28d9, bot: 0xf59e0b,
        hemiSky: 0xc084fc, hemiGnd: 0x2e1065, hemiInt: 0.88,
        moonCol: 0xfdba74, moonInt: 1.05
      },
      overcastDay: {
        label: '☁️ 湿润白昼',
        top: 0x475569, mid: 0x94a3b8, bot: 0xe2e8f0,
        hemiSky: 0xf8fafc, hemiGnd: 0x475569, hemiInt: 1.25,
        moonCol: 0xffffff, moonInt: 1.35
      }
    };

    function applySkyPresetImmediate(key) {
      const p = skyPresets[key];
      if (!p) return;
      gsap.killTweensOf([skyUniforms.uTopColor.value,skyUniforms.uMidColor.value,skyUniforms.uBotColor.value,hemiLight.color,hemiLight.groundColor,hemiLight,moonLight.color,moonLight]);
      gsap.killTweensOf(skyUniforms.uDuskAmount);skyUniforms.uDuskAmount.value=key==='afterRainDusk'?1:0;
      document.querySelectorAll('[data-sky]').forEach(b => b.classList.toggle('active', b.dataset.sky === key));
      document.getElementById('sky-label').textContent = p.label;
      document.body.dataset.skyTone=(key==='overcastDay'||key==='snowDay')?'light':'dark';
      skyUniforms.uTopColor.value.setHex(p.top);
      skyUniforms.uMidColor.value.setHex(p.mid);
      skyUniforms.uBotColor.value.setHex(p.bot);
      hemiLight.color.setHex(p.hemiSky);
      hemiLight.groundColor.setHex(p.hemiGnd);
      hemiLight.intensity = p.hemiInt;
      moonLight.color.setHex(p.moonCol);
      if(moonLight.intensity !== p.moonInt) renderer.shadowMap.needsUpdate=true;
      moonLight.intensity = p.moonInt;
    }

    function applySkyBlend(keyA, keyB, alpha) {
      skyUniforms.uDuskAmount.value=(keyA==='afterRainDusk'?1:0)*(1-alpha)+(keyB==='afterRainDusk'?1:0)*alpha;
      const a = skyPresets[keyA];
      const b = skyPresets[keyB];
      skyUniforms.uTopColor.value.setHex(a.top).lerp(new THREE.Color(b.top), alpha);
      skyUniforms.uMidColor.value.setHex(a.mid).lerp(new THREE.Color(b.mid), alpha);
      skyUniforms.uBotColor.value.setHex(a.bot).lerp(new THREE.Color(b.bot), alpha);
      hemiLight.color.setHex(a.hemiSky).lerp(new THREE.Color(b.hemiSky), alpha);
      hemiLight.groundColor.setHex(a.hemiGnd).lerp(new THREE.Color(b.hemiGnd), alpha);
      hemiLight.intensity = a.hemiInt + (b.hemiInt - a.hemiInt) * alpha;
      moonLight.color.setHex(a.moonCol).lerp(new THREE.Color(b.moonCol), alpha);
      moonLight.intensity = a.moonInt + (b.moonInt - a.moonInt) * alpha;
      const activeKey = alpha < 0.5 ? keyA : keyB;
      document.querySelectorAll('[data-sky]').forEach(btn => btn.classList.toggle('active', btn.dataset.sky === activeKey));
      document.getElementById('sky-label').textContent = skyPresets[activeKey].label;
      document.body.dataset.skyTone=(activeKey==='overcastDay'||activeKey==='snowDay')?'light':'dark';
    }

    const camPresets = {
      iso:     { pos: [75,61,89], target: [0.0, 1.6, -6.2] },
      courtyard: {pos:[27.5,13,19.2],target:[15.45,2.65,-1.4]},
      garden: {pos:[7,20,-23],target:[-14.0,2.3,-11.5]},
      residential: {pos:[33,14,-1],target:[15.3,2.4,-11.5]},
      teahouse: {pos:[-4,10,18],target:[-13.6,2.5,-1.2]},
      apartment: {pos:[-14,13,-1],target:[-4.4,2.7,-18.5]},
      modern: {pos:[13,11,-3],target:[4.8,2.4,-18.3]},
      bookstore: {pos:[0,11,-1],target:[14.4,2.5,-12.8]},
      bike: {pos:[-11.7,2.5,6.5],target:[-9.45,.8,.72]},
      cat: {pos:[6.4,1.8,5.9],target:[4.52,.55,.78]},
      delivery: {pos:[10.3,3.2,.2],target:[6.18,.9,-3.7]},
      park:    { pos: [-22, 24, 14], target: [0.2, 1.8, -11.5] },
      traffic: { pos: [-14.5, 4.8, 15.5], target: [1.5, 1.4, 4.2] },
      spill:   { pos: [8.5, 6.2, 16.5],   target: [0.2, 0.8, 1.8] },
      front:   { pos: [0.4, 2.3, 11.2],   target: [0.4, 1.5, -2.5] },
      vending: { pos: [-7.1, 2.1, 6.2],   target: [-7.2, 1.3, -0.8] },
      pylon:   { pos: [14.2, 5.2, 8.8],   target: [6.2, 3.4, -0.2] },
      shelves: { pos: [2.2, 2.8, 5.6],    target: [0.2, 1.4, -3.8] }
    };

    // =========================================================
    // 12. 60-SECOND MASTER VIDEO DIRECTOR TIMELINE ENGINE
    // =========================================================
    const TOTAL_DURATION = 60.0;
    let videoPlaying = false;
    let videoTime = 0.0;
    let playbackSpeed = 1.0;
    let lastTriggeredChimeChapter = -1;

    const chapters = [
      {
        id: 1, start: 0, end: 8,
        camBtn: 'iso', demoSelector: '[data-cam="iso"]',
        title: '01 • 桜町三丁目 1:35 街区大盒景全景',
        tag: '演示功能: 📦 街区大盒景全景 (便利店 + 樱花公园 + 街区民居 + 车流)',
        desc: '全面扩展的 1:35 街区盒景：包含星野マート便利店、后方樱花公园、周边五栋日式住宅公寓及街道车流与行人。',
        zh: '【01/08 街区大盒景】全景呈现星野マート便利店、后方樱花公园、周边日式民居与穿梭车流',
        en: '[01/08 Neighborhood Panorama] Expanded 1:35 block with Hoshino Mart, Sakura Park, houses, and street traffic.'
      },
      {
        id: 2, start: 8, end: 16,
        camBtn: 'park', demoSelector: '[data-cam="park"], #toggle-sakura',
        title: '02 • 便利店后方樱花公园与周边日式民居',
        tag: '演示功能: 🌸 后方樱花小公园 + 5棵夜樱树 + 周边一户建与公寓',
        desc: '深入便利店后方的「桜町公園」，展示 5 棵盛放的三渲二夜樱、飘落樱花瓣、复古时钟台、秋千架以及四周亮起暖光的住宅与公寓。',
        zh: '【02/08 樱花公园与民居】便利店后方坐落着「桜町公園」，五棵盛放夜樱飘落花瓣，四周环绕着温暖的日式一户建与公寓楼',
        en: '[02/08 Sakura Park & Houses] Five blooming cherry blossom trees with falling petals surrounded by cozy Japanese homes.'
      },
      {
        id: 3, start: 16, end: 24,
        camBtn: 'traffic', demoSelector: '[data-cam="traffic"], #toggle-traffic',
        title: '03 • 湿润街道车流与撑伞漫步行人',
        tag: '演示功能: 🚗 街道车流与行人 (星野配送车 / 出租车 / K-Car / 撑伞行人)',
        desc: '推近樱町主干道：星野マート配送卡车、绿黄出租车与黄色轻自动车开着前照灯穿梭而过，行人们撑着彩伞漫步在雨夜街头。',
        zh: '【03/08 街道车流与行人】配送卡车、出租车与黄色小车亮着车灯驶过湿润街面，撑伞行人在便利店与公园间漫步',
        en: '[03/08 Street Traffic & Pedestrians] Delivery truck, taxi, and kei-car with headlight beams alongside umbrella pedestrians.'
      },
      {
        id: 4, start: 24, end: 32,
        camBtn: 'spill', demoSelector: '[data-sky], #spill-slider, #wet-slider',
        title: '04 • 三色天空流转 & 窗格暖光镜面反射',
        tag: '演示功能: 🌆 三色天空切换 + ✨ 窗格暖光与镜面水洼滑块',
        desc: '无缝演示「雨后黄昏」「雨夜深蓝」「湿润白昼」三种天幕，并动态推拉窗格暖光与积水镜面反射滑块。',
        zh: '【04/08 天空与暖光镜面】无缝切换三种天空氛围，店内暖黄灯光与车灯共同倒映在潮湿镜面柏油路上',
        en: '[04/08 Sky Modes & Wet Mirror] Switching across 3 sky shaders while adjusting window light spill and wet road reflections.'
      },
      {
        id: 5, start: 32, end: 39,
        camBtn: 'front', demoSelector: '#toggle-door, #toggle-rain',
        title: '05 • 感应自动门开合 & GPU 下滑雨痕玻璃',
        tag: '演示功能: 🚪 自动门开关 + 🌧️ GPU 玻璃雨痕着色器',
        desc: '正对便利店落地窗推进，演示双开感应门平滑开合，以及纯 GPU 着色器驱动的从上往下滑落水珠轨迹。',
        zh: '【05/08 自动门与雨痕】双开感应门自动滑开流淌出暖光；玻璃窗采用纯 GPU 雨痕着色器，水珠严格从上往下滑落',
        en: '[05/08 Auto-Doors & GPU Rain Trails] Sliding glass doors open with warm light spill; GPU shader renders downward raindrops.'
      },
      {
        id: 6, start: 39, end: 46,
        camBtn: 'vending', demoSelector: '[data-cam="vending"], [data-cam="pylon"]',
        title: '06 • 3D 自动贩卖机、街角立牌与 11 幅海报',
        tag: '演示功能: 🥤 3D贩卖机特写 + 🪧 双立柱街角立牌',
        desc: '特写冷热双色 3D 饮料贩卖机（内含三层立体罐装饮料与回收箱）与右侧双钢柱街角立牌、11 幅日漫手绘海报。',
        zh: '【06/08 贩卖机与街角立牌】微距巡礼三层 3D 立体饮料贩卖机、空罐回收箱、双立柱发光广告塔与 11 幅日漫海报',
        en: '[06/08 3D Vending Machines & Pylon] Close-up of 3-tier 3D drink vending machines, corner pylon sign, and 11 anime posters.'
      },
      {
        id: 7, start: 46, end: 54,
        camBtn: 'shelves', demoSelector: '#toggle-roof, [data-cam="shelves"]',
        title: '07 • 一键掀开屋顶俯瞰店内 12 项高精陈设',
        tag: '演示功能: 🏠 掀开屋顶俯瞰店内 + 🍱 便当柜与货架区',
        desc: '自动触发「掀开屋顶」机关，屋顶平滑升起，俯瞰收银台、八宫格关东煮、便当饭团冷柜与三排双面货架。',
        zh: '【07/08 掀开屋顶看店内】一键升起便利店屋顶，全方位俯瞰双收银机、关东煮、现磨咖啡吧、饭团便当柜与三排双面货架',
        en: '[07/08 Roof Lift-Off Cutaway] Lifting the roof reveals the cashier, oden pot, coffee bar, bento/onigiri chiller, and aisles.'
      },
      {
        id: 8, start: 54, end: 60,
        camBtn: 'iso', demoSelector: '#toggle-ink',
        title: '08 • 三渲二漫画墨线开关对比 & 街区全景收尾',
        tag: '演示功能: ✒️ 三渲二墨线开关对比 + 60FPS 满帧收尾',
        desc: '还原屋顶并动态切换「三渲二墨线: 关/开」，直观对比纯色阶卡通渲染与手绘漫画墨线勾勒，最后拉回街区大全景。',
        zh: '【08/08 三渲二墨线对比】实时切换手绘漫画轮廓墨线开关，镜头拉回樱町三丁目街区大全景，完成 60 秒全功能巡礼！',
        en: '[08/08 Cel-Shaded Ink Outlines Finale] Toggling comic ink outlines off and on as the camera returns to the neighborhood overview.'
      }
    ];

    function clamp01(v) { return Math.max(0.0, Math.min(1.0, v)); }
    function smoothstep01(t) {
      const x = clamp01(t);
      return x * x * (3.0 - 2.0 * x);
    }
    function lerpVec3(a, b, alpha) {
      return [
        a[0] + (b[0] - a[0]) * alpha,
        a[1] + (b[1] - a[1]) * alpha,
        a[2] + (b[2] - a[2]) * alpha
      ];
    }

    function setSpillAndWetValues(spillVal, wetVal) {
      document.getElementById('spill-slider').value = spillVal.toFixed(2);
      frontLightSpillMat.opacity = Math.min(1.0, 0.88 * spillVal);
      sideSpillMat.opacity = Math.min(1.0, 0.78 * spillVal);
      volumetricBeams.forEach(b => { b.material.opacity = 0.062 * spillVal; });
      storeLights.forEach(sl => { sl.light.intensity = sl.base * spillVal; });

      document.getElementById('wet-slider').value = wetVal.toFixed(2);
      wetRoadOverlay.material.opacity = 1.0 - wetVal;
      roadMirror.visible = wetVal > 0.02;
    }

    let rainActive = true;
    function legacySetRainState(active) {
      rainActive = active;
      rainLines.visible = active;
      rainGlassUniforms.uActive.value = active ? 1.0 : 0.0;
      ripples.forEach(r => { r.mesh.visible = active; });
      eaveDrops.forEach(d => { d.mesh.visible = active; });
      const btn = document.getElementById('toggle-rain');
      btn.textContent = active ? '🌧️ 降雨与雨痕: 开' : '🌧️ 降雨与雨痕: 关';
      btn.classList.toggle('active', active);
    }

    let inkActive = true;
    function setInkState(active) {
      if (inkActive === active) return;
      inkActive = active;
      allInkLines.forEach(l => { l.visible = active; });
      const btn = document.getElementById('toggle-ink');
      btn.textContent = active ? '✒️ 三渲二墨线: 开' : '✒️ 三渲二墨线: 关';
      btn.classList.toggle('active', active);
    }

    let roofLifted = false;
    function setRoofHeight(yVal) {
      gsap.killTweensOf(roofGroup.position);
      const prevY = roofGroup.position.y;
      roofGroup.position.y = yVal;
      const liftedNow = yVal > 1.0;
      if (liftedNow !== roofLifted || Math.abs(prevY - yVal) > 0.2) {
        roofLifted = liftedNow;
        renderer.shadowMap.needsUpdate = true;
      }
      const btn = document.getElementById('toggle-roof');
      btn.classList.toggle('active', roofLifted);
      btn.textContent = roofLifted ? '🏠 还原便利店屋顶' : '🏠 掀开屋顶俯瞰店内';
    }

    // Deterministic evaluation of the entire 60-second showcase at time `t`
    let lastChapterId=-1;
    function applyDirectorState(t) {
      t = Math.max(0, Math.min(TOTAL_DURATION, t));

      // Find current chapter
      let chap = chapters[0];
      for (const c of chapters) {
        if (t >= c.start && (t < c.end || t === TOTAL_DURATION && c.end === TOTAL_DURATION)) { chap = c; break; }
      }

      // Chime on chapter 4 (door open) or chapter 7 (roof lift)
      if (videoPlaying && (chap.id === 4 || chap.id === 7) && lastTriggeredChimeChapter !== chap.id) {
        lastTriggeredChimeChapter = chap.id;
        playKonbiniChime();
      } else if (chap.id !== 4 && chap.id !== 7) {
        lastTriggeredChimeChapter = -1;
      }

      if(lastChapterId!==chap.id){
      lastChapterId=chap.id;
      // Update Top-Right HUD & Bottom Subtitle & Chapter Ribbon
      document.getElementById('chap-counter').textContent = `CH 0${chap.id} / 08`;
      document.getElementById('hud-chapter-title').textContent = chap.title;
      document.getElementById('hud-feature-tag').textContent = chap.tag;
      document.getElementById('hud-feature-desc').textContent = chap.desc;
      document.getElementById('sub-zh').textContent = chap.zh;
      document.getElementById('sub-en').textContent = chap.en;

      document.querySelectorAll('.chap-btn').forEach((b, idx) => {
        b.classList.toggle('active', idx + 1 === chap.id);
      });

      // Highlight active camera preset button & demo-highlight current feature button
      document.querySelectorAll('[data-cam]').forEach(b => {
        b.classList.toggle('active', b.dataset.cam === chap.camBtn);
      });
      document.querySelectorAll('.demo-highlight').forEach(el => el.classList.remove('demo-highlight'));
      if (chap.demoSelector) {
        document.querySelectorAll(chap.demoSelector).forEach(el => el.classList.add('demo-highlight'));
      }

      }
      // Default baseline states unless overridden by chapter
      let camPos = [...camPresets.iso.pos];
      let camTgt = [...camPresets.iso.target];
      let roofY = 0.0;
      let doorRatio = 0.0;
      let spillVal = 1.1;
      let wetVal = 0.55;
      let wantRain = true;
      let wantInk = true;

      if (chap.id === 1) {
        // 00–08s: Grand Neighborhood Isometric Orbital Arc
        const p = smoothstep01((t - 0) / 8.0);
        const angle = -0.35 + p * 0.65;
        const home=fitOverview(),offset=home.clone().sub(overviewCenter);
        offset.applyAxisAngle(new THREE.Vector3(0,1,0),-.18+p*.36);
        camPos=overviewCenter.clone().add(offset).toArray();
        camTgt = [0.0, 2.0, -5.5];
        applySkyPresetImmediate('afterRainDusk');
      } else if (chap.id === 2) {
        // 08–16s: Sakura Park & Surrounding Neighborhood Houses Tour
        applySkyPresetImmediate('afterRainDusk');
        const localT = t - 8.0;
        const p = smoothstep01(localT / 8.0);
        camPos = lerpVec3([-24, 24, 14], [22, 24, 14], p);
        camTgt = lerpVec3([-1.5, 1.8, -11.5], [0.5, 1.8, -11.5], p);
      } else if (chap.id === 3) {
        // 16–24s: Moving Street Vehicles & Umbrella Pedestrians Tracking Shot
        applySkyPresetImmediate('afterRainDusk');
        const localT = t - 16.0;
        const p = smoothstep01(localT / 8.0);
        camPos = lerpVec3([-15.5, 4.6, 15.5], [13.5, 4.8, 15.0], p);
        camTgt = lerpVec3([-2.5, 1.3, 4.2], [2.5, 1.4, 3.8], p);
      } else if (chap.id === 4) {
        // 24–32s: Sky Transitions + Window Light Spill & Wet Mirror Sliders
        const localT = t - 24.0;
        const p = smoothstep01(localT / 8.0);
        camPos = lerpVec3([11.5, 6.8, 17.5], [5.2, 4.4, 15.2], p);
        camTgt = lerpVec3([0.2, 0.9, 1.8], [-0.4, 0.7, 2.2], p);
        if (localT < 2.6) {
          applySkyBlend('afterRainDusk', 'rainNight', smoothstep01(localT / 2.2));
        } else if (localT < 5.4) {
          applySkyBlend('rainNight', 'overcastDay', smoothstep01((localT - 2.6) / 2.2));
        } else {
          applySkyBlend('overcastDay', 'afterRainDusk', smoothstep01((localT - 5.4) / 2.2));
        }
        spillVal = 0.50 + 1.05 * Math.sin(clamp01(localT / 7.5) * Math.PI);
        wetVal = 0.25 + 0.58 * Math.sin(clamp01(localT / 7.5) * Math.PI);
      } else if (chap.id === 5) {
        // 32–39s: Storefront Look-In, Automatic Sliding Door & GPU Raindrop Trail
        applySkyPresetImmediate('afterRainDusk');
        const localT = t - 32.0;
        const p = smoothstep01(localT / 7.0);
        camPos = lerpVec3([2.4, 2.5, 11.8], [-1.8, 2.15, 7.6], p);
        camTgt = lerpVec3([0.6, 1.6, -2.2], [-2.2, 1.55, -2.2], p);
        if (localT < 1.3) doorRatio = smoothstep01(localT / 1.3);
        else if (localT < 5.4) doorRatio = 1.0;
        else doorRatio = 1.0 - smoothstep01((localT - 5.4) / 1.3);
      } else if (chap.id === 6) {
        // 39–46s: 3D Vending Machines & Street-Corner Pylon Billboard
        applySkyPresetImmediate('afterRainDusk');
        const localT = t - 39.0;
        if (localT < 3.6) {
          const p = smoothstep01(localT / 3.6);
          camPos = lerpVec3([-5.6, 2.25, 6.6], [-8.2, 1.95, 5.4], p);
          camTgt = lerpVec3([-6.5, 1.35, -0.85], [-7.8, 1.25, -0.85], p);
        } else {
          const p = smoothstep01((localT - 3.6) / 3.4);
          camPos = lerpVec3([14.8, 3.8, 9.5], [12.6, 5.8, 7.2], p);
          camTgt = lerpVec3([6.2, 2.4, -1.2], [6.6, 4.3, 0.4], p);
        }
      } else if (chap.id === 7) {
        // 46–54s: Lift Roof Cutaway & Interior Tour
        applySkyPresetImmediate('afterRainDusk');
        const localT = t - 46.0;
        const liftIn = smoothstep01(localT / 1.4);
        roofY = 5.5 * liftIn;
        const p = smoothstep01(localT / 8.0);
        camPos = lerpVec3([-3.2, 5.8, 6.4], [3.6, 5.2, 5.8], p);
        camTgt = lerpVec3([-2.8, 1.2, -3.2], [0.8, 1.3, -3.6], p);
      } else if (chap.id === 8) {
        // 54–60s: Lower Roof, Toggle Comic Ink Outlines Off/On & Return to Neighborhood Overview
        applySkyPresetImmediate('afterRainDusk');
        const localT = t - 54.0;
        const lowerProg = 1.0 - smoothstep01(localT / 1.5);
        roofY = 5.5 * lowerProg;
        const p = smoothstep01(localT / 6.0);
        camPos = lerpVec3([14.5, 10.5, 18.0], camPresets.iso.pos, p);
        camTgt = lerpVec3([0.2, 1.5, -2.5], camPresets.iso.target, p);
        wantInk = !(localT > 1.2 && localT < 3.4);
      }

      camera.position.set(camPos[0], camPos[1], camPos[2]);
      controls.target.set(camTgt[0], camTgt[1], camTgt[2]);
      setRoofHeight(roofY);
      setDoorOpenRatio(doorRatio);
      setSpillAndWetValues(spillVal, wetVal);
      setRainState(wantRain);
      setInkState(wantInk);
    }

    function formatMMSS(sec) {
      const s = Math.floor(sec);
      const m = Math.floor(s / 60);
      const rem = s % 60;
      return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
    }

    function setDirectorActive(){
      videoPlaying=false;gsap.killTweensOf(camera.position);gsap.killTweensOf(controls.target);controls.enabled=true;
      document.getElementById('ui-panel').classList.remove('director-active');
      document.querySelectorAll('.demo-highlight').forEach(el=>el.classList.remove('demo-highlight'));
    }

    // Pause auto-director gracefully if user manually drags the 3D scene
    renderer.domElement.addEventListener('pointerdown', () => {
      if (videoPlaying) {
        setDirectorActive(false);
      }
    });


    // Collapsible Panel Logic for all 3 boxes + Subtitles + Keyboard Shortcut (H)
    const uiPanelEl = document.getElementById("ui-panel");
    const hudPanelEl = document.getElementById("feature-hud");
    const playerBarEl = document.getElementById("video-player-bar");
    const subOverlayEl = document.getElementById("subtitle-overlay");
    const btnFoldUi = document.getElementById("btn-fold-ui");
    const btnFoldHud = document.getElementById("btn-fold-hud");
    const btnFoldPlayer = document.getElementById("btn-fold-player");
    const btnFoldAll = document.getElementById("btn-fold-all");
    const btnToggleSub = document.getElementById("btn-toggle-sub");

    function syncFoldButtons() {
      const uiCollapsed = uiPanelEl.classList.contains("collapsed");
      const hudCollapsed = hudPanelEl.classList.contains("collapsed");
      const playerCollapsed = playerBarEl.classList.contains("collapsed");

      btnFoldUi.textContent = uiCollapsed ? "▾ 展开" : "▴ 折叠";
      btnFoldHud.textContent = hudCollapsed ? "▾ 展开" : "▴ 折叠";
      btnFoldPlayer.textContent = playerCollapsed ? "▴ 展开栏" : "▾ 精简栏";
      subOverlayEl.classList.toggle("sub-low", playerCollapsed);

      const allCollapsed = uiCollapsed && hudCollapsed && playerCollapsed;
      btnFoldAll.textContent = (uiCollapsed && hudCollapsed)
        ? "展开工作台 (H)"
        : "收起工作台 (H)";
    }

    btnFoldUi.addEventListener("click", (e) => {
      e.stopPropagation();
      uiPanelEl.classList.toggle("collapsed");
      syncFoldButtons();
    });

    btnFoldHud.addEventListener("click", (e) => {
      e.stopPropagation();
      hudPanelEl.classList.toggle("collapsed");
      syncFoldButtons();
    });

    btnFoldPlayer.addEventListener("click", (e) => {
      e.stopPropagation();
      playerBarEl.classList.toggle("collapsed");
      syncFoldButtons();
    });

    btnFoldAll.addEventListener("click", () => {
      const shouldCollapse = !(uiPanelEl.classList.contains("collapsed") && hudPanelEl.classList.contains("collapsed"));
      uiPanelEl.classList.toggle("collapsed", shouldCollapse);
      hudPanelEl.classList.toggle("collapsed", shouldCollapse);
      playerBarEl.classList.toggle("collapsed", shouldCollapse);
      syncFoldButtons();
    });

    let subVisible = true;
    btnToggleSub.addEventListener("click", () => {
      subVisible = !subVisible;
      subOverlayEl.classList.toggle("sub-hidden", !subVisible);
      btnToggleSub.textContent = subVisible ? "💬 字幕: 开" : "💬 字幕: 关";
    });

    window.addEventListener("keydown", (e) => {
      if (e.key === "h" || e.key === "H") {
        btnFoldAll.click();
      }
    });

    syncFoldButtons();

    // Bottom Video Player Controls
    document.getElementById('btn-play-video').addEventListener('click', () => {
      if (!videoPlaying && videoTime >= TOTAL_DURATION - 0.1) {
        videoTime = 0;
      }
      setDirectorActive(!videoPlaying);
    });

    document.getElementById('btn-replay-video').addEventListener('click', () => {
      videoTime = 0;
      setDirectorActive(true);
      applyDirectorState(0);
    });

    const scrubber = document.getElementById('video-scrubber');
    scrubber.addEventListener('input', e => {
      videoTime = parseFloat(e.target.value);
      applyDirectorState(videoTime);
      document.getElementById('video-timecode').textContent = `${formatMMSS(videoTime)} / 01:00`;
    });

    document.querySelectorAll('.chap-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        videoTime = parseFloat(btn.dataset.seek);
        scrubber.value = videoTime;
        setDirectorActive(true);
        applyDirectorState(videoTime);
      });
    });

    document.getElementById('speed-select').addEventListener('change', e => {
      playbackSpeed = parseFloat(e.target.value);
    });

    // Left Panel Manual Buttons (also work anytime!)
    document.querySelectorAll('[data-sky]').forEach(btn => {
      btn.addEventListener('click', () => {
        setDirectorActive(false);
        const key = btn.dataset.sky;
        gsap.to(skyUniforms.uDuskAmount,{value:key==='afterRainDusk'?1:0,duration:.9,overwrite:true});
        const p = skyPresets[key];
        document.querySelectorAll('[data-sky]').forEach(b => b.classList.toggle('active', b === btn));
        document.getElementById('sky-label').textContent = p.label;
      document.body.dataset.skyTone=(key==='overcastDay'||key==='snowDay')?'light':'dark';

        const cTop = new THREE.Color(p.top);
        const cMid = new THREE.Color(p.mid);
        const cBot = new THREE.Color(p.bot);
        const cHS = new THREE.Color(p.hemiSky);
        const cHG = new THREE.Color(p.hemiGnd);
        const cMoon = new THREE.Color(p.moonCol);

        gsap.to(skyUniforms.uTopColor.value, { r: cTop.r, g: cTop.g, b: cTop.b, duration: 0.9, overwrite: true });
        gsap.to(skyUniforms.uMidColor.value, { r: cMid.r, g: cMid.g, b: cMid.b, duration: 0.9, overwrite: true });
        gsap.to(skyUniforms.uBotColor.value, { r: cBot.r, g: cBot.g, b: cBot.b, duration: 0.9, overwrite: true });
        gsap.to(hemiLight.color, { r: cHS.r, g: cHS.g, b: cHS.b, duration: 0.9, overwrite: true });
        gsap.to(hemiLight.groundColor, { r: cHG.r, g: cHG.g, b: cHG.b, duration: 0.9, overwrite: true });
        gsap.to(hemiLight, { intensity: p.hemiInt, duration: 0.9, overwrite: true });
        gsap.to(moonLight.color, { r: cMoon.r, g: cMoon.g, b: cMoon.b, duration: 0.9, overwrite: true });
        gsap.to(moonLight, { intensity: p.moonInt, duration: 0.9, overwrite: true });
      });
    });

    document.querySelectorAll('[data-cam]').forEach(btn => btn.addEventListener('click', () => navigateTo(btn.dataset.cam)));

    document.getElementById('toggle-rain').addEventListener('click', () => {
      setDirectorActive(false);
      setRainState(!(rainActive||snowActive));
    });


    let trafficActive = true;
    document.getElementById('toggle-traffic').addEventListener('click', e => {
      setDirectorActive(false);
      trafficActive = !trafficActive;
      trafficGroup.visible = trafficActive;
      e.currentTarget.textContent = trafficActive ? '🚗 车流与行人: 开' : '🚗 车流与行人: 关';
      e.currentTarget.classList.toggle('active', trafficActive);
    });

    let sakuraActive = true;
    document.getElementById('toggle-sakura').addEventListener('click', e => {
      setDirectorActive(false);
      sakuraActive = !sakuraActive;
      sakuraPetalsMesh.visible = sakuraActive;
      e.currentTarget.textContent = sakuraActive ? '🌸 樱花瓣飘落: 开' : '🌸 樱花瓣飘落: 关';
      e.currentTarget.classList.toggle('active', sakuraActive);
    });

    document.getElementById('toggle-ink').addEventListener('click', () => {
      setDirectorActive(false);
      setInkState(!inkActive);
    });

    document.getElementById('toggle-door').addEventListener('click', () => {
      setDirectorActive(false);
      toggleDoor();
    });

    document.getElementById('toggle-roof').addEventListener('click', () => {
      setDirectorActive(false);
      const targetY = roofLifted ? 0 : 5.5;
      roofLifted = !roofLifted;
      gsap.to(roofGroup.position, {
        y: targetY,
        overwrite: true,
        onUpdate: () => { renderer.shadowMap.needsUpdate = true; },
        duration: 0.85,
        ease: 'power2.inOut',
        onComplete: () => { renderer.shadowMap.needsUpdate = true; }
      });
      const btn = document.getElementById('toggle-roof');
      btn.classList.toggle('active', roofLifted);
      btn.textContent = roofLifted ? '🏠 还原便利店屋顶' : '🏠 掀开屋顶俯瞰店内';
    });

    document.getElementById('spill-slider').addEventListener('input', e => {
      setDirectorActive(false);
      const v = parseFloat(e.target.value);
      frontLightSpillMat.opacity = Math.min(1.0, 0.88 * v);
      sideSpillMat.opacity = Math.min(1.0, 0.78 * v);
      volumetricBeams.forEach(b => { b.material.opacity = 0.062 * v; });
      storeLights.forEach(sl => { sl.light.intensity = sl.base * v; });
    });

    document.getElementById('wet-slider').addEventListener('input', e => {
      setDirectorActive(false);
      const reflectStrength = parseFloat(e.target.value);
      wetRoadOverlay.material.opacity = 1.0 - reflectStrength;
      roadMirror.visible = reflectStrength > 0.02;
    });

    // =========================================================
    // 13. BUILT-IN COMPOSITE VIDEO RECORDER & EXPORTER (WebM / MP4)
    // =========================================================
    let mediaRecorder = null;
    let recordedChunks = [];
    let isRecording = false;
    const recCanvas = document.createElement('canvas');
    recCanvas.width = 1280;
    recCanvas.height = 720;
    const recCtx = recCanvas.getContext('2d');

    function drawCompositeVideoFrame() {
      if (!isRecording) return;
      recCtx.drawImage(renderer.domElement, 0, 0, 1280, 720);

      // Draw Top-Left Title Badge on exported video
      recCtx.fillStyle = 'rgba(10, 15, 29, 0.82)';
      recCtx.beginPath();
      recCtx.roundRect(24, 20, 430, 62, 12);
      recCtx.fill();
      recCtx.strokeStyle = 'rgba(245, 158, 11, 0.6)';
      recCtx.lineWidth = 2;
      recCtx.stroke();

      recCtx.fillStyle = '#fde68a';
      recCtx.font = 'bold 20px "PingFang SC", "Microsoft YaHei", sans-serif';
      recCtx.fillText('星野マート 24H • 1:35 微缩盒景全功能巡礼', 42, 48);
      recCtx.fillStyle = '#38bdf8';
      recCtx.font = 'bold 14px ui-monospace, monospace';
      recCtx.fillText(document.getElementById('hud-feature-tag').textContent, 42, 70);

      // Draw Bottom Subtitle Bar on exported video
      recCtx.fillStyle = 'rgba(8, 13, 26, 0.86)';
      recCtx.beginPath();
      recCtx.roundRect(140, 618, 1000, 76, 14);
      recCtx.fill();
      recCtx.strokeStyle = 'rgba(251, 191, 36, 0.45)';
      recCtx.lineWidth = 2;
      recCtx.stroke();

      recCtx.textAlign = 'center';
      recCtx.fillStyle = '#fef3c7';
      recCtx.font = 'bold 20px "PingFang SC", "Microsoft YaHei", sans-serif';
      recCtx.fillText(document.getElementById('sub-zh').textContent, 640, 650);
      recCtx.fillStyle = '#94a3b8';
      recCtx.font = '14px system-ui, sans-serif';
      recCtx.fillText(document.getElementById('sub-en').textContent, 640, 678);
      recCtx.textAlign = 'left';
    }

    const recBtn = document.getElementById('btn-record-video');
    recBtn.addEventListener('click', () => {
      if (!isRecording) {
        try {
          const stream = recCanvas.captureStream(60);
          const mimeTypes = [
            'video/mp4;codecs=avc1',
            'video/webm;codecs=vp9',
            'video/webm;codecs=vp8',
            'video/webm'
          ];
          let chosenMime = '';
          for (const m of mimeTypes) {
            if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) {
              chosenMime = m;
              break;
            }
          }
          mediaRecorder = chosenMime ? new MediaRecorder(stream, { mimeType: chosenMime, videoBitsPerSecond: 8000000 }) : new MediaRecorder(stream);
          recordedChunks = [];
          mediaRecorder.ondataavailable = e => {
            if (e.data && e.data.size > 0) recordedChunks.push(e.data);
          };
          mediaRecorder.onstop = () => {
            const ext = chosenMime.includes('mp4') ? 'mp4' : 'webm';
            const blob = new Blob(recordedChunks, { type: chosenMime || 'video/webm' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `hoshino_mart_1_35_showcase.${ext}`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 5000);
          };
          // Start recording from current or beginning of showcase
          setDirectorActive(true);
          mediaRecorder.start(200);
          isRecording = true;
          recBtn.textContent = '⏹ 停止并保存视频';
          recBtn.classList.add('recording');
        } catch (err) {
          recBtn.textContent = '⚠️ 浏览器不支持录制';
        }
      } else {
        isRecording = false;
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
          mediaRecorder.stop();
        }
        recBtn.textContent = '🎥 录制导出视频';
        recBtn.classList.remove('recording');
      }
    });

    // =========================================================
    // 14. 60FPS MASTER ANIMATION LOOP
    // =========================================================
    const clock = new THREE.Clock();
    let nextAutoDoorTime = 6.0;
    let frameCount = 0;
    let lastFpsTime = performance.now();
    const fpsBadge = document.getElementById('fps-badge');

    // Initial full-object view and added street stories.
    // Small street stories, built from geometry in the same cel-shaded palette.
    const lifeDetails = new THREE.Group();
    diorama.add(lifeDetails);
    function propBox(group,w,h,d,color,x,y,z){const m=box(w,h,d,color);m.position.set(x,y,z);group.add(m);return m;}
    function propRod(group,a,b,r,color){
      const va=new THREE.Vector3(...a),vb=new THREE.Vector3(...b),axis=vb.clone().sub(va);
      const m=cyl(r,r,axis.length(),8,color);m.position.copy(va).add(vb).multiplyScalar(.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),axis.normalize());group.add(m);return m;
    }
    const bike = new THREE.Group();bike.position.set(-9.45,.19,.72);bike.rotation.y=.16;lifeDetails.add(bike);
    const bikeMat=makeCelMat(0x95c6bc),rubber=makeCelMat(0x182832),chrome=makeCelMat(0x9cabb0);
    [-.58,.58].forEach(x=>{
      const tire=new THREE.Mesh(new THREE.TorusGeometry(.37,.045,6,24),rubber);tire.position.set(x,.4,0);bike.add(tire);
      const rim=new THREE.Mesh(new THREE.TorusGeometry(.312,.018,4,20),chrome);rim.position.copy(tire.position);bike.add(rim);
      for(let i=0;i<8;i++){let a=i*Math.PI/4;propRod(bike,[x,.4,.012],[x+Math.cos(a)*.30,.4+Math.sin(a)*.30,.012],.006,0xb7baba);}
    });
    [ [[-.58,.4,0],[-.20,.96,0]], [[-.20,.96,0],[.06,.42,0]], [[.06,.42,0],[-.58,.4,0]],
      [[-.20,.96,0],[.42,.98,0]], [[.42,.98,0],[.06,.42,0]], [[.42,.98,0],[.58,.4,0]],
      [[-.20,.96,0],[-.23,1.12,0]], [[.42,.98,0],[.38,1.25,0]]
    ].forEach(([a,b])=>propRod(bike,a,b,.032,0x95c6bc));
    propBox(bike,.30,.07,.19,0x24363c,-.23,1.14,0);
    propRod(bike,[.38,1.25,-.25],[.38,1.25,.25],.025,0x9cabb0);
    propBox(bike,.31,.25,.34,0x8f9ea2,.66,1.05,0);
    propBox(bike,.26,.025,.29,0x33474d,.66,1.185,0);
    propRod(bike,[.02,.42,0],[-.02,.16,.22],.018,0xa9b7b2);
    const cat = new THREE.Group();cat.position.set(4.52,.2,.78);cat.rotation.y=-.55;lifeDetails.add(cat);
    propBox(cat,1.0,.1,.68,0x94734e,0,.05,0);
    propBox(cat,.48,.14,.35,0x533e31,0,.15,0);
    const catBody=new THREE.Mesh(new THREE.SphereGeometry(.26,12,8),makeCelMat(0xcda576));catBody.scale.set(1.2,.7,.7);catBody.position.set(0,.31,0);cat.add(catBody);
    const catHead=new THREE.Mesh(new THREE.SphereGeometry(.17,12,8),makeCelMat(0xe0b887));catHead.position.set(-.20,.44,.05);cat.add(catHead);
    [-.31,-.12].forEach(x=>{const ear=new THREE.Mesh(new THREE.ConeGeometry(.075,.15,3),makeCelMat(0xc5936b));ear.position.set(x,.59,.05);cat.add(ear);});
    [-.26,-.15].forEach(x=>propBox(cat,.045,.018,.015,0x473c3d,x,.455,.203));
    const tail=new THREE.Mesh(new THREE.TorusGeometry(.19,.045,6,16,Math.PI*1.3),makeCelMat(0xcda576));tail.rotation.x=Math.PI/2;tail.position.set(.19,.24,.03);cat.add(tail);
    const bowl=cyl(.12,.09,.08,12,0x819ea1);bowl.position.set(-.62,.08,.06);cat.add(bowl);
    const crates = new THREE.Group();crates.position.set(6.18,.2,-3.7);lifeDetails.add(crates);
    [[0,0,0],[.78,0,.08],[0,.52,0]].forEach(([x,y,z],i)=>{
      propBox(crates,.68,.48,.53,i===1?0x827959:0xa88965,x,y+.24,z);
      propBox(crates,.11,.49,.536,0xcebd8e,x,y+.24,z);
      const label=makeFrontBackBox(.32,.19,.01,createGraphicSign(192,100,'#ece6cf','#5d655d',i===1?'MILK':'星野便','DAILY DELIVERY'),0x9c886a);
      label.position.set(x+.12,y+.25,z+.277);crates.add(label);
    });
    function pottedPlant(x,z,color){const g=new THREE.Group();g.position.set(x,.2,z);lifeDetails.add(g);
      const pot=cyl(.18,.13,.27,10,color);pot.position.y=.135;g.add(pot);
      const soil=cyl(.16,.16,.02,10,0x3e3930);soil.position.y=.276;g.add(soil);
      for(let i=0;i<7;i++){let a=i*2.399;const leaf=new THREE.Mesh(new THREE.SphereGeometry(.105,6,4),makeCelMat(i%2?0x729474:0x42775f));leaf.scale.set(.65,1.65,.55);leaf.rotation.z=Math.cos(a)*.65;leaf.position.set(Math.cos(a)*.13,.39+(i%3)*.07,Math.sin(a)*.13);g.add(leaf);}
    }
    pottedPlant(-5.05,.82,0x9e6d54);pottedPlant(-4.65,.72,0x768e8a);pottedPlant(5.08,.76,0xa97856);
    const menu=new THREE.Group();menu.position.set(-.78,.2,.87);menu.rotation.y=-.2;lifeDetails.add(menu);
    const chalk=makeFrontBackBox(.50,.68,.06,createGraphicSign(320,420,'#233e38','#b6ab83','本日の珈琲','HOT COFFEE  ¥150'),0x9e805b);chalk.position.y=.64;menu.add(chalk);
    [-.18,.18].forEach(x=>{propRod(menu,[x,0,-.18],[x,.99,0],.028,0xa78b61);propRod(menu,[x,0,.25],[x,.99,0],.028,0xa78b61);});

    // A grained wooden edge and brass fixtures ground the scene as a handmade object.
    const grainCanvas=document.createElement('canvas');grainCanvas.width=1024;grainCanvas.height=128;
    const grainCtx=grainCanvas.getContext('2d');grainCtx.fillStyle='#634331';grainCtx.fillRect(0,0,1024,128);
    for(let i=0;i<110;i++){const y=(i*17.31)%128;grainCtx.strokeStyle=i%3?'rgba(30,17,13,.13)':'rgba(197,152,101,.18)';grainCtx.lineWidth=.4+i%3*.35;grainCtx.beginPath();grainCtx.moveTo(0,y);grainCtx.bezierCurveTo(280,y+Math.sin(i)*5,710,y-Math.cos(i)*4,1024,y);grainCtx.stroke();}
    const grainTex=new THREE.CanvasTexture(grainCanvas);grainTex.colorSpace=THREE.SRGBColorSpace;
    woodPlinth.material=new THREE.MeshToonMaterial({map:grainTex,gradientMap:celRamp});
    [-18.6,18.6].forEach(x=>{const screw=new THREE.Mesh(new THREE.SphereGeometry(.10,8,6),makeCelMat(0xad9568));screw.scale.z=.4;screw.position.set(x,-.94,11.12);diorama.add(screw);});

    let toastTimeout;
    function showToast(message){const el=document.getElementById('toast');el.textContent=message;el.style.opacity='1';clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>el.style.opacity='0',2300);}
    const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
    const preferredDirection=orbitDirection();
    const overviewDirection=new THREE.Vector3(preferredDirection.x,preferredDirection.y,preferredDirection.z);
    const overviewCenter=new THREE.Vector3(0,.6,-6.2);
    let currentCameraKey='iso';
    function fitOverview(direction=overviewDirection){
      // Match the reference's closer framing, adapting only when the viewport needs more room.
      const tanV=Math.tan(THREE.MathUtils.degToRad(camera.fov*.5))*.88,tanH=Math.tan(THREE.MathUtils.degToRad(camera.fov*.5))*camera.aspect*.90;
      const right=new THREE.Vector3().crossVectors(camera.up,direction).normalize(),up=new THREE.Vector3().crossVectors(direction,right);
      let distance=ORBIT_CONFIG.preferredRadius;
      for(const x of [-19.3,19.3])for(const y of [-1.4,10])for(const z of [-23.5,11.1]){
        const c=new THREE.Vector3(x,y,z).sub(overviewCenter),depth=c.dot(direction);
        distance=Math.max(distance,Math.abs(c.dot(right))/tanH+depth,Math.abs(c.dot(up))/tanV+depth);
      }
      return overviewCenter.clone().addScaledVector(direction,distance);
    }
    function navigateTo(requested){
      const key=requested!=='iso'&&currentCameraKey===requested?'iso':requested;
      closeDetail();pauseIdleOrbit(key==='iso'?0:8);currentCameraKey=key;syncStorySelection();
      setDirectorActive(false);
      gsap.killTweensOf(camera.position);gsap.killTweensOf(controls.target);
      controls.enabled=false;controls.update(); // clear accumulated damping before a new owner writes the camera
      const p=camPresets[key],pos=key==='iso'?fitOverview():new THREE.Vector3(...p.pos);
      document.querySelectorAll('[data-cam]').forEach(b=>b.classList.toggle('active',b.dataset.cam===key));
      gsap.to(camera.position,{x:pos.x,y:pos.y,z:pos.z,duration:reducedMotion?0:1.1,ease:'power2.inOut',overwrite:true,onComplete:()=>{controls.enabled=true;controls.update();}});
      const target=key==='iso'?overviewCenter:new THREE.Vector3(...p.target);
      gsap.to(controls.target,{x:target.x,y:target.y,z:target.z,duration:reducedMotion?0:1.1,ease:'power2.inOut',overwrite:true});
      return key;
    }
    const stops=[
      {id:'store',label:'深夜也亮着的店',point:[-.5,4.5,.3],cam:'front',body:'星野マート的灯还亮着。透过带雨痕的玻璃，可以看到便当、咖啡和整齐的货架；门口的手写小牌写着今日热咖啡。'},
      {id:'bike',label:'最后一位客人的车',point:[-9.45,1.9,.72],cam:'bike',body:'一辆薄荷绿的通勤自行车停在贩卖机旁。车篮、辐条、脚撑都由小几何体组成，像有人刚进去买了一份夜宵。'},
      {id:'cat',label:'屋檐下的避雨客',point:[4.52,1.7,.78],cam:'cat',body:'一只小猫蜷在窗边纸箱上。屋檐挡住了雨，便利店的暖光照着小水碗。为它留一个不被打扰的位置。'},
      {id:'park',label:'穿过街区去看夜樱',point:[-1.8,6.7,-11.5],cam:'park',body:'店后是桜町公园。夜樱、溪流、红桥和灯笼构成另一处小天地，花瓣缓缓落在湿润的小径上。'},
      {id:'delivery',label:'明天的第一批补货',point:[6.18,1.9,-3.7],cam:'delivery',body:'侧门边的牛奶和日用品已经送到。封箱胶带与星野便标签，让这间小店有了持续营业的生活痕迹。'},
      {id:'courtyard',label:'绿瓦屋顶下的小院',point:[15.45,3.7,-.4],cam:'courtyard',body:'绿瓦、米黄色外墙、二楼晾衣阳台和一楼凸窗，围出昭和住宅熟悉的小院。石板从半开的木门一直通向玄关，花盆、水壶和院树留在暖窗光里。'},
      {id:'garden',label:'縁側与竹水钵',point:[-12.0,4.6,-12.1],cam:'garden',body:'木造住宅把障子拉门朝向石庭。坐在縁側可以看到小水钵、竹制引水管和低矮的围墙，暖光透过窗格，落在门前的石板上。'}
    ];
    const detailCard=document.getElementById('detail-card'),hotspotLayer=document.getElementById('hotspot-layer');
    let selectedStop=null,hotspotsEnabled=true;
    for(const [i,s] of stops.entries()){
      s.button=document.createElement('button');s.button.className='scene-hotspot';s.button.textContent=String(i+1).padStart(2,'0');s.button.setAttribute('aria-label',s.label);s.button.addEventListener('click',()=>openDetail(s));hotspotLayer.appendChild(s.button);s.world=new THREE.Vector3(...s.point);
      const listBtn=document.createElement('button');listBtn.className='btn';listBtn.textContent=`${String(i+1).padStart(2,'0')} ${s.label}`;listBtn.setAttribute('aria-pressed','false');listBtn.addEventListener('click',()=>openDetail(s));s.listButton=listBtn;document.getElementById('detail-list').appendChild(listBtn);
    }
    function syncStorySelection(){for(const s of stops){const active=s.cam===currentCameraKey;s.listButton.classList.toggle('active',active);s.listButton.setAttribute('aria-pressed',String(active));}}
    function openDetail(s){if(navigateTo(s.cam)==='iso')return;selectedStop=s;detailCard.hidden=false;document.getElementById('detail-title').textContent=s.label;document.getElementById('detail-body').textContent=s.body;document.getElementById('detail-kicker').textContent=`STREET STORY / ${String(stops.indexOf(s)+1).padStart(2,'0')}`;s.button.setAttribute('aria-expanded','true');}
    function closeDetail(restoreFocus=false){detailCard.hidden=true;if(selectedStop){selectedStop.button.setAttribute('aria-expanded','false');if(restoreFocus)selectedStop.listButton.focus();selectedStop=null;}}
    document.getElementById('detail-close').addEventListener('click',()=>closeDetail(true));
    document.getElementById('btn-home').addEventListener('click',()=>{closeDetail();navigateTo('iso');});
    document.getElementById('btn-hotspots').addEventListener('click',e=>{hotspotsEnabled=!hotspotsEnabled;e.currentTarget.textContent=hotspotsEnabled?'细节标记 · 开':'细节标记 · 关';});
    document.getElementById('btn-photo').addEventListener('click',()=>{
      renderer.render(scene,camera);const a=document.createElement('a');a.download='桜町三丁目-微缩盒景.png';a.href=renderer.domElement.toDataURL('image/png');a.click();showToast('已保存当前模型画面');
    });
    const projected=new THREE.Vector3();
    function updateHotspots(){
      for(const s of stops){projected.copy(s.world).project(camera);const visible=hotspotsEnabled&&!videoPlaying&&camera.position.distanceTo(controls.target)>42&&projected.z>-1&&projected.z<1&&Math.abs(projected.x)<.92&&Math.abs(projected.y)<.80;
        s.button.hidden=!visible;if(visible){s.button.style.left=`${(projected.x*.5+.5)*100}%`;s.button.style.top=`${(-projected.y*.5+.5)*100}%`;}
      }
    }
    window.addEventListener('keydown',e=>{
      if(e.target.matches('input,select,textarea')||e.altKey||e.ctrlKey||e.metaKey)return;
      if(e.key==='Escape'){closeDetail();}
      if(e.key.toLowerCase()==='r'){navigateTo('iso');}
    });
    document.addEventListener('visibilitychange',()=>{clock.getDelta();});
    renderer.domElement.addEventListener('pointerdown',()=>{pauseIdleOrbit();setDirectorActive(false);},true);
    // Keep the opening a quiet, complete object view. Guided playback remains opt-in.
    setDirectorActive(false);applySkyPresetImmediate('rainNight');setSpillAndWetValues(1.0,.30);
    camera.position.copy(fitOverview());controls.target.copy(overviewCenter);controls.update();
    document.getElementById('btn-toggle-sub').click();
    document.getElementById('hud-chapter-title').textContent='桜町三丁目 · 自由观察';
    document.getElementById('hud-feature-desc').textContent='拖动旋转，滚轮靠近。点击数字标记，发现街角的小故事；按 R 回到完整盒景。';
    document.getElementById('sub-zh').textContent='一间还亮着灯的便利店，和它周围安静的日常。';
    document.getElementById('sub-en').textContent='A small neighborhood, still awake in the rain.';
    renderer.shadowMap.needsUpdate=true;
    renderer.domElement.setAttribute('aria-label','桜町三丁目交互式微缩街区：拖动旋转，滚轮缩放');
    renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();showToast('画面连接中断，请刷新页面恢复模型');});
    renderer.domElement.addEventListener('webglcontextrestored',()=>location.reload());

    let rainDensity=.60;
    rainGeo.setDrawRange(0, Math.floor(rainCount*rainDensity)*2);
    document.getElementById('rain-density').addEventListener('input',e=>{
      setDirectorActive(false);rainDensity=Number(e.target.value)/100;
      document.getElementById('rain-output').value=`${e.target.value}%`;
      rainGeo.setDrawRange(0,Math.floor(rainCount*rainDensity)*2);setRainState(rainDensity>0);
    });


    // Rain and snow share one particle position buffer. Only the selected precipitation renders.
    let weatherMode='rain',snowActive=false,lastNonSnowSky='rainNight',lastPrecipitation='rain';
    const snowField=createSnowField(rainCount*2);let snowTime=0;
    rainGeo.setAttribute('flakeSize',new THREE.BufferAttribute(snowField.sizes,1));rainGeo.setAttribute('flakeOpacity',new THREE.BufferAttribute(snowField.opacity,1));rainGeo.attributes.position.setUsage(THREE.DynamicDrawUsage);
    const snowParticleMat=new THREE.ShaderMaterial({uniforms:{uViewportHeight:{value:renderer.domElement.height},uPixelRatio:{value:renderer.getPixelRatio()}},transparent:true,depthWrite:false,depthTest:true,
      vertexShader:`attribute float flakeSize;attribute float flakeOpacity;uniform float uViewportHeight;uniform float uPixelRatio;varying float vAlpha;
        void main(){vec4 viewPosition=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*viewPosition;
          gl_PointSize=clamp(flakeSize*uViewportHeight*projectionMatrix[1][1]/max(1.,-viewPosition.z),.8*uPixelRatio,3.8*uPixelRatio);
          vAlpha=flakeOpacity*smoothstep(.18,.75,position.y)*(1.-smoothstep(16.,17.98,position.y));}`,
      fragmentShader:`varying float vAlpha;void main(){float r=length(gl_PointCoord-.5)*2.;float alpha=(1.-smoothstep(.25,1.,r))*vAlpha;if(alpha<.02)discard;gl_FragColor=vec4(.95,.975,1.,alpha);}`
    });
    const snowPoints=new THREE.Points(rainGeo,snowParticleMat);snowPoints.frustumCulled=false;snowPoints.visible=false;diorama.add(snowPoints);
    const snowStatic=new THREE.Group(),snowRoof=new THREE.Group();snowStatic.visible=snowRoof.visible=false;diorama.add(snowStatic);roofGroup.add(snowRoof);
    const snowMat=new THREE.MeshToonMaterial({color:0xf1f6fb,gradientMap:celRamp,emissive:0xa4b5c6,emissiveIntensity:.25,side:THREE.DoubleSide});
    scene.updateMatrixWorld(true);
    function collectSnowCaps(root,target){
      const positions=[];const inv=target.matrixWorld.clone().invert(),a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),n=new THREE.Vector3();
      const mappedRoofs=new Set([...homeRoofMaterials.values()]);
      root.traverse(o=>{
        if(!o.isMesh||o.isInstancedMesh||Array.isArray(o.material)||o.material.transparent||o.material.isShaderMaterial)return;
        o.geometry.computeBoundingBox();const size=o.geometry.boundingBox.getSize(new THREE.Vector3()),worldPos=o.getWorldPosition(new THREE.Vector3());
        if(!mappedRoofs.has(o.material)&&!(size.y<.36&&size.x>1&&size.z>.45&&worldPos.y>2.3))return;
        const geo=o.geometry,index=geo.index,attr=geo.attributes.position,triangles=index?index.count:attr.count;
        for(let i=0;i<triangles;i+=3){
          a.fromBufferAttribute(attr,index?index.getX(i):i).applyMatrix4(o.matrixWorld);b.fromBufferAttribute(attr,index?index.getX(i+1):i+1).applyMatrix4(o.matrixWorld);c.fromBufferAttribute(attr,index?index.getX(i+2):i+2).applyMatrix4(o.matrixWorld);
          n.copy(b).sub(a).cross(c.clone().sub(a)).normalize();if(n.y<.42)continue;
          for(const v of [a,b,c]){v.addScaledVector(n,.028).applyMatrix4(inv);positions.push(...v.toArray());}
        }
      });
      if(positions.length){const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.computeVertexNormals();const mesh=new THREE.Mesh(geo,snowMat);mesh.receiveShadow=true;target.add(mesh);}
    }
    collectSnowCaps(neighborhoodGroup,snowStatic);collectSnowCaps(roofGroup,snowRoof);
    // Opaque raised snow has real thickness; the stream and the main walking path stay open.
    const snowParts=[];
    function snowShape(geo,x,y,z,sx=1,sy=1,sz=1,ry=0){const m=new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromEuler(new THREE.Euler(0,ry,0)),new THREE.Vector3(sx,sy,sz));const g=geo.index?geo.toNonIndexed():geo.clone();g.applyMatrix4(m);snowParts.push(g);}
    function snowSlab(w,d,x,top,z,thickness=.06){const geo=new THREE.BoxGeometry(w,thickness,d);snowShape(geo,x,top-thickness/2,z);geo.dispose();}
    for(const [w,d,x,y,z] of [[27.8,25,-4.8,.20,-10.3],[6.3,25,15.55,.20,-10.3],[37.4,1.3,0,.23,10.05],[5.6,3.05,15.45,.399,-.10],[2.3,6.2,-12.5,.38,-12.1],
      [6.9,9.6,-5.15,.327,-11.35],[7.1,9.6,4.85,.327,-11.35]])snowSlab(w,d,x,y,z);
    // One connected heightfield per curb: broad soft shoulders, no intersecting ellipsoids.
    function snowBank({axis='x',start,end,center,width=.95,height=.16,baseA=.20,baseB=.048,seed=0}){
      const alongSteps=Math.ceil((end-start)/.17),acrossSteps=12,positions=[],uvs=[],indices=[];
      for(let i=0;i<=alongSteps;i++){
        const along=start+(end-start)*i/alongSteps;
        const taper=THREE.MathUtils.smoothstep(along-start,0,.85)*THREE.MathUtils.smoothstep(end-along,0,.85);
        const halfWidth=width*.5*(1+.10*Math.sin(along*.83+seed)+.045*Math.cos(along*2.07-seed));
        const wander=(.045*Math.sin(along*.63+seed)+.025*Math.sin(along*1.79+seed*2))*taper;
        const rise=height*(.83+.13*Math.sin(along*.72+seed)+.08*Math.sin(along*1.86-seed));
        for(let j=0;j<=acrossSteps;j++){
          const u=j/acrossSteps,across=center+(u-.5)*2*halfWidth+wander;
          const shoulder=Math.pow(Math.sin(u*Math.PI),1.65);
          const base=THREE.MathUtils.lerp(baseA,baseB,THREE.MathUtils.smoothstep(u,0,1));
          const y=base+shoulder*rise*taper;
          positions.push(axis==='x'?along:across,y,axis==='x'?across:along);uvs.push(i/alongSteps,u);
          if(i<alongSteps&&j<acrossSteps){const a=i*(acrossSteps+1)+j,b=a+acrossSteps+1;
            if(axis==='x')indices.push(a,a+1,b,a+1,b+1,b);else indices.push(a,b,a+1,a+1,b,b+1);
          }
        }
      }
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geo.setIndex(indices);geo.computeVertexNormals();snowShape(geo,0,0,0);geo.dispose();
    }
    // The cleared crossing interrupts the bank; long irregular ridges merge into the pavement.
    for(const [start,end] of [[-18.5,7.8],[12.7,18.5]]){
      snowBank({start,end,center:2.29,width:1.0,height:.17,seed:.8});
      snowBank({start,end,center:9.30,width:.92,height:.14,baseA:.048,baseB:.231,seed:3.1});
    }
    snowBank({axis:'z',start:-22.65,end:1.95,center:9.18,width:.88,height:.14,seed:4.2});
    snowBank({axis:'z',start:-22.65,end:1.95,center:12.32,width:.88,height:.16,baseA:.048,baseB:.201,seed:6.7});
    // Shallow broad snow lips at the stream merge into the park's blanket.
    snowBank({axis:'z',start:-15.8,end:-6.9,center:-1.78,width:.70,height:.075,baseA:.327,baseB:.302,seed:1.2});
    snowBank({axis:'z',start:-15.8,end:-6.9,center:.32,width:.70,height:.065,baseA:.302,baseB:.327,seed:2.9});
    // Two-ball snowman on the near pavement, facing the viewer; all parts merge by material.
    const snowman=new THREE.Group();snowman.position.set(10.7,.23,10.0);snowman.rotation.y=.45;snowStatic.add(snowman);
    function snowmanPart(geo,mat,x,y,z){const mesh=new THREE.Mesh(geo,mat);mesh.position.set(x,y,z);snowman.add(mesh);return mesh;}
    snowmanPart(new THREE.SphereGeometry(.56,18,12),snowMat,0,.51,0).scale.y=.94;
    snowmanPart(new THREE.SphereGeometry(.38,16,10),snowMat,0,1.21,.015);
    const coalMat=new THREE.MeshToonMaterial({color:0x23313a,gradientMap:celRamp}),scarfMat=new THREE.MeshToonMaterial({color:0xb84942,gradientMap:celRamp}),carrotMat=new THREE.MeshToonMaterial({color:0xe89b43,gradientMap:celRamp});
    for(const x of [-.125,.125])snowmanPart(new THREE.SphereGeometry(.044,7,5),coalMat,x,1.29,.36);
    for(const y of [.42,.64,.82])snowmanPart(new THREE.SphereGeometry(.045,7,5),coalMat,0,y,.52);
    for(let i=0;i<5;i++){const a=(i/4-.5)*1.35;snowmanPart(new THREE.SphereGeometry(.023,6,4),coalMat,Math.sin(a)*.17,1.135-Math.cos(a)*.045,.36);}
    const nose=snowmanPart(new THREE.ConeGeometry(.065,.26,9),carrotMat,0,1.22,.46);nose.rotation.x=Math.PI/2;
    const scarf=snowmanPart(new THREE.TorusGeometry(.29,.065,7,20),scarfMat,0,1.0,0);scarf.rotation.x=Math.PI/2;
    const scarfTail=snowmanPart(new THREE.BoxGeometry(.16,.40,.07),scarfMat,.23,.80,.35);scarfTail.rotation.z=-.2;
    snowmanPart(new THREE.CylinderGeometry(.32,.34,.08,16),coalMat,0,1.54,0);
    snowmanPart(new THREE.CylinderGeometry(.23,.25,.30,16),coalMat,0,1.72,0);
    snowmanPart(new THREE.CylinderGeometry(.253,.259,.055,16),scarfMat,0,1.60,0);
    function twig(a,b){const va=new THREE.Vector3(...a),vb=new THREE.Vector3(...b),d=vb.clone().sub(va);const o=snowmanPart(new THREE.CylinderGeometry(.018,.026,d.length(),6),coalMat,...va.add(vb).multiplyScalar(.5).toArray());o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());}
    for(const s of [-1,1]){twig([s*.40,.75,0],[s*.86,1.03,.02]);twig([s*.76,.97,.02],[s*.81,1.17,.02]);}
    const packedGeo=mergeGeometries(snowParts);snowParts.forEach(g=>g.dispose());const packedSnow=new THREE.Mesh(packedGeo,snowMat);packedSnow.receiveShadow=true;snowStatic.add(packedSnow);
    snowman.updateMatrix();const snowmanBuckets=new Map();for(const o of snowman.children){o.updateMatrix();const g=o.geometry.toNonIndexed();g.applyMatrix4(o.matrix);if(!snowmanBuckets.has(o.material))snowmanBuckets.set(o.material,[]);snowmanBuckets.get(o.material).push(g);o.geometry.dispose();}snowman.clear();
    for(const [mat,parts] of snowmanBuckets){const m=new THREE.Mesh(mergeGeometries(parts),mat);parts.forEach(g=>g.dispose());m.castShadow=m.receiveShadow=true;snowman.add(m);}
    // Slushy asphalt remains visible in four worn tyre tracks, with white snow between them.
    function snowyRoad(w,d,x,z,across){
      const c=document.createElement('canvas');c.width=1024;c.height=256;const ctx=c.getContext('2d');ctx.fillStyle='#edf3f8';ctx.fillRect(0,0,c.width,c.height);
      ctx.globalCompositeOperation='destination-out';
      const tracks=across?[3.48,4.62,6.78,7.92]:[9.8,11.0];
      for(const v of tracks){const axis=across?(v-2.3)/7:(v-9.3)/2.9,center=axis*(across?256:1024),span=across?256/7:1024/2.9;const grad=across?ctx.createLinearGradient(0,center-span*.38,0,center+span*.38):ctx.createLinearGradient(center-span*.38,0,center+span*.38,0);grad.addColorStop(0,'rgba(0,0,0,0)');grad.addColorStop(.25,'rgba(0,0,0,.88)');grad.addColorStop(.75,'rgba(0,0,0,.88)');grad.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=grad;ctx.fillRect(across?0:center-span*.38,across?center-span*.38:0,across?1024:span*.76,across?span*.76:256);}
      ctx.globalCompositeOperation='source-over';const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
      const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,d),new THREE.MeshToonMaterial({map:tex,color:0xf1f5f9,emissive:0x71869a,emissiveIntensity:.18,gradientMap:celRamp,transparent:true,depthWrite:false}));mesh.rotation.x=-Math.PI/2;mesh.position.set(x,.048,z);mesh.renderOrder=1;mesh.receiveShadow=true;snowStatic.add(mesh);
    }
    snowyRoad(37.4,7,0,5.8,true);snowyRoad(2.9,24.3,10.75,-9.85,false);
    camPresets.snowman={pos:[16,4.4,17.5],target:[10.7,1.0,9.9]};
    const snowFocus=document.createElement('button');snowFocus.className='btn';snowFocus.textContent='☃️ 路边雪人与积雪';snowFocus.id='snow-closeup';snowFocus.style.width='100%';document.querySelector('[data-weather]').parentElement.after(snowFocus);snowFocus.addEventListener('click',()=>{setWeatherMode('snow');navigateTo('snowman');document.getElementById('ui-panel').classList.add('collapsed');syncFoldButtons();});
    skyPresets.snowDay={label:'❄️ 雪天灰蓝',top:0x253749,mid:0x667b91,bot:0xb3c1d0,hemiSky:0xc1d3e2,hemiGnd:0x596a7c,hemiInt:.87,moonCol:0xb8cee0,moonInt:.80};
    function setWeatherMode(mode){
      const previous=weatherMode;
      if(mode==='snow'&&previous!=='snow'){snowTime=0;updateSnow(0);lastNonSnowSky=document.querySelector('[data-sky].active')?.dataset.sky||'rainNight';applySkyPresetImmediate('snowDay');}
      if(previous==='snow'&&mode!=='snow'&&document.getElementById('sky-label').textContent===skyPresets.snowDay.label)applySkyPresetImmediate(lastNonSnowSky);
      weatherMode=mode;if(mode!=='clear')lastPrecipitation=mode;rainActive=mode==='rain';snowActive=mode==='snow';rainLines.visible=rainActive;snowPoints.visible=snowActive;snowStatic.visible=snowRoof.visible=snowActive;
      document.body.dataset.weather=mode;roadMirror.visible=!snowActive&&Number(document.getElementById('wet-slider').value)>.02;wetRoadOverlay.material.opacity=snowActive?.96:1-Number(document.getElementById('wet-slider').value);
      document.querySelector('#studio-header p').textContent=mode==='snow'?'雪落屋檐，灯还亮着。 / 星野マート 24H':'雨落街角，灯还亮着。 / 星野マート 24H';
      rainGlassUniforms.uActive.value=rainActive?1:0;ripples.forEach(r=>r.mesh.visible=rainActive);eaveDrops.forEach(r=>r.mesh.visible=rainActive);
      document.querySelectorAll('[data-weather]').forEach(b=>{b.classList.toggle('active',b.dataset.weather===mode);b.setAttribute('aria-pressed',String(b.dataset.weather===mode));});
      const button=document.getElementById('toggle-rain');button.classList.toggle('active',mode!=='clear');button.textContent=mode==='snow'?'❄️ 飘雪: 开':mode==='rain'?'🌧️ 降雨: 开':'降水: 关';
      renderer.shadowMap.needsUpdate=true;
    }
    function setRainState(active){setWeatherMode(active?lastPrecipitation:'clear');}
    function updateSnow(dt){
      snowTime+=dt*1.5;stepSnowField(snowField,snowTime,rainGeo.attributes.position.array);rainGeo.attributes.position.needsUpdate=true;
      snowParticleMat.uniforms.uViewportHeight.value=renderer.domElement.height;snowParticleMat.uniforms.uPixelRatio.value=renderer.getPixelRatio();
    }
    document.querySelectorAll('[data-weather]').forEach(b=>b.addEventListener('click',()=>setWeatherMode(b.dataset.weather)));
    document.getElementById('wet-slider').addEventListener('input',()=>{if(snowActive){roadMirror.visible=false;wetRoadOverlay.material.opacity=.96;}});
    setWeatherMode('rain');

    // The diorama is now an observation workspace, with no bottom tour/player UI.
    document.getElementById('video-player-bar')?.remove();document.getElementById('subtitle-overlay')?.remove();document.getElementById('btn-toggle-sub')?.remove();document.getElementById('feature-hud')?.remove();

    const idleOrbitMotion=new IdleOrbitMotion(),orbitOffset=new THREE.Vector3(),orbitSavedPosition=new THREE.Vector3(),orbitSavedTarget=new THREE.Vector3();
    let orbitFitAspect=-1,orbitFitRadius=0,orbitWasOwner=false;
    const orbitButton=document.createElement('button');orbitButton.id='toggle-auto-orbit';orbitButton.className='fold-btn';orbitButton.textContent='⟳ 自动环绕 · 开';orbitButton.setAttribute('aria-pressed','true');orbitButton.title=`约${ORBIT_CONFIG.elevationDegrees}°俯视；正面${ORBIT_CONFIG.baseSpeedDegrees}°/秒，向侧面与背面平滑加快，最高${ORBIT_CONFIG.baseSpeedDegrees*1.5}°/秒；拖动时暂停`;
    document.getElementById('btn-home').after(orbitButton);
    function pauseIdleOrbit(delay=2.5){idleOrbitMotion.pause(performance.now()/1000,delay);orbitWasOwner=false;}
    orbitButton.addEventListener('click',()=>{idleOrbitMotion.enabled=!idleOrbitMotion.enabled;pauseIdleOrbit(0);orbitButton.textContent=idleOrbitMotion.enabled?'⟳ 自动环绕 · 开':'⟳ 自动环绕 · 关';orbitButton.setAttribute('aria-pressed',String(idleOrbitMotion.enabled));});
    controls.addEventListener('start',()=>{idleOrbitMotion.begin(performance.now()/1000);orbitWasOwner=false;});
    controls.addEventListener('end',()=>idleOrbitMotion.end(performance.now()/1000));
    renderer.domElement.addEventListener('pointercancel',()=>idleOrbitMotion.end(performance.now()/1000));
    window.addEventListener('blur',()=>idleOrbitMotion.end(performance.now()/1000));
    function fullOrbitRadius(){
      if(orbitFitAspect===camera.aspect)return orbitFitRadius;
      orbitFitAspect=camera.aspect;orbitFitRadius=0;
      for(let i=0;i<72;i++){const a=i*Math.PI/36,d=orbitDirection(a),direction=new THREE.Vector3(d.x,d.y,d.z);orbitFitRadius=Math.max(orbitFitRadius,fitOverview(direction).distanceTo(overviewCenter));}
      return orbitFitRadius;
    }
    function updateIdleOrbit(dt){
      const now=performance.now()/1000,blocked=!controls.enabled||gsap.isTweening(camera.position)||gsap.isTweening(controls.target);
      orbitOffset.copy(camera.position).sub(controls.target);
      const radius=orbitOffset.length(),pose={angle:Math.atan2(orbitOffset.x,orbitOffset.z),polar:Math.acos(THREE.MathUtils.clamp(orbitOffset.y/radius,-1,1)),radius,x:controls.target.x,y:controls.target.y,z:controls.target.z};
      const next=idleOrbitMotion.step(dt,now,pose,fullOrbitRadius(),blocked);
      if(!next){orbitWasOwner=false;orbitButton.dataset.mode=!idleOrbitMotion.enabled?'off':idleOrbitMotion.interacting?'dragging':'waiting';return false;}
      if(!orbitWasOwner){
        // Flush OrbitControls damping at the ownership boundary, restoring the visible pose.
        orbitSavedPosition.copy(camera.position);orbitSavedTarget.copy(controls.target);const damping=controls.enableDamping;controls.enableDamping=false;controls.update(0);controls.enableDamping=damping;camera.position.copy(orbitSavedPosition);controls.target.copy(orbitSavedTarget);
        currentCameraKey='iso';document.querySelectorAll('[data-cam]').forEach(b=>b.classList.toggle('active',b.dataset.cam==='iso'));syncStorySelection();closeDetail();
      }
      orbitWasOwner=true;controls.target.set(next.x,next.y,next.z);
      const horizontal=next.radius*Math.sin(next.polar);camera.position.set(next.x+horizontal*Math.sin(next.angle),next.y+next.radius*Math.cos(next.polar),next.z+horizontal*Math.cos(next.angle));camera.lookAt(controls.target);
      orbitButton.dataset.mode=next.blend<1?'returning':'rotating';orbitButton.dataset.pitch=String(90-next.polar*180/Math.PI);orbitButton.dataset.azimuth=String(next.angle*180/Math.PI);orbitButton.dataset.speedMultiplier=next.multiplier.toFixed(4);
      return true;
    }

    // Batch static city meshes by material, render flags and 8m spatial cell.
    // Dynamic roof, doors, traffic, weather and swaying crowns retain independent ownership.
    const performanceParams=new URLSearchParams(location.search);
    const dynamicRoots=new Set([roofGroup,doorLeft,doorRight,trafficGroup,snowStatic,snowRoof,...sakuraCanopies.map(c=>c.group),...ripples.map(r=>r.mesh),...eaveDrops.map(d=>d.mesh)]);
    let batchRemoved=0,batchCreated=0;
    function batchStaticCity(){
      scene.updateMatrixWorld(true);const buckets=new Map(),removed=[],removedLines=new Set(),oldGeometries=new Set();
      const inverse=diorama.matrixWorld.clone().invert(),matrix=new THREE.Matrix4(),center=new THREE.Vector3();
      diorama.traverse(o=>{
        if((!o.isMesh&&!o.isLineSegments)||o.isInstancedMesh||o===roadMirror||Array.isArray(o.material)||(!o.isLineSegments&&(o.material?.transparent||o.material?.isShaderMaterial)))return;
        for(let p=o;p&&p!==diorama;p=p.parent)if(dynamicRoots.has(p)||!p.visible)return;
        if(!o.geometry?.attributes.position)return;
        o.geometry.computeBoundingSphere();center.copy(o.geometry.boundingSphere.center).applyMatrix4(o.matrixWorld);
        const attributes=Object.keys(o.geometry.attributes).sort().join(',');
        const key=[o.isLineSegments?'line':'mesh',o.material.uuid,o.layers.mask,+o.castShadow,+o.receiveShadow,o.renderOrder,attributes,Math.floor(center.x/8),Math.floor(center.z/8)].join(':');
        if(!buckets.has(key))buckets.set(key,{source:o,parts:[],objects:[]});
        const part=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();matrix.copy(inverse).multiply(o.matrixWorld);part.applyMatrix4(matrix);
        const bucket=buckets.get(key);bucket.parts.push(part);bucket.objects.push(o);
      });
      for(const bucket of buckets.values()){
        if(bucket.parts.length<2){bucket.parts.forEach(g=>g.dispose());continue;}
        const merged=mergeGeometries(bucket.parts,false);bucket.parts.forEach(g=>g.dispose());if(!merged)continue;
        merged.computeBoundingSphere();const original=bucket.source,newObject=original.isLineSegments?new THREE.LineSegments(merged,original.material):new THREE.Mesh(merged,original.material);
        newObject.layers.mask=original.layers.mask;newObject.castShadow=original.castShadow;newObject.receiveShadow=original.receiveShadow;newObject.renderOrder=original.renderOrder;newObject.name='静态街区合批';
        for(const o of bucket.objects){removed.push(o);oldGeometries.add(o.geometry);if(o.isLineSegments)removedLines.add(o);}
        diorama.add(newObject);batchCreated++;if(newObject.isLineSegments)allInkLines.push(newObject);
      }
      for(const o of removed)o.removeFromParent();batchRemoved=removed.length;
      const activeInk=allInkLines.filter(l=>!removedLines.has(l));allInkLines.length=0;allInkLines.push(...activeInk);
      function prune(group){for(const c of [...group.children]){if(c.isGroup&&!dynamicRoots.has(c)){prune(c);if(!c.children.length)group.remove(c);}}}
      prune(diorama);
      const liveGeometry=new Set();scene.traverse(o=>{if(o.geometry)liveGeometry.add(o.geometry);});for(const g of oldGeometries)if(!liveGeometry.has(g))g.dispose();
    }
    if(performanceParams.get('batch')!=='0')batchStaticCity();
    if(performanceParams.get('batch')!=='0'){
      // Additive light is order-independent, so the shared warm/cool shafts and pools can merge.
      const buckets=new Map();residentialEffects.updateMatrixWorld(true);
      for(const o of [...residentialEffects.children]){if(!o.isMesh||o.material.blending!==THREE.AdditiveBlending)continue;const key=o.material.uuid;if(!buckets.has(key))buckets.set(key,{source:o,parts:[],objects:[]});const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();g.applyMatrix4(o.matrix);buckets.get(key).parts.push(g);buckets.get(key).objects.push(o);}
      for(const b of buckets.values()){const geo=mergeGeometries(b.parts);b.parts.forEach(g=>g.dispose());if(!geo)continue;const m=new THREE.Mesh(geo,b.source.material);m.renderOrder=b.source.renderOrder;residentialEffects.add(m);for(const o of b.objects){o.removeFromParent();o.geometry.dispose();}batchRemoved+=b.objects.length;batchCreated++;}
    }

    // Distant blossoms keep all their instances and silhouette, with fewer triangles per flower.
    const farFlowerGeo=(()=>{
      const pos=[],color=[],base=new THREE.Color(0xe6b2be),tip=new THREE.Color(0xffede5),outline=[];
      for(let petal=0;petal<5;petal++)for(const [offset,r] of [[-.61,.25],[-.22,1],[0,.9],[.22,1]]){const a=petal*Math.PI*2/5+offset;outline.push([Math.cos(a)*r,Math.sin(a)*r,.04]);}
      for(let i=0;i<outline.length;i++){pos.push(0,0,0,...outline[i],...outline[(i+1)%outline.length]);color.push(base.r,base.g,base.b,tip.r,tip.g,tip.b,tip.r,tip.g,tip.b);}
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(color,3));g.computeVertexNormals();return g;
    })();
    const blossomLods=[];scene.updateMatrixWorld(true);scene.traverse(o=>{if(o.isInstancedMesh&&o.geometry===sakuraFlowerGeo)blossomLods.push({mesh:o,position:o.getWorldPosition(new THREE.Vector3())});});
    // Freeze only fully static branches. Doors, roof, traffic, weather and crowns keep updating.
    let staticTransformsFrozen=0;
    scene.updateMatrixWorld(true);
    function freezeStaticTransforms(root){
      if(dynamicRoots.has(root))return;
      root.matrixAutoUpdate=false;root.matrixWorldAutoUpdate=false;staticTransformsFrozen++;
      for(const child of root.children)freezeStaticTransforms(child);
    }
    for(const child of diorama.children)freezeStaticTransforms(child);
    // One fixed renderer: original full-resolution cap, 512px reflections and enabled shadows.
    // Never lower resolution, remove shadows or skip reflection frames in response to low FPS.
    let nextSceneFrame=0,sceneWorkStarted=0;
    function shouldRenderScene(now){if(document.hidden||now+1<nextSceneFrame)return false;nextSceneFrame=now+1000/60;sceneWorkStarted=now;return true;}
    let perfFrames=0,perfTime=performance.now(),lastLodTime=0,callsMax=0,trianglesMax=0;
    function updateScenePerformance(dt){
      perfFrames++;callsMax=Math.max(callsMax,renderer.info.render.calls);trianglesMax=Math.max(trianglesMax,renderer.info.render.triangles);const now=performance.now();
      if(now-lastLodTime>220){for(const b of blossomLods)b.mesh.geometry=camera.position.distanceTo(b.position)<36?sakuraFlowerGeo:farFlowerGeo;lastLodTime=now;}
      if(now-perfTime<750)return;
      const fps=Math.round(perfFrames*1000/(now-perfTime)),el=document.getElementById('perf-details');el.textContent=`${fps} FPS`;
      fpsBadge.textContent=`⚡ ${fps} FPS`;
      el.dataset.drawCalls=String(callsMax);el.dataset.triangles=String(trianglesMax);el.dataset.batchRemoved=String(batchRemoved);el.dataset.batchCreated=String(batchCreated);
      el.dataset.frameWorkMs=(performance.now()-sceneWorkStarted).toFixed(1);
      el.dataset.staticTransformsFrozen=String(staticTransformsFrozen);el.dataset.pixelRatio=String(renderer.getPixelRatio());el.dataset.reflectionSize=String(roadMirror.getRenderTarget().width);el.dataset.shadowsEnabled=String(renderer.shadowMap.enabled);
      const coverage=[...lightingCoverage.values()];el.dataset.lightingCoverage=JSON.stringify(coverage);
      perfFrames=0;perfTime=now;callsMax=0;trianglesMax=0;
    }
    document.addEventListener('visibilitychange',()=>{perfFrames=0;perfTime=performance.now();callsMax=0;trianglesMax=0;nextSceneFrame=0;});

    function animate() {
      requestAnimationFrame(animate);
      if(!shouldRenderScene(performance.now()))return;
      const rawDelta=clock.getDelta();
      const dt = document.hidden ? 0 : Math.min(rawDelta, 0.1);
      const elapsed = clock.elapsedTime;
      if(document.hidden)return;

      frameCount++;
      if (videoPlaying) {
        videoTime += dt * playbackSpeed;
        if (videoTime >= TOTAL_DURATION) {
          if (isRecording) {
            // Automatically finish & download recording when the 60s tour completes!
            recBtn.click();
          }
          videoTime = 0.0;
        }
        scrubber.value = videoTime;
        document.getElementById('video-timecode').textContent = `${formatMMSS(videoTime)} / 01:00`;
        applyDirectorState(videoTime);
      }

      if (rainActive) {
        rainGlassUniforms.uTime.value = elapsed;

        const pos = rainGeo.attributes.position;
        for (let i = 0; i < rainCount; i++) {
          const m = rainMeta[i];
          m.y -= m.spd * dt;
          m.x -= 0.85 * dt;
          if (m.y < 0.2) {
            m.y = 11.2;
            m.x = (Math.random() - 0.5) * 35.0;
          }
          pos.setXYZ(i * 2, m.x, m.y, m.z);
          pos.setXYZ(i * 2 + 1, m.x - 0.06, m.y - m.len, m.z);
        }
        pos.needsUpdate = true;

        ripples.forEach(r => {
          r.p += dt * r.spd;
          if (r.p >= 1.0) {
            r.p = 0;
            r.mesh.position.x = (Math.random() - 0.5) * 15;
            r.mesh.position.z = 2.5 + Math.random() * 4.5;
          }
          const s = 0.5 + r.p * 2.6;
          r.mesh.scale.set(s, s, 1);
          r.mat.opacity = (1.0 - r.p) * 0.42;
        });

        eaveDrops.forEach(d => {
          d.phase = (d.phase + dt * 1.3) % 2.0;
          if (d.phase < 0.7) {
            d.mesh.position.y = 2.94;
          } else {
            const t = (d.phase - 0.7) / 1.3;
            d.mesh.position.y = Math.max(0.18, 2.94 - t * t * 6.5);
          }
        });
      }


      if(snowActive)updateSnow(dt,elapsed);
      // Animate Moving Vehicles & Walking Umbrella Pedestrians
      if (trafficActive) {
        movingVehicles.forEach(v => {
          v.mesh.position.x += v.dir * v.speed * dt;
          if (v.dir > 0 && v.mesh.position.x > v.maxX) v.mesh.position.x = v.minX;
          if (v.dir < 0 && v.mesh.position.x < v.minX) v.mesh.position.x = v.maxX;

          // Smooth fade/scale within 2.0m of road ends so cars & headlight beams NEVER stick out past the diorama road!
          const distFromEdge = Math.min(v.mesh.position.x - v.minX, v.maxX - v.mesh.position.x);
          const edgeAlpha = smoothstep01(distFromEdge / 2.2);
          const s = Math.max(0.001, edgeAlpha);
          v.mesh.scale.setScalar(s);
          v.groundBeamMat.uniforms.uOpacity.value = 0.72 * edgeAlpha;
          v.tailGlowMat.uniforms.uOpacity.value = 0.62 * edgeAlpha;
          v.haloSprites.forEach((spMat, idx) => { spMat.opacity = (idx % 2 === 0 ? 0.85 : 0.75) * edgeAlpha; });
        });

        pedestrians.forEach(p => {
          p.prog = (p.prog + dt * p.speed) % 2.0;
          const pingPong = p.prog <= 1.0 ? p.prog : (2.0 - p.prog);
          const forward = p.prog <= 1.0;
          const [p0, p1] = p.path;
          const cx = p0[0] + (p1[0] - p0[0]) * pingPong;
          const cy = p0[1] + (p1[1] - p0[1]) * pingPong;
          const cz = p0[2] + (p1[2] - p0[2]) * pingPong;
          p.group.position.set(cx, cy + Math.abs(Math.sin(elapsed * 6.5 + p.walkPhase)) * 0.025, cz);

          const dx = forward ? (p1[0] - p0[0]) : (p0[0] - p1[0]);
          const dz = forward ? (p1[2] - p0[2]) : (p0[2] - p1[2]);
          p.group.rotation.y = Math.atan2(dx, dz);

          const swing = Math.sin(elapsed * 6.5 + p.walkPhase) * 0.45;
          p.leftLeg.rotation.x = swing;
          p.rightLeg.rotation.x = -swing;
        });
      }

      // Gently sway Sakura tree canopies & drift falling Sakura petals
      sakuraCanopies.forEach(sc => {
        sc.group.rotation.z = Math.sin(elapsed * .65 + sc.phase) * 0.007;
        sc.group.rotation.x = Math.cos(elapsed * .52 + sc.phase) * 0.005;
      });

      if (sakuraActive) {
        const pPos = petalGeo.attributes.position;
        for (let i = 0; i < petalCount; i++) {
          const pm = petalMeta[i];
          pm.y -= pm.vy * dt;
          pm.x += (pm.vx + Math.sin(elapsed * 2.0 + pm.phase) * 0.35) * dt;
          pm.z += Math.cos(elapsed * 1.7 + pm.phase) * 0.25 * dt;
          if (pm.y < 0.22) {
            pm.y = 5.2 + Math.random() * 1.8;
            pm.x = (Math.random() - 0.5) * 18.0 - 0.5;
            pm.z = -6.5 - Math.random() * 10.5;
          }
          pPos.setXYZ(i, pm.x, pm.y, pm.z);
        }
        pPos.needsUpdate = true;
      }

      const cycle = elapsed % 14;
      grnOrbMat.color.setHex(cycle < 6 ? 0x34d399 : 0x064e3b);
      yelOrbMat.color.setHex(cycle >= 6 && cycle < 8 ? 0xfacc15 : 0x422006);
      redOrbMat.color.setHex(cycle >= 8 ? 0xf43f5e : 0x3f1d24);

      if(!updateIdleOrbit(dt))controls.update(dt);
      updateHotspots();
      updateResidentialLighting();
      renderer.render(scene, camera);
      updateScenePerformance(dt);
      if(frameCount===1){const loading=document.getElementById('loading-screen');if(loading){loading.style.opacity='0';setTimeout(()=>loading.remove(),450);}}


      if (isRecording) {
        drawCompositeVideoFrame();
      }
    }

    rainLines.frustumCulled=false;
    sakuraPetalsMesh.frustumCulled=false;
    animate();

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      if(!videoPlaying && document.querySelector('[data-cam="iso"]').classList.contains('active')){
        gsap.killTweensOf(camera.position);gsap.killTweensOf(controls.target);controls.enabled=true;
        const direction=camera.position.clone().sub(controls.target).normalize();camera.position.copy(fitOverview(direction));controls.target.copy(overviewCenter);controls.update();pauseIdleOrbit(0);
      }
    });
  