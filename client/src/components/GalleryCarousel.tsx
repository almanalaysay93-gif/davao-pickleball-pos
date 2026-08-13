import { useState } from "react";
import { ChevronLeft, ChevronRight, ImageOff } from "lucide-react";

interface GalleryImage {
  id: number;
  imageKey: string;
}

interface GalleryCarouselProps {
  /** Gallery images ordered by sort order (may be empty). */
  images: GalleryImage[];
  /** Venue name used for the alt text of the placeholder. */
  venueName: string;
  /** Optional fixed height class, defaults to 56 on desktop / 48 on mobile. */
  className?: string;
}

/**
 * Carousel-style photo gallery shown at the top of venue sections.
 * Single photo renders as a plain image; multiple photos get prev/next arrows + dots.
 */
export function GalleryCarousel({ images, venueName, className }: GalleryCarouselProps) {
  const [index, setIndex] = useState(0);
  const count = images.length;
  const active = count > 0 ? (index + count) % count : 0;

  if (count === 0) {
    return (
      <div className={`w-full h-44 md:h-56 mb-4 rounded-md border border-dashed border-border bg-background/60 flex flex-col items-center justify-center gap-1.5 text-muted-foreground ${className ?? ""}`}>
        <ImageOff className="h-5 w-5" />
        <p className="text-[11px]">No photos yet</p>
      </div>
    );
  }

  const go = (dir: 1 | -1) => setIndex(i => i + dir);

  return (
    <div className={`relative mb-4 ${className ?? ""}`} data-testid="gallery-carousel">
      <div className="w-full h-48 md:h-56 overflow-hidden rounded-md border border-border bg-muted/40">
        <img
          src={`/manus-storage/${images[active].imageKey}`}
          alt={`${venueName} photo ${active + 1} of ${count}`}
          className="w-full h-full object-cover"
        />
      </div>

      {count > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous photo"
            onClick={() => go(-1)}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-background/85 border border-border shadow-md flex items-center justify-center text-foreground/80 hover:text-primary press transition-colors">
            <ChevronLeft className="h-4.5 w-4.5" />
          </button>
          <button
            type="button"
            aria-label="Next photo"
            onClick={() => go(1)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-background/85 border border-border shadow-md flex items-center justify-center text-foreground/80 hover:text-primary press transition-colors">
            <ChevronRight className="h-4.5 w-4.5" />
          </button>

          <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-background/70 px-2 py-1 border border-border">
            {images.map((img, i) => (
              <button
                key={img.id}
                type="button"
                aria-label={`Go to photo ${i + 1}`}
                onClick={() => setIndex(i)}
                className={`h-1.5 rounded-full transition-all duration-200 ${i === active ? "w-4 bg-primary" : "w-1.5 bg-foreground/30 hover:bg-foreground/50"}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
