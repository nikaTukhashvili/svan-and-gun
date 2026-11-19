/** A timed movement slow (Rokapi's curse). A stronger or longer slow replaces a weaker one. */
export class SlowEffect {
  factor = 0;
  timeLeft = 0;

  apply(factor: number, seconds: number): void {
    if (factor >= this.factor || this.timeLeft <= 0) this.factor = factor;
    this.timeLeft = Math.max(this.timeLeft, seconds);
  }

  update(dt: number): void {
    if (this.timeLeft <= 0) return;
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.factor = 0;
    }
  }

  /** Multiply movement speed by this. */
  get multiplier(): number {
    return this.timeLeft > 0 ? 1 - this.factor : 1;
  }
}
