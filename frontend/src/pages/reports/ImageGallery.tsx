import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useState, type KeyboardEvent } from 'react'

import { reportImageUrl } from '../../api/reportImages'
import styles from './Images.module.css'

/**
 * Elevens bilder i en inskickad redovisning. Ett klick visar bilden stor, och pilarna bläddrar
 * (Texas skiss "Fråga med bilder", 2026-11-07).
 */
export function ImageGallery({ reportId, imageIds }: { reportId: string; imageIds: string[] }) {
  const [open, setOpen] = useState<number | null>(null)
  return (
    <>
      <ul className={styles.gallery}>
        {imageIds.map((id, i) => (
          <li key={id}>
            <button
              type="button"
              className={styles.galleryButton}
              aria-label={`Visa bild ${i + 1} av ${imageIds.length} större`}
              onClick={() => setOpen(i)}
            >
              <img src={reportImageUrl(reportId, id)} alt="" className={styles.thumb} loading="lazy" />
            </button>
          </li>
        ))}
      </ul>
      {open !== null && (
        <Lightbox
          reportId={reportId}
          imageIds={imageIds}
          index={open}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  )
}

function Lightbox({
  reportId,
  imageIds,
  index,
  onIndex,
  onClose,
}: {
  reportId: string
  imageIds: string[]
  index: number
  onIndex: (i: number) => void
  onClose: () => void
}) {
  const many = imageIds.length > 1
  const go = (step: number) => onIndex((index + step + imageIds.length) % imageIds.length)

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
      aria-label={`Bild ${index + 1} av ${imageIds.length}`}
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
        <img src={reportImageUrl(reportId, imageIds[index])} alt={`Bild ${index + 1}`} className={styles.big} />
        {many && (
          <button type="button" className={styles.lightboxNav} aria-label="Nästa bild" onClick={() => go(1)}>
            <ChevronRight aria-hidden="true" />
          </button>
        )}
      </div>
      {many && (
        <p className={styles.lightboxCount}>
          {index + 1} av {imageIds.length}
        </p>
      )}
    </dialog>
  )
}
