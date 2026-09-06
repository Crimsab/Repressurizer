import { listen, type Event } from "@tauri-apps/api/event";
export function scopedListener<T>(name: string, handler: (event: Event<T>) => void): () => void {
  return disposeAsyncRegistration((active) => listen<T>(name, (event) => {
    if (active()) handler(event);
  }));
}
export function disposeAsyncRegistration(register: (active: () => boolean) => Promise<() => void>) {
  let active = true;
  let unlisten: (() => void) | undefined;
  void register(() => active).then((cleanup) => {
    if (active) unlisten = cleanup;
    else cleanup();
  }).catch(() => {});
  return () => {
    if (!active) return;
    active = false;
    unlisten?.();
  };
}
