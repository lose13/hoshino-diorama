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

