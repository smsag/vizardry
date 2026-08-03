import type { Result } from "./core";

// ── Carousel ─────────────────────────────────────────────────────────────────

export interface CarouselImage {
  src: string;
  alt: string;
}

export interface CarouselBlock {
  images: CarouselImage[];
}

export type CarouselResult = Result<CarouselBlock>;
