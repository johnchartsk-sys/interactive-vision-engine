import { Suspense, useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, Lightformer, OrbitControls, Html, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import niaAsset from '@/assets/nia.glb.asset.json';

function NiaBust({ wireframe, cyan, deep }: { wireframe: boolean; cyan: string; deep: string }) {
 const { scene } = useGLTF(niaAsset.url);
 const model = useMemo(() => {
  const clone=scene.clone(true);
  const box=new THREE.Box3().setFromObject(clone); const size=box.getSize(new THREE.Vector3());
  clone.scale.setScalar(3.05/size.y);
  const scaled=new THREE.Box3().setFromObject(clone);const center=scaled.getCenter(new THREE.Vector3());
  clone.position.set(-center.x,-scaled.min.y-.98,-center.z);
  clone.traverse(o=>{if(o instanceof THREE.Mesh){o.material=new THREE.MeshStandardMaterial({color:cyan,emissive:deep,emissiveIntensity:.65,metalness:.72,roughness:.34,wireframe});}});
  return clone;
 },[scene,wireframe,cyan,deep]);
 return <primitive object={model} />;
}
export function NiaHologram({ autoRotate, wireframe, resetKey }: { autoRotate: boolean; wireframe: boolean; resetKey: number }) {
 const [palette,setPalette]=useState<{cyan:string;deep:string;silver:string}|null>(null);
 useEffect(()=>{const style=getComputedStyle(document.documentElement);const color=(name:string)=>{const c=document.createElement('canvas').getContext('2d');if(!c)return 'cyan';c.fillStyle=style.getPropertyValue(name).trim();c.fillRect(0,0,1,1);const pixel=c.getImageData(0,0,1,1).data;return `rgb(${pixel[0]},${pixel[1]},${pixel[2]})`;};setPalette({cyan:color('--primary'),deep:color('--secondary'),silver:color('--silver')});},[]);
 if(!palette)return null;
 return <div className="nia-canvas" aria-label="Rotatable 3D NIA hologram"><Canvas key={resetKey} dpr={[1,1.5]} camera={{position:[0,.65,6.7],fov:36}} gl={{alpha:true,antialias:true}}>
 <ambientLight intensity={1.1}/><directionalLight position={[3,4,5]} intensity={3} color={palette.cyan}/><directionalLight position={[-3,2,3]} intensity={1.6}/><pointLight position={[0,0,-2]} intensity={9} color={palette.cyan}/>
 <Environment resolution={128}><Lightformer intensity={2} position={[0,4,3]} scale={[5,5,1]}/><Lightformer intensity={3} color={palette.cyan} position={[-4,1,1]} rotation-y={Math.PI/2} scale={[5,4,1]}/></Environment>
 <Suspense fallback={<Html center><span className="detail-eyebrow">INITIALIZING NIA…</span></Html>}><NiaBust wireframe={wireframe} cyan={palette.cyan} deep={palette.deep}/></Suspense>
 <group position={[0,-1.08,0]}>
 <mesh><cylinderGeometry args={[1.48,1.55,.15,64]}/><meshStandardMaterial color={palette.deep} metalness={.8} roughness={.2}/></mesh>
 {[1.4,1.15,.85,.55].map((radius,i)=><mesh key={radius} rotation-x={Math.PI/2} position-y={.09+i*.002}><torusGeometry args={[radius,.015,8,80]}/><meshBasicMaterial color={palette.cyan}/></mesh>)}
 <mesh rotation-x={-Math.PI/2} position-y={.085}><circleGeometry args={[1.4,64]}/><meshBasicMaterial color={palette.cyan} transparent opacity={.12}/></mesh>
 </group>
 <OrbitControls makeDefault target={[0,.5,0]} enablePan={false} minDistance={4.3} maxDistance={9} minPolarAngle={.65} maxPolarAngle={2.1} autoRotate={autoRotate} autoRotateSpeed={.8} enableDamping />
 </Canvas></div>;
}
