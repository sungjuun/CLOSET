import { useUserId } from '@/providers/AppProviders';
import { InsightsScreen } from '@/features/insights/InsightsScreen';
export default function Insights() {
  const owner = useUserId();
  return <InsightsScreen key={owner} />;
}
