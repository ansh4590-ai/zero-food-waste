import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

export default function AnimatedFood() {
  const groupRef = useRef<THREE.Group>(null)

  useFrame((state) => {
    if (groupRef.current) {
      // Subtly rotate
      groupRef.current.rotation.y += 0.01;
      groupRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.5) * 0.1;
      groupRef.current.rotation.z = Math.cos(state.clock.elapsedTime * 0.5) * 0.05;
      
      // Pulse effect
      const scale = 2.2 + Math.sin(state.clock.elapsedTime * 2) * 0.05;
      groupRef.current.scale.setScalar(scale);
    }
  })

  return (
    <group ref={groupRef}>
      {/* Apple Body */}
      <mesh position={[0, -0.1, 0]} scale={[1, 0.95, 1]}>
        <sphereGeometry args={[1, 64, 64]} />
        <meshStandardMaterial 
          color="#ef4444" 
          roughness={0.3} 
          metalness={0.1} 
        />
      </mesh>
      
      {/* Stem */}
      <mesh position={[0, 0.85, 0]} rotation={[0, 0, 0.15]}>
        <cylinderGeometry args={[0.04, 0.06, 0.4, 16]} />
        <meshStandardMaterial color="#451a03" roughness={0.9} />
      </mesh>

      {/* Leaf */}
      <mesh position={[0.3, 0.9, 0]} rotation={[0.2, 0.5, 0.8]} scale={[1, 0.2, 2]}>
        <sphereGeometry args={[0.2, 16, 16]} />
        <meshStandardMaterial color="#22c55e" roughness={0.6} />
      </mesh>
    </group>
  )
}
