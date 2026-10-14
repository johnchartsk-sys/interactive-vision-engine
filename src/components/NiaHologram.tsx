import { createElement, Suspense, useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, Lightformer, OrbitControls, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import niaAsset from '@/assets/nia-identity.png.asset.json';

function NiaPortrait({ wireframe, cyan }: { wireframe: boolean; cyan: string }) {
 const texture = useTexture(niaAsset.url, t => { t.colorSpace = THREE.SRGBColorSpace; });
 // Preserve the actual reference pixels on a shallow curved relief. A single
 // frontal image cannot define an accurate unseen profile or back of the head.
 const geometry = useMemo(() => {
  const mesh = new THREE.PlaneGeometry(3.76, 3.04, 96, 80);
  const positions = mesh.getAttribute('position');
  for (let i = 0; i < positions.count; i++) {
   const x = positions.getX(i), y = positions.getY(i);
   const head = Math.exp(-((x*x)/.34 + ((y-.43)*(y-.43))/.7));
   const nose = Math.exp(-((x*x)/.014 + ((y-.05)*(y-.05))/.035));
   const shoulders = Math.exp(-((x*x)/1.7 + ((y+1.15)*(y+1.15))/.18));
   positions.setZ(i, head*.27 + nose*.12 + shoulders*.09);
  }
  mesh.computeVertexNormals();
  return mesh;
 }, []);
 useEffect(() => () => geometry.dispose(), [geometry]);
 // Three objects are not DOM nodes. Avoid JSX source-selection attributes,
 // which R3F interprets as nested Three properties during preview updates.
 return createElement('group', {position:[0,.3,0]},
  createElement('mesh', {geometry}, createElement('meshBasicMaterial', {
   map:texture, transparent:true, alphaTest:.06, side:THREE.DoubleSide, toneMapped:false,
  })),
  wireframe && createElement('mesh', {geometry, position:[0,0,.008]},
   createElement('meshBasicMaterial', {map:texture, color:cyan, transparent:true, opacity:.4, alphaTest:.06, wireframe:true, depthWrite:false})),
 );
}
export function NiaHologram({ autoRotate, wireframe, resetKey }: { autoRotate: boolean; wireframe: boolean; resetKey: number }) {
 const [palette,setPalette]=useState<{cyan:string;deep:string;silver:string}|null>(null);
 useEffect(()=>{const style=getComputedStyle(document.documentElement);const color=(name:string)=>{const c=document.createElement('canvas').getContext('2d');if(!c)return 'cyan';c.fillStyle=style.getPropertyValue(name).trim();c.fillRect(0,0,1,1);const pixel=c.getImageData(0,0,1,1).data;return `rgb(${pixel[0]},${pixel[1]},${pixel[2]})`;};setPalette({cyan:color('--primary'),deep:color('--secondary'),silver:color('--silver')});},[]);
 if(!palette)return null;
 return <div className="nia-canvas" aria-label="Rotatable 3D NIA hologram"><Canvas key={resetKey} dpr={[1,1.5]} camera={{position:[0,.65,6.7],fov:36}} gl={{alpha:true,antialias:true}}>
 {createElement('ambientLight',{intensity:1.1})}
 {createElement('directionalLight',{position:[3,4,5],intensity:3,color:palette.cyan})}
 {createElement('directionalLight',{position:[-3,2,3],intensity:1.6})}
 {createElement('pointLight',{position:[0,0,-2],intensity:9,color:palette.cyan})}
 <Environment resolution={128}><Lightformer intensity={2} position={[0,4,3]} scale={[5,5,1]}/><Lightformer intensity={3} color={palette.cyan} position={[-4,1,1]} rotation-y={Math.PI/2} scale={[5,4,1]}/></Environment>
 <Suspense fallback={null}><NiaPortrait wireframe={wireframe} cyan={palette.cyan}/></Suspense>
 {createElement('group',{position:[0,-1.08,0]},
  createElement('mesh',null,
   createElement('cylinderGeometry',{args:[1.48,1.55,.15,64]}),
   createElement('meshStandardMaterial',{color:palette.deep,metalness:.8,roughness:.2})),
  ...[1.4,1.15,.85,.55].map((radius,i)=>createElement('mesh',{key:radius,rotation:[Math.PI/2,0,0],position:[0,.09+i*.002,0]},
   createElement('torusGeometry',{args:[radius,.015,8,80]}),
   createElement('meshBasicMaterial',{color:palette.cyan}))),
  createElement('mesh',{rotation:[-Math.PI/2,0,0],position:[0,.085,0]},
   createElement('circleGeometry',{args:[1.4,64]}),
   createElement('meshBasicMaterial',{color:palette.cyan,transparent:true,opacity:.12})),
 )}
 <OrbitControls makeDefault target={[0,.3,0]} enablePan={false} minDistance={5.5} maxDistance={9} minPolarAngle={1.25} maxPolarAngle={1.75} minAzimuthAngle={-.6} maxAzimuthAngle={.6} autoRotate={autoRotate} autoRotateSpeed={.5} enableDamping />
 </Canvas></div>;
}
