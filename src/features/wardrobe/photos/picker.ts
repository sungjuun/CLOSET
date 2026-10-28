import * as ImagePicker from 'expo-image-picker';
import { PhotoError } from './model';

export async function selectPhotos(camera: boolean, available: number) {
  if (available <= 0) throw new PhotoError('limit');
  if (camera) {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new PhotoError('permission_denied');
    return ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 1, exif: false });
  }
  // Keep this immediately after the user's web click, before any awaited work.
  return ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: available, allowsEditing: false, quality: 1, exif: false, base64: false });
}
