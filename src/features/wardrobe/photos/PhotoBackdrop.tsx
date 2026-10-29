import { StyleSheet, View } from 'react-native';
import Svg, { Image as SvgImage } from 'react-native-svg';

// Extend a tiny patch of the photo's upper-left background across the frame.
// The inset avoids image borders. The foreground remains uncropped/undistorted.
// SVG uses the existing image loader/cache and does not modify the stored file.
export function PhotoBackdrop({ url }: { url: string }) {
  return <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
    <Svg width="100%" height="100%" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden>
      <SvgImage href={{ uri: url }} x={-32} y={-32} width={1024} height={1024} preserveAspectRatio="none" />
    </Svg>
  </View>;
}
