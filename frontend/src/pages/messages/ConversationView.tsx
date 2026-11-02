import { ChevronLeft, FileText, FolderOpen, Image as ImageIcon, Plus, SendHorizontal, X } from 'lucide-react'
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link } from 'react-router'

import { ApiError } from '../../api/errors'
import {
  fetchOlder,
  useMarkRead,
  useMessages,
  useSendMessage,
  useShareableProjects,
  type Conversation,
  type Message,
} from '../../api/messages'
import { ConversationAvatar } from './Messages'
import { clockTime, dayLabel, sameDay, sizeText } from './messageTime'
import styles from './Messages.module.css'

const MAX_BYTES = 10 * 1024 * 1024
const MAX_FILES = 10

function MessageBubble({ message, showName }: { message: Message; showName: boolean }) {
  const images = message.attachments.filter((a) => a.is_image)
  const files = message.attachments.filter((a) => !a.is_image)
  return (
    <li className={styles.message} data-mine={message.mine ? '' : undefined}>
      <span className={styles.meta}>
        {showName && !message.mine && (
          <span className={styles.sender}>{message.sender_name ?? 'Borttagen användare'} · </span>
        )}
        <time dateTime={message.created_at}>{clockTime(message.created_at)}</time>
      </span>
      {message.text && <p className={styles.bubble}>{message.text}</p>}
      {message.project && <ProjectCard project={message.project} />}
      {images.length > 0 && (
        <span className={styles.images}>
          {images.map((a) => (
            <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className={styles.imageLink}>
              <img src={a.url} alt={a.filename} loading="lazy" />
            </a>
          ))}
        </span>
      )}
      {files.map((a) => (
        <a key={a.id} href={a.url} className={styles.card} download={a.filename}>
          <span className={styles.cardIcon} data-kind="file">
            <FileText aria-hidden="true" />
          </span>
          <span className={styles.cardText}>
            <span className={styles.cardTitle}>{a.filename}</span>
            <span className={styles.cardSub}>{sizeText(a.size)} · Ladda ner</span>
          </span>
        </a>
      ))}
    </li>
  )
}

function ProjectCard({ project }: { project: NonNullable<Message['project']> }) {
  const sub = [
    project.workplace_name,
    project.deadline &&
      `slutdatum ${new Date(project.deadline).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}`,
  ]
    .filter(Boolean)
    .join(' · ')
  const content = (
    <>
      <span className={styles.cardIcon} data-kind="project">
        <FolderOpen aria-hidden="true" />
      </span>
      <span className={styles.cardText}>
        <span className={styles.cardSub}>Projekt</span>
        <span className={styles.cardTitle}>{project.name}</span>
        {sub && <span className={styles.cardSub}>{sub}</span>}
      </span>
    </>
  )
  return project.url ? (
    <Link to={project.url} className={styles.card}>
      {content}
    </Link>
  ) : (
    <span className={styles.card}>{content}</span>
  )
}

/** Det öppna samtalet: meddelandena, och fältet för att skriva med bilder, filer och projekt. */
export function ConversationView({
  conversation,
  initialProjectId,
}: {
  conversation: Conversation
  initialProjectId?: string
}) {
  const thread = useMessages(conversation.id)
  const send = useSendMessage(conversation.id)
  const markRead = useMarkRead(conversation.id)
  const [older, setOlder] = useState<Message[]>([])
  const [hasMoreOlder, setHasMoreOlder] = useState<boolean | null>(null)
  const [text, setText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [projectId, setProjectId] = useState(initialProjectId ?? '')
  const [menu, setMenu] = useState<'closed' | 'attach' | 'projects'>('closed')
  const [error, setError] = useState('')
  const projects = useShareableProjects(conversation.id, menu === 'projects' || Boolean(projectId))
  const imageInput = useRef<HTMLInputElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)

  const messages = [...older, ...(thread.data?.messages ?? [])]
  const lastId = thread.data?.messages.at(-1)?.id

  // Läst när samtalet öppnas och när nya meddelanden kommer medan det är öppet.
  const { mutate: markAsRead } = markRead
  useEffect(() => {
    if (thread.isSuccess) markAsRead()
  }, [lastId, thread.isSuccess, markAsRead])

  // Nya meddelanden hämtas när strömmen säger till (listan hämtas om). Samtalet följer med.
  const { refetch } = thread
  const { last_message_at: lastMessageAt } = conversation
  useEffect(() => {
    void refetch()
  }, [lastMessageAt, refetch])

  // Längst ned när samtalet öppnas och när ett nytt meddelande kommer.
  useLayoutEffect(() => {
    const node = listRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [lastId])

  const selectedProject = projects.data?.find((p) => p.id === projectId)
  const canSend = (text.trim() || files.length > 0 || projectId) && !send.isPending

  function addFiles(list: FileList | null) {
    setMenu('closed')
    if (!list) return
    const chosen = Array.from(list)
    const tooBig = chosen.find((f) => f.size > MAX_BYTES)
    if (tooBig) {
      setError(`${tooBig.name} är större än 10 MB.`)
      return
    }
    const next = [...files, ...chosen].slice(0, MAX_FILES)
    if (files.length + chosen.length > MAX_FILES) setError(`Högst ${MAX_FILES} filer åt gången.`)
    else setError('')
    setFiles(next)
  }

  function submit(event?: FormEvent) {
    event?.preventDefault()
    if (!canSend) return
    setError('')
    send.mutate(
      { text, files, projectId: projectId || undefined },
      {
        onSuccess: () => {
          setText('')
          setFiles([])
          setProjectId('')
          textRef.current?.focus()
        },
        onError: (e) => setError(e instanceof ApiError ? e.message : 'Det gick inte att skicka. Försök igen.'),
      },
    )
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter skickar, Skift+Enter ger en ny rad. Inte i mobilen, där Enter är ny rad.
    if (event.key === 'Enter' && !event.shiftKey && window.matchMedia('(min-width: 1025px)').matches) {
      event.preventDefault()
      submit()
    }
  }

  async function loadOlder() {
    const first = messages[0]
    if (!first) return
    const page = await fetchOlder(conversation.id, first.created_at)
    setOlder((current) => [...page.messages, ...current])
    setHasMoreOlder(page.has_more)
  }

  const moreOlder = hasMoreOlder ?? thread.data?.has_more ?? false
  const memberLine = conversation.is_group
    ? [...conversation.members.map((m) => `${m.name} (${m.description.split(' · ')[0].toLowerCase()})`), 'du'].join(
        ' · ',
      )
    : conversation.members[0]?.description

  return (
    <div className={styles.thread}>
      <header className={styles.threadHead}>
        <Link to="/messages" className={styles.back} aria-label="Tillbaka till alla samtal">
          <ChevronLeft aria-hidden="true" />
        </Link>
        <ConversationAvatar conversation={conversation} />
        <span className={styles.threadTitleBox}>
          <span className={styles.threadTitle}>{conversation.title}</span>
          <span className={styles.threadSub}>{memberLine}</span>
        </span>
      </header>

      <div className={styles.messages} ref={listRef}>
        {moreOlder && (
          <button type="button" className={styles.older} onClick={() => void loadOlder()}>
            Visa äldre meddelanden
          </button>
        )}
        {thread.isPending ? (
          <p className={styles.muted}>Laddar…</p>
        ) : messages.length === 0 ? (
          <p className={styles.emptyThread}>
            {conversation.is_placement_group
              ? 'Här kan eleven, handledaren och läraren skriva till varandra under praktiken.'
              : 'Inga meddelanden än. Skriv det första.'}
          </p>
        ) : (
          <ol className={styles.messageList}>
            {messages.map((m, i) => {
              const previous = messages[i - 1]
              const newDay = !previous || !sameDay(previous.created_at, m.created_at)
              return (
                <Fragment key={m.id}>
                  {newDay && (
                    <li className={styles.day} aria-hidden="true">
                      {dayLabel(m.created_at)}
                    </li>
                  )}
                  <MessageBubble message={m} showName={conversation.is_group} />
                </Fragment>
              )
            })}
          </ol>
        )}
      </div>

      <form className={styles.composer} onSubmit={submit}>
        {(files.length > 0 || projectId) && (
          <ul className={styles.pending} aria-label="Bifogat">
            {projectId && (
              <li className={styles.chip}>
                <FolderOpen aria-hidden="true" />
                {selectedProject?.name ?? 'Projekt'}
                <button type="button" aria-label="Ta bort projektet" onClick={() => setProjectId('')}>
                  <X aria-hidden="true" />
                </button>
              </li>
            )}
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className={styles.chip}>
                {f.type.startsWith('image/') ? <ImageIcon aria-hidden="true" /> : <FileText aria-hidden="true" />}
                {f.name}
                <button
                  type="button"
                  aria-label={`Ta bort ${f.name}`}
                  onClick={() => setFiles(files.filter((_, j) => j !== i))}
                >
                  <X aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.composerRow}>
          <div className={styles.attachBox}>
            <button
              type="button"
              className={styles.roundButton}
              aria-label="Bifoga bild, fil eller projekt"
              aria-expanded={menu !== 'closed'}
              onClick={() => setMenu(menu === 'closed' ? 'attach' : 'closed')}
            >
              <Plus aria-hidden="true" />
            </button>
            {menu === 'attach' && (
              <div className={styles.menu} role="menu">
                <button type="button" role="menuitem" onClick={() => imageInput.current?.click()}>
                  <span className={styles.cardIcon} data-kind="image">
                    <ImageIcon aria-hidden="true" />
                  </span>
                  <span className={styles.cardText}>
                    <span className={styles.cardTitle}>Bild</span>
                    <span className={styles.cardSub}>Från datorn eller kameran</span>
                  </span>
                </button>
                <button type="button" role="menuitem" onClick={() => fileInput.current?.click()}>
                  <span className={styles.cardIcon} data-kind="file">
                    <FileText aria-hidden="true" />
                  </span>
                  <span className={styles.cardText}>
                    <span className={styles.cardTitle}>Fil</span>
                    <span className={styles.cardSub}>PDF, Word, Excel … högst 10 MB</span>
                  </span>
                </button>
                <button type="button" role="menuitem" onClick={() => setMenu('projects')}>
                  <span className={styles.cardIcon} data-kind="project">
                    <FolderOpen aria-hidden="true" />
                  </span>
                  <span className={styles.cardText}>
                    <span className={styles.cardTitle}>Projekt</span>
                    <span className={styles.cardSub}>Ett projekt som någon i samtalet är med i</span>
                  </span>
                </button>
              </div>
            )}
            {menu === 'projects' && (
              <div className={styles.menu} role="menu" aria-label="Välj projekt">
                <span className={styles.menuTitle}>Välj projekt</span>
                {projects.isPending ? (
                  <span className={styles.muted}>Laddar…</span>
                ) : (projects.data ?? []).length === 0 ? (
                  <span className={styles.muted}>Inga projekt att dela i det här samtalet.</span>
                ) : (
                  projects.data?.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setProjectId(p.id)
                        setMenu('closed')
                      }}
                    >
                      <span className={styles.cardText}>
                        <span className={styles.cardTitle}>{p.name}</span>
                        <span className={styles.cardSub}>
                          {[p.workplace_name, p.completed ? 'avslutat' : 'pågår'].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <input
            ref={imageInput}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            hidden
            onChange={(e) => {
              addFiles(e.target.files)
              e.target.value = ''
            }}
          />
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              addFiles(e.target.files)
              e.target.value = ''
            }}
          />
          <textarea
            ref={textRef}
            className={styles.input}
            rows={1}
            maxLength={4000}
            placeholder="Skriv ett meddelande …"
            aria-label="Meddelande"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <button type="submit" className={styles.sendButton} aria-label="Skicka" disabled={!canSend}>
            <SendHorizontal aria-hidden="true" />
          </button>
        </div>
      </form>
    </div>
  )
}
