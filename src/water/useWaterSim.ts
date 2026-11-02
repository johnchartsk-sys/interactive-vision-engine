import { useEffect, useRef, useSyncExternalStore } from 'react';
import { WaterSimulation } from './engine';
import { NETWORK } from './network';

export function useWaterSim() {
  const ref = useRef<WaterSimulation | null>(null);
  if (!ref.current) ref.current = new WaterSimulation(NETWORK);
  const sim = ref.current;
  const snap = useSyncExternalStore(sim.subscribe, sim.getSnapshot, sim.getSnapshot);
  useEffect(() => {
    sim.start();
    return () => sim.stop();
  }, [sim]);
  return { sim, snap };
}