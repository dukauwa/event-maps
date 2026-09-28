/** Status → badge tone. Plain module (no "use client") so server pages read the real map, not a client reference. */
export type Tone = "gray" | "green" | "yellow" | "orange" | "blue" | "red" | "purple";

export const statusTone: Record<string, Tone> = { available: "green", held: "yellow", reserved: "orange", sold: "blue", unavailable: "gray", paid: "green", pending_payment: "orange", hold: "yellow", invoiced: "blue", cancelled: "gray", expired: "gray", refunded: "red", draft: "gray", published: "green", archived: "gray" };
