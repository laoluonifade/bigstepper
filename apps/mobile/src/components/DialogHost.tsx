import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { settleDialog, useDialog, type Dialog } from '@/lib/dialog';
import { Sheet } from './Sheet';
import { Button, haptic } from './ui';

/**
 * Draws whatever `ask()` / `confirm()` is asking, as one of the app's sheets. Mounted once at the root,
 * like the Toaster. A single action sits beside Cancel; several stack, with Cancel last.
 */
export function DialogHost() {
  const dialog = useDialog();
  // Keep the last dialog on screen while the sheet slides away.
  const [shown, setShown] = useState<Dialog | null>(dialog);
  useEffect(() => {
    if (dialog) {
      setShown(dialog);
      if (dialog.actions.some((action) => action.style === 'destructive')) haptic('warning');
    }
  }, [dialog]);

  const close = (index: number | null) => settleDialog(index);
  if (!shown) return null;
  const single = shown.actions.length === 1;
  const buttons = shown.actions.map((action, index) => <Button key={action.label} full size="lg" style={single ? { flex: 1 } : undefined}
    variant={action.style === 'destructive' ? 'danger' : 'dark'} title={action.label} onPress={() => close(index)} />);
  const cancel = <Button key="cancel" full size="lg" variant="secondary" style={single ? { flex: 1 } : undefined} title={shown.cancelLabel} onPress={() => close(null)} />;

  return <Sheet open={Boolean(dialog)} onOpenChange={(open) => { if (!open && dialog) close(null); }} title={shown.title} description={shown.message} scroll={false}
    footer={single ? <View style={{ flexDirection: 'row', gap: 12 }}>{cancel}{buttons}</View> : <View style={{ gap: 10 }}>{buttons}{cancel}</View>}>
    <View />
  </Sheet>;
}
