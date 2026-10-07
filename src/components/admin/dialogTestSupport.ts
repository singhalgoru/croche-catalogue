export function mockNativeDialog(): () => void {
  const prototype = HTMLDialogElement.prototype;
  const showModal = Object.getOwnPropertyDescriptor(prototype, 'showModal');
  const close = Object.getOwnPropertyDescriptor(prototype, 'close');
  Object.defineProperty(prototype, 'showModal', {
    configurable: true, value(this: HTMLDialogElement) { this.open = true; },
  });
  Object.defineProperty(prototype, 'close', {
    configurable: true, value(this: HTMLDialogElement) { this.open = false; },
  });
  return () => {
    if (showModal) Object.defineProperty(prototype, 'showModal', showModal);
    else Reflect.deleteProperty(prototype, 'showModal');
    if (close) Object.defineProperty(prototype, 'close', close);
    else Reflect.deleteProperty(prototype, 'close');
  };
}
