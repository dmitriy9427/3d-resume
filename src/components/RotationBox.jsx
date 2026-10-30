import { useRef } from "react";
import { useFrame } from "@react-three/fiber";

const RotationBox = () => {
  const ref = useRef();
  useFrame((_, delta) => (ref.current.rotation.y += delta));
  return (
    <mesh position={[0, 1, 0]} ref={ref}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="lightgreen" flatShading />
    </mesh>
  );
};

export default RotationBox;
