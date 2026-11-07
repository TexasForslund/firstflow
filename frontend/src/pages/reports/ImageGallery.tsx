import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useState, type KeyboardEvent, type ReactNode } from 'react'

import { reportImageUrl } from '../../api/reportImages'
import styles from './Images.module.css'

/**
 * Elevens bilder i en inskickad redovisning. Ett klick visar bilden stor, och pilarna bläddrar
 * (Texas skiss "Fråga med bilder", 2026-11-07).
 */
export function ImageGallery({ reportId, imageIds }: { reportId: string; imageIds: string[] }) {
  return <Gallery images={imageIds.map((id) => ({ id, src: reportImageUrl(reportId, id) }))} />
}

export type GalleryImage = { id: string; src: string; caption?: ReactNode }

/** Bilder i ett rutnät. Ett klick visar bilden stor, med bildtexten under. */
export function Gallery({ images, large = false }: { images: GalleryImage[]; large?: boolean }) {
  const [open, setOpen] = useState<number | null>(null)
  return (
    <>
      <ul className={large ? `${styles.gallery} ${styles.galleryLarge}` : styles.gallery}>
        {images.map((image, i) => (
          <li key={image.id}>
            <button
              type="button"
              className={styles.galleryButton}
              aria-label={`Visa bild ${i + 1} av ${images.length} större`}
              onClick={() => setOpen(i)}
            >
              <img src={image.src} alt="" className={styles.thumb} loading="lazy" />
            </button>
          </li>
        ))}
      </ul>
      {open !== null && <Lightbox images={images} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />}
    </>
  )
}

function Lightbox({
  images,
  index,
  onIndex,
  onClose,
}: {
  images: GalleryImage[]
  index: number
  onIndex: (i: number) => void
  onClose: () => void
}) {
  const many = images.length > 1
  const go = (step: number) => onIndex((index + step + images.length) % images.length)

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'ArrowLeft' && many) go(-1)
    if (event.key === 'ArrowRight' && many) go(1)
  }

  return (
    <dialog
      ref={(node) => {
        if (node && !node.open) node.showModal()
      }}
      className={styles.lightbox}
      aria-label={`Bild ${index + 1} av ${images.length}`}
      onClose={onClose}
      onKeyDown={onKeyDown}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <button type="button" className={styles.lightboxClose} aria-label="Stäng" onClick={onClose}>
        <X aria-hidden="true" />
      </button>
      <div className={styles.lightboxBody}>
        {many && (
          <button type="button" className={styles.lightboxNav} aria-label="Föregående bild" onClick={() => go(-1)}>
            <ChevronLeft aria-hidden="true" />
          </button>
        )}
        <img src={images[index].src} alt={`Bild ${index + 1}`} className={styles.big} />
        {many && (
          <button type="button" className={styles.lightboxNav} aria-label="Nästa bild" onClick={() => go(1)}>
            <ChevronRight aria-hidden="true" />
          </button>
        )}
      </div>
      {(many || images[index].caption) && (
        <p className={styles.lightboxCount}>
          {images[index].caption}
          {images[index].caption && many && ' · '}
          {many && `${index + 1} av ${images.length}`}
        </p>
      )}
    </dialog>
  )
}
