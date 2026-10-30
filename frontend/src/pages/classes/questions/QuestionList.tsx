import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Plus } from 'lucide-react'

import type { Question } from '../../../api/forms'
import type { Track } from '../../../api/tracks'
import { TrackPill } from '../TracksCard'
import styles from './FormBuilder.module.css'
import { QUESTION_TYPES, questionProblems, questionTitle } from './questionTypes'
import { TypeBadge } from './TypeBadge'

interface Props {
  questions: Question[]
  selectedId: string | null
  onSelect: (id: string) => void
  onReorder: (questions: Question[]) => void
  onAdd: () => void
  /** Klassens inriktningar, för etiketten på frågor som bara gäller vissa. */
  tracks?: Track[]
}

export function QuestionList({ questions, selectedId, onSelect, onReorder, onAdd, tracks = [] }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const position = (id: unknown) => questions.findIndex((q) => q.id === id) + 1
  const title = (id: unknown) => {
    const question = questions.find((q) => q.id === id)
    return question ? questionTitle(question) : ''
  }
  // Uppläsning för skärmläsare på svenska.
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Du flyttar fråga ${position(active.id)}, ${title(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over ? `Fråga ${title(active.id)} är nu på plats ${position(over.id)}.` : undefined,
    onDragEnd: ({ active, over }) =>
      over ? `Fråga ${title(active.id)} flyttades till plats ${position(over.id)}.` : undefined,
    onDragCancel: ({ active }) => `Flytten avbröts. Fråga ${title(active.id)} ligger kvar.`,
  }

  function dragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    const from = questions.findIndex((q) => q.id === active.id)
    const to = questions.findIndex((q) => q.id === over.id)
    onReorder(arrayMove(questions, from, to))
  }

  return (
    <nav className={styles.list} aria-label="Frågor">
      <div className={styles.listHeader}>
        <h2 className={styles.listTitle}>Frågor</h2>
        <span className={styles.count}>{questions.length}</span>
      </div>
      {questions.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={dragEnd}
          accessibility={{
            announcements,
            screenReaderInstructions: {
              draggable:
                'Tryck mellanslag för att lyfta frågan. Flytta med piltangenterna och tryck mellanslag igen för att släppa, eller Escape för att avbryta.',
            },
          }}
        >
          <SortableContext items={questions.map((q) => q.id)} strategy={verticalListSortingStrategy}>
            <ol className={styles.items}>
              {questions.map((question, i) => (
                <SortableItem
                  key={question.id}
                  question={question}
                  number={i + 1}
                  selected={question.id === selectedId}
                  onSelect={() => onSelect(question.id)}
                  tracks={tracks}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}
      <button type="button" className={styles.addButton} onClick={onAdd}>
        <Plus aria-hidden="true" />
        Lägg till fråga
      </button>
    </nav>
  )
}

function SortableItem({
  question,
  number,
  selected,
  onSelect,
  tracks,
}: {
  question: Question
  number: number
  selected: boolean
  onSelect: () => void
  tracks: Track[]
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: question.id,
  })
  const needsFix = questionProblems(question).length > 0
  return (
    <li
      ref={setNodeRef}
      className={`${styles.item} ${selected ? styles.itemSelected : ''} ${isDragging ? styles.itemDragging : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button
        type="button"
        className={styles.itemButton}
        onClick={onSelect}
        aria-current={selected ? 'true' : undefined}
      >
        <TypeBadge type={question.type} number={number} />
        <span className={styles.itemText}>
          <span className={question.title.trim() ? styles.itemTitle : styles.itemUntitled}>
            {questionTitle(question)}
          </span>
          <span className={needsFix ? styles.itemProblem : styles.itemType}>
            {needsFix ? 'Behöver fyllas i' : QUESTION_TYPES[question.type].label}
          </span>
          {question.tracks.length > 0 && (
            <span className={styles.itemTracks}>
              {question.tracks.map((id) => (
                <TrackPill key={id} tracks={tracks} trackId={id} />
              ))}
            </span>
          )}
        </span>
      </button>
      <button
        type="button"
        ref={setActivatorNodeRef}
        className={styles.handle}
        aria-label={`Flytta fråga ${number}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical aria-hidden="true" />
      </button>
    </li>
  )
}
