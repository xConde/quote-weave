/**
 * Utility for managing timers with automatic cleanup
 * Prevents memory leaks from setTimeout/setInterval
 */
export class DisposableTimerCollection {
  private timers = new Set<number>();

  setTimeout(callback: () => void, delay: number): void {
    const id = window.setTimeout(() => {
      this.timers.delete(id);
      callback();
    }, delay);
    this.timers.add(id);
  }

  clearAll(): void {
    this.timers.forEach((id) => window.clearTimeout(id));
    this.timers.clear();
  }

  get activeCount(): number {
    return this.timers.size;
  }
}
