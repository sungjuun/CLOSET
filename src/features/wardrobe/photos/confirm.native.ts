import { Alert } from 'react-native';
export function confirmPhotoRemoval(): Promise<boolean> {
  return new Promise((resolve) => Alert.alert('사진 삭제','기기에 있는 원본 파일은 유지됩니다.',[
    { text: '취소', style: 'cancel', onPress: () => resolve(false) },
    { text: '삭제', style: 'destructive', onPress: () => resolve(true) },
  ],{ cancelable: true, onDismiss: () => resolve(false) }));
}
