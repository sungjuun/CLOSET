import { BrandsScreen } from '@/features/brands/BrandsScreen';
import { useUserId } from '@/providers/AppProviders';

export default function Brands() { return <BrandsScreen key={useUserId()} />; }
