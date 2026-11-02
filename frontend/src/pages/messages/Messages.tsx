import { MessageSquare, Plus, Users } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'

import {
  fetchContacts,
  fetchPlacementGroup,
  useConversations,
  useStartConversation,
  type Conversation,
} from '../../api/messages'
import { useCurrentUser } from '../../auth/useCurrentUser'
import { Avatar, Button, SearchInput, matches } from '../../components'
import { ConversationView } from './ConversationView'
import { listTime } from './messageTime'
import styles from './Messages.module.css'
import { NewConversationDialog } from './NewConversationDialog'

export function ConversationAvatar({ conversation, size = 'md' }: { conversation: Conversation; size?: 'sm' | 'md' }) {
  if (conversation.is_group) {
    return (
      <span className={styles.groupAvatar} data-size={size} aria-hidden="true">
        <Users />
      </span>
    )
  }
  return <Avatar name={conversation.members[0]?.name ?? conversation.title} size={size} />
}

/**
 * Meddelanden (B11, skiss "Firstflow – Meddelanden", Texas 2026-11-02). Samtal till vänster och
 * det öppna samtalet till höger. I mobilen visas ett i taget.
 *
 * Länkar från andra sidor:
 * - `?to=<id>,<id>` startar ett samtal med personerna (eller öppnar det ni redan har).
 * - `?group=<elevens id>` öppnar gruppen för elevens praktikplats.
 * - `&project=<id>` lägger projektet i meddelandet som ska skrivas.
 */
export function Messages() {
  const { conversationId } = useParams()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const conversations = useConversations()
  const me = useCurrentUser()
  const start = useStartConversation()
  const [search, setSearch] = useState('')
  const [newOpen, setNewOpen] = useState(false)
  const [linkError, setLinkError] = useState('')

  // Länk från elevsidan, Närvaro eller ett projekt.
  const to = params.get('to')
  const group = params.get('group')
  const project = params.get('project')
  const handled = useRef('')
  useEffect(() => {
    const key = `${to}|${group}`
    if ((!to && !group) || handled.current === key) return
    handled.current = key
    const open = (id: string) =>
      navigate({ pathname: `/messages/${id}`, search: project ? `?project=${project}` : '' }, { replace: true })
    if (group) {
      fetchPlacementGroup(group)
        .then((c) => open(c.id))
        .catch(() => {
          setLinkError('Eleven har ingen grupp för praktikplatsen än.')
          setParams({}, { replace: true })
        })
    } else if (to) {
      // Bara de man får skriva till, t.ex. inte en handledare på projektet som inte har elevens
      // praktikplats.
      const wanted = to.split(',')
      void fetchContacts()
        .then((contacts) => wanted.filter((id) => contacts.some((c) => c.id === id)))
        .catch(() => wanted)
        .then((ids) =>
          start.mutate(
            { member_ids: ids.length > 0 ? ids : wanted },
            {
              onSuccess: (c) => open(c.id),
              onError: () => {
                setLinkError('Det gick inte att starta samtalet.')
                setParams({}, { replace: true })
              },
            },
          ),
        )
    }
  }, [to, group, project, navigate, start, setParams])

  const list = (conversations.data ?? []).filter((c) =>
    matches([c.title, ...c.members.map((m) => m.name)].join(' '), search),
  )
  const open = conversations.data?.find((c) => c.id === conversationId)

  return (
    <div
      className={styles.page}
      data-open={conversationId ? '' : undefined}
      data-tabbar={me.data?.role === 'student' ? '' : undefined}
    >
      <section className={styles.listPane} aria-label="Samtal">
        <div className={styles.listHead}>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>Meddelanden</h1>
            <Button variant="primary" icon={<Plus aria-hidden="true" />} onClick={() => setNewOpen(true)}>
              Nytt
            </Button>
          </div>
          <SearchInput value={search} onChange={setSearch} placeholder="Sök person eller grupp" label="Sök samtal" />
          {linkError && (
            <p className={styles.error} role="alert">
              {linkError}
            </p>
          )}
        </div>
        {conversations.isPending ? (
          <p className={styles.muted}>Laddar…</p>
        ) : list.length === 0 ? (
          <p className={styles.empty}>
            {search ? 'Inga samtal matchar sökningen.' : 'Inga samtal än. Tryck på Nytt för att skriva till någon.'}
          </p>
        ) : (
          <ul className={styles.list}>
            {list.map((c) => (
              <li key={c.id}>
                <Link
                  to={`/messages/${c.id}`}
                  className={styles.row}
                  aria-current={c.id === conversationId ? 'page' : undefined}
                  data-unread={c.unread > 0 ? '' : undefined}
                >
                  <ConversationAvatar conversation={c} />
                  <span className={styles.rowText}>
                    <span className={styles.rowTop}>
                      <span className={styles.rowTitle}>{c.title}</span>
                      <span className={styles.rowTime}>{listTime(c.last_message_at)}</span>
                    </span>
                    <span className={styles.rowSub}>
                      {c.is_placement_group
                        ? 'Grupp för praktikplatsen'
                        : c.is_group
                          ? `Grupp · ${c.members.length + 1} personer`
                          : c.members[0]?.description}
                    </span>
                    <span className={styles.rowBottom}>
                      <span className={styles.preview}>{c.preview ?? 'Inga meddelanden än'}</span>
                      {c.unread > 0 && (
                        <span className={styles.unread} aria-label={`${c.unread} olästa`}>
                          {c.unread}
                        </span>
                      )}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.threadPane} aria-label={open ? open.title : 'Samtal'}>
        {open ? (
          <ConversationView key={open.id} conversation={open} initialProjectId={project ?? undefined} />
        ) : conversationId && conversations.isSuccess ? (
          <div className={styles.placeholder}>
            <p>Samtalet finns inte, eller så är du inte med i det.</p>
          </div>
        ) : (
          <div className={styles.placeholder}>
            <MessageSquare aria-hidden="true" />
            <p>Välj ett samtal, eller starta ett nytt.</p>
          </div>
        )}
      </section>

      {newOpen && (
        <NewConversationDialog
          onClose={() => setNewOpen(false)}
          onStarted={(id) => {
            setNewOpen(false)
            navigate(`/messages/${id}`)
          }}
        />
      )}
    </div>
  )
}
