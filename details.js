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
