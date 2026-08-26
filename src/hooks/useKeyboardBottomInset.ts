import { useEffect, useState } from 'react';
import { Keyboard, Platform, type KeyboardEvent } from 'react-native';

/**
 * Bottom inset to keep focused inputs above the software keyboard.
 * On modern Android (edge-to-edge) window resize alone is unreliable;
 * we measure keyboard height and pad the layout explicitly.
 */
export function useKeyboardBottomInset() {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = (event: KeyboardEvent) => {
      const height = Math.max(0, Math.round(event.endCoordinates?.height ?? 0));
      setInset(height);
    };
    const onHide = () => setInset(0);

    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return inset;
}
