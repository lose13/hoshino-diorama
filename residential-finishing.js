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
