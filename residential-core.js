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
