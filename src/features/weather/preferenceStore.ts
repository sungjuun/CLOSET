import { createWeatherPreferenceStore } from './preferences';
import { weatherStorage } from './storage';

export const weatherPreferenceStore = createWeatherPreferenceStore(weatherStorage);
