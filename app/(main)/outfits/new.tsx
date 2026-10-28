import { OutfitEditorScreen } from '@/features/outfits/EditorScreen';
import { useUserId } from '@/providers/AppProviders';
export default function NewOutfit() {
  const owner = useUserId();
  return <OutfitEditorScreen key={owner} />;
}
