import { Suspense, useEffect, useMemo, useState } from 'react';
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
  const positions = mesh.attributes.position;
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
 return <group position={[0,.3,0]}>
  <mesh geometry={geometry}>
   <meshBasicMaterial map={texture} transparent alphaTest={.06} side={THREE.DoubleSide} toneMapped={false}/>
  </mesh>
  {wireframe && <mesh geometry={geometry} position-z={.008}>
   <meshBasicMaterial map={texture} color={cyan} transparent opacity={.4} alphaTest={.06} wireframe depthWrite={false}/>
  </mesh>}
 </group>;
}
export function NiaHologram({ autoRotate, wireframe, resetKey }: { autoRotate: boolean; wireframe: boolean; resetKey: number }) {
 const [palette,setPalette]=useState<{cyan:string;deep:string;silver:string}|null>(null);
 useEffect(()=>{const style=getComputedStyle(document.documentElement);const color=(name:string)=>{const c=document.createElement('canvas').getContext('2d');if(!c)return 'cyan';c.fillStyle=style.getPropertyValue(name).trim();c.fillRect(0,0,1,1);const pixel=c.getImageData(0,0,1,1).data;return `rgb(${pixel[0]},${pixel[1]},${pixel[2]})`;};setPalette({cyan:color('--primary'),deep:color('--secondary'),silver:color('--silver')});},[]);
 if(!palette)return null;
 return <div className="nia-canvas" aria-label="Rotatable 3D NIA hologram"><Canvas key={resetKey} dpr={[1,1.5]} camera={{position:[0,.65,6.7],fov:36}} gl={{alpha:true,antialias:true}}>
 <ambientLight intensity={1.1}/><directionalLight position={[3,4,5]} intensity={3} color={palette.cyan}/><directionalLight position={[-3,2,3]} intensity={1.6}/><pointLight position={[0,0,-2]} intensity={9} color={palette.cyan}/>
 <Environment resolution={128}><Lightformer intensity={2} position={[0,4,3]} scale={[5,5,1]}/><Lightformer intensity={3} color={palette.cyan} position={[-4,1,1]} rotation-y={Math.PI/2} scale={[5,4,1]}/></Environment>
 <Suspense fallback={null}><NiaPortrait wireframe={wireframe} cyan={palette.cyan}/></Suspense>
 <group position={[0,-1.08,0]}>
 <mesh><cylinderGeometry args={[1.48,1.55,.15,64]}/><meshStandardMaterial color={palette.deep} metalness={.8} roughness={.2}/></mesh>
 {[1.4,1.15,.85,.55].map((radius,i)=><mesh key={radius} rotation-x={Math.PI/2} position-y={.09+i*.002}><torusGeometry args={[radius,.015,8,80]}/><meshBasicMaterial color={palette.cyan}/></mesh>)}
 <mesh rotation-x={-Math.PI/2} position-y={.085}><circleGeometry args={[1.4,64]}/><meshBasicMaterial color={palette.cyan} transparent opacity={.12}/></mesh>
 </group>
 <OrbitControls makeDefault target={[0,.3,0]} enablePan={false} minDistance={5.5} maxDistance={9} minPolarAngle={1.25} maxPolarAngle={1.75} minAzimuthAngle={-.6} maxAzimuthAngle={.6} autoRotate={autoRotate} autoRotateSpeed={.5} enableDamping />
 </Canvas></div>;
}
