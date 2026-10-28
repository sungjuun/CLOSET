import { BrandsScreen } from '@/features/brands/BrandsScreen';
import { useUserId } from '@/providers/AppProviders';

export default function Brands() { const owner = useUserId(); return <BrandsScreen key={owner} />; }
