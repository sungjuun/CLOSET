import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useUserId } from '@/providers/AppProviders';
import { WearCalendarScreen } from '@/features/wear/CalendarScreen';
import { localCalendarDate } from '@/features/wear/calendar';
import { wearDateSchema } from '@/features/wear/model';
export default function Calendar() {
  const owner = useUserId();
  const [fallbackDate] = useState(localCalendarDate);
  const { date } = useLocalSearchParams<{ date?: string | string[] }>();
  const parsed = wearDateSchema.safeParse(date);
  const initialDate = parsed.success ? parsed.data : fallbackDate;
  return <WearCalendarScreen key={`${owner}:${initialDate}`} initialDate={initialDate} />;
}
