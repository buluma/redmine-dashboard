"use client";

type IssueImageLightboxProps = {
  image: { src: string; alt: string };
  onClose: () => void;
};

export function IssueImageLightbox({ image, onClose }: IssueImageLightboxProps) {
  return (
    <div className="lightbox-overlay" onClick={onClose}>
      <div className="lightbox-content" onClick={(event) => event.stopPropagation()}>
        <button className="lightbox-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image.src} alt={image.alt} className="lightbox-image" />
        <p className="lightbox-caption">{image.alt}</p>
      </div>
    </div>
  );
}
