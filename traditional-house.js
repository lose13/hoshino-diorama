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

