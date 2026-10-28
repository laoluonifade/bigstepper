import { useEffect, useState } from 'react';
import { Keyboard, LayoutAnimation, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * How far the keyboard reaches above the home-indicator area, live. A form adds it as bottom padding so its
 * pinned buttons sit right on top of the keyboard. Measured, not guessed, so it's right in a modal sheet too.
 */
export function useKeyboardLift() {
  const insets = useSafeAreaInsets();
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const ease = (duration?: number) => { if (ios) LayoutAnimation.configureNext({ duration: duration || 250, update: { type: LayoutAnimation.Types.keyboard } }); };
    const shown = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (event) => { ease(event.duration); setHeight(event.endCoordinates.height); });
    const hidden = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', (event) => { ease(event?.duration); setHeight(0); });
    return () => { shown.remove(); hidden.remove(); };
  }, []);
  return Math.max(0, height - insets.bottom);
}
