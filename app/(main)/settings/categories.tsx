import { CategoriesScreen } from '@/features/categories/CategoriesScreen';
import { useUserId } from '@/providers/AppProviders';

export default function Categories() { return <CategoriesScreen key={useUserId()} />; }
