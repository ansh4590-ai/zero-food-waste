import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Sphere, MeshDistortMaterial } from '@react-three/drei'
import * as THREE from 'three'

export default function AnimatedGlobe() {
  const sphereRef = useRef<THREE.Mesh>(null)

  useFrame((state) => {
    if (sphereRef.current) {
      sphereRef.current.rotation.y = state.clock.elapsedTime * 0.2
      sphereRef.current.rotation.x = state.clock.elapsedTime * 0.1
    }
  })

  return (
    <Sphere ref={sphereRef} args={[1, 64, 64]} scale={2.5}>
      <MeshDistortMaterial
        color="#3b82f6"
        attach="material"
        distort={0.3}
        speed={1.5}
        roughness={0.2}
      />
    </Sphere>
  )
}
