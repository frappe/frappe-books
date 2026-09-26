export class StockQueue {
  quantity: number;
  value: number;
  queue: { rate: number; quantity: number }[];

  constructor() {
    this.value = 0;
    this.quantity = 0;
    this.queue = [];
  }

  get fifo() {
    /**
     * Stock value maintained is based on the stock queue
     * ∴ FIFO by default. This returns FIFO valuation rate.
     */
    if (!this.quantity) {
      return 0;
    }

    return this.value / this.quantity;
  }

  inward(rate: number, quantity: number): null | number {
    if (
      !Number.isFinite(quantity) ||
      !Number.isFinite(rate) ||
      quantity <= 0 ||
      rate < 0
    ) {
      return null;
    }

    const inwardValue = rate * quantity;
    this.quantity += quantity;
    this.value += inwardValue;

    const last = this.queue.at(-1);
    if (last?.rate !== rate) {
      this.queue.push({ rate, quantity });
    } else {
      last.quantity += quantity;
    }

    return rate;
  }

  outward(quantity: number): null | number {
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return null;
    }

    // Decimal stock quantities can differ by one floating-point rounding step.
    const depleted =
      Math.abs(this.quantity - quantity) <=
      Number.EPSILON * Math.max(this.quantity, quantity);
    if (depleted && this.quantity > 0) {
      const value = this.queue.reduce(
        (sum, row) => sum + row.rate * row.quantity,
        0
      );
      const rate = value / this.quantity;
      this.quantity = 0;
      this.value = 0;
      this.queue = [];
      return rate;
    }
    if (this.quantity < quantity) {
      return null;
    }

    let incomingRate = 0;
    this.quantity -= quantity;
    let remaining = quantity;

    while (remaining > 0) {
      const last = this.queue.shift();
      if (last === undefined) {
        return null;
      }

      const storedQuantity = last.quantity;
      let quantityRemoved = remaining;

      const quantityLeft = storedQuantity - remaining;
      remaining = remaining - storedQuantity;

      if (remaining > 0) {
        quantityRemoved = storedQuantity;
      }

      if (quantityLeft > 0) {
        this.queue.unshift({ rate: last.rate, quantity: quantityLeft });
      }

      this.value -= last.rate * quantityRemoved;
      incomingRate += quantityRemoved * last.rate;
    }

    return incomingRate / quantity;
  }
}
