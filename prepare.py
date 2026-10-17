from pathlib import Path
import re
p=Path(__file__).parent
html=(p/'original.html').read_text(encoding='utf-8')
script=re.search(r'<script type="module">(.*?)</script>',html,re.S).group(1)
shell=re.sub(r'<script type="module">.*?</script>','<!-- BUNDLED_SCENE -->',html,flags=re.S)
shell=re.sub(r'<script type="importmap">.*?</script>','',shell,flags=re.S)
shell=shell.replace('</style>',(p/'enhancements.css').read_text(encoding='utf-8')+'\n</style>')
shell=shell.replace('<body>','''<body>
  <div id="loading-screen" role="status">桜町三丁目<small>正在布置微缩街区…</small></div>
  <header id="studio-header"><div class="eyebrow">HOSHINO · MINIATURE ARCHIVE / 001</div><h1>桜町三丁目<small>1:35 DIORAMA</small></h1><p>雨落街角，灯还亮着。 / 星野マート 24H</p></header>
  <div id="hotspot-layer" aria-label="街区细节"></div>
  <aside id="detail-card" hidden aria-labelledby="detail-title"><button id="detail-close" aria-label="关闭细节卡片">×</button><div id="detail-kicker">STREET STORY</div><h2 id="detail-title"></h2><p id="detail-body"></p></aside>
  <div id="scene-note">拖动查看 · 松手恢复环绕 · R 回到全景</div><div id="toast" role="status"></div>''')
shell=shell.replace('⚙️ 星野マート 控制框','场景工作台')
shell=shell.replace('<button class="fold-btn" id="btn-toggle-sub"','<button class="fold-btn" id="btn-home" style="margin-left:0;">回到全景</button><button class="fold-btn" id="btn-photo" style="margin-left:0;">保存画面</button><button class="fold-btn" id="btn-toggle-sub"')
shell=shell.replace('<div class="ui-panel-body">','''<div class="ui-panel-body"><div class="sec-lbl">街角小故事 / 点击查看</div><div id="detail-list" class="btn-grid"></div><button class="btn" id="btn-hotspots" style="width:100%;margin-top:6px">细节标记 · 开</button>''')
shell=shell.replace('min="0.2" max="1.6"','aria-label="店内投射街面光强" min="0.2" max="1.6"').replace('min="0.0" max="0.85"','aria-label="雨夜地面镜面反射" min="0.0" max="0.85"')
shell=shell.replace('<input type="range" id="video-scrubber"','<input type="range" aria-label="巡游时间" id="video-scrubber"')
shell=shell.replace('<div class="sec-lbl">动态与拆解控制</div>','''<div class="sec-lbl">动态与拆解控制</div><div class="slider-line"><span>降雨密度 <output id="rain-output">60%</output></span><input type="range" aria-label="降雨密度" id="rain-density" min="0" max="100" step="5" value="60"></div>''')
shell=shell.replace('data-sky="afterRainDusk"','data-sky="afterRainDusk"')
labels=['01 盒景全景','02 夜樱公园','03 车流行人','04 天空与暖光','05 自动门雨痕','06 贩卖机立牌','07 掀顶看店内','08 墨线对比']
times=[0,8,16,24,32,39,46,54]
for i,(label,t) in enumerate(zip(labels,times)):
    shell=re.sub(r'(<button class="chap-btn[^>]*data-seek=")[^"]+(">).*?(</button>)',lambda m:m.group(0),shell,count=0) if False else shell
chap_i=iter(zip(labels,times))
def chapter(m):
    label,t=next(chap_i)
    return f'<button class="chap-btn" data-seek="{t}">{label}</button>'
shell=re.sub(r'<button class="chap-btn[^>]*>.*?</button>',chapter,shell)
shell=shell.replace('星野マート 24H — 雨夜街角微缩盒景 全功能演示视频与交互播放器','桜町三丁目 · 星野マート 24H 微缩街区')

script=script.replace("import gsap from 'gsap';","import { gsap } from 'gsap';")
script=script.replace('window.innerWidth / window.innerHeight, 1.0, 260','window.innerWidth / window.innerHeight, 0.1, 900')
script=script.replace('new THREE.SphereGeometry(115, 24, 16)','new THREE.SphereGeometry(600, 24, 16)')
script=script.replace('controls.maxDistance = 110','controls.maxDistance = 400')
script=script.replace('sidewalkPlatform.material.transparent = true;','sidewalkPlatform.material = sidewalkPlatform.material.clone();\n    sidewalkPlatform.material.transparent = true;')
script=script.replace('eastBlockPlatform.material.transparent = true;','eastBlockPlatform.material = eastBlockPlatform.material.clone();\n    eastBlockPlatform.material.transparent = true;')
script=script.replace('let videoPlaying = true','let videoPlaying = false')
# Draw markings as part of the asphalt, avoiding low-angle depth fighting with thin boxes.
paint_start=script.index('    // Main street zebra crosswalk')
paint_end=script.index('    function createGuardrail',paint_start)
script=script[:paint_start]+(p/'road-paint.js').read_text(encoding='utf-8')+'\n'+script[paint_end:]
sign_start=script.index('    function createFasciaTexture()')
sign_end=script.index('    function createPylonMainTexture()',sign_start)
script=script[:sign_start]+(p/'store-signage.js').read_text(encoding='utf-8')+'\n'+script[sign_end:]
script=script.replace("createGraphicSign(768, 160, '#fffbeb', '#0284c7', '星野マート 24H OPEN', '酒 • たばこ • 銀行ATM • 珈琲')",'createSideFasciaTexture()')
script=script.replace("park:    { pos: [-16.5, 9.2, -2.5], target: [0.2, 2.1, -12.5] },","park:    { pos: [-22, 24, 14], target: [0.2, 1.8, -11.5] },")
script=script.replace('lerpVec3([-16.5, 8.8, -2.5], [14.5, 7.8, -4.5], p)','lerpVec3([-24, 24, 14], [22, 24, 14], p)')
script=script.replace('lerpVec3([-1.5, 2.4, -12.8], [0.5, 2.6, -13.5], p)','lerpVec3([-1.5, 1.8, -11.5], [0.5, 1.8, -11.5], p)')
script=script.replace("iso:     { pos: [34.0, 21.5, 36.0], target: [0.0, 1.8, -5.2] },","""iso:     { pos: [75,61,89], target: [0.0, 1.6, -6.2] },
      bike: {pos:[-11.7,2.5,6.5],target:[-9.45,.8,.72]},
      cat: {pos:[6.4,1.8,5.9],target:[4.52,.55,.78]},
      delivery: {pos:[10.3,3.2,.2],target:[6.18,.9,-3.7]},""")
script=script.replace("if (t >= c.start && t <= c.end)","if (t >= c.start && (t < c.end || t === TOTAL_DURATION && c.end === TOTAL_DURATION))")
script=script.replace("const radius = 44.0 - p * 4.0;\n        camPos = [Math.sin(angle) * radius + 8.0, 21.5 - p * 2.5, Math.cos(angle) * radius - 3.0];","""const home=fitOverview(),offset=home.clone().sub(overviewCenter);
        offset.applyAxisAngle(new THREE.Vector3(0,1,0),-.18+p*.36);
        camPos=overviewCenter.clone().add(offset).toArray();""")
# Preserve the original purple/gold twilight palette and its purple ambient light.
# The reference's low camera must still show the whole twilight gradient.
script=script.replace('    const skyDome = new THREE.Mesh(', '''    skyUniforms.uDuskAmount={value:0};
    skyUniforms.uViewportHeight={value:renderer.domElement.height};
    const skyDome = new THREE.Mesh(''')
script=script.replace('          uniform vec3 uBotColor;', '''          uniform vec3 uBotColor;
          uniform float uDuskAmount;
          uniform float uViewportHeight;''')
script=script.replace('            gl_FragColor = vec4(col, 1.0);', '''            float v=clamp(gl_FragCoord.y/uViewportHeight,0.,1.);
            vec3 dusk=mix(uBotColor,uMidColor,smoothstep(.02,.56,v));
            dusk=mix(dusk,uTopColor,smoothstep(.56,1.,v));
            gl_FragColor=mix(vec4(col,1.),linearToOutputTexel(vec4(dusk,1.)),uDuskAmount);''',1)
script=script.replace('    scene.add(skyDome);', '''    scene.add(skyDome);
    const skyViewport=new THREE.Vector4();
    skyDome.onBeforeRender=()=>{renderer.getCurrentViewport(skyViewport);skyUniforms.uViewportHeight.value=skyViewport.w;};''')
script=script.replace('      if (!p) return;', '''      if (!p) return;
      gsap.killTweensOf([skyUniforms.uTopColor.value,skyUniforms.uMidColor.value,skyUniforms.uBotColor.value,hemiLight.color,hemiLight.groundColor,hemiLight,moonLight.color,moonLight]);
      gsap.killTweensOf(skyUniforms.uDuskAmount);skyUniforms.uDuskAmount.value=key==='afterRainDusk'?1:0;''',1)
script=script.replace('        const key = btn.dataset.sky;', '''        const key = btn.dataset.sky;
        gsap.to(skyUniforms.uDuskAmount,{value:key==='afterRainDusk'?1:0,duration:.9,overwrite:true});''')
script=script.replace('      const a = skyPresets[keyA];', '''      skyUniforms.uDuskAmount.value=(keyA==='afterRainDusk'?1:0)*(1-alpha)+(keyB==='afterRainDusk'?1:0)*alpha;
      const a = skyPresets[keyA];''')
# A single owner for camera moves: cancel pending transitions on tour / direct gestures.
script=script.replace('videoPlaying = active;','''gsap.killTweensOf(camera.position);gsap.killTweensOf(controls.target);
      controls.enabled=true;
      videoPlaying = active;''')
start=script.index("    document.querySelectorAll('[data-cam]').forEach(btn => {",script.index('// Left Panel Manual Buttons'))
end=script.index("    document.getElementById('toggle-rain')",start)
script=script[:start]+"    document.querySelectorAll('[data-cam]').forEach(btn => btn.addEventListener('click', () => navigateTo(btn.dataset.cam)));\n\n"+script[end:]
# Manual door position now remains under user control.
script=script.replace('let doorOpen = false;','let doorOpen = false;')
script=script.replace("gsap.to(doorLeft.position, { x:","gsap.to(doorLeft.position, { overwrite: true, x:").replace("gsap.to(doorRight.position, { x:","gsap.to(doorRight.position, { overwrite: true, x:")
script=script.replace('''      } else {
        if (elapsed > nextAutoDoorTime) {
          toggleDoor();
          nextAutoDoorTime = elapsed + (doorOpen ? 3.4 : 7.8);
        }
      }''','''      }''')
script=script.replace("document.getElementById('toggle-door').classList.toggle('active', doorOpen);","document.getElementById('toggle-door').classList.toggle('active', doorOpen);\n      document.getElementById('toggle-door').textContent=doorOpen?'🚪 关闭自动门':'🚪 打开自动门';")
script=script.replace("        y: targetY,\n        duration:","        y: targetY,\n        overwrite: true,\n        onUpdate: () => { renderer.shadowMap.needsUpdate = true; },\n        duration:")
script=script.replace('const prevY = roofGroup.position.y;','gsap.killTweensOf(roofGroup.position);\n      const prevY = roofGroup.position.y;')
script=script.replace("      if (active) {\n        playBtn.textContent", "      if (active) {\n        gsap.killTweensOf(doorLeft.position);gsap.killTweensOf(doorRight.position);\n        playBtn.textContent")
# Do not churn UI 60 times per second when only a chapter boundary changes it.
script=script.replace('    function applyDirectorState(t) {','    let lastChapterId=-1;\n    function applyDirectorState(t) {')
script=script.replace('      // Update Top-Right HUD & Bottom Subtitle & Chapter Ribbon','      if(lastChapterId!==chap.id){\n      lastChapterId=chap.id;\n      // Update Top-Right HUD & Bottom Subtitle & Chapter Ribbon')
script=script.replace('      // Default baseline states unless overridden by chapter','      }\n      // Default baseline states unless overridden by chapter')
script=script.replace("        uiPanel.classList.add('director-active');","        uiPanel.classList.add('director-active');\n        lastChapterId=-1;")
script=script.replace("        lastChapterId=-1;","        lastChapterId=-1;\n        document.getElementById('detail-card').hidden=true;")
# Sky transitions replace any older tween, starting at the current interpolated value.
script=re.sub(r'(duration: 0\.9)( \})',r'\1, overwrite: true\2',script)
# Let shadow updates follow the slow lighting transition rather than stale static illumination.
script=script.replace("      moonLight.intensity = p.moonInt;","      if(moonLight.intensity !== p.moonInt) renderer.shadowMap.needsUpdate=true;\n      moonLight.intensity = p.moonInt;")
script=script.replace("    // Initialize at t = 0\n    applyDirectorState(0);",'''    // Initial full-object view and added street stories.
'''+(p/'details.js').read_text(encoding='utf-8')+'''
    let rainDensity=.60;
    rainGeo.setDrawRange(0, Math.floor(rainCount*rainDensity)*2);
    document.getElementById('rain-density').addEventListener('input',e=>{
      setDirectorActive(false);rainDensity=Number(e.target.value)/100;
      document.getElementById('rain-output').value=`${e.target.value}%`;
      rainGeo.setDrawRange(0,Math.floor(rainCount*rainDensity)*2);setRainState(rainDensity>0);
    });
''')
script=script.replace('const dt = Math.min(clock.getDelta(), 0.05);\n      const elapsed = clock.getElapsedTime();','''const rawDelta=clock.getDelta();
      const dt = document.hidden ? 0 : Math.min(rawDelta, 0.1);
      const elapsed = clock.elapsedTime;
      if(document.hidden)return;''')
script=script.replace('      controls.update();\n      renderer.render(scene, camera);','''      controls.update();
      updateHotspots();
      renderer.render(scene, camera);
      if(frameCount===1){const loading=document.getElementById('loading-screen');if(loading){loading.style.opacity='0';setTimeout(()=>loading.remove(),450);}}
''')
# Near/far rainfall remains bounded by the box scene; update buffer bounds explicitly.
script=script.replace('rainLines.visible = active;','rainLines.visible = active;')
script=script.replace('    animate();','''    rainLines.frustumCulled=false;
    sakuraPetalsMesh.frustumCulled=false;
    animate();''')
# Refit an overview on resize, including narrow portrait screens.
script=script.replace('      renderer.setSize(window.innerWidth, window.innerHeight);\n    });','''      renderer.setSize(window.innerWidth, window.innerHeight);
      if(!videoPlaying && document.querySelector('[data-cam="iso"]').classList.contains('active')){
        gsap.killTweensOf(camera.position);gsap.killTweensOf(controls.target);controls.enabled=true;
        const direction=camera.position.clone().sub(controls.target).normalize();camera.position.copy(fitOverview(direction));controls.target.copy(overviewCenter);controls.update();pauseIdleOrbit(0);
      }
    });''')
# Replace the inherited platter crowns with branch-supported geometric flowers.
window_start=script.index('    //Framed Japanese Window Helper')
window_end=script.index('    // Exterior AC Compressor Unit',window_start)
script=script[:window_start]+(p/'residential-core.js').read_text(encoding='utf-8')+'\n'+script[window_end:]
script=script.replace('machiya.add(doorRecess, doorGlow);', "doorGlow.material=homeWindowMaterial(homeWarmTex);\n      machiya.add(doorRecess, doorGlow);\n      residentialWindows.push({mesh:doorGlow,w:1.52,h:1.88,pane:doorGlow});")
script=script.replace('modern.add(backGlowPane);', "backGlowPane.material=homeWindowMaterial(homeWarmTex);\n      modern.add(backGlowPane);\n      for(const y of [1.40,3.75]){const emitter=new THREE.Object3D();emitter.position.set(-2.0,y,2.23);modern.add(emitter);residentialWindows.push({mesh:emitter,w:1.55,h:1.45,pane:backGlowPane});}")
script=script.replace('apato.add(orb);','homeLamp(apato,ux - 0.72, fy + 2.12, 2.22);')
script=script.replace('const slab = box(eaveW, 0.14, slopeLen + 0.12, tileCol, false);','const slab = box(eaveW, 0.14, slopeLen + 0.12, tileCol, false);\n        slab.material=homeRoofMaterial(tileCol,eaveW,slopeLen);')
house2_start=script.index('    // BUILDING 2 ')
house3_start=script.index('    // BUILDING 3 ',house2_start)
script=script[:house2_start]+(p/'traditional-house.js').read_text(encoding='utf-8')+'\n'+script[house3_start:]
book_start=script.index('    // BUILDING 5 ')
house6_start=script.index('    // BUILDING 6 ',book_start)
traffic_start=script.index('    // 8.6 SCULPTED 3D VEHICLES',house6_start)
book=script[book_start:house6_start].replace('15.4, 0.22, -3.2','15.4, 0.22, -12.8').replace('X: +15.4, Z: -3.2','X: +15.4, Z: -12.8')
script=script[:book_start]+(p/'courtyard-house.js').read_text(encoding='utf-8')+'\n'+book+(p/'residential-finishing.js').read_text(encoding='utf-8')+'\n'+script[traffic_start:]
script=script.replace('      updateHotspots();','      updateHotspots();\n      updateResidentialLighting();')
script=script.replace("      bike: {pos:","      courtyard: {pos:[27.5,13,19.2],target:[15.45,2.65,-1.4]},\n      garden: {pos:[7,20,-23],target:[-14.0,2.3,-11.5]},\n      residential: {pos:[33,14,-1],target:[15.3,2.4,-11.5]},\n      teahouse: {pos:[-4,10,18],target:[-13.6,2.5,-1.2]},\n      apartment: {pos:[-14,13,-1],target:[-4.4,2.7,-18.5]},\n      modern: {pos:[13,11,-3],target:[4.8,2.4,-18.3]},\n      bookstore: {pos:[0,11,-1],target:[14.4,2.5,-12.8]},\n      bike: {pos:")
shell=shell.replace('<div class="sec-lbl">动态与拆解控制</div>', '<div class="btn-grid" style="margin-top:5px"><button class="btn" data-cam="courtyard">🏡 绿瓦庭院独栋</button><button class="btn" data-cam="garden">🎋 木造縁側小院</button><button class="btn" data-cam="residential">🏘️ 住宅街与窗光</button></div><div class="slider-line"><span>住宅窗光与柔光束</span><input type="range" aria-label="住宅窗光与柔光束" id="home-light-slider" min="0" max="1.6" step="0.05" value="1"></div><div class="sec-lbl">动态与拆解控制</div>')
script=script.replace("import { Reflector } from 'three/addons/objects/Reflector.js';", "import { Reflector } from 'three/addons/objects/Reflector.js';\n    import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';\n    import { clipLightToMiniature,createSnowField,stepSnowField } from './scene-space.js';\n    import { IdleOrbitMotion, ORBIT_CONFIG, orbitDirection } from './orbit-motion.js';")
sakura_start=script.index('    // 8. Five Intricate Multi-Branching Anime Sakura Trees')
sakura_end=script.index('    // Soft Pink-Warm Bounce PointLight for Sakura Park',sakura_start)
script=script[:sakura_start]+(p/'sakura.js').read_text(encoding='utf-8')+'\n'+script[sakura_end:]
script=script.replace('new THREE.PointLight(0xf9a8d4, 3.5, 20, 1.2)','new THREE.PointLight(0xffd5d2, 2.0, 20, 1.2)').replace('light: sakuraParkLight, base: 3.5','light: sakuraParkLight, base: 2.0')
script=script.replace('Math.sin(elapsed * 1.4 + sc.phase) * 0.025','Math.sin(elapsed * .65 + sc.phase) * 0.007').replace('Math.cos(elapsed * 1.1 + sc.phase) * 0.02','Math.cos(elapsed * .52 + sc.phase) * 0.005')
# Observation-only UI: player nodes are retired after legacy listener setup, before first frame.
director_start=script.index('    function setDirectorActive(active) {')
director_end=script.index('    // Pause auto-director gracefully',director_start)
script=script[:director_start]+'''    function setDirectorActive(){
      videoPlaying=false;gsap.killTweensOf(camera.position);gsap.killTweensOf(controls.target);controls.enabled=true;
      document.getElementById('ui-panel').classList.remove('director-active');
      document.querySelectorAll('.demo-highlight').forEach(el=>el.classList.remove('demo-highlight'));
    }
\n'''+script[director_end:]
script=script.replace('    function setRainState(active) {','    function legacySetRainState(active) {')
script=script.replace('setRainState(!rainActive);','setRainState(!(rainActive||snowActive));')
script=script.replace("      document.getElementById('sky-label').textContent = p.label;", "      document.getElementById('sky-label').textContent = p.label;\n      document.body.dataset.skyTone=(key==='overcastDay'||key==='snowDay')?'light':'dark';")
script=script.replace("      document.getElementById('sky-label').textContent = skyPresets[activeKey].label;", "      document.getElementById('sky-label').textContent = skyPresets[activeKey].label;\n      document.body.dataset.skyTone=(activeKey==='overcastDay'||activeKey==='snowDay')?'light':'dark';")
script=script.replace('    function animate() {',(p/'weather.js').read_text(encoding='utf-8')+'\n'+(p/'auto-orbit.js').read_text(encoding='utf-8')+'\n'+(p/'performance.js').read_text(encoding='utf-8')+'\n    function animate() {')
script=script.replace('      controls.update();\n      updateHotspots();','      if(!updateIdleOrbit(dt))controls.update(dt);\n      updateHotspots();')
script=script.replace('      // Animate Moving Vehicles & Walking Umbrella Pedestrians','      if(snowActive)updateSnow(dt,elapsed);\n      // Animate Moving Vehicles & Walking Umbrella Pedestrians')
script=script.replace('      renderer.render(scene, camera);\n      if(frameCount===1)', '      renderer.render(scene, camera);\n      updateScenePerformance(dt);\n      if(frameCount===1)')
script=script.replace('      requestAnimationFrame(animate);','      requestAnimationFrame(animate);\n      if(!shouldRenderScene(performance.now()))return;')
frame_loop=script.index('    function animate() {')
fps_start=script.index('      const now = performance.now();',frame_loop)
fps_end=script.index('      if (videoPlaying)',fps_start)
script=script[:fps_start]+script[fps_end:]
shell=shell.replace('<div class="sec-lbl">天空与时间氛围 (Time & Sky)</div>','<div class="sec-lbl">天空与时间氛围</div>')
shell=shell.replace('<div class="sec-lbl">动态与拆解控制</div>', '<div class="sec-lbl">天气与降水</div><div class="btn-grid-3"><button class="btn" data-weather="clear">无降水</button><button class="btn active" data-weather="rain">🌧️ 雨天</button><button class="btn" data-weather="snow">❄️ 雪天</button></div><div class="sec-lbl">动态与拆解控制</div>')
shell=shell.replace('降雨密度','降水密度')
shell=shell.replace('<div class="slider-line"><span>住宅窗光与柔光束</span>', '<div class="btn-grid" style="margin-top:5px"><button class="btn" data-cam="teahouse">茶屋窗光</button><button class="btn" data-cam="apartment">公寓窗光</button><button class="btn" data-cam="modern">现代住宅窗光</button><button class="btn" data-cam="bookstore">古书店窗光</button></div><div class="slider-line"><span>住宅窗光与柔光束</span>')
script=script.replace('👁️ 展开两侧面板 (H)','展开工作台 (H)').replace('👁️ 一键折叠面板 (H)','收起工作台 (H)')
shell=shell.replace('<div class="ui-panel-body">','<div class="ui-panel-body"><output id="perf-details" hidden aria-hidden="true"></output>')
shell=shell.replace('</style>','''#scene-note{bottom:24px}#detail-card{bottom:28px}#toast{bottom:30px}@media(max-width:600px){#detail-card{bottom:18px}#toast{bottom:20px}}\n</style>''')
(p/'shell.html').write_text(shell,encoding='utf-8')
(p/'scene.js').write_text(script,encoding='utf-8')
print('Prepared editable scene and shell')
