import { createFileRoute } from '@tanstack/react-router';
import { WaterDashboard } from '@/water/WaterDashboard';

export const Route = createFileRoute('/water')({
  ssr: false,
  head: () => ({ meta: [{ title: 'NamTwin Water | Simulated water network' }] }),
  component: WaterDashboard,
});