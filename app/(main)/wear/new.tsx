import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useUserId } from '@/providers/AppProviders';
import { WearFormScreen } from '@/features/wear/FormScreen';
import { localCalendarDate } from '@/features/wear/calendar';
import { wearDateSchema } from '@/features/wear/model';
export default function NewWear() {
  const owner = useUserId();
  const [fallbackDate] = useState(localCalendarDate);
  const { date } = useLocalSearchParams<{ date?: string | string[] }>();
  const parsed = wearDateSchema.safeParse(date);
  const initialDate = parsed.success ? parsed.data : fallbackDate;
  return <WearFormScreen key={`${owner}:${initialDate}`} initialDate={initialDate} />;
}
