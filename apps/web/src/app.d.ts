declare global {
  namespace App {
    interface Locals {
      /** True when the request carries a valid owner session (always true in open mode). */
      authed: boolean;
    }
  }
}

export {};
