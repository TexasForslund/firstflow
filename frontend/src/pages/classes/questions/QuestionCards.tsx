import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
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
import { Copy, CornerDownRight, GripVertical, Plus, Target, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

import type { ChoiceQuestion, Question, QuestionType } from '../../../api/forms'
import { goalGroups, useCreateGoal, type Goal } from '../../../api/goals'
import type { Track } from '../../../api/tracks'
import { SelectField, Switch } from '../../../components'
import { TrackPill } from '../TracksCard'
import { AudienceEditor } from './AudienceEditor'
import styles from './QuestionCards.module.css'
import {
  answerOptions,
  IMAGES_MAX,
  LETTERS,
  newId,
  newQuestion,
  QUESTION_TYPES,
  questionProblems,
  questionTitle,
  type Group,
} from './questionTypes'
import { TypeBadge } from './TypeBadge'

/** Typerna en följdfråga kan ha. Fritext först, den passar nästan alltid. */
const FOLLOW_UP_TYPES: QuestionType[] = ['long_text', 'short_text', 'images', 'rating', 'yes_no']

interface Props {
  groups: Group[]
  selectedId: string | null
  focusId: string | null
  goals: Goal[]
  tracks: Track[]
  onSelect: (id: string) => void
  onChange: (question: Question) => void
  onReorder: (groups: Group[]) => void
  onAddFollowUp: (parentId: string, when: string) => void
  onRemove: (id: string) => void
  onDuplicate: (id: string) => void
  /** Gör om ett äldre hopp till följdfrågor. null om det inte går. */
  canConvertJump: (id: string) => boolean
  onConvertJump: (id: string) => void
}

/**
 * Frågorna i en kolumn (Texas skiss "Enklare frågor", 2026-11-08). Läraren klickar på en fråga
 * och ändrar den på plats. Svaren visar vilket mål de visar och vilken följdfråga som kommer.
 */
export function QuestionCards(props: Props) {
  const { groups, onReorder } = props
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  function dragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    const from = groups.findIndex((g) => g.question.id === active.id)
    const to = groups.findIndex((g) => g.question.id === over.id)
    onReorder(arrayMove(groups, from, to))
  }
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={dragEnd}
      accessibility={{
        screenReaderInstructions: {
          draggable:
            'Tryck mellanslag för att lyfta frågan. Flytta med piltangenterna och tryck mellanslag igen för att släppa, eller Escape för att avbryta.',
        },
      }}
    >
      <SortableContext items={groups.map((g) => g.question.id)} strategy={verticalListSortingStrategy}>
        <ol className={styles.cards}>
          {groups.map((group, i) => (
            <Card key={group.question.id} group={group} number={i + 1} {...props} />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  )
}

function Card({
  group,
  number,
  selectedId,
  focusId,
  goals,
  tracks,
  onSelect,
  onChange,
  onAddFollowUp,
  onRemove,
  onDuplicate,
  canConvertJump,
  onConvertJump,
}: Props & { group: Group; number: number }) {
  const { question, followUps } = group
  const open = selectedId === question.id
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: question.id,
  })
  const problems = [question, ...followUps].some((q) => questionProblems(q).length > 0)
  const optional = question.type !== 'statement' && !question.required

  return (
    <li
      ref={setNodeRef}
      className={`${styles.card} ${open ? styles.cardOpen : ''} ${isDragging ? styles.dragging : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <div className={styles.cardTop}>
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
        <TypeBadge type={question.type} number={number} />
        <span className={styles.typeLabel}>{QUESTION_TYPES[question.type].label}</span>
        {question.tracks.map((id) => (
          <TrackPill key={id} tracks={tracks} trackId={id} />
        ))}
        <span className={styles.grow} />
        {problems ? (
          <span className={styles.problem}>Behöver fyllas i</span>
        ) : (
          optional && <span className={styles.muted}>Valfri</span>
        )}
      </div>

      {open ? (
        <Editor
          question={question}
          followUps={followUps}
          focusTitle={focusId === question.id}
          goals={goals}
          tracks={tracks}
          onChange={onChange}
          onAddFollowUp={onAddFollowUp}
          onRemove={onRemove}
          onDuplicate={onDuplicate}
          canConvertJump={canConvertJump(question.id)}
          onConvertJump={() => onConvertJump(question.id)}
        />
      ) : (
        <button type="button" className={styles.summary} onClick={() => onSelect(question.id)}>
          <span className={question.title.trim() ? styles.title : styles.untitled}>{questionTitle(question)}</span>
          <Summary question={question} followUps={followUps} goals={goals} />
        </button>
      )}
    </li>
  )
}

/** Det som händer efter svaren, i korthet: mål och följdfrågor. */
function Summary({ question, followUps, goals }: { question: Question; followUps: Question[]; goals: Goal[] }) {
  const options = answerOptions(question)
  const goalRules = 'goals' in question ? question.goals : []
  const label = (when: string) => options.find((o) => o.value === when)?.label ?? when
  const jumps = 'logic' in question ? question.logic : []
  if (goalRules.length === 0 && followUps.length === 0 && jumps.length === 0) return null
  return (
    <span className={styles.summaryLines}>
      {goalRules.length > 0 && (
        <span className={styles.chips}>
          {goalRules.map((rule) => {
            const goal = goals.find((g) => g.id === rule.goal_id)
            return (
              <span key={rule.when} className={styles.goalChip}>
                <Target aria-hidden="true" />
                {options.length > 2 || question.type !== 'yes_no' ? `${label(rule.when)}: ` : ''}
                {goal?.name ?? 'Mål'}
              </span>
            )
          })}
        </span>
      )}
      {followUps.map((f) => (
        <span key={f.id} className={styles.followUpLine}>
          <CornerDownRight aria-hidden="true" />
          Om {label(f.show_if!.when)}: ”{questionTitle(f)}”
        </span>
      ))}
      {jumps.length > 0 && (
        <span className={styles.followUpLine}>
          <CornerDownRight aria-hidden="true" />
          {jumps.length === 1 ? 'Ett hopp' : `${jumps.length} hopp`} från en tidigare version
        </span>
      )}
    </span>
  )
}

function Editor({
  question,
  followUps,
  focusTitle,
  goals,
  tracks,
  onChange,
  onAddFollowUp,
  onRemove,
  onDuplicate,
  canConvertJump,
  onConvertJump,
}: {
  question: Question
  followUps: Question[]
  canConvertJump: boolean
  onConvertJump: () => void
  focusTitle: boolean
  goals: Goal[]
  tracks: Track[]
  onChange: (question: Question) => void
  onAddFollowUp: (parentId: string, when: string) => void
  onRemove: (id: string) => void
  onDuplicate: (id: string) => void
}) {
  const titleRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (focusTitle) titleRef.current?.focus()
  }, [focusTitle])
  const problems = questionProblems(question)

  return (
    <div className={styles.editor}>
      <textarea
        ref={titleRef}
        className={styles.titleInput}
        value={question.title}
        placeholder={question.type === 'statement' ? 'Skriv meddelandet här…' : 'Skriv frågan här…'}
        aria-label="Frågans rubrik"
        maxLength={500}
        rows={1}
        onChange={(e) => onChange({ ...question, title: e.target.value })}
      />
      <textarea
        className={styles.descriptionInput}
        value={question.description}
        placeholder="Beskrivning (valfri)"
        aria-label="Beskrivning"
        maxLength={2000}
        rows={1}
        onChange={(e) => onChange({ ...question, description: e.target.value })}
      />

      {question.type === 'yes_no' && (
        <div className={styles.answers}>
          {answerOptions(question).map((o, i) => (
            <AnswerBlock
              key={o.value}
              letter={i === 0 ? 'J' : 'N'}
              label={o.label}
              when={o.value}
              question={question}
              followUps={followUps.filter((f) => f.show_if?.when === o.value)}
              goals={goals}
              onChange={onChange}
              onAddFollowUp={onAddFollowUp}
              onRemove={onRemove}
            />
          ))}
        </div>
      )}
      {question.type === 'choice' && (
        <ChoiceEditor
          question={question}
          followUps={followUps}
          goals={goals}
          onChange={onChange}
          onAddFollowUp={onAddFollowUp}
          onRemove={onRemove}
        />
      )}
      {question.type === 'images' && (
        <SelectField
          label="Högst antal bilder"
          value={String(question.max_images)}
          onChange={(v) => onChange({ ...question, max_images: Number(v) })}
        >
          {Array.from({ length: IMAGES_MAX }, (_, i) => (
            <option key={i} value={i + 1}>
              {i + 1}
            </option>
          ))}
        </SelectField>
      )}

      {'logic' in question && question.logic.length > 0 && (
        <div className={styles.oldJumps}>
          <span>
            <strong>Hopp från en tidigare version.</strong> Nya frågor använder följdfrågor i stället.
          </span>
          <ul>
            {question.logic.map((rule, i) => (
              <li key={i}>
                Om {answerOptions(question).find((o) => o.value === rule.when)?.label ?? rule.when}: hoppa
                {rule.goto ? ' fram' : ' till slutet'}
                <button
                  type="button"
                  className={styles.textButton}
                  onClick={() => onChange({ ...question, logic: question.logic.filter((_, j) => j !== i) })}
                >
                  Ta bort hoppet
                </button>
              </li>
            ))}
          </ul>
          {canConvertJump && (
            <button type="button" className={styles.softButton} onClick={onConvertJump}>
              Gör om till följdfråga om Ja
            </button>
          )}
        </div>
      )}

      {problems.length > 0 && (
        <ul className={styles.problems} aria-label="Att fylla i">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      {tracks.length > 0 && (
        <div className={styles.audience}>
          <AudienceEditor question={question} tracks={tracks} onChange={onChange} />
        </div>
      )}

      <div className={styles.footer}>
        {question.type !== 'statement' && (
          <Switch
            label="Obligatorisk"
            checked={question.required}
            onChange={(required) => onChange({ ...question, required })}
          />
        )}
        <span className={styles.grow} />
        <button type="button" className={styles.softButton} onClick={() => onDuplicate(question.id)}>
          <Copy aria-hidden="true" /> Kopiera
        </button>
        <button type="button" className={styles.dangerButton} onClick={() => onRemove(question.id)}>
          <Trash2 aria-hidden="true" /> Ta bort
        </button>
      </div>
    </div>
  )
}

/** Ett svar: vilket mål det visar och vilka följdfrågor som kommer. */
function AnswerBlock({
  letter,
  label,
  when,
  question,
  followUps,
  goals,
  onChange,
  onAddFollowUp,
  onRemove,
  children,
}: {
  letter: string
  label: string
  when: string
  question: Question
  followUps: Question[]
  goals: Goal[]
  onChange: (question: Question) => void
  onAddFollowUp: (parentId: string, when: string) => void
  onRemove: (id: string) => void
  children?: ReactNode
}) {
  return (
    <div className={styles.answer}>
      <div className={styles.answerHead}>
        <span className={styles.letter}>{letter}</span>
        {children ?? <span className={styles.answerLabel}>{label}</span>}
        {'goals' in question && <GoalPicker question={question} when={when} goals={goals} onChange={onChange} />}
      </div>
      {followUps.map((f) => (
        <FollowUpEditor key={f.id} question={f} onChange={onChange} onRemove={onRemove} />
      ))}
      <button type="button" className={styles.addFollowUp} onClick={() => onAddFollowUp(question.id, when)}>
        <Plus aria-hidden="true" /> Följdfråga om {label}
      </button>
    </div>
  )
}

type WithGoals = Extract<Question, { goals: unknown }>

/** Mål för ett svar. Klassens mål först, grupperade per ämne. Nytt skolmål längst ner. */
function GoalPicker({
  question,
  when,
  goals,
  onChange,
}: {
  question: WithGoals
  when: string
  goals: Goal[]
  onChange: (question: Question) => void
}) {
  const create = useCreateGoal()
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const current = question.goals.find((g) => g.when === when)?.goal_id ?? ''

  function setGoal(goalId: string) {
    const rest = question.goals.filter((g) => g.when !== when)
    onChange({ ...question, goals: goalId ? [...rest, { when, goal_id: goalId }] : rest })
  }

  if (naming) {
    return (
      <form
        className={styles.newGoal}
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) return
          create.mutate(name.trim(), {
            onSuccess: (goal) => {
              setGoal(goal.id)
              setNaming(false)
              setName('')
            },
          })
        }}
      >
        <input
          className={styles.newGoalInput}
          value={name}
          maxLength={40}
          placeholder="Nytt mål, t.ex. Kundkontakt"
          aria-label="Nytt mål"
          autoFocus
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className={styles.softButton} disabled={!name.trim() || create.isPending}>
          Lägg till
        </button>
        <button type="button" className={styles.iconButton} aria-label="Avbryt" onClick={() => setNaming(false)}>
          <X aria-hidden="true" />
        </button>
      </form>
    )
  }

  return (
    <label className={`${styles.goalPicker} ${current ? styles.goalPicked : ''}`}>
      <Target aria-hidden="true" />
      <span className="sr-only">Mål för svaret</span>
      <select
        value={current}
        onChange={(e) => (e.target.value === '__new__' ? setNaming(true) : setGoal(e.target.value))}
      >
        <option value="">Koppla mål</option>
        {goalGroups(goals).map((group) =>
          group.title ? (
            <optgroup key={group.title} label={group.title}>
              {group.goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </optgroup>
          ) : (
            group.goals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))
          ),
        )}
        <option value="__new__">+ Nytt mål…</option>
      </select>
    </label>
  )
}

/** En följdfråga, indragen under svaret. */
function FollowUpEditor({
  question,
  onChange,
  onRemove,
}: {
  question: Question
  onChange: (question: Question) => void
  onRemove: (id: string) => void
}) {
  function setType(type: QuestionType) {
    const fresh = newQuestion(type)
    onChange({
      ...fresh,
      id: question.id,
      title: question.title,
      description: question.description,
      tracks: question.tracks,
      show_if: question.show_if,
    } as Question)
  }
  return (
    <div className={styles.followUp}>
      <div className={styles.followUpHead}>
        <CornerDownRight aria-hidden="true" className={styles.followUpIcon} />
        <span className={styles.followUpTag}>Följdfråga</span>
        <select
          className={styles.typeSelect}
          value={question.type}
          aria-label="Följdfrågans typ"
          onChange={(e) => setType(e.target.value as QuestionType)}
        >
          {FOLLOW_UP_TYPES.map((t) => (
            <option key={t} value={t}>
              {QUESTION_TYPES[t].label}
            </option>
          ))}
        </select>
        <span className={styles.grow} />
        {question.type !== 'statement' && (
          <label className={styles.smallCheck}>
            <input
              type="checkbox"
              checked={!question.required}
              onChange={(e) => onChange({ ...question, required: !e.target.checked })}
            />
            Valfri
          </label>
        )}
        <button
          type="button"
          className={styles.iconButton}
          aria-label="Ta bort följdfrågan"
          onClick={() => onRemove(question.id)}
        >
          <X aria-hidden="true" />
        </button>
      </div>
      <input
        className={styles.followUpInput}
        value={question.title}
        placeholder="Till exempel: Berätta vad du gjorde."
        aria-label="Följdfrågans text"
        maxLength={500}
        autoFocus={!question.title}
        onChange={(e) => onChange({ ...question, title: e.target.value })}
      />
    </div>
  )
}

function ChoiceEditor({
  question,
  followUps,
  goals,
  onChange,
  onAddFollowUp,
  onRemove,
}: {
  question: ChoiceQuestion
  followUps: Question[]
  goals: Goal[]
  onChange: (question: Question) => void
  onAddFollowUp: (parentId: string, when: string) => void
  onRemove: (id: string) => void
}) {
  const [focusId, setFocusId] = useState<string | null>(null)
  const inputs = useRef(new Map<string, HTMLInputElement>())
  useEffect(() => {
    if (focusId) inputs.current.get(focusId)?.focus()
  }, [focusId])
  const max = 20

  function setLabel(id: string, label: string) {
    onChange({ ...question, choices: question.choices.map((c) => (c.id === id ? { ...c, label } : c)) })
  }
  function add(after?: number) {
    if (question.choices.length >= max) return
    const choice = { id: newId(), label: '' }
    const choices = [...question.choices]
    choices.splice(after === undefined ? choices.length : after + 1, 0, choice)
    onChange({ ...question, choices })
    setFocusId(choice.id)
  }
  /** Ett alternativ per mål som saknas, med målet kopplat. */
  function addFromGoals() {
    const used = new Set(question.goals.map((g) => g.goal_id))
    const missing = goals.filter((g) => g.class_id && !used.has(g.id)).slice(0, max - question.choices.length)
    if (missing.length === 0) return
    const added = missing.map((g) => ({ goal: g, choice: { id: newId(), label: g.name } }))
    // Tomma alternativ ersätts, så att en ny fråga inte får två tomma rader kvar.
    const kept = question.choices.filter((c) => c.label.trim())
    onChange({
      ...question,
      choices: [...kept, ...added.map((a) => a.choice)],
      goals: [...question.goals, ...added.map((a) => ({ when: a.choice.id, goal_id: a.goal.id }))],
    })
  }
  function remove(id: string) {
    onChange({
      ...question,
      choices: question.choices.filter((c) => c.id !== id),
      goals: question.goals.filter((g) => g.when !== id),
    })
  }
  function keyDown(event: KeyboardEvent<HTMLInputElement>, index: number) {
    if (event.key === 'Enter') {
      event.preventDefault()
      add(index)
    }
  }
  const hasClassGoals = goals.some((g) => g.class_id)

  return (
    <div className={styles.answers}>
      {question.choices.map((choice, i) => (
        <AnswerBlock
          key={choice.id}
          letter={LETTERS[i]}
          label={choice.label.trim() || `alternativ ${LETTERS[i]}`}
          when={choice.id}
          question={question}
          followUps={followUps.filter((f) => f.show_if?.when === choice.id)}
          goals={goals}
          onChange={onChange}
          onAddFollowUp={onAddFollowUp}
          onRemove={onRemove}
        >
          <input
            ref={(el) => {
              if (el) inputs.current.set(choice.id, el)
              else inputs.current.delete(choice.id)
            }}
            className={styles.choiceInput}
            value={choice.label}
            placeholder={`Alternativ ${LETTERS[i]}`}
            aria-label={`Alternativ ${LETTERS[i]}`}
            maxLength={200}
            onChange={(e) => setLabel(choice.id, e.target.value)}
            onKeyDown={(e) => keyDown(e, i)}
          />
          {question.choices.length > 2 && (
            <button
              type="button"
              className={styles.iconButton}
              aria-label={`Ta bort alternativ ${LETTERS[i]}`}
              onClick={() => remove(choice.id)}
            >
              <X aria-hidden="true" />
            </button>
          )}
        </AnswerBlock>
      ))}
      <div className={styles.choiceActions}>
        {question.choices.length < max && (
          <button type="button" className={styles.textButton} onClick={() => add()}>
            + Alternativ
          </button>
        )}
        {hasClassGoals && question.choices.length < max && (
          <button type="button" className={styles.textButton} onClick={addFromGoals}>
            + Alternativ från målen
          </button>
        )}
        <span className={styles.grow} />
        <Switch
          label="Flera val"
          checked={question.multiple}
          onChange={(multiple) => onChange({ ...question, multiple })}
        />
        <Switch
          label="Annat"
          checked={question.allow_other}
          onChange={(allow_other) => onChange({ ...question, allow_other })}
        />
      </div>
    </div>
  )
}
